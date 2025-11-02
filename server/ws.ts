import { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { withSource } from "./logger";
import { config } from "./config";
import { storage } from "./storage";
import { 
  IncomingWebSocketMessage, 
  OutgoingWebSocketMessage,
  SubscriptionConfirmation,
  ConnectionStatus,
  UserSubscriptionUpdate,
  UserTeamsLoaded
} from "./types/websocket";
import {
  WebSocketError,
  AuthenticationError,
  ValidationError,
  logError,
  ErrorSeverity
} from "./types/errors";

const wsLog = withSource("ws");

// Enhanced WebSocket interface with user authentication
interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  userEmail?: string;
  userTeams?: Set<string>;
  subs?: Set<string>;
  isAuthenticated?: boolean;
  connectedAt?: Date;
  lastActivity?: Date;
  messagesSent?: number;
  messagesReceived?: number;
}

let wss: WebSocketServer | undefined;

// WebSocket Health Monitoring
interface WebSocketHealthMetrics {
  totalConnections: number;
  totalDisconnections: number;
  totalMessages: number;
  totalErrors: number;
  authFailures: number;
  startTime: Date;
}

const healthMetrics: WebSocketHealthMetrics = {
  totalConnections: 0,
  totalDisconnections: 0,
  totalMessages: 0,
  totalErrors: 0,
  authFailures: 0,
  startTime: new Date()
};

// Firebase Admin SDK lazy loading and initialization
async function lazyGetAdmin(): Promise<any | null> {
  try {
    const admin = await import('firebase-admin');
    return admin;
  } catch (err) {
    wsLog.warn({ err }, 'firebase-admin not available for WebSocket auth');
    return null;
  }
}

function hasFirebaseEnv(): boolean {
  const fb = config.firebase || ({} as any);
  return !!(fb.projectId && fb.clientEmail && fb.privateKey);
}

function initFirebaseOnce(admin: any): void {
  try {
    if (!admin?.apps?.length) {
      const key = (config.firebase.privateKey || '').replace(/\\n/g, '\n');
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: config.firebase.projectId!,
          clientEmail: config.firebase.clientEmail!,
          privateKey: key,
        }),
      });
      wsLog.info('firebase admin initialized for WebSocket auth');
    }
  } catch (err) {
    wsLog.error({ err }, 'failed to initialize firebase admin for WebSocket');
    throw err;
  }
}

// Authenticate WebSocket connection using JWT token
async function authenticateWebSocketConnection(
  socket: AuthenticatedWebSocket, 
  request: IncomingMessage
): Promise<string | null> {
  try {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const token = url.searchParams.get('token');
    
    // Dev fallback: Allow header override when running in dev and Firebase env missing
    if (config.isDev && !hasFirebaseEnv()) {
      const devUid = request.headers['x-dev-firebase-uid'] as string;
      if (!devUid?.trim()) {
        const authError = new AuthenticationError(
          'WebSocket authentication failed: missing dev UID header',
          { 
            reason: 'missing_dev_uid',
            environment: 'development',
            requiredHeader: 'x-dev-firebase-uid'
          }
        );
        
        logError(wsLog, authError, {
          operation: 'websocket_auth_dev_fallback',
          reason: 'missing_dev_uid',
          environment: 'development'
        });
        
        healthMetrics.authFailures++;
        return null;
      }
      wsLog.info({ uid: devUid }, 'WebSocket authenticated via dev fallback');
      return devUid.trim();
    }

    if (!token?.trim()) {
      const authError = new AuthenticationError(
        'WebSocket authentication failed: missing token parameter',
        { 
          reason: 'missing_token',
          url: request.url,
          headers: Object.keys(request.headers || {})
        }
      );
      
      logError(wsLog, authError, {
        operation: 'websocket_auth',
        reason: 'missing_token',
        url: request.url
      });
      
      healthMetrics.authFailures++;
      return null;
    }

    const admin = await lazyGetAdmin();
    if (!admin || !hasFirebaseEnv()) {
      const authError = new AuthenticationError(
        'WebSocket authentication failed: Firebase admin unavailable or environment missing',
        { 
          reason: 'admin_unavailable_or_env_missing',
          hasAdmin: !!admin,
          hasFirebaseEnv: hasFirebaseEnv()
        }
      );
      
      logError(wsLog, authError, {
        operation: 'websocket_auth',
        reason: 'admin_unavailable_or_env_missing',
        hasAdmin: !!admin,
        hasFirebaseEnv: hasFirebaseEnv()
      });
      
      healthMetrics.authFailures++;
      return null;
    }

    initFirebaseOnce(admin);
    const auth = admin.auth();
    const claims = await auth.verifyIdToken(token).catch((err: any) => {
      const authError = new AuthenticationError(
        'WebSocket token verification failed',
        { 
          reason: 'verification_failed',
          originalError: err.message,
          tokenLength: token.length
        }
      );
      
      logError(wsLog, authError, {
        operation: 'websocket_token_verification',
        reason: 'verification_failed',
        error: err.message,
        tokenLength: token.length
      });
      
      healthMetrics.authFailures++;
      return null;
    });

    if (!claims || !claims.sub) {
      const authError = new AuthenticationError(
        'WebSocket authentication failed: invalid token claims',
        { 
          reason: 'invalid_claims',
          hasClaims: !!claims,
          hasSub: !!(claims && claims.sub)
        }
      );
      
      logError(wsLog, authError, {
        operation: 'websocket_auth',
        reason: 'invalid_claims',
        hasClaims: !!claims,
        hasSub: !!(claims && claims.sub)
      });
      
      return null;
    }

    const uid = claims.sub as string;
    const email = (claims as any).email as string | undefined;
    
    // Store user information in socket
    socket.userId = uid;
    socket.userEmail = email;
    socket.isAuthenticated = true;
    
    wsLog.info({ uid, email }, 'WebSocket authenticated via Firebase');
    return uid;
  } catch (err) {
    const wsError = new WebSocketError(
      'Unexpected WebSocket authentication error',
      { 
        operation: 'websocket_auth',
        originalError: err instanceof Error ? err.message : String(err)
      }
    );
    
    logError(wsLog, wsError, {
      operation: 'websocket_auth_unexpected',
      error: err instanceof Error ? err.message : String(err)
    });
    
    return null;
  }
}

