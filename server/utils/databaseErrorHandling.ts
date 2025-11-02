/**
 * Enhanced database error handling utilities for the Sports Center application
 * Provides comprehensive error classification, retry logic, transaction safety,
 * with proper connection management, transaction safety, and error classification.
 */

import { Pool, PoolClient } from "pg";
import { sql } from "drizzle-orm";
import { DatabaseError, UserTeamScoresError } from "../types/errors";
import { withSource } from "../logger";
import { dbConnectionManager } from "./dbConnection";
import { executeInTransaction, TransactionOptions, TransactionContext } from "./transactionUtils";

const log = withSource("database-error-handling");

/**
 * Database error codes for classification
 */
export const DB_ERROR_CODES = {
  // Connection errors
  CONNECTION_REFUSED: "ECONNREFUSED",
  CONNECTION_TIMEOUT: "ETIMEDOUT", 
  CONNECTION_RESET: "ECONNRESET",
  
  // PostgreSQL constraint errors
  UNIQUE_VIOLATION: "23505",
  FOREIGN_KEY_VIOLATION: "23503", 
  NOT_NULL_VIOLATION: "23502",
  CHECK_VIOLATION: "23514",
  
  // PostgreSQL syntax/query errors
  SYNTAX_ERROR: "42601",
  UNDEFINED_TABLE: "42P01",
  UNDEFINED_COLUMN: "42703",
  INVALID_TEXT_REPRESENTATION: "22P02",
  
  // PostgreSQL transaction errors
  SERIALIZATION_FAILURE: "40001",
  DEADLOCK_DETECTED: "40P01",
  
  // System errors
  DISK_FULL: "53100",
  OUT_OF_MEMORY: "53200",
  TOO_MANY_CONNECTIONS: "53300",
} as const;

/**
 * Enhanced query execution with comprehensive error handling and retry logic
 */
export async function executeQuery<T>(
  queryBuilder: () => Promise<T>,
  context: Record<string, any> = {}
): Promise<T> {
  try {
    log.debug({ context }, "Executing database query");
    
    const result = await dbConnectionManager.executeWithRetry(
      'executeQuery',
      'general',
      queryBuilder,
      context
    );
    
    log.debug({ context }, "Query executed successfully");
    return result;
  } catch (error) {
    log.error({ error, context }, "Query execution failed");
    throw classifyDatabaseError(error, 'executeQuery', context);
  }
}

/**
 * Execute raw SQL queries with parameters using node-postgres client
 */
export async function executeRawQuery<T = any>(
  query: string,
  params: any[] = [],
  context: Record<string, any> = {}
): Promise<T[]> {
  try {
    log.debug({ query, params, context }, "Executing raw SQL query");
    
    const result = await dbConnectionManager.executeWithRetry(
      'executeRawQuery',
      'general',
      async () => {
        const pool = dbConnectionManager.getPool();
        const client = await pool.connect();
        try {
          const queryResult = await client.query(query, params);
          return queryResult.rows as T[];
        } finally {
          client.release();
        }
      },
      context
    );
    
    log.debug({ context, rowCount: result.length }, "Raw query executed successfully");
    return result;
  } catch (error) {
    log.error({ error, query, params, context }, "Raw query execution failed");
    throw classifyDatabaseError(error, 'executeRawQuery', context);
  }
}

/**
 * Execute query with raw pool client for more control
 */
export async function executeQueryWithClient<T>(
  client: PoolClient,
  query: string,
  params: any[],
  operation: string,
  context?: Record<string, any>
): Promise<T> {
  const startTime = Date.now();
  
  try {
    log.debug({
      operation,
      query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
      paramCount: params.length,
      context
    }, "Executing query with client");
    
    const result = await client.query(query, params);
    
    const duration = Date.now() - startTime;
    log.info({
      operation,
      duration,
      rowCount: result.rowCount,
      context
    }, "Client query executed successfully");
    
    return result.rows as T;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = classifyDatabaseError(error, operation, context);
    
    log.error({
      operation,
      duration,
      error: dbError.message,
      code: dbError.code,
      query: query.substring(0, 100),
      paramTypes: params.map(p => typeof p),
      context
    }, "Client query failed");
    
    throw dbError;
  }
}

/**
 * Enhanced transaction execution with comprehensive error handling
 * Integrates with existing transaction utilities for proper rollback
 */
export async function executeTransaction<T>(
  operations: (client: PoolClient, context: TransactionContext) => Promise<T>,
  options: Partial<TransactionOptions> = {},
  context: Record<string, any> = {}
): Promise<T> {
  try {
    log.debug({ context, options }, "Starting database transaction");
    
    const result = await executeInTransaction(async (client, txContext) => {
      log.debug({ 
        transactionId: txContext.transactionId, 
        context 
      }, "Transaction started successfully");
      
      const operationResult = await operations(client, txContext);
      
      log.info({ 
        transactionId: txContext.transactionId, 
        context,
        operations: txContext.operations 
      }, "Transaction completed successfully");
      
      return operationResult;
    }, options);
    
    return result;
  } catch (error) {
    log.error({ 
      error, 
      context, 
      options 
    }, "Transaction failed, will be rolled back");
    
    // Re-throw the error to trigger rollback
    throw classifyDatabaseError(error, 'transaction', context);
  }
}

