import React, { useState, useMemo, useCallback, memo } from 'react';
import { Bell, BellOff, Volume2, VolumeX, Wifi, WifiOff, Activity, Clock, TrendingUp, AlertCircle, RefreshCw } from 'lucide-react';
import { Sport } from '../data/sportsTeams';
import { useRealTimeScoreUpdates } from '../hooks/useRealTimeScoreUpdates';
import { LoadingErrorBoundary, ConnectionStatusIndicator, ErrorDisplay } from './LoadingErrorBoundary';
import type { RealTimeUpdateEvent } from '../hooks/useRealTimeScoreUpdates';

/**
 * Props for the RealTimeUpdates component
 */
export interface RealTimeUpdatesProps {
  sports?: Sport[];
  enableNotifications?: boolean;
  enableSoundAlerts?: boolean;
  showUpdateHistory?: boolean;
  maxHistoryItems?: number;
  className?: string;
}

/**
 * Connection status indicator component - memoized for performance
 */
const ConnectionStatus = memo<{
  isConnected: boolean;
  connectionState: string;
  connectedSince: string | null;
}>(({ isConnected, connectionState, connectedSince }) => {
  const statusConfig = useMemo(() => {
    switch (connectionState) {
      case 'connected': 
        return { 
          color: 'text-green-600 bg-green-100',
          icon: <Wifi className="w-3 h-3" />
        };
      case 'connecting': 
        return { 
          color: 'text-yellow-600 bg-yellow-100',
          icon: <RefreshCw className="w-3 h-3 animate-spin" />
        };
      case 'disconnected': 
        return { 
          color: 'text-gray-600 bg-gray-100',
          icon: <WifiOff className="w-3 h-3" />
        };
      case 'error': 
        return { 
          color: 'text-red-600 bg-red-100',
          icon: <WifiOff className="w-3 h-3" />
        };
      default: 
        return { 
          color: 'text-gray-600 bg-gray-100',
          icon: <WifiOff className="w-3 h-3" />
        };
    }
  }, [connectionState, isConnected]);

  const formattedConnectedTime = useMemo(() => {
    if (!connectedSince || !isConnected) return null;
    
    const connectedTime = new Date(connectedSince);
    const now = new Date();
    const diffMs = now.getTime() - connectedTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h ago`;
  }, [connectedSince, isConnected]);

  return (
    <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}>
      {statusConfig.icon}
      <span className="capitalize">{connectionState}</span>
      {formattedConnectedTime && (
        <span className="text-xs opacity-75">
          • {formattedConnectedTime}
        </span>
      )}
    </div>
  );
});

ConnectionStatus.displayName = 'ConnectionStatus';

/**
 * Update statistics component - memoized for performance
 */
const UpdateStats = memo<{
  stats: {
    totalUpdates: number;
    scoreUpdates: number;
    statusChanges: number;
    lastUpdateTime: string | null;
    connectedSince: string | null;
  };
}>(({ stats }) => {
  const formattedLastUpdate = useMemo(() => {
    if (!stats.lastUpdateTime) return 'No updates yet';
    
    const updateTime = new Date(stats.lastUpdateTime);
    const now = new Date();
    const diffMs = now.getTime() - updateTime.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    
    if (diffSecs < 60) return `${diffSecs}s ago`;
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h ago`;
  }, [stats.lastUpdateTime]);

  return (
    <div className="grid grid-cols-2 gap-3 text-sm">
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-blue-600" />
        <div>
          <div className="font-medium">{stats.totalUpdates}</div>
          <div className="text-xs text-gray-500">Total Updates</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-green-600" />
        <div>
          <div className="font-medium">{stats.scoreUpdates}</div>
          <div className="text-xs text-gray-500">Score Updates</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-orange-600" />
        <div>
          <div className="font-medium">{stats.statusChanges}</div>
          <div className="text-xs text-gray-500">Status Changes</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-purple-600" />
        <div>
          <div className="text-xs font-medium">{formattedLastUpdate}</div>
          <div className="text-xs text-gray-500">Last Update</div>
        </div>
      </div>
    </div>
  );
});

UpdateStats.displayName = 'UpdateStats';

/**
 * Individual update history item - memoized for performance
 */
