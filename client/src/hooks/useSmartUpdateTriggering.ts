import { useEffect, useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Sport } from '@/data/sportsTeams';
import {
  getSmartUpdateTriggeringService,
  type UpdateRequest,
  type UpdatePriority,
  type UpdateType,
  type TriggerCondition,
  type SmartUpdateConfig,
  type SmartUpdateCallbacks,
  type PerformanceMetrics,
  type UserActivityLevel,
} from '@/lib/smartUpdateTriggeringService';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface UseSmartUpdateTriggeringOptions {
  /** Configuration for the smart update triggering service */
  config?: Partial<SmartUpdateConfig>;
  /** Whether to automatically track user activity */
  autoTrackActivity?: boolean;
  /** Whether to automatically handle React Query invalidations */
  autoHandleQueryInvalidation?: boolean;
  /** Custom callbacks */
  callbacks?: Partial<SmartUpdateCallbacks>;
  /** Enable performance monitoring */
  enablePerformanceMonitoring?: boolean;
}

export interface UseSmartUpdateTriggeringReturn {
  /** Request an update with intelligent triggering */
  requestUpdate: (request: Omit<UpdateRequest, 'id' | 'timestamp'>) => string;
  /** Cancel a pending update */
  cancelUpdate: (updateId: string) => boolean;
  /** Force immediate processing of an update */
  forceUpdate: (updateId: string) => boolean;
  /** Current queue status */
  queueStatus: {
    size: number;
    byPriority: Record<UpdatePriority, number>;
    byType: Record<UpdateType, number>;
    processing: number;
  };
  /** Performance metrics */
  metrics: PerformanceMetrics | null;
  /** Current user activity level */
  userActivityLevel: UserActivityLevel;
  /** Whether the service is processing updates */
  isProcessing: boolean;
  /** Convenience methods for common update types */
  requestScoreUpdate: (gameId: string, sport: Sport, priority?: UpdatePriority) => string;
  requestStatusUpdate: (gameId: string, sport: Sport, priority?: UpdatePriority) => string;
  requestSportChange: (sport: Sport, priority?: UpdatePriority) => string;
  requestConnectionUpdate: (priority?: UpdatePriority) => string;
  /** Batch request multiple updates */
  requestBatchUpdates: (requests: Omit<UpdateRequest, 'id' | 'timestamp'>[]) => string[];
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useSmartUpdateTriggering(
  options: UseSmartUpdateTriggeringOptions = {}
): UseSmartUpdateTriggeringReturn {
  const {
    config = {},
    autoTrackActivity = true,
    autoHandleQueryInvalidation = true,
    callbacks = {},
    enablePerformanceMonitoring = true,
  } = options;

  const queryClient = useQueryClient();
  const serviceRef = useRef<ReturnType<typeof getSmartUpdateTriggeringService> | null>(null);
  
  // State for tracking service status
  const [queueStatus, setQueueStatus] = useState({
    size: 0,
    byPriority: { critical: 0, high: 0, medium: 0, low: 0 } as Record<UpdatePriority, number>,
    byType: { score: 0, status: 0, 'sport-change': 0, connection: 0, 'user-action': 0 } as Record<UpdateType, number>,
    processing: 0,
  });
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [userActivityLevel, setUserActivityLevel] = useState<UserActivityLevel>('active');
  const [isProcessing, setIsProcessing] = useState(false);

  // Activity tracking refs
  const activityTrackingRef = useRef<{
    lastActivity: number;
    interactionCount: number;
  }>({
    lastActivity: Date.now(),
    interactionCount: 0,
  });

  // Initialize service
  useEffect(() => {
    const serviceCallbacks: SmartUpdateCallbacks = {
      onUpdateTriggered: (request) => {
        setIsProcessing(true);
        
        // Handle React Query invalidation
        if (autoHandleQueryInvalidation) {
          handleQueryInvalidation(request);
        }
        
        callbacks.onUpdateTriggered?.(request);
        
        // Update queue status
        updateQueueStatus();
      },
      
      onUpdateBatched: (requests) => {
        setIsProcessing(true);
        
        // Handle batch query invalidation
        if (autoHandleQueryInvalidation) {
          requests.forEach(handleQueryInvalidation);
        }
        
        callbacks.onUpdateBatched?.(requests);
        updateQueueStatus();
      },
      
      onUpdateDeferred: (request, reason) => {
        callbacks.onUpdateDeferred?.(request, reason);
        updateQueueStatus();
      },
      
      onUpdateDropped: (request, reason) => {
        callbacks.onUpdateDropped?.(request, reason);
        updateQueueStatus();
      },
      
      onQueueOverflow: (droppedCount) => {
        callbacks.onQueueOverflow?.(droppedCount);
        updateQueueStatus();
      },
      
      onPerformanceMetrics: (newMetrics) => {
        if (enablePerformanceMonitoring) {
          setMetrics(newMetrics);
          setUserActivityLevel(newMetrics.userActivityLevel);
        }
        callbacks.onPerformanceMetrics?.(newMetrics);
      },
    };

    serviceRef.current = getSmartUpdateTriggeringService(config, serviceCallbacks);
    
    // Initial status update
    updateQueueStatus();

    return () => {
      // Cleanup is handled by the singleton service
    };
  }, []);

  // Auto-track user activity
  useEffect(() => {
    if (!autoTrackActivity || typeof window === 'undefined') return;

    const trackActivity = () => {
      const now = Date.now();
      activityTrackingRef.current.lastActivity = now;
      activityTrackingRef.current.interactionCount++;
      
      serviceRef.current?.updateUserActivity({
        lastActivity: now,
        interactionCount: activityTrackingRef.current.interactionCount,
      });
    };

    const trackFocus = () => {
      serviceRef.current?.updateUserActivity({ focusState: 'focused' });
      trackActivity();
    };

    const trackBlur = () => {
      serviceRef.current?.updateUserActivity({ focusState: 'blurred' });
    };

    const trackScroll = () => {
      serviceRef.current?.updateUserActivity({ scrollActivity: true });
      trackActivity();
    };

    const trackClick = () => {
      serviceRef.current?.updateUserActivity({ clickActivity: true });
      trackActivity();
    };

    // Add event listeners
    window.addEventListener('focus', trackFocus);
    window.addEventListener('blur', trackBlur);
    window.addEventListener('scroll', trackScroll, { passive: true });
    window.addEventListener('click', trackClick);
    window.addEventListener('keydown', trackActivity);
    window.addEventListener('mousemove', trackActivity, { passive: true });

    return () => {
      window.removeEventListener('focus', trackFocus);
      window.removeEventListener('blur', trackBlur);
      window.removeEventListener('scroll', trackScroll);
      window.removeEventListener('click', trackClick);
      window.removeEventListener('keydown', trackActivity);
      window.removeEventListener('mousemove', trackActivity);
    };
  }, [autoTrackActivity]);

  // Periodic queue status updates
  useEffect(() => {
    const interval = setInterval(() => {
      updateQueueStatus();
      setIsProcessing(false); // Reset processing state
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Helper function to update queue status
  const updateQueueStatus = useCallback(() => {
    if (serviceRef.current) {
      setQueueStatus(serviceRef.current.getQueueStatus());
    }
  }, []);

  // Helper function to handle query invalidation
  const handleQueryInvalidation = useCallback((request: UpdateRequest) => {
    switch (request.type) {
      case 'score':
        queryClient.invalidateQueries({
          predicate: (query) => {
            const queryKey = query.queryKey;
            return Array.isArray(queryKey) && 
                   (queryKey.includes('scores') || 
                    queryKey.includes('userTeamScores') ||
                    (request.gameId ? queryKey.includes(request.gameId) : false) ||
                    (request.sport ? queryKey.includes(request.sport) : false));
          },
        });
        break;
        
      case 'status':
        queryClient.invalidateQueries({
          predicate: (query) => {
            const queryKey = query.queryKey;
            return Array.isArray(queryKey) && 
                   (queryKey.includes('gameStatus') ||
                    (request.gameId ? queryKey.includes(request.gameId) : false));
          },
        });
        break;
        
      case 'sport-change':
        queryClient.invalidateQueries({
          predicate: (query) => {
            const queryKey = query.queryKey;
            return Array.isArray(queryKey) && 
                   (queryKey.includes('userTeamScores') ||
                    queryKey.includes('scores'));
          },
        });
        break;
        
      case 'connection':
        // Invalidate connection-related queries
        queryClient.invalidateQueries({
          predicate: (query) => {
            const queryKey = query.queryKey;
            return Array.isArray(queryKey) && queryKey.includes('connection');
          },
        });
        break;
    }
  }, [queryClient]);

  // Main API functions
  const requestUpdate = useCallback((request: Omit<UpdateRequest, 'id' | 'timestamp'>): string => {
    if (!serviceRef.current) {
      throw new Error('Smart update triggering service not initialized');
    }
    
    const updateId = serviceRef.current.requestUpdate(request);
    updateQueueStatus();
    return updateId;
  }, [updateQueueStatus]);

  const cancelUpdate = useCallback((updateId: string): boolean => {
    if (!serviceRef.current) return false;
    
    const result = serviceRef.current.cancelUpdate(updateId);
    updateQueueStatus();
    return result;
  }, [updateQueueStatus]);

  const forceUpdate = useCallback((updateId: string): boolean => {
    if (!serviceRef.current) return false;
    
    const result = serviceRef.current.forceUpdate(updateId);
    updateQueueStatus();
    return result;
  }, [updateQueueStatus]);

  // Convenience methods
  const requestScoreUpdate = useCallback((
    gameId: string, 
    sport: Sport, 
    priority: UpdatePriority = 'high'
  ): string => {
    return requestUpdate({
      type: 'score',
      priority,
      sport,
      gameId,
      payload: { gameId, sport },
      condition: 'throttled',
    });
  }, [requestUpdate]);

  const requestStatusUpdate = useCallback((
    gameId: string, 
    sport: Sport, 
    priority: UpdatePriority = 'medium'
  ): string => {
    return requestUpdate({
      type: 'status',
      priority,
      sport,
      gameId,
      payload: { gameId, sport },
      condition: 'throttled',
    });
  }, [requestUpdate]);

  const requestSportChange = useCallback((
    sport: Sport, 
    priority: UpdatePriority = 'high'
  ): string => {
    return requestUpdate({
      type: 'sport-change',
      priority,
      sport,
      payload: { sport },
      condition: 'immediate',
    });
  }, [requestUpdate]);

  const requestConnectionUpdate = useCallback((
    priority: UpdatePriority = 'critical'
  ): string => {
    return requestUpdate({
      type: 'connection',
      priority,
      payload: { timestamp: Date.now() },
      condition: 'immediate',
    });
  }, [requestUpdate]);

  const requestBatchUpdates = useCallback((
    requests: Omit<UpdateRequest, 'id' | 'timestamp'>[]
  ): string[] => {
    return requests.map(request => requestUpdate({
      ...request,
      condition: 'batched',
    }));
  }, [requestUpdate]);

  return {
    requestUpdate,
    cancelUpdate,
    forceUpdate,
    queueStatus,
    metrics,
    userActivityLevel,
    isProcessing,
    requestScoreUpdate,
    requestStatusUpdate,
    requestSportChange,
    requestConnectionUpdate,
    requestBatchUpdates,
  };
}

// ============================================================================
// UTILITY HOOKS
// ============================================================================

/**
 * Simple hook to get queue status without full triggering functionality
 */
export function useUpdateQueueStatus() {
  const service = getSmartUpdateTriggeringService();
  const [status, setStatus] = useState(service.getQueueStatus());

  useEffect(() => {
    const interval = setInterval(() => {
      setStatus(service.getQueueStatus());
    }, 1000);

    return () => clearInterval(interval);
  }, [service]);

  return status;
}

/**
 * Hook to monitor performance metrics
 */
export function useUpdatePerformanceMetrics() {
  const service = getSmartUpdateTriggeringService();
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(service.getMetrics());
    }, 2000);

    return () => clearInterval(interval);
  }, [service]);

  return metrics;
}