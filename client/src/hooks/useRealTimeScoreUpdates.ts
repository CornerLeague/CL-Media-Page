import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Sport } from '../data/sportsTeams';
import { useWebSocket } from './useWebSocket';
import { userTeamScoresKeys } from './useUserTeamScores';
import type { 
  UserTeamScoreUpdate, 
  UserTeamStatusChange,
  SubscriptionConfirmation 
} from './useWebSocket';
import type { 
  GameScoreData, 
  UserTeamScoresResult, 
  UserTeamScoresOptions 
} from './useUserTeamScores';

// ============================================================================
// TYPES
// ============================================================================

export interface RealTimeUpdateEvent {
  type: 'score-update' | 'status-change' | 'subscription-change';
  gameId: string;
  sport: Sport;
  timestamp: string;
  data: any;
}

export interface RealTimeUpdateStats {
  totalUpdates: number;
  scoreUpdates: number;
  statusChanges: number;
  lastUpdateTime: string | null;
  connectedSince: string | null;
}

export interface UseRealTimeScoreUpdatesOptions {
  sports?: Sport[];
  enableNotifications?: boolean;
  enableSoundAlerts?: boolean;
  updateThrottleMs?: number;
  maxUpdateHistory?: number;
  debounceNotificationsMs?: number;
  maxCacheSize?: number;
}

export interface UseRealTimeScoreUpdatesReturn {
  // Connection state
  isConnected: boolean;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
  
  // Update tracking
  updateHistory: RealTimeUpdateEvent[];
  updateStats: RealTimeUpdateStats;
  lastUpdate: RealTimeUpdateEvent | null;
  
  // Control functions
  connect: () => void;
  disconnect: () => void;
  subscribeToSport: (sport: Sport) => void;
  unsubscribeFromSport: (sport: Sport) => void;
  subscribeToAllUserTeams: () => void;
  unsubscribeFromAllUserTeams: () => void;
  clearUpdateHistory: () => void;
  
  // Notification controls
  enableNotifications: () => void;
  disableNotifications: () => void;
  enableSoundAlerts: () => void;
  disableSoundAlerts: () => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_OPTIONS: Required<UseRealTimeScoreUpdatesOptions> = {
  sports: [],
  enableNotifications: false,
  enableSoundAlerts: false,
  updateThrottleMs: 1000,
  maxUpdateHistory: 100,
  debounceNotificationsMs: 2000,
  maxCacheSize: 50,
};

// ============================================================================
// PERFORMANCE UTILITIES
// ============================================================================

/**
 * Debounce function for notifications to prevent spam
 */
function createDebouncer<T extends (...args: any[]) => void>(
  func: T,
  delay: number
): T {
  let timeoutId: NodeJS.Timeout | null = null;
  
  return ((...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, delay);
  }) as T;
}

/**
 * LRU Cache for managing update deduplication
 */
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

// ============================================================================
// MAIN HOOK
// ============================================================================

/**
 * Hook for managing real-time score updates across multiple sports
 * Provides comprehensive update tracking, notifications, and cache management
 * Enhanced with performance optimizations including memoization, throttling, and debouncing
 */
