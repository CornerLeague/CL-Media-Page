import type { Sport } from '@/data/sportsTeams';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export type UpdatePriority = 'critical' | 'high' | 'medium' | 'low';
export type UpdateType = 'score' | 'status' | 'sport-change' | 'connection' | 'user-action';
export type TriggerCondition = 'immediate' | 'throttled' | 'batched' | 'deferred';
export type UserActivityLevel = 'active' | 'idle' | 'away' | 'background';

export interface UpdateRequest {
  id: string;
  type: UpdateType;
  priority: UpdatePriority;
  sport?: Sport;
  gameId?: string;
  payload: any;
  timestamp: number;
  retryCount?: number;
  maxRetries?: number;
  expiresAt?: number;
  dependencies?: string[];
  condition: TriggerCondition;
}

export interface SmartUpdateConfig {
  /** Enable intelligent throttling based on user activity */
  enableAdaptiveThrottling: boolean;
  /** Base throttle intervals by priority (ms) */
  throttleIntervals: Record<UpdatePriority, number>;
  /** Maximum queue size before dropping low priority updates */
  maxQueueSize: number;
  /** Batch processing interval (ms) */
  batchInterval: number;
  /** Maximum batch size */
  maxBatchSize: number;
  /** User activity detection settings */
  activityDetection: {
    idleThreshold: number; // ms
    awayThreshold: number; // ms
    backgroundThreshold: number; // ms
  };
  /** Priority boost settings */
  priorityBoost: {
    enableUserInteractionBoost: boolean;
    enableCriticalGameBoost: boolean;
    enableLiveGameBoost: boolean;
  };
  /** Performance optimization */
  performance: {
    enableRequestCoalescing: boolean;
    enableDependencyTracking: boolean;
    enableMetrics: boolean;
  };
}

export interface SmartUpdateCallbacks {
  onUpdateTriggered?: (request: UpdateRequest) => void;
  onUpdateBatched?: (requests: UpdateRequest[]) => void;
  onUpdateDeferred?: (request: UpdateRequest, reason: string) => void;
  onUpdateDropped?: (request: UpdateRequest, reason: string) => void;
  onQueueOverflow?: (droppedCount: number) => void;
  onPerformanceMetrics?: (metrics: PerformanceMetrics) => void;
}

export interface PerformanceMetrics {
  queueSize: number;
  processedCount: number;
  droppedCount: number;
  averageProcessingTime: number;
  throttleHitRate: number;
  batchEfficiency: number;
  userActivityLevel: UserActivityLevel;
  lastProcessedAt: number;
}

export interface UserActivityState {
  level: UserActivityLevel;
  lastActivity: number;
  interactionCount: number;
  focusState: 'focused' | 'blurred';
  scrollActivity: boolean;
  clickActivity: boolean;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: SmartUpdateConfig = {
  enableAdaptiveThrottling: true,
  throttleIntervals: {
    critical: 100,   // Almost immediate
    high: 500,       // Half second
    medium: 2000,    // 2 seconds
    low: 5000,       // 5 seconds
  },
  maxQueueSize: 100,
  batchInterval: 1000,
  maxBatchSize: 10,
  activityDetection: {
    idleThreshold: 30000,     // 30 seconds
    awayThreshold: 300000,    // 5 minutes
    backgroundThreshold: 600000, // 10 minutes
  },
  priorityBoost: {
    enableUserInteractionBoost: true,
    enableCriticalGameBoost: true,
    enableLiveGameBoost: true,
  },
  performance: {
    enableRequestCoalescing: true,
    enableDependencyTracking: true,
    enableMetrics: true,
  },
};

// ============================================================================
// SMART UPDATE TRIGGERING SERVICE
// ============================================================================

export class SmartUpdateTriggeringService {
  private config: SmartUpdateConfig;
  private callbacks: SmartUpdateCallbacks;
  private updateQueue: Map<string, UpdateRequest> = new Map();
  private processingQueue: Set<string> = new Set();
  private throttleTimers: Map<string, NodeJS.Timeout> = new Map();
  private batchTimer: NodeJS.Timeout | null = null;
  private activityInterval: ReturnType<typeof setInterval> | null = null;
  private userActivity: UserActivityState;
  private metrics: PerformanceMetrics;
  private dependencyGraph: Map<string, Set<string>> = new Map();
  private coalescingMap: Map<string, UpdateRequest> = new Map();