const UpdateHistoryItem = memo<{ update: RealTimeUpdateEvent }>(({ update }) => {
  const updateContent = useMemo(() => {
    const timestamp = new Date(update.timestamp).toLocaleTimeString();
    
    switch (update.type) {
      case 'score-update':
        if (update.data?.gameData) {
          const { homeTeam, awayTeam, homeScore, awayScore } = update.data.gameData;
          return {
            icon: <TrendingUp className="w-4 h-4 text-green-600" />,
            title: 'Score Update',
            content: `${homeTeam} ${homeScore} - ${awayScore} ${awayTeam}`,
            timestamp,
            bgColor: 'bg-green-50 border-green-200'
          };
        }
        return {
          icon: <TrendingUp className="w-4 h-4 text-green-600" />,
          title: 'Score Update',
          content: `Game ${update.gameId}`,
          timestamp,
          bgColor: 'bg-green-50 border-green-200'
        };
        
      case 'status-change':
        return {
          icon: <Activity className="w-4 h-4 text-blue-600" />,
          title: 'Status Change',
          content: `Game ${update.gameId} - ${update.data?.newStatus || 'Status updated'}`,
          timestamp,
          bgColor: 'bg-blue-50 border-blue-200'
        };
        
      default:
        return {
          icon: <Activity className="w-4 h-4 text-gray-600" />,
          title: 'Update',
          content: `Game ${update.gameId}`,
          timestamp,
          bgColor: 'bg-gray-50 border-gray-200'
        };
    }
  }, [update]);

  return (
    <div className={`p-3 rounded-lg border ${updateContent.bgColor}`}>
      <div className="flex items-start gap-3">
        {updateContent.icon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-900">{updateContent.title}</h4>
            <span className="text-xs text-gray-500">{updateContent.timestamp}</span>
          </div>
          <p className="text-sm text-gray-600 mt-1 truncate">{updateContent.content}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs px-2 py-0.5 bg-white rounded-full border">
              {update.sport}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

UpdateHistoryItem.displayName = 'UpdateHistoryItem';

/**
 * Main RealTimeUpdates component with performance optimizations
 */
export const RealTimeUpdates: React.FC<RealTimeUpdatesProps> = memo(({
  sports = [],
  enableNotifications = false,
  enableSoundAlerts = false,
  showUpdateHistory = true,
  maxHistoryItems = 10,
  className = '',
}) => {
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Memoize hook options to prevent unnecessary re-renders
  const hookOptions = useMemo(() => ({
    sports,
    enableNotifications,
    enableSoundAlerts,
    updateThrottleMs: 500, // Faster updates for better UX
    maxUpdateHistory: Math.max(maxHistoryItems, 50), // Keep more in memory for performance
    debounceNotificationsMs: 1500, // Shorter debounce for better responsiveness
    maxCacheSize: 100, // Larger cache for better deduplication
  }), [sports, enableNotifications, enableSoundAlerts, maxHistoryItems]);

  const realTimeUpdates = useRealTimeScoreUpdates(hookOptions);

  // Memoize filtered update history
  const displayedUpdates = useMemo(() => 
    realTimeUpdates.updateHistory.slice(-maxHistoryItems).reverse(),
    [realTimeUpdates.updateHistory, maxHistoryItems]
  );

  // Memoized event handlers
  const handleToggleNotifications = useCallback(() => {
    if (realTimeUpdates.isConnected) {
      enableNotifications ? realTimeUpdates.disableNotifications() : realTimeUpdates.enableNotifications();
    }
  }, [realTimeUpdates.isConnected, enableNotifications, realTimeUpdates.disableNotifications, realTimeUpdates.enableNotifications]);

  const handleToggleSoundAlerts = useCallback(() => {
    if (realTimeUpdates.isConnected) {
      enableSoundAlerts ? realTimeUpdates.disableSoundAlerts() : realTimeUpdates.enableSoundAlerts();
    }
  }, [realTimeUpdates.isConnected, enableSoundAlerts, realTimeUpdates.disableSoundAlerts, realTimeUpdates.enableSoundAlerts]);

  const handleClearHistory = useCallback(() => {
    realTimeUpdates.clearUpdateHistory();
  }, [realTimeUpdates.clearUpdateHistory]);

  const handleRetryConnection = useCallback(() => {
    setConnectionError(null);
    realTimeUpdates.disconnect();
    setTimeout(() => realTimeUpdates.connect(), 1000);
  }, [realTimeUpdates.disconnect, realTimeUpdates.connect]);

  // Memoize loading and error states
   const loadingErrorProps = useMemo(() => ({
     loading: {
       isLoading: realTimeUpdates.connectionState === 'connecting',
       loadingMessage: 'Connecting to real-time updates...',
     },
     error: connectionError ? {
       hasError: true,
       error: connectionError,
       retryable: true,
     } : undefined,
     connection: {
       isConnected: realTimeUpdates.isConnected,
       isConnecting: realTimeUpdates.connectionState === 'connecting',
       connectionState: realTimeUpdates.connectionState,
       lastError: connectionError || undefined,
     },
     onRetry: handleRetryConnection,
     onReconnect: handleRetryConnection,
   }), [
     realTimeUpdates.connectionState,
     realTimeUpdates.isConnected,
     connectionError,
     handleRetryConnection
   ]);

  return (
    <LoadingErrorBoundary {...loadingErrorProps}>
      <div className={`bg-white rounded-lg shadow-sm border p-6 ${className}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Real-Time Updates</h2>
            <ConnectionStatus
              isConnected={realTimeUpdates.isConnected}
              connectionState={realTimeUpdates.connectionState}
              connectedSince={realTimeUpdates.updateStats.connectedSince}
            />
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleNotifications}
              disabled={!realTimeUpdates.isConnected}
              className={`p-2 rounded-lg transition-colors ${
                enableNotifications
                  ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title={enableNotifications ? 'Disable notifications' : 'Enable notifications'}
            >
              {enableNotifications ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            </button>
            
            <button
              onClick={handleToggleSoundAlerts}
              disabled={!realTimeUpdates.isConnected}
              className={`p-2 rounded-lg transition-colors ${
                enableSoundAlerts
                  ? 'bg-green-100 text-green-600 hover:bg-green-200'
                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title={enableSoundAlerts ? 'Disable sound alerts' : 'Enable sound alerts'}
            >
              {enableSoundAlerts ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Statistics */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <UpdateStats stats={realTimeUpdates.updateStats} />
        </div>

        {/* Update History */}
        {showUpdateHistory && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-md font-medium text-gray-900">Recent Updates</h3>
              {displayedUpdates.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Clear History
                </button>
              )}
            </div>
            
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {displayedUpdates.length > 0 ? (
                displayedUpdates.map((update, index) => (
                  <UpdateHistoryItem key={`${update.gameId}-${update.timestamp}-${index}`} update={update} />
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No updates yet</p>
                  <p className="text-sm">Updates will appear here when games are active</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </LoadingErrorBoundary>
  );
});

RealTimeUpdates.displayName = 'RealTimeUpdates';

export default RealTimeUpdates;