/**
 * Handle team subscription messages
 */
async function handleTeamSubscription(socket: AuthenticatedWebSocket, msg: any): Promise<void> {
  if (!msg.teamId || typeof msg.teamId !== "string") {
    sendMessage(socket, {
      type: 'subscription-confirmation',
      payload: {
        action: 'subscribe',
        success: false,
        message: 'Invalid teamId provided'
      }
    });
    return;
  }

  socket.subs!.add(msg.teamId);
  wsLog.debug({ userId: socket.userId, teamId: msg.teamId }, 'team subscription added');
  
  sendMessage(socket, {
    type: 'subscription-confirmation',
    payload: {
      action: 'subscribe',
      teamId: msg.teamId,
      success: true,
      message: `Subscribed to team ${msg.teamId}`
    }
  });
}

/**
 * Handle team unsubscription messages
 */
async function handleTeamUnsubscription(socket: AuthenticatedWebSocket, msg: any): Promise<void> {
  if (!msg.teamId || typeof msg.teamId !== "string") {
    sendMessage(socket, {
      type: 'subscription-confirmation',
      payload: {
        action: 'unsubscribe',
        success: false,
        message: 'Invalid teamId provided'
      }
    });
    return;
  }

  socket.subs!.delete(msg.teamId);
  wsLog.debug({ userId: socket.userId, teamId: msg.teamId }, 'team subscription removed');
  
  sendMessage(socket, {
    type: 'subscription-confirmation',
    payload: {
      action: 'unsubscribe',
      teamId: msg.teamId,
      success: true,
      message: `Unsubscribed from team ${msg.teamId}`
    }
  });
}

/**
 * Handle user team subscription (subscribe to all user's favorite teams)
 */
async function handleUserTeamSubscription(socket: AuthenticatedWebSocket, msg: any): Promise<void> {
  try {
    // This will be implemented in Subtask 4.3 with actual user team discovery
    // For now, just acknowledge the request
    wsLog.info({ userId: socket.userId, sport: msg.sport }, 'user team subscription requested');
    
    sendMessage(socket, {
      type: 'subscription-confirmation',
      payload: {
        action: 'subscribe',
        sport: msg.sport,
        success: true,
        message: 'User team subscription will be implemented in next phase'
      }
    });
  } catch (error) {
    wsLog.error({ userId: socket.userId, error }, 'user team subscription failed');
    sendMessage(socket, {
      type: 'subscription-confirmation',
      payload: {
        action: 'subscribe',
        sport: msg.sport,
        success: false,
        message: 'Failed to subscribe to user teams'
      }
    });
  }
}

/**
 * Handle user team unsubscription - unsubscribe from all favorite teams
 */
async function handleUserTeamUnsubscription(socket: AuthenticatedWebSocket, msg: any): Promise<void> {
  try {
    if (!socket.userId) {
      wsLog.warn('user team unsubscription attempted without authentication');
      return;
    }

    // Get user's current favorite teams to unsubscribe from
    const userProfile = await storage.getUserProfile(socket.userId);
    
    if (!userProfile || !userProfile.favoriteTeams || userProfile.favoriteTeams.length === 0) {
      wsLog.debug({ userId: socket.userId }, 'No favorite teams to unsubscribe from');
      
      sendMessage(socket, {
        type: 'subscription-confirmation',
        payload: {
          action: 'unsubscribe',
          success: true,
          message: 'No favorite teams were subscribed'
        }
      });
      return;
    }

    // Unsubscribe from all favorite teams
    let unsubscribedCount = 0;
    if (socket.subs) {
      for (const teamId of userProfile.favoriteTeams) {
        if (socket.subs.has(teamId)) {
          socket.subs.delete(teamId);
          unsubscribedCount++;
        }
      }
    }

    wsLog.info({ 
      userId: socket.userId, 
      unsubscribedCount,
      totalFavoriteTeams: userProfile.favoriteTeams.length 
    }, 'User unsubscribed from favorite teams');

    sendMessage(socket, {
      type: 'subscription-confirmation',
      payload: {
        action: 'unsubscribe',
        success: true,
        message: `Unsubscribed from ${unsubscribedCount} favorite team${unsubscribedCount !== 1 ? 's' : ''}`
      }
    });

  } catch (error) {
    wsLog.error({ userId: socket.userId, error }, 'Failed to handle user team unsubscription');
    
    sendMessage(socket, {
      type: 'subscription-confirmation',
      payload: {
        action: 'unsubscribe',
        success: false,
        message: 'Failed to unsubscribe from favorite teams'
      }
    });
  }
}

