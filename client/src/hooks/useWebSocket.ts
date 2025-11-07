import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { isDev as isDevMode, isDevHeaderAllowed, getDevUid } from '@/lib/devAuth';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * WebSocket connection states
 */
export type WebSocketState = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * WebSocket message types from server (matching server/types/websocket.ts)
 */
export interface UserTeamScoreUpdate {
  type: 'user-team-score-update';
  payload: {
    userId: string;
    teamId: string;
    teamName: string;
    sport: string;
    gameData: {
      gameId: string;
      homeTeam: string;
      awayTeam: string;
      homeScore: number;
      awayScore: number;
      status: string;
      quarter?: string;
      timeRemaining?: string;
    };
    timestamp: string;
    isUserTeam: boolean;
  };
}

export interface UserTeamStatusChange {
  type: 'user-team-status-change';
  payload: {
    userId: string;
    teamId: string;
    gameId: string;
    oldStatus: string;
    newStatus: string;
    timestamp: string;
  };
}

export interface SubscriptionConfirmation {
  type: 'subscription-confirmation';
  payload: {
    action: 'subscribe' | 'unsubscribe';
    teamId?: string;
    sport?: string;
    success: boolean;
    message?: string;
  };
}

export interface ConnectionStatus {
  type: 'connection-status';
  payload: {
    status: 'connected' | 'authenticated' | 'error';
    userId?: string;
    message?: string;
  };
}

export interface UserTeamsLoaded {
  type: 'user-teams-loaded';
  payload: {
    teams: Array<{
      id: string;
      name: string;
      league: string;
      code: string;
    }>;
    autoSubscribed: boolean;
    message?: string;
  };
}

/**
 * Union type for all incoming WebSocket messages
 */
export type IncomingWebSocketMessage = 
  | UserTeamScoreUpdate
  | UserTeamStatusChange
  | SubscriptionConfirmation
  | ConnectionStatus
  | UserTeamsLoaded;

/**
 * Outgoing message types (client to server)
 */
export interface SubscribeToTeamMessage {
  type: 'subscribe';
  teamId: string;
}

export interface UnsubscribeFromTeamMessage {
  type: 'unsubscribe';
  teamId: string;
}

export interface SubscribeToUserTeamsMessage {
  type: 'subscribe-user-teams';
  sport?: string;
}

export interface UnsubscribeFromUserTeamsMessage {
  type: 'unsubscribe-user-teams';
  sport?: string;
}

export type OutgoingWebSocketMessage = 
  | SubscribeToTeamMessage
  | UnsubscribeFromTeamMessage
  | SubscribeToUserTeamsMessage
  | UnsubscribeFromUserTeamsMessage;

/**
 * WebSocket event handlers
 */
export interface WebSocketEventHandlers {
  onScoreUpdate?: (update: UserTeamScoreUpdate) => void;
  onStatusChange?: (change: UserTeamStatusChange) => void;
  onSubscriptionConfirmation?: (confirmation: SubscriptionConfirmation) => void;
  onConnectionStatus?: (status: ConnectionStatus) => void;
  onUserTeamsLoaded?: (teams: UserTeamsLoaded) => void;
  onError?: (error: Event) => void;
  onClose?: (event: CloseEvent) => void;
}

/**
 * WebSocket configuration options
 */
export interface WebSocketOptions {
  /** Whether to automatically connect when the hook mounts */
  autoConnect?: boolean;
  /** Whether to automatically reconnect on connection loss */
  autoReconnect?: boolean;
  /** Maximum number of reconnection attempts */
  maxReconnectAttempts?: number;
  /** Delay between reconnection attempts in milliseconds */
  reconnectDelay?: number;
  /** Whether to exponentially increase reconnection delay */
  exponentialBackoff?: boolean;
  /** Maximum reconnection delay in milliseconds */
  maxReconnectDelay?: number;
  /** Heartbeat interval in milliseconds (0 to disable) */
  heartbeatInterval?: number;
  /** Event handlers for WebSocket events */
  eventHandlers?: WebSocketEventHandlers;
}

/**
 * WebSocket hook return type
 */
