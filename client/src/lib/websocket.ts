import { isDev as isDevMode, isDevHeaderAllowed, getDevUid } from '@/lib/devAuth';
/**
 * Enhanced WebSocket Service for Real-time Score Updates
 * 
 * This service provides robust WebSocket connection management with:
 * - Auto-reconnection with exponential backoff
 * - Connection state management
 * - Health monitoring with heartbeat/ping-pong
 * - Event subscription system
 * - Comprehensive error handling
 */

// Simple EventEmitter implementation for browser compatibility
class SimpleEventEmitter {
  private events: { [key: string]: Function[] } = {};

  on(event: string, listener: Function) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
  }

  off(event: string, listener: Function) {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter(l => l !== listener);
  }

  emit(event: string, ...args: any[]) {
    if (!this.events[event]) return;
    this.events[event].forEach(listener => listener(...args));
  }

  removeAllListeners(event?: string) {
    if (event) {
      delete this.events[event];
    } else {
      this.events = {};
    }
  }
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error' | 'reconnecting';

export interface WebSocketConfig {
  /** WebSocket server URL */
  url?: string;
  /** Auto-connect on service creation */
  autoConnect?: boolean;
  /** Auto-reconnect on connection loss */
  autoReconnect?: boolean;
  /** Maximum reconnection attempts */
  maxReconnectAttempts?: number;
  /** Initial reconnection delay in milliseconds */
  reconnectDelay?: number;
  /** Use exponential backoff for reconnection delays */
  exponentialBackoff?: boolean;
  /** Maximum reconnection delay in milliseconds */
  maxReconnectDelay?: number;
  /** Heartbeat interval in milliseconds (0 to disable) */
  heartbeatInterval?: number;
  /** Connection timeout in milliseconds */
  connectionTimeout?: number;
}

export interface ConnectionMetrics {
  /** Total connection attempts */
  connectionAttempts: number;
  /** Successful connections */
  successfulConnections: number;
  /** Failed connections */
  failedConnections: number;
  /** Current reconnection attempts */
  reconnectAttempts: number;
  /** Last connection time */
  lastConnectedAt: Date | null;
  /** Last disconnection time */
  lastDisconnectedAt: Date | null;
  /** Total messages sent */
  messagesSent: number;
  /** Total messages received */
  messagesReceived: number;
  /** Connection uptime in milliseconds */
  uptime: number;
}

export interface WebSocketServiceEvents {
  'connection-state-changed': (state: ConnectionState, previousState: ConnectionState) => void;
  'connected': () => void;
  'disconnected': (event: CloseEvent) => void;
  'error': (error: Event | Error) => void;
  'message': (data: any) => void;
  'reconnecting': (attempt: number, maxAttempts: number) => void;
  'reconnect-failed': (attempts: number) => void;
  'heartbeat-sent': () => void;
  'heartbeat-received': () => void;
  'metrics-updated': (metrics: ConnectionMetrics) => void;
}

// ============================================================================
// WEBSOCKET SERVICE CLASS
// ============================================================================

export class WebSocketService extends SimpleEventEmitter {
  private ws: WebSocket | null = null;
  private config: Required<WebSocketConfig>;
  private state: ConnectionState = 'disconnected';
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private connectionTimer: NodeJS.Timeout | null = null;
  private isManualDisconnect = false;
  private metrics: ConnectionMetrics;
  private lastHeartbeatSent: Date | null = null;
  private heartbeatResponseReceived = true;