/**
 * Send a typed message to a WebSocket client
 */
function sendMessage(socket: AuthenticatedWebSocket, message: OutgoingWebSocketMessage): void {
  if (socket.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify(message));
      
      // Track sent message
      socket.messagesSent = (socket.messagesSent || 0) + 1;
      healthMetrics.totalMessages++;
    } catch (error) {
      const wsError = new WebSocketError(
        'Failed to send WebSocket message',
        { 
          operation: 'send_message',
          userId: socket.userId,
          messageType: message.type,
          socketState: socket.readyState,
          originalError: error instanceof Error ? error.message : String(error)
        }
      );
      
      logError(wsLog, wsError, {
        operation: 'websocket_send_message',
        userId: socket.userId,
        messageType: message.type,
        socketState: socket.readyState,
        error: error instanceof Error ? error.message : String(error)
      });
      
      wsLog.error({ userId: socket.userId, error }, 'Failed to send WebSocket message');
      
      // Track error
      healthMetrics.totalErrors++;
    }
  }
}

/**
 * Load user's favorite teams and auto-subscribe them to score updates
 */
async function loadUserFavoriteTeams(socket: AuthenticatedWebSocket, firebaseUid: string): Promise<void> {
  try {
    // Get user profile to access favorite teams
    const userProfile = await storage.getUserProfile(firebaseUid);
    
    if (!userProfile || !userProfile.favoriteTeams || userProfile.favoriteTeams.length === 0) {
      wsLog.debug({ userId: socket.userId }, 'No favorite teams found for user');
      
      // Send empty teams loaded message
      sendMessage(socket, {
        type: 'user-teams-loaded',
        payload: {
          teams: [],
          autoSubscribed: false,
          message: 'No favorite teams configured'
        }
      });
      return;
    }

    // Get team details for favorite teams
    const teams = [];
    for (const teamId of userProfile.favoriteTeams) {
      try {
        const team = await storage.getTeam(teamId);
        if (team) {
          teams.push({
            id: team.id,
            name: team.name,
            code: team.code,
            league: team.league
          });
        }
      } catch (error) {
        const teamError = new ValidationError(
          'Failed to load team details for favorite team',
          { 
            teamId,
            userId: socket.userId,
            originalError: error instanceof Error ? error.message : String(error)
          }
        );
        
        logError(wsLog, teamError, {
          operation: 'load_favorite_team_details',
          teamId,
          userId: socket.userId,
          error: error instanceof Error ? error.message : String(error)
        });
        
        wsLog.warn({ teamId, error }, 'Failed to load team details');
      }
    }

    // Auto-subscribe to favorite teams
    if (!socket.subs) {
      socket.subs = new Set();
    }
    
    let subscribedCount = 0;
    for (const team of teams) {
      socket.subs.add(team.id);
      subscribedCount++;
    }

    wsLog.info({ 
      userId: socket.userId, 
      teamCount: teams.length, 
      subscribedCount 
    }, 'Auto-subscribed user to favorite teams');

    // Send teams loaded confirmation
    sendMessage(socket, {
      type: 'user-teams-loaded',
      payload: {
        teams,
        autoSubscribed: subscribedCount > 0,
        message: `Auto-subscribed to ${subscribedCount} favorite team${subscribedCount !== 1 ? 's' : ''}`
      }
    });

  } catch (error) {
    const wsError = new WebSocketError(
      'Failed to load user favorite teams',
      { 
        operation: 'load_user_favorite_teams',
        userId: socket.userId,
        firebaseUid,
        originalError: error instanceof Error ? error.message : String(error)
      }
    );
    
    logError(wsLog, wsError, {
      operation: 'websocket_load_user_favorite_teams',
      userId: socket.userId,
      firebaseUid,
      error: error instanceof Error ? error.message : String(error)
    });
    
    wsLog.error({ userId: socket.userId, firebaseUid, error }, 'Failed to load user favorite teams');
    
    // Send error message
    sendMessage(socket, {
      type: 'user-teams-loaded',
      payload: {
        teams: [],
        autoSubscribed: false,
        message: 'Failed to load favorite teams'
      }
    });
  }
}

