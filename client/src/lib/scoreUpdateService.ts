import { QueryClient } from '@tanstack/react-query';
import type { 
  UserTeamScoreUpdate, 
  UserTeamStatusChange, 
  SubscriptionConfirmation 
} from '@/hooks/useWebSocket';
import type { Sport } from '@/data/sportsTeams';
import { getScoreComparisonService, type ScoreComparison } from './scoreComparisonService';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface ScoreUpdateConfig {
  /** Enable score change detection to prevent unnecessary updates */
  enableScoreChangeDetection?: boolean;
  /** Minimum score difference to trigger an update */
  minScoreDifference?: number;
  /** Enable update throttling */
  enableThrottling?: boolean;
  /** Throttle interval in milliseconds */
  throttleInterval?: number;
  /** Maximum number of updates to queue */
  maxQueueSize?: number;
  /** Enable update validation */
  enableValidation?: boolean;
  /** Enable debug logging */
  enableDebugLogging?: boolean;
}

export interface ScoreUpdateMetrics {
  totalUpdatesReceived: number;
  validUpdatesProcessed: number;
  invalidUpdatesFiltered: number;
  duplicateUpdatesFiltered: number;
  throttledUpdates: number;
  lastUpdateTimestamp: number | null;
  averageProcessingTime: number;
  errorCount: number;
}

export interface GameScoreState {
  gameId: string;
  homeScore: number;
  awayScore: number;
  status: string;
  lastUpdated: number;
  period?: string;
  timeRemaining?: string;
}

export interface ScoreUpdateFilter {
  /** Filter by sport */
  sport?: string;
  /** Filter by team IDs */
  teamIds?: string[];
  /** Filter by game status */
  gameStatus?: string[];
  /** Custom filter function */
  customFilter?: (update: UserTeamScoreUpdate['payload']) => boolean;
}

export interface ScoreUpdateServiceCallbacks {
  /** Called when a score update is processed */
  onScoreUpdate?: (update: UserTeamScoreUpdate['payload'], comparison: ScoreComparison) => void;
  /** Called when a status change is processed */
  onStatusChange?: (change: UserTeamStatusChange['payload']) => void;
  /** Called when an update is throttled */
  onUpdateThrottled?: (update: UserTeamScoreUpdate['payload']) => void;
  /** Called when an update fails validation */
  onValidationFailed?: (update: UserTeamScoreUpdate['payload'], reason: string) => void;
  /** Called when a significant change is detected */
  onSignificantChange?: (update: UserTeamScoreUpdate['payload'], comparison: ScoreComparison) => void;
}

// ============================================================================
// SCORE UPDATE SERVICE
// ============================================================================

export class ScoreUpdateService {
  private config: Required<ScoreUpdateConfig>;
  private metrics: ScoreUpdateMetrics;
  private gameStates: Map<string, GameScoreState>;
  private updateQueue: UserTeamScoreUpdate['payload'][];
  private throttleTimers: Map<string, NodeJS.Timeout>;
  private processingTimes: number[];
  private queryClient: QueryClient;
  private filters: ScoreUpdateFilter[];
  private eventListeners: Map<string, Set<Function>>;
  private comparisonService = getScoreComparisonService();

