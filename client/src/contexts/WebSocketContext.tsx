/**
 * WebSocket Context for Global State Management
 * 
 * This context provides:
 * - Global WebSocket service access
 * - Connection state management
 * - Real-time metrics tracking
 * - Event subscription management
 * - Authentication integration
 */

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { WebSocketService, getWebSocketService, ConnectionState, ConnectionMetrics } from '../lib/websocket';
import { useAuth } from './AuthContext';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface WebSocketContextValue {
  /** WebSocket service instance */
  service: WebSocketService;
  /** Current connection state */
  connectionState: ConnectionState;
  /** Connection metrics */
  metrics: ConnectionMetrics;
  /** Whether WebSocket is connected */
  isConnected: boolean;
  /** Connect to WebSocket */
  connect: () => void;
  /** Disconnect from WebSocket */
  disconnect: () => void;
  /** Send message through WebSocket */
  sendMessage: (message: any) => boolean;
  /** Subscribe to WebSocket events */
  subscribe: (event: string, callback: Function) => void;
  /** Unsubscribe from WebSocket events */
  unsubscribe: (event: string, callback: Function) => void;
  /** Last connection error */
  lastError: Error | null;
  /** Whether currently reconnecting */
  isReconnecting: boolean;
}

export interface WebSocketProviderProps {
  children: ReactNode;
  /** WebSocket server URL override */
  url?: string;
  /** Auto-connect on mount */
  autoConnect?: boolean;
  /** Auto-reconnect on connection loss */
  autoReconnect?: boolean;
  /** Maximum reconnection attempts */
  maxReconnectAttempts?: number;
  /** Heartbeat interval in milliseconds */
  heartbeatInterval?: number;
}

// ============================================================================
// CONTEXT CREATION
// ============================================================================

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

// ============================================================================
// WEBSOCKET PROVIDER COMPONENT
// ============================================================================

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({
  children,
  url,
  autoConnect = true,
  autoReconnect = true,
  maxReconnectAttempts = 5,
  heartbeatInterval = 30000,
}) => {
  // ============================================================================
  // HOOKS AND STATE
  // ============================================================================

  const { user } = useAuth();
  const [service] = useState(() => getWebSocketService({
    url,
    autoConnect: false, // We'll handle connection manually
    autoReconnect,
    maxReconnectAttempts,
    heartbeatInterval,
  }));

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [metrics, setMetrics] = useState<ConnectionMetrics>(() => service.getMetrics());
  const [lastError, setLastError] = useState<Error | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);

  // ============================================================================
  // DERIVED STATE
  // ============================================================================

  const isConnected = connectionState === 'connected';

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  const handleConnectionStateChanged = useCallback((
    newState: ConnectionState,
    previousState: ConnectionState
  ) => {
    setConnectionState(newState);
    setIsReconnecting(newState === 'reconnecting');
    
    // Clear error when successfully connected
    if (newState === 'connected' && lastError) {
      setLastError(null);
    }

    console.log(`WebSocket state changed: ${previousState} -> ${newState}`);
  }, [lastError]);

  const handleError = useCallback((error: Event | Error) => {
    const errorObj = error instanceof Error ? error : new Error('WebSocket error');
    setLastError(errorObj);
    console.error('WebSocket error:', errorObj);
  }, []);

  const handleMetricsUpdated = useCallback((newMetrics: ConnectionMetrics) => {
    setMetrics(newMetrics);
  }, []);

  const handleReconnecting = useCallback((attempt: number, maxAttempts: number) => {
    console.log(`WebSocket reconnecting: attempt ${attempt}/${maxAttempts}`);
  }, []);

  const handleReconnectFailed = useCallback((attempts: number) => {
    console.error(`WebSocket reconnection failed after ${attempts} attempts`);
    setLastError(new Error(`Failed to reconnect after ${attempts} attempts`));
  }, []);

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  const connect = useCallback(() => {
    // Initiates WebSocket connection; token handling occurs in service
    service.connect();
  }, [service]);

  const disconnect = useCallback(() => {
    service.disconnect();
  }, [service]);

  const sendMessage = useCallback((message: any) => {
    return service.send(message);
  }, [service]);

  const subscribe = useCallback((event: string, callback: Function) => {
    service.subscribe(event, callback);
  }, [service]);

  const unsubscribe = useCallback((event: string, callback: Function) => {
    service.unsubscribe(event, callback);
  }, [service]);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Set up event listeners
  useEffect(() => {
    service.on('connection-state-changed', handleConnectionStateChanged);
    service.on('error', handleError);
    service.on('metrics-updated', handleMetricsUpdated);
    service.on('reconnecting', handleReconnecting);
    service.on('reconnect-failed', handleReconnectFailed);

    return () => {
      service.off('connection-state-changed', handleConnectionStateChanged);
      service.off('error', handleError);
      service.off('metrics-updated', handleMetricsUpdated);
      service.off('reconnecting', handleReconnecting);
      service.off('reconnect-failed', handleReconnectFailed);
    };
  }, [
    service,
    handleConnectionStateChanged,
    handleError,
    handleMetricsUpdated,
    handleReconnecting,
    handleReconnectFailed,
  ]);

  // Handle authentication changes
  useEffect(() => {
    if (user) {
      // Connect if auto-connect is enabled and user is authenticated
      if (autoConnect && !isConnected) {
        connect();
      }
    } else if (!user && isConnected) {
      // Disconnect when user logs out
      disconnect();
    }
  }, [user, autoConnect, isConnected, connect, disconnect]);

  // Handle component unmount (disconnect once; avoid dependency thrash)
  useEffect(() => {
    return () => {
      service.disconnect();
    };
  }, [service]);

  // ============================================================================
  // CONTEXT VALUE
  // ============================================================================

  const contextValue: WebSocketContextValue = {
    service,
    connectionState,
    metrics,
    isConnected,
    connect,
    disconnect,
    sendMessage,
    subscribe,
    unsubscribe,
    lastError,
    isReconnecting,
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
};