export function initWs(server: HttpServer) {
  // Scope our app WebSocket to a dedicated path to avoid collisions with Vite's HMR WebSocket
  wss = new WebSocketServer({ 
    server, 
    path: "/ws",
    perMessageDeflate: false,
    maxPayload: 16 * 1024 // 16KB max payload
  });
  
  // Setup comprehensive error handling
  setupWebSocketErrorHandling(wss);
  
  wss.on("error", (err) => {
    try { 
      const wsError = new WebSocketError(
        'WebSocket server error',
        { 
          operation: 'websocket_server',
          originalError: err instanceof Error ? err.message : String(err)
        }
      );
      
      logError(wsLog, wsError, {
        operation: 'websocket_server_error',
        error: err instanceof Error ? err.message : String(err)
      });
      
      wsLog.error({ err }, "websocket server error"); 
    } catch {}
  });
  
  wss.on("connection", async (socket: AuthenticatedWebSocket, request: IncomingMessage) => {
    // Track connection
    healthMetrics.totalConnections++;
    
    // Authenticate the WebSocket connection
    const userId = await authenticateWebSocketConnection(socket, request);
    
    if (!userId) {
      const authError = new AuthenticationError(
        'WebSocket connection rejected: authentication failed',
        { 
          reason: 'authentication_failed',
          remoteAddress: request.socket.remoteAddress,
          userAgent: request.headers['user-agent']
        }
      );
      
      logError(wsLog, authError, {
        operation: 'websocket_connection_rejection',
        reason: 'authentication_failed',
        remoteAddress: request.socket.remoteAddress
      });
      
      wsLog.warn('rejecting unauthenticated WebSocket connection');
      socket.close(1008, 'Authentication required');
      return;
    }

    // Initialize socket properties
    socket.subs = new Set<string>();
    socket.userTeams = new Set<string>();
    socket.connectedAt = new Date();
    socket.lastActivity = new Date();
    socket.messagesSent = 0;
    socket.messagesReceived = 0;
    
    wsLog.info({ userId: socket.userId }, 'WebSocket connection established');

    // Send connection confirmation
    sendMessage(socket, {
      type: 'connection-status',
      payload: {
        status: 'authenticated',
        userId: socket.userId,
        message: 'WebSocket connection authenticated successfully'
      }
    });

    // Auto-load and subscribe to user's favorite teams
    await loadUserFavoriteTeams(socket, userId);

    socket.on("message", async (data) => {
      try {
        // Track received message
        socket.messagesReceived = (socket.messagesReceived || 0) + 1;
        socket.lastActivity = new Date();
        healthMetrics.totalMessages++;
        
        const rawMessage = String(data);
        
        // Validate message format before parsing
        if (!validateWebSocketMessage(rawMessage)) {
          const validationError = new ValidationError(
            'Invalid WebSocket message format',
            { 
              operation: 'message_validation',
              userId: socket.userId,
              messageLength: rawMessage.length,
              messagePreview: rawMessage.substring(0, 100)
            }
          );
          
          logError(wsLog, validationError, {
            operation: 'websocket_message_validation',
            userId: socket.userId,
            messageLength: rawMessage.length
          });
          
          sendMessage(socket, {
            type: 'subscription-confirmation',
            payload: {
              action: 'subscribe',
              success: false,
              message: 'Invalid message format'
            }
          });
          return;
        }
        
        const msg = JSON.parse(rawMessage) as IncomingWebSocketMessage;
        
        wsLog.debug({ userId: socket.userId, messageType: msg.type }, 'WebSocket message received');
        
        switch (msg.type) {
          case "subscribe":
            await handleTeamSubscription(socket, msg);
            break;
          case "unsubscribe":
            await handleTeamUnsubscription(socket, msg);
            break;
          case "subscribe-user-teams":
            await handleUserTeamSubscription(socket, msg);
            break;
          case "unsubscribe-user-teams":
            await handleUserTeamUnsubscription(socket, msg);
            break;
          default:
            const validationError = new ValidationError(
              'Unknown WebSocket message type',
              { 
                messageType: (msg as any).type,
                userId: socket.userId,
                validTypes: ['subscribe', 'unsubscribe', 'subscribe-user-teams', 'unsubscribe-user-teams']
              }
            );
            
            logError(wsLog, validationError, {
              operation: 'websocket_message_validation',
              messageType: (msg as any).type,
              userId: socket.userId
            });
            
            wsLog.warn({ userId: socket.userId, messageType: (msg as any).type }, 'Unknown WebSocket message type');
            sendMessage(socket, {
              type: 'subscription-confirmation',
              payload: {
                action: 'subscribe',
                success: false,
                message: `Unknown message type: ${(msg as any).type}`
              }
            });
        }
      } catch (err) {
        // Track error
        healthMetrics.totalErrors++;
        
        const wsError = new WebSocketError(
          'WebSocket message parsing error',
          { 
            operation: 'message_parsing',
            userId: socket.userId,
            originalError: err instanceof Error ? err.message : String(err),
            messageLength: String(data).length
          }
        );
        
        logError(wsLog, wsError, {
          operation: 'websocket_message_parsing',
          userId: socket.userId,
          error: err instanceof Error ? err.message : String(err),
          messageLength: String(data).length
        });
        
        wsLog.error({ userId: socket.userId, error: err }, "WebSocket message parsing error");
        sendMessage(socket, {
          type: 'connection-status',
          payload: {
            status: 'error',
            message: 'Failed to parse message'
          }
        });
      }
    });

    socket.on("close", (code, reason) => {
      // Track disconnection
      healthMetrics.totalDisconnections++;
      
      wsLog.info({ 
        userId: socket.userId, 
        code, 
        reason: reason.toString() 
      }, 'WebSocket connection closed');
    });

    socket.on("error", (err) => {
      // Track error
      healthMetrics.totalErrors++;
      
      const wsError = new WebSocketError(
        'WebSocket connection error',
        { 
          operation: 'connection_error',
          userId: socket.userId,
          originalError: err instanceof Error ? err.message : String(err)
        }
      );
      
      logError(wsLog, wsError, {
        operation: 'websocket_connection_error',
        userId: socket.userId,
        error: err instanceof Error ? err.message : String(err)
      });
      
      wsLog.error({ userId: socket.userId, err }, "WebSocket connection error");
    });
  });
}