  constructor(config: WebSocketConfig = {}) {
    super();
    
    // Set default configuration
    this.config = {
      url: this.getDefaultWebSocketUrl(),
      autoConnect: true,
      autoReconnect: true,
      maxReconnectAttempts: 5,
      reconnectDelay: 1000,
      exponentialBackoff: true,
      maxReconnectDelay: 30000,
      heartbeatInterval: 30000,
      connectionTimeout: 10000,
      ...config
    };

    // Initialize metrics
    this.metrics = {
      connectionAttempts: 0,
      successfulConnections: 0,
      failedConnections: 0,
      reconnectAttempts: 0,
      lastConnectedAt: null,
      lastDisconnectedAt: null,
      messagesSent: 0,
      messagesReceived: 0,
      uptime: 0
    };

    // Auto-connect if enabled
    if (this.config.autoConnect) {
      this.connect();
    }
  }

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  /**
   * Connect to WebSocket server
   */
  public connect(): void {
    if (this.state === 'connecting' || this.state === 'connected') {
      return;
    }

    this.isManualDisconnect = false;
    this.setState('connecting');
    this.metrics.connectionAttempts++;

    // Build URL asynchronously to allow token retrieval
    (async () => {
      try {
        const wsUrl = await this.buildWebSocketUrlAsync();
        this.ws = new WebSocket(wsUrl);

        // Set connection timeout
        this.connectionTimer = setTimeout(() => {
          if (this.state === 'connecting') {
            this.handleConnectionTimeout();
          }
        }, this.config.connectionTimeout);

        // Attach event listeners
        this.ws.onopen = this.handleOpen.bind(this);
        this.ws.onmessage = this.handleMessage.bind(this);
        this.ws.onclose = this.handleClose.bind(this);
        this.ws.onerror = this.handleError.bind(this);
      } catch (error) {
        this.handleConnectionError(error as Error);
      }
    })();
  }

  /**
   * Disconnect from WebSocket server
   */
  public disconnect(): void {
    this.isManualDisconnect = true;
    this.clearTimers();

    if (this.ws) {
      this.ws.close(1000, 'Manual disconnect');
    }

    this.setState('disconnected');
    this.metrics.reconnectAttempts = 0;
  }

  /**
   * Send message to WebSocket server
   */
  public send(message: any): boolean {
    if (this.state !== 'connected' || !this.ws) {
      console.warn('Cannot send message: WebSocket not connected');
      return false;
    }

    try {
      const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
      this.ws.send(messageStr);
      this.metrics.messagesSent++;
      this.updateMetrics();
      return true;
    } catch (error) {
      console.error('Failed to send WebSocket message:', error);
      this.emit('error', error as Error);
      return false;
    }
  }

  /**
   * Subscribe to specific event types
   */
  public subscribe(event: string, callback: Function): void {
    this.on(event, callback as any);
  }

  /**
   * Unsubscribe from specific event types
   */
  public unsubscribe(event: string, callback: Function): void {
    this.off(event, callback as any);
  }

  /**
   * Get current connection state
   */
  public getConnectionState(): ConnectionState {
    return this.state;
  }

  /**
   * Get connection metrics
   */
  public getMetrics(): ConnectionMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  /**
   * Check if WebSocket is connected
   */
  public isConnected(): boolean {
    return this.state === 'connected';
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<WebSocketConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private getDefaultWebSocketUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }

  private async buildWebSocketUrlAsync(): Promise<string> {
    // Prefer Firebase token when dev override is disabled; else use devUid in development
    try {
      const baseUrl = this.config.url;
      const url = new URL(baseUrl, window.location.origin);

      if (!isDevHeaderAllowed()) {
        try {
          const { getFirebaseIdToken } = await import('@/lib/firebaseClient');
          const idToken = await getFirebaseIdToken();
          if (idToken) {
            url.searchParams.set('token', idToken);
          }
        } catch {}
        return url.toString();
      }

      // Dev convenience: append devUid when override is allowed
      if (isDevMode() && isDevHeaderAllowed()) {
        const devUid = getDevUid() || 'dev-user';
        if (devUid) {
          url.searchParams.set('devUid', String(devUid));
        }
      }
      return url.toString();
    } catch {
      return this.config.url;
    }
  }

  private setState(newState: ConnectionState): void {
    const previousState = this.state;
    this.state = newState;
    
    if (previousState !== newState) {
      this.emit('connection-state-changed', newState, previousState);
    }
  }

  private handleOpen(): void {
    this.clearConnectionTimer();
    this.setState('connected');
    this.metrics.successfulConnections++;
    this.metrics.reconnectAttempts = 0;
    this.metrics.lastConnectedAt = new Date();
    this.updateMetrics();

    this.startHeartbeat();
    this.emit('connected');
    
    console.log('WebSocket connected successfully');
  }