export function useRealTimeScoreUpdates(
  options: UseRealTimeScoreUpdatesOptions = {}
): UseRealTimeScoreUpdatesReturn {
  const mergedOptions = useMemo(() => ({ ...DEFAULT_OPTIONS, ...options }), [options]);
  const queryClient = useQueryClient();
  
  // State management
  const [updateHistory, setUpdateHistory] = useState<RealTimeUpdateEvent[]>([]);
  const [updateStats, setUpdateStats] = useState<RealTimeUpdateStats>({
    totalUpdates: 0,
    scoreUpdates: 0,
    statusChanges: 0,
    lastUpdateTime: null,
    connectedSince: null,
  });
  const [lastUpdate, setLastUpdate] = useState<RealTimeUpdateEvent | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(mergedOptions.enableNotifications);
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState(mergedOptions.enableSoundAlerts);
  
  // Performance refs
  const updateThrottleRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdatesRef = useRef<RealTimeUpdateEvent[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const updateCacheRef = useRef<LRUCache<string, boolean>>(
    new LRUCache(mergedOptions.maxCacheSize)
  );
  const notificationDebounceRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  
  // Memoized notification and sound functions
  const debouncedShowNotification = useMemo(
    () => createDebouncer((title: string, body: string, icon?: string) => {
      if (!notificationsEnabled || !('Notification' in window)) return;
      
      if (Notification.permission === 'granted') {
        new Notification(title, {
          body,
          icon: icon || '/favicon.ico',
          tag: 'score-update',
          requireInteraction: false,
        });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            new Notification(title, { body, icon });
          }
        });
      }
    }, mergedOptions.debounceNotificationsMs),
    [notificationsEnabled, mergedOptions.debounceNotificationsMs]
  );

  // Initialize audio context for sound alerts
  useEffect(() => {
    if (soundAlertsEnabled && !audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (error) {
        console.warn('Audio context not supported:', error);
      }
    }
  }, [soundAlertsEnabled]);
  
  // Memoized sound alert function
  const playUpdateSound = useCallback((updateType: 'score' | 'status') => {
    if (!soundAlertsEnabled || !audioContextRef.current) return;
    
    try {
      const ctx = audioContextRef.current;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      // Different tones for different update types
      oscillator.frequency.setValueAtTime(
        updateType === 'score' ? 800 : 600, 
        ctx.currentTime
      );
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
    } catch (error) {
      console.warn('Failed to play update sound:', error);
    }
  }, [soundAlertsEnabled]);
  
  // Process pending updates with throttling and deduplication
  const processPendingUpdates = useCallback(() => {
    if (pendingUpdatesRef.current.length === 0) return;
    
    const updates = [...pendingUpdatesRef.current];
    pendingUpdatesRef.current = [];
    
    // Deduplicate updates based on gameId + timestamp
    const deduplicatedUpdates = updates.filter(update => {
      const key = `${update.gameId}-${update.timestamp}`;
      if (updateCacheRef.current.has(key)) {
        return false;
      }
      updateCacheRef.current.set(key, true);
      return true;
    });
    
    if (deduplicatedUpdates.length === 0) return;
    
    setUpdateHistory(prev => {
      const newHistory = [...prev, ...deduplicatedUpdates];
      return newHistory.slice(-mergedOptions.maxUpdateHistory);
    });
    
    setUpdateStats(prev => ({
      totalUpdates: prev.totalUpdates + deduplicatedUpdates.length,
      scoreUpdates: prev.scoreUpdates + deduplicatedUpdates.filter(u => u.type === 'score-update').length,
      statusChanges: prev.statusChanges + deduplicatedUpdates.filter(u => u.type === 'status-change').length,
      lastUpdateTime: deduplicatedUpdates[deduplicatedUpdates.length - 1]?.timestamp || prev.lastUpdateTime,
      connectedSince: prev.connectedSince,
    }));
    
    if (deduplicatedUpdates.length > 0) {
      setLastUpdate(deduplicatedUpdates[deduplicatedUpdates.length - 1]);
    }
  }, [mergedOptions.maxUpdateHistory]);
  
  // Add update to pending queue with throttling
  const addUpdate = useCallback((update: RealTimeUpdateEvent) => {
    pendingUpdatesRef.current.push(update);
    
    if (updateThrottleRef.current) {
      clearTimeout(updateThrottleRef.current);
    }
    
    updateThrottleRef.current = setTimeout(() => {
      processPendingUpdates();
      updateThrottleRef.current = null;
    }, mergedOptions.updateThrottleMs);
  }, [processPendingUpdates, mergedOptions.updateThrottleMs]);
  
  // Memoized WebSocket event handlers
  const webSocketEventHandlers = useMemo(() => ({
    onScoreUpdate: (update: UserTeamScoreUpdate) => {
      // Update React Query cache with optimized invalidation
      const sport = update.payload.sport as Sport;
      
      // Use more specific query invalidation to reduce unnecessary re-renders
      queryClient.invalidateQueries({
        queryKey: userTeamScoresKeys.bySport(sport),
        exact: false,
      });
      
      // Create update event
      const updateEvent: RealTimeUpdateEvent = {
        type: 'score-update',
        gameId: update.payload.gameData.gameId,
        sport,
        timestamp: update.payload.timestamp,
        data: update.payload,
      };
      
      addUpdate(updateEvent);
      
      // Notifications and sound alerts for user teams only
      if (update.payload.isUserTeam) {
        playUpdateSound('score');
        
        const { homeTeam, awayTeam, homeScore, awayScore } = update.payload.gameData;
        debouncedShowNotification(
          'Score Update!',
          `${homeTeam} ${homeScore} - ${awayScore} ${awayTeam}`,
        );
      }
    },
    
    onStatusChange: (change: UserTeamStatusChange) => {
      // Invalidate queries when status changes
      queryClient.invalidateQueries({
        queryKey: userTeamScoresKeys.all,
        exact: false,
      });
      
      const updateEvent: RealTimeUpdateEvent = {
        type: 'status-change',
        gameId: change.payload.gameId,
        sport: 'football' as Sport, // Default, should be provided by server
        timestamp: change.payload.timestamp,
        data: change.payload,
      };
      
      addUpdate(updateEvent);
      playUpdateSound('status');
      
      if (change.payload.newStatus === 'live') {
        debouncedShowNotification(
          'Game Started!',
          `Game ${change.payload.gameId} is now live`,
        );
      } else if (change.payload.newStatus === 'final') {
        debouncedShowNotification(
          'Game Finished!',
          `Game ${change.payload.gameId} has ended`,
        );
      }
    },
    
    onSubscriptionConfirmation: (confirmation: SubscriptionConfirmation) => {
      console.log('Real-time updates subscription confirmed:', confirmation);
    },
  }), [queryClient, addUpdate, playUpdateSound, debouncedShowNotification]);
  
  // Initialize WebSocket with memoized handlers
  const webSocket = useWebSocket({
    autoConnect: true,
    autoReconnect: true,
    maxReconnectAttempts: 10,
    eventHandlers: webSocketEventHandlers,
  });
  
  // Update connection stats when WebSocket connects
  useEffect(() => {
    if (webSocket.isConnected && !updateStats.connectedSince) {
      setUpdateStats(prev => ({
        ...prev,
        connectedSince: new Date().toISOString(),
      }));
    } else if (!webSocket.isConnected && updateStats.connectedSince) {
      setUpdateStats(prev => ({
        ...prev,
        connectedSince: null,
      }));
    }
  }, [webSocket.isConnected, updateStats.connectedSince]);
  
  // Auto-subscribe to specified sports with memoized dependency
  const sportsString = useMemo(() => mergedOptions.sports.join(','), [mergedOptions.sports]);
  useEffect(() => {
    if (webSocket.isConnected && mergedOptions.sports.length > 0) {
      mergedOptions.sports.forEach(sport => {
        webSocket.subscribeToUserTeams(sport);
      });
    }
  }, [webSocket.isConnected, sportsString, webSocket]);
  
  // Memoized control functions
  const subscribeToSport = useCallback((sport: Sport) => {
    webSocket.subscribeToUserTeams(sport);
  }, [webSocket]);
  
  const unsubscribeFromSport = useCallback((sport: Sport) => {
    webSocket.unsubscribeFromUserTeams(sport);
  }, [webSocket]);
  
  const subscribeToAllUserTeams = useCallback(() => {
    webSocket.subscribeToUserTeams();
  }, [webSocket]);
  
  const unsubscribeFromAllUserTeams = useCallback(() => {
    webSocket.unsubscribeFromUserTeams();
  }, [webSocket]);
  
  const clearUpdateHistory = useCallback(() => {
    setUpdateHistory([]);
    setUpdateStats(prev => ({
      ...prev,
      totalUpdates: 0,
      scoreUpdates: 0,
      statusChanges: 0,
      lastUpdateTime: null,
    }));
    setLastUpdate(null);
    updateCacheRef.current.clear();
  }, []);
  
  // Memoized notification control functions
  const enableNotifications = useCallback(() => {
    setNotificationsEnabled(true);
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);
  
  const disableNotifications = useCallback(() => {
    setNotificationsEnabled(false);
  }, []);
  
  const enableSoundAlerts = useCallback(() => {
    setSoundAlertsEnabled(true);
  }, []);
  
  const disableSoundAlerts = useCallback(() => {
    setSoundAlertsEnabled(false);
  }, []);
  
  // Enhanced cleanup with memory management
  useEffect(() => {
    return () => {
      if (updateThrottleRef.current) {
        clearTimeout(updateThrottleRef.current);
      }
      
      // Clear notification debounce timers
      notificationDebounceRef.current.forEach(timer => clearTimeout(timer));
      notificationDebounceRef.current.clear();
      
      // Clear update cache
      updateCacheRef.current.clear();
      
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);
  
  // Memoized return object to prevent unnecessary re-renders
  return useMemo(() => ({
    // Connection state
    isConnected: webSocket.isConnected,
    connectionState: webSocket.state,
    
    // Update tracking
    updateHistory,
    updateStats,
    lastUpdate,
    
    // Control functions
    connect: webSocket.connect,
    disconnect: webSocket.disconnect,
    subscribeToSport,
    unsubscribeFromSport,
    subscribeToAllUserTeams,
    unsubscribeFromAllUserTeams,
    clearUpdateHistory,
    
    // Notification controls
    enableNotifications,
    disableNotifications,
    enableSoundAlerts,
    disableSoundAlerts,
  }), [
    webSocket.isConnected,
    webSocket.state,
    webSocket.connect,
    webSocket.disconnect,
    updateHistory,
    updateStats,
    lastUpdate,
    subscribeToSport,
    unsubscribeFromSport,
    subscribeToAllUserTeams,
    unsubscribeFromAllUserTeams,
    clearUpdateHistory,
    enableNotifications,
    disableNotifications,
    enableSoundAlerts,
    disableSoundAlerts,
  ]);
}

export default useRealTimeScoreUpdates;