/**
 * Broadcast a typed message to specific users or teams
 */
export function broadcastToUsers(message: OutgoingWebSocketMessage, targetUserIds?: string[]): void {
  if (!wss) return;
  
  wss.clients.forEach((client) => {
    const authenticatedClient = client as AuthenticatedWebSocket;
    
    // Only send to authenticated clients
    if (!authenticatedClient.isAuthenticated || !authenticatedClient.userId) {
      return;
    }
    
    // Check if client is ready to receive messages
    if (authenticatedClient.readyState !== WebSocket.OPEN) {
      return;
    }
    
    // If target users specified, only send to those users
    if (targetUserIds && targetUserIds.length > 0) {
      if (!targetUserIds.includes(authenticatedClient.userId)) {
        return;
      }
    }
    
    sendMessage(authenticatedClient, message);
  });
}

/**
 * Broadcast a typed message to users subscribed to specific teams
 */
export function broadcastToTeamSubscribers(message: OutgoingWebSocketMessage, teamIds: string[]): void {
  if (!wss || teamIds.length === 0) return;
  
  wss.clients.forEach((client) => {
    const authenticatedClient = client as AuthenticatedWebSocket;
    
    // Only send to authenticated clients
    if (!authenticatedClient.isAuthenticated || !authenticatedClient.userId) {
      return;
    }
    
    // Check if client is ready to receive messages
    if (authenticatedClient.readyState !== WebSocket.OPEN) {
      return;
    }
    
    const subs: Set<string> = authenticatedClient.subs || new Set<string>();
    if (teamIds.some((teamId) => subs.has(teamId))) {
      sendMessage(authenticatedClient, message);
    }
  });
}

export function broadcast(type: string, payload: any) {
  if (!wss) return;
  const msg = JSON.stringify({ type, payload });
  const targetTeams: string[] = Array.isArray(payload?.teamIds) ? payload.teamIds : [];
  
  // Use forEach on the Set to avoid downlevel iteration issues
  wss.clients.forEach((client) => {
    const authenticatedClient = client as AuthenticatedWebSocket;
    
    // Only send to authenticated clients
    if (!authenticatedClient.isAuthenticated || !authenticatedClient.userId) {
      return;
    }
    
    // Check if client is ready to receive messages
    if (authenticatedClient.readyState !== WebSocket.OPEN) {
      return;
    }
    
    const subs: Set<string> = authenticatedClient.subs || new Set<string>();
    if (targetTeams.length === 0 || targetTeams.some((t) => subs.has(t))) {
      try { 
        authenticatedClient.send(msg);
        wsLog.debug({ 
          userId: authenticatedClient.userId, 
          type, 
          targetTeams 
        }, 'broadcast message sent');
      } catch (err) {
        wsLog.error({ 
          userId: authenticatedClient.userId, 
          err 
        }, 'failed to send broadcast message');
      }
    }
  });
}

/**
 * Rate limiting and throttling for score updates
 */
class ScoreUpdateThrottler {
  private lastUpdates = new Map<string, number>();
  private readonly throttleMs = 1000; // 1 second minimum between updates
  
  shouldSendUpdate(gameId: string): boolean {
    const now = Date.now();
    const lastUpdate = this.lastUpdates.get(gameId) || 0;
    
    if (now - lastUpdate >= this.throttleMs) {
      this.lastUpdates.set(gameId, now);
      return true;
    }
    
    return false;
  }
  
  cleanup(): void {
    // Clean up old entries (older than 1 hour)
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    for (const [gameId, timestamp] of this.lastUpdates.entries()) {
      if (now - timestamp > oneHour) {
        this.lastUpdates.delete(gameId);
      }
    }
  }
}

