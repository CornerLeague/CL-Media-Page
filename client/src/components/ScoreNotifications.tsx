import React, { useEffect, useState, memo, useMemo, useCallback } from 'react';
import { X, TrendingUp, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { Sport } from '../data/sportsTeams';
import { useRealTimeScoreUpdates } from '../hooks/useRealTimeScoreUpdates';
import { LoadingErrorBoundary, ErrorDisplay } from './LoadingErrorBoundary';
import type { RealTimeUpdateEvent } from '../hooks/useRealTimeScoreUpdates';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ScoreNotification {
  id: string;
  type: 'score-update' | 'status-change' | 'connection';
  title: string;
  message: string;
  sport?: Sport;
  gameId?: string;
  timestamp: string;
  duration?: number;
  priority: 'low' | 'medium' | 'high';
}

export interface ScoreNotificationsProps {
  sports?: Sport[];
  maxNotifications?: number;
  defaultDuration?: number;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  enableAutoHide?: boolean;
  className?: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Memoize the notification creation function using useMemo instead of memo
const createNotificationFromUpdate = (update: RealTimeUpdateEvent): ScoreNotification => {
  const baseNotification = {
    id: `${update.gameId}-${update.timestamp}-${Math.random()}`,
    timestamp: update.timestamp,
    sport: update.sport,
    gameId: update.gameId,
  };

  switch (update.type) {
    case 'score-update':
      const gameData = update.data?.gameData;
      return {
        ...baseNotification,
        type: 'score-update',
        title: 'Score Update!',
        message: gameData 
          ? `${gameData.homeTeam} ${gameData.homeScore} - ${gameData.awayScore} ${gameData.awayTeam}`
          : 'Game score updated',
        priority: update.data?.isUserTeam ? 'high' : 'medium',
        duration: update.data?.isUserTeam ? 8000 : 5000,
      };

    case 'status-change':
      const statusData = update.data;
      let title = 'Game Status Update';
      let message = `Game status changed to ${statusData?.newStatus || 'unknown'}`;
      let priority: 'low' | 'medium' | 'high' = 'medium';

      if (statusData?.newStatus === 'live') {
        title = 'Game Started!';
        message = `Game ${update.gameId} is now live`;
        priority = 'high';
      } else if (statusData?.newStatus === 'final') {
        title = 'Game Finished!';
        message = `Game ${update.gameId} has ended`;
        priority = 'medium';
      }

      return {
        ...baseNotification,
        type: 'status-change',
        title,
        message,
        priority,
        duration: 6000,
      };

    default:
      return {
        ...baseNotification,
        type: 'connection',
        title: 'Update Received',
        message: 'Real-time update received',
        priority: 'low',
        duration: 3000,
      };
  }
};

// ============================================================================
// NOTIFICATION ITEM COMPONENT
// ============================================================================

// Memoize the NotificationItem component
const NotificationItem: React.FC<{
  notification: ScoreNotification;
  onDismiss: (id: string) => void;
  enableAutoHide: boolean;
}> = memo(({ notification, onDismiss, enableAutoHide }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  // Animate in
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Auto-hide
  useEffect(() => {
    if (!enableAutoHide || !notification.duration) return;

    const timer = setTimeout(() => {
      handleDismiss();
    }, notification.duration);

    return () => clearTimeout(timer);
  }, [notification.duration, enableAutoHide]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss(notification.id);
    }, 300);
  };

  const getIcon = () => {
    switch (notification.type) {
      case 'score-update':
        return <TrendingUp className="w-5 h-5 text-green-500" />;
      case 'status-change':
        return <Clock className="w-5 h-5 text-orange-500" />;
      case 'connection':
        return <CheckCircle className="w-5 h-5 text-blue-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getPriorityStyles = () => {
    switch (notification.priority) {
      case 'high':
        return 'border-l-4 border-l-red-500 bg-red-50';
      case 'medium':
        return 'border-l-4 border-l-yellow-500 bg-yellow-50';
      case 'low':
        return 'border-l-4 border-l-blue-500 bg-blue-50';
      default:
        return 'border-l-4 border-l-gray-500 bg-gray-50';
    }
  };

  return (
    <div
      className={`
        transform transition-all duration-300 ease-in-out mb-3
        ${isVisible && !isExiting ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
        ${isExiting ? 'scale-95' : 'scale-100'}
      `}
    >
      <div
        className={`
          bg-white rounded-lg shadow-lg border border-gray-200 p-4 min-w-80 max-w-96
          ${getPriorityStyles()}
        `}
      >
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            {getIcon()}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-gray-900 mb-1">
                  {notification.title}
                </h4>
                <p className="text-sm text-gray-700 mb-2">
                  {notification.message}
                </p>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {notification.sport && (
                    <span className="capitalize bg-gray-100 px-2 py-1 rounded">
                      {notification.sport}
                    </span>
                  )}
                  <span>
                    {new Date(notification.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
              
              <button
                onClick={handleDismiss}
                className="flex-shrink-0 ml-2 p-1 rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Dismiss notification"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

NotificationItem.displayName = 'NotificationItem';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const ScoreNotifications: React.FC<ScoreNotificationsProps> = memo(({
  sports = [],
  maxNotifications = 5,
  defaultDuration = 5000,
  position = 'top-right',
  enableAutoHide = true,
  className = '',
}) => {
  const [notifications, setNotifications] = useState<ScoreNotification[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Memoize hook options to prevent unnecessary re-renders
  const hookOptions = useMemo(() => ({
    sports,
    enableNotifications: false, // We handle notifications ourselves
    enableSoundAlerts: false,
  }), [sports]);

  const { lastUpdate, isConnected, connectionState, connect } = useRealTimeScoreUpdates(hookOptions);

  // Memoize dismiss handler
  const handleDismiss = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // Memoize position classes
  const positionClasses = useMemo(() => {
    switch (position) {
      case 'top-left': return 'top-4 left-4';
      case 'bottom-right': return 'bottom-4 right-4';
      case 'bottom-left': return 'bottom-4 left-4';
      default: return 'top-4 right-4';
    }
  }, [position]);

  // Handle connection errors
  useEffect(() => {
    if (connectionState === 'error') {
      setConnectionError('Failed to connect to real-time score updates');
    } else {
      setConnectionError(null);
    }
  }, [connectionState]);

  const handleRetryConnection = useCallback(() => {
    setConnectionError(null);
    connect();
  }, [connect]);

  // Add notification from real-time update
  useEffect(() => {
    if (!lastUpdate) return;

    const notification = createNotificationFromUpdate(lastUpdate);
    
    setNotifications(prev => {
      const newNotifications = [notification, ...prev];
      return newNotifications.slice(0, maxNotifications);
    });
  }, [lastUpdate, maxNotifications]);

  // Add connection status notifications
  useEffect(() => {
    if (connectionState === 'connected') {
      const notification: ScoreNotification = {
        id: `connection-${Date.now()}`,
        type: 'connection',
        title: 'Connected!',
        message: 'Real-time updates are now active',
        timestamp: new Date().toISOString(),
        priority: 'low',
        duration: 3000,
      };
      
      setNotifications(prev => [notification, ...prev.slice(0, maxNotifications - 1)]);
    } else if (connectionState === 'error') {
      const notification: ScoreNotification = {
        id: `connection-error-${Date.now()}`,
        type: 'connection',
        title: 'Connection Error',
        message: 'Failed to connect to real-time updates',
        timestamp: new Date().toISOString(),
        priority: 'high',
        duration: 8000,
      };
      
      setNotifications(prev => [notification, ...prev.slice(0, maxNotifications - 1)]);
    }
  }, [connectionState, maxNotifications]);

  const dismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const dismissAll = () => {
    setNotifications([]);
  };

  const getPositionStyles = () => {
    switch (position) {
      case 'top-right':
        return 'top-4 right-4';
      case 'top-left':
        return 'top-4 left-4';
      case 'bottom-right':
        return 'bottom-4 right-4';
      case 'bottom-left':
        return 'bottom-4 left-4';
      default:
        return 'top-4 right-4';
    }
  };

  return (
    <LoadingErrorBoundary
      loading={{
        isLoading: connectionState === 'connecting',
        loadingMessage: 'Connecting to score updates...'
      }}
      error={{
        hasError: !!connectionError,
        error: connectionError || undefined,
        retryable: true
      }}
      connection={{
        isConnected,
        isConnecting: connectionState === 'connecting',
        connectionState,
        lastError: connectionError || undefined
      }}
      onRetry={handleRetryConnection}
      onReconnect={handleRetryConnection}
    >
      {notifications.length === 0 ? null : (
        <div
          className={`
            fixed z-50 pointer-events-none
            ${getPositionStyles()}
            ${className}
          `}
        >
          <div className="pointer-events-auto">
            {/* Dismiss All Button */}
            {notifications.length > 1 && (
              <div className="mb-3 flex justify-end">
                <button
                  onClick={dismissAll}
                  className="text-xs text-gray-500 hover:text-gray-700 bg-white px-2 py-1 rounded shadow-sm border border-gray-200 transition-colors"
                >
                  Dismiss All ({notifications.length})
                </button>
              </div>
            )}

            {/* Notifications */}
            <div className="space-y-0">
              {notifications.map(notification => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onDismiss={dismissNotification}
                  enableAutoHide={enableAutoHide}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </LoadingErrorBoundary>
  );
});

export default ScoreNotifications;