  constructor(config: Partial<SmartUpdateConfig> = {}, callbacks: SmartUpdateCallbacks = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.callbacks = callbacks;
    
    this.userActivity = {
      level: 'active',
      lastActivity: Date.now(),
      interactionCount: 0,
      focusState: 'focused',
      scrollActivity: false,
      clickActivity: false,
    };

    this.metrics = {
      queueSize: 0,
      processedCount: 0,
      droppedCount: 0,
      averageProcessingTime: 0,
      throttleHitRate: 0,
      batchEfficiency: 0,
      userActivityLevel: 'active',
      lastProcessedAt: Date.now(),
    };

    this.initializeActivityTracking();
    this.startBatchProcessor();
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Request an update with intelligent triggering
   */
  requestUpdate(request: Omit<UpdateRequest, 'id' | 'timestamp'>): string {
    const updateRequest: UpdateRequest = {
      ...request,
      id: this.generateUpdateId(request),
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: request.maxRetries ?? 3,
    };

    // Apply priority boost if applicable
    const boostedRequest = this.applyPriorityBoost(updateRequest);
    
    // Handle request coalescing
    if (this.config.performance.enableRequestCoalescing) {
      const coalescedRequest = this.handleCoalescing(boostedRequest);
      if (coalescedRequest !== boostedRequest) {
        return coalescedRequest.id;
      }
    }

    // Add to queue
    this.addToQueue(boostedRequest);

    // Determine trigger condition and process
    this.processTriggerCondition(boostedRequest);

    return boostedRequest.id;
  }

  /**
   * Cancel a pending update
   */
  cancelUpdate(updateId: string): boolean {
    if (this.updateQueue.has(updateId)) {
      this.updateQueue.delete(updateId);
      this.clearThrottleTimer(updateId);
      this.updateMetrics();
      return true;
    }
    return false;
  }

  /**
   * Force immediate processing of an update
   */
  forceUpdate(updateId: string): boolean {
    const request = this.updateQueue.get(updateId);
    if (!request) return false;

    this.clearThrottleTimer(updateId);
    this.processUpdate(request);
    return true;
  }

  /**
   * Get current queue status
   */
  getQueueStatus(): {
    size: number;
    byPriority: Record<UpdatePriority, number>;
    byType: Record<UpdateType, number>;
    processing: number;
  } {
    const byPriority: Record<UpdatePriority, number> = {
      critical: 0, high: 0, medium: 0, low: 0
    };
    const byType: Record<UpdateType, number> = {
      score: 0, status: 0, 'sport-change': 0, connection: 0, 'user-action': 0
    };

    for (const request of this.updateQueue.values()) {
      byPriority[request.priority]++;
      byType[request.type]++;
    }

    return {
      size: this.updateQueue.size,
      byPriority,
      byType,
      processing: this.processingQueue.size,
    };
  }

  /**
   * Get performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Update user activity state
   */
  updateUserActivity(activity: Partial<UserActivityState>): void {
    this.userActivity = { ...this.userActivity, ...activity };
    this.updateActivityLevel();
  }

  /**
   * Cleanup and destroy service
   */
  destroy(): void {
    // Clear all timers
    this.throttleTimers.forEach(timer => clearTimeout(timer));
    this.throttleTimers.clear();
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.activityInterval) {
      clearInterval(this.activityInterval);
      this.activityInterval = null;
    }

    // Clear queues
    this.updateQueue.clear();
    this.processingQueue.clear();
    this.dependencyGraph.clear();
    this.coalescingMap.clear();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private generateUpdateId(request: Omit<UpdateRequest, 'id' | 'timestamp'>): string {
    const base = `${request.type}-${request.priority}`;
    const specific = request.gameId || request.sport || 'global';
    const timestamp = Date.now();
    return `${base}-${specific}-${timestamp}`;
  }

  private applyPriorityBoost(request: UpdateRequest): UpdateRequest {
    let boostedPriority = request.priority;

    // User interaction boost
    if (this.config.priorityBoost.enableUserInteractionBoost && 
        this.userActivity.level === 'active' && 
        this.userActivity.interactionCount > 0) {
      boostedPriority = this.boostPriority(boostedPriority);
    }

    // Critical game boost (live games, close scores, etc.)
    if (this.config.priorityBoost.enableCriticalGameBoost && 
        request.type === 'score' && 
        this.isCriticalGame(request)) {
      boostedPriority = this.boostPriority(boostedPriority);
    }

    return { ...request, priority: boostedPriority };
  }

  private boostPriority(priority: UpdatePriority): UpdatePriority {
    const priorities: UpdatePriority[] = ['low', 'medium', 'high', 'critical'];
    const currentIndex = priorities.indexOf(priority);
    return priorities[Math.min(currentIndex + 1, priorities.length - 1)];
  }

  private isCriticalGame(request: UpdateRequest): boolean {
    // This would integrate with game state to determine if it's a critical moment
    // For now, return false as placeholder
    return false;
  }

  private handleCoalescing(request: UpdateRequest): UpdateRequest {
    const coalescingKey = this.getCoalescingKey(request);
    const existing = this.coalescingMap.get(coalescingKey);

    if (existing) {
      // Merge requests, keeping higher priority
      const mergedRequest: UpdateRequest = {
        ...existing,
        priority: this.getHigherPriority(existing.priority, request.priority),
        payload: { ...existing.payload, ...request.payload },
        timestamp: Math.max(existing.timestamp, request.timestamp),
      };
      
      this.coalescingMap.set(coalescingKey, mergedRequest);
      this.updateQueue.set(existing.id, mergedRequest);
      
      return mergedRequest;
    } else {
      this.coalescingMap.set(coalescingKey, request);
      return request;
    }
  }

  private getCoalescingKey(request: UpdateRequest): string {
    return `${request.type}-${request.gameId || request.sport || 'global'}`;
  }

  private getHigherPriority(p1: UpdatePriority, p2: UpdatePriority): UpdatePriority {
    const priorities: UpdatePriority[] = ['low', 'medium', 'high', 'critical'];
    const i1 = priorities.indexOf(p1);
    const i2 = priorities.indexOf(p2);
    return priorities[Math.max(i1, i2)];
  }

  private addToQueue(request: UpdateRequest): void {
    // Check queue size limits
    if (this.updateQueue.size >= this.config.maxQueueSize) {
      this.handleQueueOverflow();
    }

    this.updateQueue.set(request.id, request);
    
    // Handle dependencies
    if (this.config.performance.enableDependencyTracking && request.dependencies) {
      this.updateDependencyGraph(request);
    }

    this.updateMetrics();
  }

  private handleQueueOverflow(): void {
    // Drop lowest priority items
    const sortedRequests = Array.from(this.updateQueue.values())
      .sort((a, b) => this.comparePriority(a.priority, b.priority));

    const toDrop = sortedRequests.slice(0, Math.floor(this.config.maxQueueSize * 0.2));
    let droppedCount = 0;

    toDrop.forEach(request => {
      if (request.priority === 'low' || request.priority === 'medium') {
        this.updateQueue.delete(request.id);
        this.callbacks.onUpdateDropped?.(request, 'queue-overflow');
        droppedCount++;
      }
    });

    this.metrics.droppedCount += droppedCount;
    this.callbacks.onQueueOverflow?.(droppedCount);
  }

  private comparePriority(p1: UpdatePriority, p2: UpdatePriority): number {
    const priorities: UpdatePriority[] = ['low', 'medium', 'high', 'critical'];
    return priorities.indexOf(p1) - priorities.indexOf(p2);
  }

  private processTriggerCondition(request: UpdateRequest): void {
    switch (request.condition) {
      case 'immediate':
        this.processUpdate(request);
        break;
      
      case 'throttled':
        this.throttleUpdate(request);
        break;
      
      case 'batched':
        // Will be processed by batch processor
        break;
      
      case 'deferred':
        this.deferUpdate(request);
        break;
    }
  }

  private processUpdate(request: UpdateRequest): void {
    if (this.processingQueue.has(request.id)) return;

    this.processingQueue.add(request.id);
    const startTime = Date.now();

    try {
      // Check dependencies
      if (this.config.performance.enableDependencyTracking && 
          !this.areDependenciesSatisfied(request)) {
        this.deferUpdate(request, 'dependencies-not-satisfied');
        return;
      }

      // Remove from queue and process
      this.updateQueue.delete(request.id);
      this.coalescingMap.delete(this.getCoalescingKey(request));
      
      this.callbacks.onUpdateTriggered?.(request);
      
      // Update metrics
      const processingTime = Date.now() - startTime;
      this.updateProcessingMetrics(processingTime);
      
    } finally {
      this.processingQueue.delete(request.id);
    }
  }

  private throttleUpdate(request: UpdateRequest): void {
    const throttleKey = `${request.type}-${request.priority}`;
    
    // If a throttle timer already exists for this key, reset it to ensure
    // the latest request is scheduled and not lost.
    const existingTimer = this.throttleTimers.get(throttleKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.throttleTimers.delete(throttleKey);
    }

    const interval = this.getAdaptiveThrottleInterval(request);
    
    const timer = setTimeout(() => {
      this.throttleTimers.delete(throttleKey);
      if (this.updateQueue.has(request.id)) {
        this.processUpdate(request);
      }
    }, interval);

    this.throttleTimers.set(throttleKey, timer);
    this.metrics.throttleHitRate++;
  }

  private getAdaptiveThrottleInterval(request: UpdateRequest): number {
    let baseInterval = this.config.throttleIntervals[request.priority];

    if (this.config.enableAdaptiveThrottling) {
      // Adjust based on user activity
      switch (this.userActivity.level) {
        case 'active':
          baseInterval *= 0.5; // Faster updates when active
          break;
        case 'idle':
          baseInterval *= 1.5; // Slower when idle
          break;
        case 'away':
          baseInterval *= 3; // Much slower when away
          break;
        case 'background':
          baseInterval *= 5; // Very slow when in background
          break;
      }
    }

    return Math.max(baseInterval, 50); // Minimum 50ms
  }

  private deferUpdate(request: UpdateRequest, reason?: string): void {
    // Move to end of queue with lower priority
    const deferredRequest = {
      ...request,
      priority: 'low' as UpdatePriority,
      condition: 'batched' as TriggerCondition,
    };
    
    this.updateQueue.set(request.id, deferredRequest);
    this.callbacks.onUpdateDeferred?.(request, reason || 'deferred');
  }

  private areDependenciesSatisfied(request: UpdateRequest): boolean {
    if (!request.dependencies) return true;
    
    return request.dependencies.every(depId => 
      !this.updateQueue.has(depId) && !this.processingQueue.has(depId)
    );
  }

  private updateDependencyGraph(request: UpdateRequest): void {
    if (!request.dependencies) return;
    
    request.dependencies.forEach(depId => {
      if (!this.dependencyGraph.has(depId)) {
        this.dependencyGraph.set(depId, new Set());
      }
      this.dependencyGraph.get(depId)!.add(request.id);
    });
  }

  private clearThrottleTimer(updateId: string): void {
    // Find and clear timer for this update
    for (const [key, timer] of this.throttleTimers.entries()) {
      if (key.includes(updateId)) {
        clearTimeout(timer);
        this.throttleTimers.delete(key);
        break;
      }
    }
  }

  private startBatchProcessor(): void {
    const processBatch = () => {
      const batchRequests = this.getBatchRequests();
      
      if (batchRequests.length > 0) {
        this.processBatch(batchRequests);
      }

      this.batchTimer = setTimeout(processBatch, this.config.batchInterval);
    };

    this.batchTimer = setTimeout(processBatch, this.config.batchInterval);
  }

  private getBatchRequests(): UpdateRequest[] {
    const batchableRequests = Array.from(this.updateQueue.values())
      .filter(request => 
        request.condition === 'batched' && 
        !this.processingQueue.has(request.id)
      )
      .sort((a, b) => this.comparePriority(b.priority, a.priority))
      .slice(0, this.config.maxBatchSize);

    return batchableRequests;
  }

  private processBatch(requests: UpdateRequest[]): void {
    if (requests.length === 0) return;

    // Remove from queue
    requests.forEach(request => {
      this.updateQueue.delete(request.id);
      this.coalescingMap.delete(this.getCoalescingKey(request));
    });

    this.callbacks.onUpdateBatched?.(requests);
    
    // Update batch efficiency metric
    this.metrics.batchEfficiency = requests.length / this.config.maxBatchSize;
    this.metrics.processedCount += requests.length;
  }

  private initializeActivityTracking(): void {
    if (typeof window === 'undefined') return;

    // Track user interactions
    const trackActivity = () => {
      this.userActivity.lastActivity = Date.now();
      this.userActivity.interactionCount++;
    };

    // Track focus state
    window.addEventListener('focus', () => {
      this.userActivity.focusState = 'focused';
      trackActivity();
    });

    window.addEventListener('blur', () => {
      this.userActivity.focusState = 'blurred';
    });

    // Track user interactions
    ['click', 'keydown', 'scroll', 'mousemove'].forEach(event => {
      window.addEventListener(event, trackActivity, { passive: true });
    });

    // Periodic activity level update
    this.activityInterval = setInterval(() => {
      this.updateActivityLevel();
    }, 5000);
  }

  private updateActivityLevel(): void {
    const now = Date.now();
    const timeSinceActivity = now - this.userActivity.lastActivity;
    const { idleThreshold, awayThreshold, backgroundThreshold } = this.config.activityDetection;

    let level: UserActivityLevel = 'active';

    if (this.userActivity.focusState === 'blurred') {
      level = 'background';
    } else if (timeSinceActivity > backgroundThreshold) {
      level = 'background';
    } else if (timeSinceActivity > awayThreshold) {
      level = 'away';
    } else if (timeSinceActivity > idleThreshold) {
      level = 'idle';
    }

    if (level !== this.userActivity.level) {
      this.userActivity.level = level;
      this.metrics.userActivityLevel = level;
    }
  }

  private updateMetrics(): void {
    this.metrics.queueSize = this.updateQueue.size;
    this.metrics.lastProcessedAt = Date.now();
    
    if (this.config.performance.enableMetrics) {
      this.callbacks.onPerformanceMetrics?.(this.metrics);
    }
  }

  private updateProcessingMetrics(processingTime: number): void {
    this.metrics.processedCount++;
    
    // Update rolling average
    const alpha = 0.1; // Smoothing factor
    this.metrics.averageProcessingTime = 
      (1 - alpha) * this.metrics.averageProcessingTime + alpha * processingTime;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let smartUpdateTriggeringServiceInstance: SmartUpdateTriggeringService | null = null;

export function getSmartUpdateTriggeringService(
  config?: Partial<SmartUpdateConfig>,
  callbacks?: SmartUpdateCallbacks
): SmartUpdateTriggeringService {
  if (!smartUpdateTriggeringServiceInstance) {
    smartUpdateTriggeringServiceInstance = new SmartUpdateTriggeringService(config, callbacks);
  }
  return smartUpdateTriggeringServiceInstance;
}

export function resetSmartUpdateTriggeringService(): void {
  if (smartUpdateTriggeringServiceInstance) {
    smartUpdateTriggeringServiceInstance.destroy();
    smartUpdateTriggeringServiceInstance = null;
  }
}