const scoreThrottler = new ScoreUpdateThrottler();

// Clean up throttler every 30 minutes
setInterval(() => {
  scoreThrottler.cleanup();
}, 30 * 60 * 1000);

/**
 * Broadcast user team score updates to relevant users only
 */
export function broadcastUserTeamUpdate(gameData: any): void {
  if (!wss) return;
  
  // Check if we should throttle this update
  if (!scoreThrottler.shouldSendUpdate(gameData.id)) {
    wsLog.debug({ gameId: gameData.id }, 'Score update throttled');
    return;
  }
  
  const affectedTeams = [gameData.homeTeamId, gameData.awayTeamId];
  const timestamp = new Date().toISOString();
  
  wss.clients.forEach((client: AuthenticatedWebSocket) => {
    if (!client.userId || client.readyState !== WebSocket.OPEN) return;
    
    // Check if user has any of the affected teams as favorites
    const hasAffectedTeam = affectedTeams.some(teamId => 
      client.userTeams?.has(teamId)
    );
    
    if (hasAffectedTeam) {
      const userTeamId = affectedTeams.find(teamId => 
        client.userTeams?.has(teamId)
      );
      
      const updateMessage = {
        type: 'user-team-score-update' as const,
        payload: {
          userId: client.userId,
          teamId: userTeamId!,
          teamName: gameData.homeTeamId === userTeamId ? gameData.homeTeam : gameData.awayTeam,
          sport: gameData.sport,
          gameData: {
            gameId: gameData.id,
            homeTeam: gameData.homeTeam,
            awayTeam: gameData.awayTeam,
            homeScore: gameData.homeScore,
            awayScore: gameData.awayScore,
            status: gameData.status,
            quarter: gameData.quarter,
            timeRemaining: gameData.timeRemaining
          },
          timestamp,
          isUserTeam: true
        }
      };
      
      try {
        sendMessage(client, updateMessage);
        wsLog.info({ 
          userId: client.userId, 
          teamId: userTeamId, 
          gameId: gameData.id 
        }, 'Sent user team score update');
      } catch (error) {
        wsLog.error({ error, userId: client.userId }, "Failed to send user team score update");
      }
    }
  });
}

/**
 * Broadcast user team status changes to relevant users
 */
export function broadcastUserTeamStatusChange(
  gameId: string, 
  teamId: string, 
  oldStatus: string, 
  newStatus: string
): void {
  if (!wss) return;
  
  const timestamp = new Date().toISOString();
  
  wss.clients.forEach((client: AuthenticatedWebSocket) => {
    if (!client.userId || !client.userTeams?.has(teamId)) return;
    
    if (client.readyState !== WebSocket.OPEN) return;
    
    const statusMessage = {
      type: 'user-team-status-change' as const,
      payload: {
        userId: client.userId,
        teamId,
        gameId,
        oldStatus,
        newStatus,
        timestamp
      }
    };
    
    try {
      sendMessage(client, statusMessage);
      wsLog.info({ 
        userId: client.userId, 
        teamId, 
        gameId, 
        oldStatus, 
        newStatus 
      }, 'Sent user team status change');
    } catch (error) {
      wsLog.error({ error, userId: client.userId }, "Failed to send user team status update");
    }
  });
}

export function getWsHealthMetrics(): {
  healthMetrics: WebSocketHealthMetrics;
  activeConnections: Array<{
    userId: string;
    connectedAt: Date;
    lastActivity: Date;
    messagesSent: number;
    messagesReceived: number;
    connectionDuration: number;
  }>;
  performanceStats: {
    averageConnectionDuration: number;
    messagesPerSecond: number;
    errorRate: number;
    authFailureRate: number;
    peakConnections: number;
  };
} {
  const activeConnections: Array<{
    userId: string;
    connectedAt: Date;
    lastActivity: Date;
    messagesSent: number;
    messagesReceived: number;
    connectionDuration: number;
  }> = [];

  let totalConnectionDuration = 0;
  let peakConnections = 0;

  if (wss) {
    wss.clients.forEach((client) => {
      const authenticatedClient = client as AuthenticatedWebSocket;
      if (authenticatedClient.isAuthenticated && 
          authenticatedClient.userId && 
          authenticatedClient.connectedAt &&
          authenticatedClient.lastActivity) {
        const connectionDuration = Date.now() - authenticatedClient.connectedAt.getTime();
        totalConnectionDuration += connectionDuration;
        
        activeConnections.push({
          userId: authenticatedClient.userId,
          connectedAt: authenticatedClient.connectedAt,
          lastActivity: authenticatedClient.lastActivity,
          messagesSent: authenticatedClient.messagesSent || 0,
          messagesReceived: authenticatedClient.messagesReceived || 0,
          connectionDuration
        });
      }
    });
    
    peakConnections = Math.max(wss.clients.size, healthMetrics.totalConnections - healthMetrics.totalDisconnections);
  }

  const uptime = Date.now() - healthMetrics.startTime.getTime();
  const uptimeSeconds = uptime / 1000;
  
  const performanceStats = {
    averageConnectionDuration: activeConnections.length > 0 ? totalConnectionDuration / activeConnections.length : 0,
    messagesPerSecond: uptimeSeconds > 0 ? healthMetrics.totalMessages / uptimeSeconds : 0,
    errorRate: healthMetrics.totalMessages > 0 ? (healthMetrics.totalErrors / healthMetrics.totalMessages) : 0,
    authFailureRate: healthMetrics.totalConnections > 0 ? (healthMetrics.authFailures / healthMetrics.totalConnections) : 0,
    peakConnections
  };

  return {
    healthMetrics,
    activeConnections,
    performanceStats
  };
}

