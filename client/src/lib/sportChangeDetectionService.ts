import type { Sport } from '@/data/sportsTeams';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface SportChangeEvent {
  /** Previous sport */
  previousSport: Sport | null;
  /** New sport */
  currentSport: Sport;
  /** Timestamp of the change */
  timestamp: number;
  /** Source of the change */
  source: SportChangeSource;
  /** Whether this change requires cleanup */
  requiresCleanup: boolean;
}

export type SportChangeSource = 
  | 'user-selection'
  | 'route-change'
  | 'auto-detection'
  | 'websocket-update'
  | 'query-param'
  | 'default-fallback';

export interface SportChangeDetectionConfig {
  /** Debounce delay in milliseconds */
  debounceDelay?: number;
  /** Whether to enable automatic cleanup */
  enableAutoCleanup?: boolean;
  /** Whether to track sport change history */
  trackHistory?: boolean;
  /** Maximum history entries to keep */
  maxHistoryEntries?: number;
  /** Whether to enable debug logging */
  enableDebugLogging?: boolean;
}

export interface SportChangeCallbacks {
  /** Called when sport changes */
  onSportChange?: (event: SportChangeEvent) => void;
  /** Called before cleanup operations */
  onBeforeCleanup?: (previousSport: Sport) => void;
  /** Called after cleanup operations */
  onAfterCleanup?: (previousSport: Sport) => void;
  /** Called when sport change is debounced */
  onSportChangeDebounced?: (event: SportChangeEvent) => void;
}

export interface SportChangeHistory {
  /** Change event */
  event: SportChangeEvent;
  /** Duration spent on previous sport (ms) */
  duration?: number;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: Required<SportChangeDetectionConfig> = {
  debounceDelay: 300,
  enableAutoCleanup: true,
  trackHistory: true,
  maxHistoryEntries: 10,
  enableDebugLogging: false,
};

// ============================================================================
// SPORT CHANGE DETECTION SERVICE
// ============================================================================

export class SportChangeDetectionService {
  private config: Required<SportChangeDetectionConfig>;
  private callbacks: SportChangeCallbacks;
  private currentSport: Sport | null = null;
  private previousSport: Sport | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private changeHistory: SportChangeHistory[] = [];
  private lastChangeTime: number = 0;
  private cleanupTasks: Map<Sport, (() => void)[]> = new Map();

  constructor(
    config: SportChangeDetectionConfig = {},
    callbacks: SportChangeCallbacks = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.callbacks = callbacks;
  }

  /**
   * Detect and handle sport change
   */
  public detectSportChange(
    newSport: Sport,
    source: SportChangeSource = 'auto-detection'
  ): void {
    if (this.config.enableDebugLogging) {
      console.log('[SportChangeDetection] Detecting sport change:', {
        from: this.currentSport,
        to: newSport,
        source,
      });
    }

    // Check if sport actually changed
    if (this.currentSport === newSport) {
      if (this.config.enableDebugLogging) {
        console.log('[SportChangeDetection] No sport change detected');
      }
      return;
    }

    // Clear existing debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set up debounced change
    this.debounceTimer = setTimeout(() => {
      this.executeSportChange(newSport, source);
      this.debounceTimer = null;
    }, this.config.debounceDelay);
  }

  /**
   * Force immediate sport change (bypasses debouncing)
   */
  public forceSportChange(
    newSport: Sport,
    source: SportChangeSource = 'user-selection'
  ): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    
    this.executeSportChange(newSport, source);
  }

  /**
   * Get current sport
   */
  public getCurrentSport(): Sport | null {
    return this.currentSport;
  }

  /**
   * Get previous sport
   */
  public getPreviousSport(): Sport | null {
    return this.previousSport;
  }

  /**
   * Get sport change history
   */
  public getChangeHistory(): SportChangeHistory[] {
    return [...this.changeHistory];
  }

  /**
   * Register cleanup task for a specific sport
   */
  public registerCleanupTask(sport: Sport, cleanupFn: () => void): void {
    if (!this.cleanupTasks.has(sport)) {
      this.cleanupTasks.set(sport, []);
    }
    this.cleanupTasks.get(sport)!.push(cleanupFn);
  }

  /**
   * Unregister cleanup task for a specific sport
   */
  public unregisterCleanupTask(sport: Sport, cleanupFn: () => void): void {
    const tasks = this.cleanupTasks.get(sport);
    if (tasks) {
      const index = tasks.indexOf(cleanupFn);
      if (index > -1) {
        tasks.splice(index, 1);
      }
      if (tasks.length === 0) {
        this.cleanupTasks.delete(sport);
      }
    }
  }