export interface UseWebSocketReturn {
  /** Current WebSocket connection state */
  state: WebSocketState;
  /** Whether the WebSocket is connected */
  isConnected: boolean;
  /** Whether the WebSocket is connecting */
  isConnecting: boolean;
  /** Last error that occurred */
  lastError: Event | null;
  /** Number of reconnection attempts made */
  reconnectAttempts: number;
  /** Send a message to the server */
  sendMessage: (message: OutgoingWebSocketMessage) => boolean;
  /** Manually connect to the WebSocket */
  connect: () => void;
  /** Manually disconnect from the WebSocket */
  disconnect: () => void;
  /** Subscribe to a specific team's updates */
  subscribeToTeam: (teamId: string) => void;
  /** Unsubscribe from a specific team's updates */
  unsubscribeFromTeam: (teamId: string) => void;
  /** Subscribe to all user's favorite teams */
  subscribeToUserTeams: (sport?: string) => void;
  /** Unsubscribe from all user's favorite teams */
  unsubscribeFromUserTeams: (sport?: string) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_OPTIONS: Required<Omit<WebSocketOptions, 'eventHandlers'>> = {
  autoConnect: true,
  autoReconnect: true,
  maxReconnectAttempts: 5,
  reconnectDelay: 1000,
  exponentialBackoff: true,
  maxReconnectDelay: 30000,
  heartbeatInterval: 30000,
};

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Custom hook for managing WebSocket connections with automatic reconnection,
 * heartbeat, and comprehensive error handling
 * 
 * @param options - Configuration options for the WebSocket connection
 * @returns WebSocket connection state and utility functions
 */
export function useWebSocket(options: WebSocketOptions = {}): UseWebSocketReturn {
  const { user } = useAuth();
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  const isDev = isDevMode();
  // Resolve devUid from multiple sources for smoother development auth fallback
  const rawDevUid = getDevUid();
  const effectiveDevUid = isDevHeaderAllowed() ? rawDevUid : null;
  
  // State management
  const [state, setState] = useState<WebSocketState>('disconnected');
  const [lastError, setLastError] = useState<Event | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  
  // Refs for managing WebSocket instance and timers
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isManualDisconnectRef = useRef(false);
  
  // Computed states
  const isConnected = state === 'connected';
  const isConnecting = state === 'connecting';
  
  /**
   * Clear all active timers
   */
  const clearTimers = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);
  
