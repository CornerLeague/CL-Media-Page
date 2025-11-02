/**
 * Custom Error Classes and Types for User Team Scores Feature
 * 
 * This file defines custom error classes that extend a base UserTeamScoresError
 * to provide consistent error handling across the application with proper
 * context information and HTTP status codes.
 */

// Base error class for user team scores feature
export class UserTeamScoresError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly context?: Record<string, any>;
  
  constructor(message: string, code: string, statusCode: number, context?: Record<string, any>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.context = context;
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// Specific error types for different scenarios

/**
 * Thrown when a user doesn't have a favorite team set for a specific sport
 */
export class NoFavoriteTeamError extends UserTeamScoresError {
  constructor(userId: string, sport: string, customMessage?: string) {
    const message = customMessage || `No favorite team found for user in ${sport}`;
    super(
      message,
      'NO_FAVORITE_TEAM',
      404,
      { userId, sport }
    );
  }
}

/**
 * Thrown when external API calls fail or timeout
 */
export class ScoreFetchError extends UserTeamScoresError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'SCORE_FETCH_ERROR', 503, context);
  }
}

/**
 * Thrown when database operations fail
 */
export class DatabaseError extends UserTeamScoresError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'DATABASE_ERROR', 500, context);
  }
}

/**
 * Thrown when WebSocket operations fail
 */
export class WebSocketError extends UserTeamScoresError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'WEBSOCKET_ERROR', 500, context);
  }
}

/**
 * Thrown when input validation fails
 */
export class ValidationError extends UserTeamScoresError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'VALIDATION_ERROR', 400, context);
  }
}

/**
 * Thrown when authentication or authorization fails
 */
export class AuthenticationError extends UserTeamScoresError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'AUTHENTICATION_ERROR', 401, context);
  }
}

/**
 * Thrown when rate limits are exceeded
 */
export class RateLimitError extends UserTeamScoresError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'RATE_LIMIT_ERROR', 429, context);
  }
}

/**
 * Thrown when external service is temporarily unavailable
 */
export class ServiceUnavailableError extends UserTeamScoresError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'SERVICE_UNAVAILABLE', 503, context);
  }
}

// Error Response Types

/**
 * Standard error response format for API endpoints
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    timestamp: string;
    requestId?: string;
    details?: Record<string, any>;
  };
}

/**
 * Error context for logging and debugging
 */
export interface ErrorContext {
  userId?: string;
  sport?: string;
  teamId?: string;
  operation?: string;
  requestId?: string;
  userAgent?: string;
  clientIP?: string;
  timestamp?: string;
  [key: string]: any;
}

/**
 * Error severity levels for monitoring and alerting
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Error metadata for monitoring systems
 */
export interface ErrorMetadata {
  severity: ErrorSeverity;
  category: string;
  retryable: boolean;
  alertThreshold?: number;
}

/**
 * Utility function to check if an error is a UserTeamScoresError
 */
export function isUserTeamScoresError(error: any): error is UserTeamScoresError {
  return error instanceof UserTeamScoresError;
}

/**
 * Utility function to extract safe error information for logging
 */
export function extractErrorInfo(error: Error): {
  message: string;
  code?: string;
  statusCode?: number;
  context?: Record<string, any>;
} {
  if (isUserTeamScoresError(error)) {
    return {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      context: error.context
    };
  }
  
  return {
    message: error.message
  };
}

/**
 * Error code constants for consistent usage across the application
 */
export const ERROR_CODES = {
  NO_FAVORITE_TEAM: 'NO_FAVORITE_TEAM',
  SCORE_FETCH_ERROR: 'SCORE_FETCH_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  WEBSOCKET_ERROR: 'WEBSOCKET_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  INVALID_SPORT: 'INVALID_SPORT',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR'
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

/**
 * Utility function to create a standardized error response
 */
export function createErrorResponse(
  error: UserTeamScoresError | Error,
  requestId?: string
): ErrorResponse {
  if (error instanceof UserTeamScoresError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        timestamp: new Date().toISOString(),
        requestId,
        details: error.context
      }
    };
  }
  
  return {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
      requestId
    }
  };
}

/**
 * Utility function to log errors with proper context
 */
export function logError(
  logger: any,
  error: Error,
  context?: ErrorContext
): void {
  const errorInfo = extractErrorInfo(error);
  
  logger.error({
    error: errorInfo,
    context,
    timestamp: new Date().toISOString()
  }, `Error occurred: ${error.message}`);
  
  // Track error in monitoring system
  try {
    // Lazy import to avoid circular dependencies
    const { trackError } = require('../monitoring/errorMonitoring');
    trackError(error, context || {});
  } catch (monitoringError) {
    // Silently fail if monitoring is not available
    logger.debug({ monitoringError }, 'Failed to track error in monitoring system');
  }
}