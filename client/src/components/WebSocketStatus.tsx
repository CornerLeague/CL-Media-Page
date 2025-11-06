/**
 * WebSocket Status Component
 * 
 * Displays real-time WebSocket connection status, metrics, and provides
 * manual connection controls for debugging and monitoring purposes.
 */

import React from 'react';
import { 
  useWebSocketConnection, 
  useWebSocketMetrics, 
  useWebSocketContext 
} from '../contexts/WebSocketContext';

interface WebSocketStatusProps {
  /** Whether to show detailed metrics */
  showMetrics?: boolean;
  /** Whether to show connection controls */
  showControls?: boolean;
  /** Custom CSS classes */
  className?: string;
}

export const WebSocketStatus: React.FC<WebSocketStatusProps> = ({
  showMetrics = false,
  showControls = false,
  className = '',
}) => {
  const { 
    connectionState, 
    isConnected, 
    isConnecting, 
    isReconnecting, 
    isDisconnected,
    hasError,
    lastError 
  } = useWebSocketConnection();
  
  const metrics = useWebSocketMetrics();
  const { connect, disconnect } = useWebSocketContext();

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  const getStatusColor = (): string => {
    switch (connectionState) {
      case 'connected':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'connecting':
      case 'reconnecting':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'disconnected':
        return 'text-gray-600 bg-gray-50 border-gray-200';
      case 'error':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = (): string => {
    switch (connectionState) {
      case 'connected':
        return '🟢';
      case 'connecting':
        return '🟡';
      case 'reconnecting':
        return '🔄';
      case 'disconnected':
        return '⚪';
      case 'error':
        return '🔴';
      default:
        return '⚪';
    }
  };

  const getStatusText = (): string => {
    switch (connectionState) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'reconnecting':
        return `Reconnecting... (${metrics.reconnectAttempts} attempts)`;
      case 'disconnected':
        return 'Disconnected';
      case 'error':
        return 'Connection Error';
      default:
        return 'Unknown';
    }
  };

  const formatUptime = (uptime: number): string => {
    if (uptime === 0) return '0s';
    
    const seconds = Math.floor(uptime / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const formatDate = (date: Date | null): string => {
    if (!date) return 'Never';
    return date.toLocaleTimeString();
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className={`inline-flex items-center space-x-2 ${className}`}>
      {/* Status Indicator */}
      <div className={`
        inline-flex items-center px-2 py-1 rounded-md border text-xs font-medium
        ${getStatusColor()}
      `}>
        <span className="mr-1">{getStatusIcon()}</span>
        <span>{getStatusText()}</span>
      </div>

      {/* Error Message */}
      {hasError && lastError && (
        <div className="text-xs text-red-600 max-w-xs truncate" title={lastError.message}>
          Error: {lastError.message}
        </div>
      )}

      {/* Connection Controls */}
      {showControls && (
        <div className="flex space-x-1">
          <button
            onClick={connect}
            disabled={isConnected || isConnecting}
            className="px-2 py-1 text-xs bg-blue-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600"
          >
            Connect
          </button>
          <button
            onClick={disconnect}
            disabled={isDisconnected}
            className="px-2 py-1 text-xs bg-red-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-600"
          >
            Disconnect
          </button>
        </div>
      )}

      {/* Detailed Metrics */}
      {showMetrics && (
        <div className="text-xs text-gray-600 space-y-1">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="font-medium">Uptime:</span> {formatUptime(metrics.uptime)}
            </div>
            <div>
              <span className="font-medium">Messages:</span> ↑{metrics.messagesSent} ↓{metrics.messagesReceived}
            </div>
            <div>
              <span className="font-medium">Connections:</span> {metrics.successfulConnections}/{metrics.connectionAttempts}
            </div>
            <div>
              <span className="font-medium">Last Connected:</span> {formatDate(metrics.lastConnectedAt)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// COMPACT VERSION
// ============================================================================

/**
 * Compact WebSocket status indicator for use in headers/toolbars
 */
export const WebSocketStatusCompact: React.FC<{ className?: string }> = ({ 
  className = '' 
}) => {
  const { isConnected, connectionState } = useWebSocketConnection();
  
  return (
    <div className={`inline-flex items-center ${className}`} title={`WebSocket: ${connectionState}`}>
      <div className={`w-2 h-2 rounded-full ${
        isConnected ? 'bg-green-500' : 'bg-red-500'
      }`} />
    </div>
  );
};

export default WebSocketStatus;