  /**
   * Clear all cleanup tasks
   */
  public clearAllCleanupTasks(): void {
    this.cleanupTasks.clear();
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<SportChangeDetectionConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Update callbacks
   */
  public updateCallbacks(newCallbacks: Partial<SportChangeCallbacks>): void {
    this.callbacks = { ...this.callbacks, ...newCallbacks };
  }

  /**
   * Reset service state
   */
  public reset(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    
    this.currentSport = null;
    this.previousSport = null;
    this.changeHistory = [];
    this.lastChangeTime = 0;
    this.cleanupTasks.clear();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private executeSportChange(newSport: Sport, source: SportChangeSource): void {
    const timestamp = Date.now();
    const previousSport = this.currentSport;
    
    // Create change event
    const changeEvent: SportChangeEvent = {
      previousSport,
      currentSport: newSport,
      timestamp,
      source,
      requiresCleanup: previousSport !== null && this.config.enableAutoCleanup,
    };

    if (this.config.enableDebugLogging) {
      console.log('[SportChangeDetection] Executing sport change:', changeEvent);
    }

    // Perform cleanup if needed
    if (changeEvent.requiresCleanup && previousSport) {
      this.performCleanup(previousSport);
    }

    // Update state
    this.previousSport = previousSport;
    this.currentSport = newSport;

    // Track history
    if (this.config.trackHistory) {
      this.addToHistory(changeEvent);
    }

    // Update last change time
    this.lastChangeTime = timestamp;

    // Call callbacks
    this.callbacks.onSportChange?.(changeEvent);
  }

  private performCleanup(sport: Sport): void {
    if (this.config.enableDebugLogging) {
      console.log('[SportChangeDetection] Performing cleanup for sport:', sport);
    }

    // Call before cleanup callback
    this.callbacks.onBeforeCleanup?.(sport);

    // Execute registered cleanup tasks
    const cleanupTasks = this.cleanupTasks.get(sport) || [];
    cleanupTasks.forEach(task => {
      try {
        task();
      } catch (error) {
        console.error('[SportChangeDetection] Cleanup task failed:', error);
      }
    });

    // Call after cleanup callback
    this.callbacks.onAfterCleanup?.(sport);
  }

  private addToHistory(event: SportChangeEvent): void {
    // Calculate duration if there was a previous change
    let duration: number | undefined;
    if (this.lastChangeTime > 0) {
      duration = event.timestamp - this.lastChangeTime;
    }

    // Add to history
    this.changeHistory.push({
      event,
      duration,
    });

    // Trim history if needed
    if (this.changeHistory.length > this.config.maxHistoryEntries) {
      this.changeHistory = this.changeHistory.slice(-this.config.maxHistoryEntries);
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let sportChangeDetectionServiceInstance: SportChangeDetectionService | null = null;

/**
 * Get singleton instance of sport change detection service
 */
export function getSportChangeDetectionService(
  config?: SportChangeDetectionConfig,
  callbacks?: SportChangeCallbacks
): SportChangeDetectionService {
  if (!sportChangeDetectionServiceInstance) {
    sportChangeDetectionServiceInstance = new SportChangeDetectionService(config, callbacks);
  }
  return sportChangeDetectionServiceInstance;
}

/**
 * Reset singleton instance (useful for testing)
 */
export function resetSportChangeDetectionService(): void {
  sportChangeDetectionServiceInstance?.reset();
  sportChangeDetectionServiceInstance = null;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Detect sport from URL path
 */
export function detectSportFromPath(pathname: string): Sport | null {
  const pathSegments = pathname.toLowerCase().split('/').filter(Boolean);
  
  // Common sport path patterns
  const sportMappings: Record<string, Sport> = {
    'nba': 'NBA',
    'nfl': 'NFL',
    'mlb': 'MLB',
    'nhl': 'NHL',
    'college-football': 'College Football',
    'college-basketball': 'College Basketball',
    'soccer': 'Soccer',
    'tennis': 'Tennis',
    'golf': 'Golf',
    'ufc': 'UFC',
    'boxing': 'Boxing',
    'f1': 'F1',
    'nascar': 'NASCAR',
    'pickleball': 'Pickleball',
    'jet-ski': 'Jet Ski',
  };

  for (const segment of pathSegments) {
    if (sportMappings[segment]) {
      return sportMappings[segment];
    }
  }

  return null;
}

/**
 * Detect sport from query parameters
 */
export function detectSportFromQuery(searchParams: URLSearchParams): Sport | null {
  const sportParam = searchParams.get('sport');
  if (!sportParam) return null;

  // Normalize and find matching sport
  const normalizedSport = sportParam.toLowerCase().replace(/[-_\s]/g, '');
  
  const sportMappings: Record<string, Sport> = {
    'nba': 'NBA',
    'nfl': 'NFL',
    'mlb': 'MLB',
    'nhl': 'NHL',
    'collegefootball': 'College Football',
    'collegebasketball': 'College Basketball',
    'soccer': 'Soccer',
    'tennis': 'Tennis',
    'golf': 'Golf',
    'ufc': 'UFC',
    'boxing': 'Boxing',
    'f1': 'F1',
    'nascar': 'NASCAR',
    'pickleball': 'Pickleball',
    'jetski': 'Jet Ski',
  };

  return sportMappings[normalizedSport] || null;
}