export function getWsStats(): { 
  ready: boolean; 
  clients: number; 
  authenticatedClients: number;
  path: string;
  uptime: number;
  totalConnections: number;
  totalDisconnections: number;
  totalMessages: number;
  totalErrors: number;
  authFailures: number;
  averageMessagesPerClient: number;
  connectionHealth: string;
} {
  const ready = !!wss;
  const clients = wss ? wss.clients.size : 0;
  
  let authenticatedClients = 0;
  let totalMessagesSent = 0;
  let totalMessagesReceived = 0;
  
  if (wss) {
    wss.clients.forEach((client) => {
      const authenticatedClient = client as AuthenticatedWebSocket;
      if (authenticatedClient.isAuthenticated && authenticatedClient.userId) {
        authenticatedClients++;
      }
      totalMessagesSent += authenticatedClient.messagesSent || 0;
      totalMessagesReceived += authenticatedClient.messagesReceived || 0;
    });
  }
  
  const uptime = Date.now() - healthMetrics.startTime.getTime();
  const averageMessagesPerClient = clients > 0 ? Math.round(healthMetrics.totalMessages / clients) : 0;
  
  // Determine connection health status
  let connectionHealth = 'healthy';
  const errorRate = healthMetrics.totalMessages > 0 ? (healthMetrics.totalErrors / healthMetrics.totalMessages) : 0;
  const authFailureRate = healthMetrics.totalConnections > 0 ? (healthMetrics.authFailures / healthMetrics.totalConnections) : 0;
  
  if (errorRate > 0.1 || authFailureRate > 0.3) {
    connectionHealth = 'unhealthy';
  } else if (errorRate > 0.05 || authFailureRate > 0.15) {
    connectionHealth = 'degraded';
  }
  
  return { 
    ready, 
    clients, 
    authenticatedClients, 
    path: "/ws",
    uptime,
    totalConnections: healthMetrics.totalConnections,
    totalDisconnections: healthMetrics.totalDisconnections,
    totalMessages: healthMetrics.totalMessages,
    totalErrors: healthMetrics.totalErrors,
    authFailures: healthMetrics.authFailures,
    averageMessagesPerClient,
    connectionHealth
  };
}

/**
 * Setup comprehensive WebSocket error handling
 * This function implements the error handling requirements from Subtask 6.5
 */
export function setupWebSocketErrorHandling(wss: WebSocketServer) {
  wss.on('connection', (ws: AuthenticatedWebSocket, req: IncomingMessage) => {
    ws.on('error', (error) => {
      const wsError = new WebSocketError(
        'WebSocket connection error',
        { 
          operation: 'connection_error',
          userId: ws.userId,
          clientIP: req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
          originalError: error.message
        }
      );
      
      logError(wsLog, wsError, {
        operation: 'websocket_connection_error',
        userId: ws.userId,
        clientIP: req.socket.remoteAddress,
        error: error.message
      });
      
      healthMetrics.totalErrors++;
    });
    
    ws.on('close', (code, reason) => {
      wsLog.info({
        code,
        reason: reason.toString(),
        userId: ws.userId,
        clientIP: req.socket.remoteAddress,
        connectionDuration: ws.connectedAt ? Date.now() - ws.connectedAt.getTime() : 0
      }, 'WebSocket connection closed');
    });
  });
  
  wss.on('error', (error) => {
    const wsError = new WebSocketError(
      'WebSocket server error',
      { 
        operation: 'websocket_server_error',
        originalError: error.message
      }
    );
    
    logError(wsLog, wsError, {
      operation: 'websocket_server_error',
      error: error.message,
      stack: error.stack
    });
    
    healthMetrics.totalErrors++;
  });
}

/**
 * Enhanced broadcast function with retry logic and exponential backoff
 * Implements the retry requirements from Subtask 6.5
 */