  /**
   * Start heartbeat to keep connection alive
   */
  const startHeartbeat = useCallback(() => {
    if (mergedOptions.heartbeatInterval > 0) {
      heartbeatIntervalRef.current = setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          // Send ping message to keep connection alive
          wsRef.current.send(JSON.stringify({ type: 'ping' }));
        }
      }, mergedOptions.heartbeatInterval);
    }
  }, [mergedOptions.heartbeatInterval]);
  
  /**
   * Calculate reconnection delay with exponential backoff
   */
  const getReconnectDelay = useCallback((attempt: number): number => {
    if (!mergedOptions.exponentialBackoff) {
      return mergedOptions.reconnectDelay;
    }
    
    const delay = mergedOptions.reconnectDelay * Math.pow(2, attempt);
    return Math.min(delay, mergedOptions.maxReconnectDelay);
  }, [mergedOptions.reconnectDelay, mergedOptions.exponentialBackoff, mergedOptions.maxReconnectDelay]);
  
  /**
   * Handle incoming WebSocket messages
   */
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: IncomingWebSocketMessage = JSON.parse(event.data);
      
      // Route message to appropriate handler
      switch (message.type) {
        case 'user-team-score-update':
          options.eventHandlers?.onScoreUpdate?.(message);
          break;
        case 'user-team-status-change':
          options.eventHandlers?.onStatusChange?.(message);
          break;
        case 'subscription-confirmation':
          options.eventHandlers?.onSubscriptionConfirmation?.(message);
          break;
        case 'connection-status':
          options.eventHandlers?.onConnectionStatus?.(message);
          break;
        case 'user-teams-loaded':
          options.eventHandlers?.onUserTeamsLoaded?.(message);
          break;
        default:
          console.warn('Unknown WebSocket message type:', message);
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }, [options.eventHandlers]);
  
  /**
   * Handle WebSocket connection open
   */
  const handleOpen = useCallback(() => {
    setState('connected');
    setLastError(null);
    setReconnectAttempts(0);
    startHeartbeat();
    
    console.log('WebSocket connected successfully');
  }, [startHeartbeat]);
  
  /**
   * Handle WebSocket connection close
   */
  const handleClose = useCallback((event: CloseEvent) => {
    setState('disconnected');
    clearTimers();
    
    options.eventHandlers?.onClose?.(event);
    
    // Only attempt reconnection if not manually disconnected and user is authenticated
    if (!isManualDisconnectRef.current && 
        user && 
        mergedOptions.autoReconnect && 
        reconnectAttempts < mergedOptions.maxReconnectAttempts) {
      
      const delay = getReconnectDelay(reconnectAttempts);
      console.log(`WebSocket disconnected. Reconnecting in ${delay}ms... (attempt ${reconnectAttempts + 1}/${mergedOptions.maxReconnectAttempts})`);
      
      reconnectTimeoutRef.current = setTimeout(() => {
        setReconnectAttempts(prev => prev + 1);
        connect();
      }, delay);
    } else {
      console.log('WebSocket disconnected');
    }
  }, [user, mergedOptions.autoReconnect, mergedOptions.maxReconnectAttempts, reconnectAttempts, getReconnectDelay, clearTimers, options.eventHandlers]);
  
  /**
   * Handle WebSocket errors
   */
  const handleError = useCallback((event: Event) => {
    setState('error');
    setLastError(event);
    
    options.eventHandlers?.onError?.(event);
    console.error('WebSocket error:', event);
  }, [options.eventHandlers]);
  
  /**
   * Connect to WebSocket server
   */
  const connect = useCallback(() => {
    // Ensure browser environment before accessing window or WebSocket
    if (typeof window === 'undefined') {
      console.warn('WebSocket connect skipped: non-browser environment');
      return;
    }
    if (typeof WebSocket === 'undefined') {
      console.warn('WebSocket API not available in this environment');
      return;
    }
    // In dev, allow connection when effectiveDevUid is present even if user is not set
    const canConnect = !!user || (!!effectiveDevUid && isDev);
    if (!canConnect) {
      console.warn('Cannot connect WebSocket: user not authenticated and no devUid present');
      return;
    }
    
    // Don't connect if already connecting or connected
    if (wsRef.current?.readyState === WebSocket.CONNECTING || 
        wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }
    
    setState('connecting');
    isManualDisconnectRef.current = false;
    
    try {
      // Determine WebSocket URL
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // In local/dev, pass devUid as query param for server dev auth fallback when allowed
      let devUidParam = '';
      const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
      if (effectiveDevUid && (isDev || isLocalHost) && isDevHeaderAllowed()) {
        devUidParam = `?devUid=${encodeURIComponent(String(effectiveDevUid))}`;
      }

      const wsUrl = `${protocol}//${window.location.host}/ws${devUidParam}`;
      if (!import.meta.env.PROD) {
        console.log('[useWebSocket] Connecting to:', wsUrl);
      }

      // Create new WebSocket connection
      wsRef.current = new WebSocket(wsUrl);
      
      // Attach event listeners
      wsRef.current.onopen = handleOpen;
      wsRef.current.onmessage = handleMessage;
      wsRef.current.onclose = handleClose;
      wsRef.current.onerror = handleError;
      
    } catch (error) {
      setState('error');
      setLastError(error as Event);
      console.error('Failed to create WebSocket connection:', error);
    }
  }, [user, isDev, effectiveDevUid, handleOpen, handleMessage, handleClose, handleError]);
  
  /**
   * Disconnect from WebSocket server
   */
  const disconnect = useCallback(() => {
    isManualDisconnectRef.current = true;
    clearTimers();
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'Manual disconnect');
      wsRef.current = null;
    }
    
    setState('disconnected');
    setReconnectAttempts(0);
  }, [clearTimers]);
  
  /**
   * Send a message to the WebSocket server
   */
  const sendMessage = useCallback((message: OutgoingWebSocketMessage): boolean => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error('Failed to send WebSocket message:', error);
        return false;
      }
    }
    
    console.warn('Cannot send message: WebSocket not connected');
    return false;
  }, []);
  
  /**
   * Subscribe to a specific team's updates
   */
  const subscribeToTeam = useCallback((teamId: string) => {
    sendMessage({ type: 'subscribe', teamId });
  }, [sendMessage]);
  
  /**
   * Unsubscribe from a specific team's updates
   */
  const unsubscribeFromTeam = useCallback((teamId: string) => {
    sendMessage({ type: 'unsubscribe', teamId });
  }, [sendMessage]);
  
  /**
   * Subscribe to all user's favorite teams
   */
  const subscribeToUserTeams = useCallback((sport?: string) => {
    sendMessage({ type: 'subscribe-user-teams', sport });
  }, [sendMessage]);
  
  /**
   * Unsubscribe from all user's favorite teams
   */
  const unsubscribeFromUserTeams = useCallback((sport?: string) => {
    sendMessage({ type: 'unsubscribe-user-teams', sport });
  }, [sendMessage]);
  
  // Auto-connect when authenticated or in dev with devUid
  useEffect(() => {
    const shouldAutoConnect = mergedOptions.autoConnect && (user || (isDev && !!effectiveDevUid));
    if (shouldAutoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [user, effectiveDevUid, isDev, mergedOptions.autoConnect, connect, disconnect]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimers();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [clearTimers]);
  
  return {
    state,
    isConnected,
    isConnecting,
    lastError,
    reconnectAttempts,
    sendMessage,
    connect,
    disconnect,
    subscribeToTeam,
    unsubscribeFromTeam,
    subscribeToUserTeams,
    unsubscribeFromUserTeams,
  };
}