  private handleMessage(event: MessageEvent): void {
    this.metrics.messagesReceived++;
    this.updateMetrics();

    try {
      // Handle heartbeat responses
      if (event.data === 'pong') {
        this.heartbeatResponseReceived = true;
        this.emit('heartbeat-received');
        return;
      }

      // Parse and emit regular messages
      const data = JSON.parse(event.data);
      this.emit('message', data);
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
      this.emit('error', error as Error);
    }
  }

  private handleClose(event: CloseEvent): void {
    this.clearTimers();
    this.setState('disconnected');
    this.metrics.lastDisconnectedAt = new Date();
    this.updateMetrics();

    this.emit('disconnected', event);

    // Attempt reconnection if not manually disconnected
    if (!this.isManualDisconnect && this.config.autoReconnect) {
      this.attemptReconnection();
    }

    console.log('WebSocket disconnected:', event.reason || 'Unknown reason');
  }

  private handleError(event: Event): void {
    this.setState('error');
    this.metrics.failedConnections++;
    this.updateMetrics();

    this.emit('error', event);
    console.error('WebSocket error:', event);
  }

  private handleConnectionTimeout(): void {
    console.warn('WebSocket connection timeout');
    this.handleConnectionError(new Error('Connection timeout'));
  }

  private handleConnectionError(error: Error): void {
    this.clearConnectionTimer();
    this.setState('error');
    this.metrics.failedConnections++;
    this.updateMetrics();

    this.emit('error', error);

    if (!this.isManualDisconnect && this.config.autoReconnect) {
      this.attemptReconnection();
    }
  }

  private attemptReconnection(): void {
    if (this.metrics.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error(`Max reconnection attempts (${this.config.maxReconnectAttempts}) reached`);
      this.emit('reconnect-failed', this.metrics.reconnectAttempts);
      return;
    }

    this.setState('reconnecting');
    this.metrics.reconnectAttempts++;

    const delay = this.calculateReconnectDelay();
    
    this.emit('reconnecting', this.metrics.reconnectAttempts, this.config.maxReconnectAttempts);
    console.log(`Reconnecting in ${delay}ms... (attempt ${this.metrics.reconnectAttempts}/${this.config.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private calculateReconnectDelay(): number {
    if (!this.config.exponentialBackoff) {
      return this.config.reconnectDelay;
    }

    const delay = this.config.reconnectDelay * Math.pow(2, this.metrics.reconnectAttempts - 1);
    return Math.min(delay, this.config.maxReconnectDelay);
  }

  private startHeartbeat(): void {
    if (this.config.heartbeatInterval <= 0) {
      return;
    }

    this.heartbeatTimer = setInterval(() => {
      if (this.state === 'connected' && this.ws) {
        // Check if previous heartbeat was acknowledged
        if (!this.heartbeatResponseReceived) {
          console.warn('Heartbeat not acknowledged, connection may be stale');
          this.ws.close(1000, 'Heartbeat timeout');
          return;
        }

        // Send heartbeat
        this.heartbeatResponseReceived = false;
        this.lastHeartbeatSent = new Date();
        this.ws.send('ping');
        this.emit('heartbeat-sent');
      }
    }, this.config.heartbeatInterval);
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    this.clearConnectionTimer();
  }

  private clearConnectionTimer(): void {
    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer);
      this.connectionTimer = null;
    }
  }

  private updateMetrics(): void {
    if (this.metrics.lastConnectedAt) {
      this.metrics.uptime = Date.now() - this.metrics.lastConnectedAt.getTime();
    }
    // Emit a shallow copy of metrics directly to avoid recursive calls via getMetrics
    this.emit('metrics-updated', { ...this.metrics });
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.disconnect();
    this.removeAllListeners();
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let webSocketServiceInstance: WebSocketService | null = null;

/**
 * Get or create WebSocket service singleton instance
 */
export function getWebSocketService(config?: WebSocketConfig): WebSocketService {
  if (!webSocketServiceInstance) {
    webSocketServiceInstance = new WebSocketService(config);
  } else if (config) {
    webSocketServiceInstance.updateConfig(config);
  }
  
  return webSocketServiceInstance;
}

/**
 * Destroy WebSocket service singleton instance
 */
export function destroyWebSocketService(): void {
  if (webSocketServiceInstance) {
    webSocketServiceInstance.destroy();
    webSocketServiceInstance = null;
  }
}