// ============================================================================
// CUSTOM HOOK
// ============================================================================

/**
 * Hook to access WebSocket context
 * @throws Error if used outside WebSocketProvider
 */
export const useWebSocketContext = (): WebSocketContextValue => {
  const context = useContext(WebSocketContext);
  
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  
  return context;
};

// ============================================================================
// UTILITY HOOKS
// ============================================================================

/**
 * Hook to get WebSocket connection status
 */
export const useWebSocketConnection = () => {
  const { connectionState, isConnected, isReconnecting, lastError } = useWebSocketContext();
  
  return {
    connectionState,
    isConnected,
    isReconnecting,
    lastError,
    isConnecting: connectionState === 'connecting',
    isDisconnected: connectionState === 'disconnected',
    hasError: connectionState === 'error' || lastError !== null,
  };
};

/**
 * Hook to get WebSocket metrics
 */
export const useWebSocketMetrics = () => {
  const { metrics } = useWebSocketContext();
  return metrics;
};

/**
 * Hook to send WebSocket messages
 */
export const useWebSocketSender = () => {
  const { sendMessage, isConnected } = useWebSocketContext();
  
  const send = useCallback((message: any) => {
    if (!isConnected) {
      console.warn('Cannot send message: WebSocket not connected');
      return false;
    }
    return sendMessage(message);
  }, [sendMessage, isConnected]);

  return { send, canSend: isConnected };
};

/**
 * Hook to subscribe to WebSocket events with automatic cleanup
 */
export const useWebSocketSubscription = (
  event: string,
  callback: Function,
  dependencies: React.DependencyList = []
) => {
  const { subscribe, unsubscribe } = useWebSocketContext();

  useEffect(() => {
    subscribe(event, callback);
    
    return () => {
      unsubscribe(event, callback);
    };
  }, [event, subscribe, unsubscribe, ...dependencies]);
};