  constructor(queryClient: QueryClient, config: ScoreUpdateConfig = {}) {
    this.queryClient = queryClient;
    this.config = {
      enableScoreChangeDetection: config.enableScoreChangeDetection ?? true,
      minScoreDifference: config.minScoreDifference ?? 1,
      enableThrottling: config.enableThrottling ?? true,
      throttleInterval: config.throttleInterval ?? 1000,
      maxQueueSize: config.maxQueueSize ?? 100,
      enableValidation: config.enableValidation ?? true,
      enableDebugLogging: config.enableDebugLogging ?? false,
    };

    this.metrics = {
      totalUpdatesReceived: 0,
      validUpdatesProcessed: 0,
      invalidUpdatesFiltered: 0,
      duplicateUpdatesFiltered: 0,
      throttledUpdates: 0,
      lastUpdateTimestamp: null,
      averageProcessingTime: 0,
      errorCount: 0,
    };

    this.gameStates = new Map();
    this.updateQueue = [];
    this.throttleTimers = new Map();
    this.processingTimes = [];
    this.filters = [];
    this.eventListeners = new Map();
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Process incoming score update with comparison logic
   */
  public processScoreUpdate(update: UserTeamScoreUpdate): boolean {
    const startTime = performance.now();
    this.metrics.totalUpdatesReceived++;

    try {
      // Validate update
      if (this.config.enableValidation && !this.validateUpdate(update.payload)) {
        this.metrics.invalidUpdatesFiltered++;
        this.log('Invalid update filtered:', update);
        return false;
      }

      // Apply filters
      if (!this.passesFilters(update.payload)) {
        this.log('Update filtered out:', update);
        return false;
      }

      // Compare with previous state using comparison service
      const comparison = this.comparisonService.compareScores(update.payload, update.payload.gameData.gameId);
      
      // Check if this is a significant change
      if (this.config.enableScoreChangeDetection && !comparison.isSignificant) {
        this.metrics.duplicateUpdatesFiltered++;
        this.log('No significant change detected:', comparison);
        return false;
      }

      // Handle throttling
      if (this.config.enableThrottling) {
        return this.throttleUpdate(update.payload, comparison);
      }

      // Process immediately with comparison data
      return this.executeUpdate(update.payload, comparison);
    } catch (error) {
      this.metrics.errorCount++;
      console.error('Error processing score update:', error);
      return false;
    } finally {
      const processingTime = performance.now() - startTime;
      this.updateProcessingMetrics(processingTime);
    }
  }

  /**
   * Process status change update
   */
  public processStatusChange(update: UserTeamStatusChange): boolean {
    this.log('Processing status change:', update);
    
    try {
      // Update game state
      const gameState = this.gameStates.get(update.payload.gameId);
      if (gameState) {
        gameState.status = update.payload.newStatus;
        gameState.lastUpdated = Date.now();
      }

      // Invalidate relevant queries
      this.invalidateQueries('', update.payload.gameId);
      
      // Emit event
      this.emit('statusChange', update);
      
      return true;
    } catch (error) {
      console.error('Error processing status change:', error);
      return false;
    }
  }

  /**
   * Add update filter
   */
  public addFilter(filter: ScoreUpdateFilter): void {
    this.filters.push(filter);
  }

  /**
   * Remove update filter
   */
  public removeFilter(filter: ScoreUpdateFilter): void {
    const index = this.filters.indexOf(filter);
    if (index > -1) {
      this.filters.splice(index, 1);
    }
  }

  /**
   * Clear all filters
   */
  public clearFilters(): void {
    this.filters = [];
  }

  /**
   * Subscribe to events
   */
  public on(event: string, callback: Function): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.eventListeners.get(event)?.delete(callback);
    };
  }

  /**
   * Get current metrics
   */
  public getMetrics(): ScoreUpdateMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  public resetMetrics(): void {
    this.metrics = {
      totalUpdatesReceived: 0,
      validUpdatesProcessed: 0,
      invalidUpdatesFiltered: 0,
      duplicateUpdatesFiltered: 0,
      throttledUpdates: 0,
      lastUpdateTimestamp: null,
      averageProcessingTime: 0,
      errorCount: 0,
    };
    this.processingTimes = [];
  }

  /**
   * Get game states
   */
  public getGameStates(): Map<string, GameScoreState> {
    return new Map(this.gameStates);
  }

  /**
   * Clear game states
   */
  public clearGameStates(): void {
    this.gameStates.clear();
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<ScoreUpdateConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private validateUpdate(payload: UserTeamScoreUpdate['payload']): boolean {
    // Basic validation
    if (!payload.gameData?.gameId || typeof payload.gameData.gameId !== 'string') return false;
    if (!payload.sport || typeof payload.sport !== 'string') return false;
    if (typeof payload.gameData.homeScore !== 'number' || payload.gameData.homeScore < 0) return false;
    if (typeof payload.gameData.awayScore !== 'number' || payload.gameData.awayScore < 0) return false;
    if (!payload.gameData.status || typeof payload.gameData.status !== 'string') return false;

    // Validate team information
    if (!payload.gameData.homeTeam || !payload.gameData.awayTeam) return false;
    if (!payload.teamId || !payload.teamName) return false;

    return true;
  }

  private passesFilters(payload: UserTeamScoreUpdate['payload']): boolean {
    return this.filters.every(filter => {
      // Sport filter
      if (filter.sport && payload.sport !== filter.sport) return false;

      // Team IDs filter
      if (filter.teamIds && filter.teamIds.length > 0) {
        const hasTeam = filter.teamIds.includes(payload.teamId);
        if (!hasTeam) return false;
      }

      // Game status filter
      if (filter.gameStatus && filter.gameStatus.length > 0) {
        if (!filter.gameStatus.includes(payload.gameData.status)) return false;
      }

      // Custom filter
      if (filter.customFilter && !filter.customFilter(payload)) return false;

      return true;
    });
  }

  private hasSignificantChange(payload: UserTeamScoreUpdate['payload']): boolean {
    const existingState = this.gameStates.get(payload.gameData.gameId);
    
    if (!existingState) {
      // First time seeing this game
      return true;
    }

    // Check score changes
    const homeScoreDiff = Math.abs(payload.gameData.homeScore - existingState.homeScore);
    const awayScoreDiff = Math.abs(payload.gameData.awayScore - existingState.awayScore);
    
    if (homeScoreDiff >= this.config.minScoreDifference || 
        awayScoreDiff >= this.config.minScoreDifference) {
      return true;
    }

    // Check status changes
    if (payload.gameData.status !== existingState.status) {
      return true;
    }

    // Check period changes
    if (payload.gameData.quarter && payload.gameData.quarter !== existingState.period) {
      return true;
    }

    return false;
  }

  private throttleUpdate(payload: UserTeamScoreUpdate['payload'], comparison: ScoreComparison): boolean {
    const gameId = payload.gameData.gameId;
    
    // Check if already throttled
    if (this.throttleTimers.has(gameId)) {
      // Add to queue if not full
      if (this.updateQueue.length < this.config.maxQueueSize) {
        this.updateQueue.push(payload);
        this.metrics.throttledUpdates++;
      }
      return false;
    }

    // Execute immediately and set throttle timer
    const result = this.executeUpdate(payload, comparison);
    
    this.throttleTimers.set(gameId, setTimeout(() => {
      this.throttleTimers.delete(gameId);
      
      // Process queued updates for this game
      const queuedUpdates = this.updateQueue.filter(u => u.gameData.gameId === gameId);
      this.updateQueue = this.updateQueue.filter(u => u.gameData.gameId !== gameId);
      
      if (queuedUpdates.length > 0) {
        // Process the most recent update
        const latestUpdate = queuedUpdates[queuedUpdates.length - 1];
        // Get fresh comparison for queued update
        const queuedComparison = this.comparisonService.compareScores(latestUpdate, latestUpdate.gameData.gameId);
        this.executeUpdate(latestUpdate, queuedComparison);
      }
    }, this.config.throttleInterval));

    return result;
  }

  private executeUpdate(payload: UserTeamScoreUpdate['payload'], comparison?: ScoreComparison): boolean {
    try {
      // Update game state
      this.updateGameState(payload);

      // Invalidate relevant queries
      this.invalidateQueries(payload.sport, payload.gameData.gameId);

      // Emit event with comparison data
      this.emit('scoreUpdate', { payload, comparison });

      this.metrics.validUpdatesProcessed++;
      this.metrics.lastUpdateTimestamp = Date.now();
      
      this.log('Score update processed:', payload, comparison);
      return true;
    } catch (error) {
      console.error('Error executing update:', error);
      return false;
    }
  }

  private updateGameState(payload: UserTeamScoreUpdate['payload']): void {
    const gameState: GameScoreState = {
      gameId: payload.gameData.gameId,
      homeScore: payload.gameData.homeScore,
      awayScore: payload.gameData.awayScore,
      status: payload.gameData.status,
      lastUpdated: Date.now(),
      period: payload.gameData.quarter,
      timeRemaining: payload.gameData.timeRemaining,
    };

    this.gameStates.set(payload.gameData.gameId, gameState);
  }

  private invalidateQueries(sport: string, gameId?: string): void {
    // Invalidate user team scores queries
    this.queryClient.invalidateQueries({
      queryKey: ['user-team-scores', sport],
    });

    // Invalidate specific game queries if gameId provided
    if (gameId) {
      this.queryClient.invalidateQueries({
        queryKey: ['game', gameId],
      });
    }

    // Invalidate live games queries
    this.queryClient.invalidateQueries({
      queryKey: ['live-games', sport],
    });
  }

  private emit(event: string, data: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  private updateProcessingMetrics(processingTime: number): void {
    this.processingTimes.push(processingTime);
    
    // Keep only last 100 measurements
    if (this.processingTimes.length > 100) {
      this.processingTimes.shift();
    }

    // Calculate average
    this.metrics.averageProcessingTime = 
      this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length;
  }

  private log(...args: any[]): void {
    if (this.config.enableDebugLogging) {
      console.log('[ScoreUpdateService]', ...args);
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let scoreUpdateServiceInstance: ScoreUpdateService | null = null;

export function getScoreUpdateService(queryClient: QueryClient, config?: ScoreUpdateConfig): ScoreUpdateService {
  if (!scoreUpdateServiceInstance) {
    scoreUpdateServiceInstance = new ScoreUpdateService(queryClient, config);
  }
  return scoreUpdateServiceInstance;
}

export function resetScoreUpdateService(): void {
  scoreUpdateServiceInstance = null;
}