export async function broadcastUserTeamUpdateWithRetry(
  gameData: any,
  retryCount: number = 0
): Promise<void> {
  try {
    if (!wss) {
      throw new WebSocketError('WebSocket server not initialized', { operation: 'broadcast' });
    }

    const affectedUsers = await getUsersWithFavoriteTeam(gameData.teamId);
    
    const message = JSON.stringify({
      type: 'user-team-score-update',
      data: gameData,
      timestamp: new Date().toISOString()
    });
    
    const failedConnections: AuthenticatedWebSocket[] = [];
    let successfulBroadcasts = 0;
    
    affectedUsers.forEach(userId => {
      const userConnections = getUserConnections(userId);
      
      userConnections.forEach(ws => {
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);
            successfulBroadcasts++;
            ws.messagesSent = (ws.messagesSent || 0) + 1;
          } else {
            failedConnections.push(ws);
          }
        } catch (error) {
          const wsError = new WebSocketError(
            'Failed to send WebSocket message',
            { 
              operation: 'message_send',
              userId,
              originalError: error instanceof Error ? error.message : String(error)
            }
          );
          
          logError(wsLog, wsError, {
            operation: 'websocket_message_send_failure',
            userId,
            error: error instanceof Error ? error.message : String(error)
          });
          
          failedConnections.push(ws);
        }
      });
    });
    
    // Clean up failed connections
    failedConnections.forEach(ws => {
      try {
        ws.terminate();
      } catch (error) {
         wsLog.warn({
           error: error instanceof Error ? error.message : String(error),
           userId: ws.userId
         }, 'Failed to terminate WebSocket connection');
       }
    });
    
    wsLog.info({
       gameId: gameData.id,
       successfulBroadcasts,
       failedConnections: failedConnections.length,
       retryCount
     }, 'Broadcast completed');
    
  } catch (error) {
    const wsError = new WebSocketError(
      'Failed to broadcast user team update',
      { 
        operation: 'broadcast_user_team_update',
        gameData,
        retryCount,
        originalError: error instanceof Error ? error.message : String(error)
      }
    );
    
    logError(wsLog, wsError, {
      operation: 'broadcast_user_team_update_failure',
      gameData,
      retryCount,
      error: error instanceof Error ? error.message : String(error)
    });
    
    // Retry logic for critical updates with exponential backoff
    if (retryCount < 3) {
      const backoffDelay = 1000 * Math.pow(2, retryCount); // Exponential backoff
      
      wsLog.info({
         gameId: gameData.id,
         retryCount: retryCount + 1,
         backoffDelay
       }, 'Retrying broadcast after delay');
      
      setTimeout(() => {
        broadcastUserTeamUpdateWithRetry(gameData, retryCount + 1);
      }, backoffDelay);
    } else {
      throw new WebSocketError(
        'Failed to broadcast after maximum retries',
        { gameData, maxRetries: 3, finalRetryCount: retryCount }
      );
    }
  }
}

/**
 * Validate WebSocket message format
 * Implements message validation requirements from Subtask 6.5
 */
function validateWebSocketMessage(message: any): boolean {
  try {
    if (typeof message === 'string') {
      const parsed = JSON.parse(message);
      return !!(parsed.type && parsed.data && parsed.timestamp);
    }
    
    if (typeof message === 'object' && message !== null) {
      return !!(message.type && message.data && message.timestamp);
    }
    
    return false;
  } catch (error) {
    const validationError = new ValidationError(
      'Invalid WebSocket message format',
      { 
        operation: 'message_validation',
        messageType: typeof message,
        messageLength: typeof message === 'string' ? message.length : 0,
        originalError: error instanceof Error ? error.message : String(error)
      }
    );
    
    logError(wsLog, validationError, {
      operation: 'websocket_message_validation',
      messageType: typeof message,
      error: error instanceof Error ? error.message : String(error)
    });
    
    return false;
  }
}

/**
 * Helper function to get users with a specific favorite team
 * Used by the enhanced broadcast function
 */
async function getUsersWithFavoriteTeam(teamId: string): Promise<string[]> {
  try {
    // This would typically query the database for users with this team as favorite
    // For now, we'll use the existing WebSocket connections as a fallback
    const users: string[] = [];
    
    if (wss) {
      wss.clients.forEach((client: AuthenticatedWebSocket) => {
        if (client.userId && client.userTeams?.has(teamId)) {
          users.push(client.userId);
        }
      });
    }
    
    return users;
  } catch (error) {
    const dbError = new WebSocketError(
      'Failed to get users with favorite team',
      { 
        operation: 'get_users_with_favorite_team',
        teamId,
        originalError: error instanceof Error ? error.message : String(error)
      }
    );
    
    logError(wsLog, dbError, {
      operation: 'get_users_with_favorite_team',
      teamId,
      error: error instanceof Error ? error.message : String(error)
    });
    
    return [];
  }
}

/**
 * Helper function to get WebSocket connections for a specific user
 * Used by the enhanced broadcast function
 */
function getUserConnections(userId: string): AuthenticatedWebSocket[] {
  const connections: AuthenticatedWebSocket[] = [];
  
  if (wss) {
    wss.clients.forEach((client: AuthenticatedWebSocket) => {
      if (client.userId === userId && client.readyState === WebSocket.OPEN) {
        connections.push(client);
      }
    });
  }
  
  return connections;
}

// ... existing code ...