/**
 * Classify database errors into appropriate custom error types
 */
export function classifyDatabaseError(
  error: any, 
  operation: string, 
  context: Record<string, any> = {}
): DatabaseError {
  const errorCode = error?.code || error?.errno || 'UNKNOWN';
  const errorMessage = error?.message || 'Unknown database error';
  
  log.debug({ 
    errorCode, 
    errorMessage, 
    operation, 
    context 
  }, "Classifying database error");

  // Connection errors
  if ([
    DB_ERROR_CODES.CONNECTION_REFUSED,
    DB_ERROR_CODES.CONNECTION_TIMEOUT,
    DB_ERROR_CODES.CONNECTION_RESET
  ].includes(errorCode)) {
    return new DatabaseError(
      `Database connection failed during ${operation}`,
      { operation, errorCode, originalError: errorMessage, ...context }
    );
  }

  // Constraint violations
  if ([
    DB_ERROR_CODES.UNIQUE_VIOLATION,
    DB_ERROR_CODES.FOREIGN_KEY_VIOLATION,
    DB_ERROR_CODES.NOT_NULL_VIOLATION,
    DB_ERROR_CODES.CHECK_VIOLATION
  ].includes(errorCode)) {
    return new DatabaseError(
      `Data constraint violation in ${operation}: ${errorMessage}`,
      { operation, errorCode, originalError: errorMessage, ...context }
    );
  }

  // Query/syntax errors
  if ([
    DB_ERROR_CODES.SYNTAX_ERROR,
    DB_ERROR_CODES.UNDEFINED_TABLE,
    DB_ERROR_CODES.UNDEFINED_COLUMN,
    DB_ERROR_CODES.INVALID_TEXT_REPRESENTATION
  ].includes(errorCode)) {
    return new DatabaseError(
      `Query error in ${operation}: ${errorMessage}`,
      { operation, errorCode, originalError: errorMessage, ...context }
    );
  }

  // Transaction errors
  if ([
    DB_ERROR_CODES.SERIALIZATION_FAILURE,
    DB_ERROR_CODES.DEADLOCK_DETECTED
  ].includes(errorCode)) {
    return new DatabaseError(
      `Transaction conflict in ${operation}: ${errorMessage}`,
      { operation, errorCode, originalError: errorMessage, retryable: true, ...context }
    );
  }

  // System resource errors
  if ([
    DB_ERROR_CODES.DISK_FULL,
    DB_ERROR_CODES.OUT_OF_MEMORY,
    DB_ERROR_CODES.TOO_MANY_CONNECTIONS
  ].includes(errorCode)) {
    return new DatabaseError(
      `System resource error in ${operation}: ${errorMessage}`,
      { operation, errorCode, originalError: errorMessage, retryable: errorCode === DB_ERROR_CODES.TOO_MANY_CONNECTIONS, ...context }
    );
  }

  // Generic database error
  return new DatabaseError(
    `Database operation failed in ${operation}: ${errorMessage}`,
    { operation, errorCode, originalError: errorMessage, ...context }
  );
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: DatabaseError): boolean {
  const retryableCodes = [
    DB_ERROR_CODES.CONNECTION_TIMEOUT,
    DB_ERROR_CODES.CONNECTION_RESET,
    DB_ERROR_CODES.SERIALIZATION_FAILURE,
    DB_ERROR_CODES.DEADLOCK_DETECTED,
    DB_ERROR_CODES.TOO_MANY_CONNECTIONS,
  ];
  
  return retryableCodes.includes(error.context?.errorCode) || 
         error.context?.retryable === true;
}

/**
 * Get user-friendly error message for client responses
 */
export function getUserFriendlyErrorMessage(error: DatabaseError): string {
  const errorCode = error.context?.errorCode;
  
  switch (errorCode) {
    case DB_ERROR_CODES.CONNECTION_REFUSED:
    case DB_ERROR_CODES.CONNECTION_TIMEOUT:
    case DB_ERROR_CODES.CONNECTION_RESET:
      return 'Service temporarily unavailable. Please try again later.';
      
    case DB_ERROR_CODES.UNIQUE_VIOLATION:
      return 'This record already exists.';
      
    case DB_ERROR_CODES.FOREIGN_KEY_VIOLATION:
      return 'Referenced data not found.';
      
    case DB_ERROR_CODES.NOT_NULL_VIOLATION:
      return 'Required information is missing.';
      
    case DB_ERROR_CODES.SERIALIZATION_FAILURE:
    case DB_ERROR_CODES.DEADLOCK_DETECTED:
      return 'Request conflict detected. Please try again.';
      
    case DB_ERROR_CODES.TOO_MANY_CONNECTIONS:
      return 'Service is busy. Please try again in a moment.';
      
    default:
      return 'An error occurred while processing your request.';
  }
}