import { PoolClient } from "pg";
import { dbConnectionManager } from "./dbConnection";
import { withSource } from "../logger";

const log = withSource("transaction-utils");

/**
 * Transaction context for tracking operations
 */
export interface TransactionContext {
  transactionId: string;
  startTime: number;
  operations: string[];
}

/**
 * Transaction options
 */
export interface TransactionOptions {
  isolationLevel?: "READ UNCOMMITTED" | "READ COMMITTED" | "REPEATABLE READ" | "SERIALIZABLE";
  timeout?: number; // in milliseconds
  retryOnSerializationFailure?: boolean;
  maxRetries?: number;
}

/**
 * Default transaction options
 */
const DEFAULT_TRANSACTION_OPTIONS: Required<TransactionOptions> = {
  isolationLevel: "READ COMMITTED",
  timeout: 30000, // 30 seconds
  retryOnSerializationFailure: true,
  maxRetries: 3,
};

/**
 * Generate a unique transaction ID
 */
function generateTransactionId(): string {
  return `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if error is a serialization failure that can be retried
 */
function isSerializationFailure(error: Error): boolean {
  const serializationErrors = [
    "40001", // serialization_failure
    "40P01", // deadlock_detected
  ];
  
  return serializationErrors.some(code => error.message.includes(code));
}

/**
 * Execute multiple operations within a single transaction
 */
export async function executeInTransaction<T>(
  operations: (client: PoolClient, context: TransactionContext) => Promise<T>,
  options: Partial<TransactionOptions> = {}
): Promise<T> {
  const config = { ...DEFAULT_TRANSACTION_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    const transactionId = generateTransactionId();
    const context: TransactionContext = {
      transactionId,
      startTime: Date.now(),
      operations: [],
    };

    try {
      const result = await dbConnectionManager.executeInTransaction(
        async (client: PoolClient) => {
          // Set isolation level if specified
          if (config.isolationLevel !== "READ COMMITTED") {
            await client.query(`SET TRANSACTION ISOLATION LEVEL ${config.isolationLevel}`);
            log.debug({ transactionId, isolationLevel: config.isolationLevel }, "Set transaction isolation level");
          }

          // Set timeout if specified
          if (config.timeout > 0) {
            await client.query(`SET statement_timeout = ${config.timeout}`);
          }

          log.info({ transactionId, attempt, maxRetries: config.maxRetries }, "Transaction started");

          const result = await operations(client, context);

          const duration = Date.now() - context.startTime;
          log.info({
            transactionId,
            duration_ms: duration,
            operations: context.operations,
            attempt,
          }, "Transaction completed successfully");

          return result;
        },
        { transactionId, attempt }
      );

      return result;

    } catch (error) {
      lastError = error as Error;
      const duration = Date.now() - context.startTime;

      log.error({
        transactionId,
        attempt,
        maxRetries: config.maxRetries,
        duration_ms: duration,
        operations: context.operations,
        error: lastError.message,
      }, "Transaction failed");

      // Check if we should retry on serialization failure
      if (
        config.retryOnSerializationFailure &&
        isSerializationFailure(lastError) &&
        attempt < config.maxRetries
      ) {
        const delay = Math.min(100 * Math.pow(2, attempt - 1), 1000); // Exponential backoff up to 1s
        log.info({
          transactionId,
          attempt,
          nextAttempt: attempt + 1,
          delayMs: delay,
        }, "Retrying transaction due to serialization failure");

        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Don't retry for other errors or if max retries reached
      break;
    }
  }

  throw lastError || new Error("Transaction failed after all retries");
}

/**
 * Execute a batch of operations with automatic batching and transaction management
 */
export async function executeBatch<T, R>(
  items: T[],
  batchSize: number,
  processor: (batch: T[], client: PoolClient, context: TransactionContext) => Promise<R[]>,
  options: Partial<TransactionOptions> = {}
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    const batchResults = await executeInTransaction(
      async (client, context) => {
        context.operations.push(`batch_${Math.floor(i / batchSize) + 1}_of_${Math.ceil(items.length / batchSize)}`);
        return processor(batch, client, context);
      },
      options
    );
    
    results.push(...batchResults);
  }
  
  return results;
}

/**
 * Utility for tracking operations within a transaction context
 */
export function trackOperation(context: TransactionContext, operation: string): void {
  context.operations.push(operation);
}

/**
 * Utility for conditional rollback based on business logic
 */
export async function conditionalRollback(
  client: PoolClient,
  condition: boolean,
  reason: string
): Promise<void> {
  if (condition) {
    log.warn({ reason }, "Conditional rollback triggered");
    throw new Error(`Transaction rolled back: ${reason}`);
  }
}

/**
 * Savepoint management utilities
 */
export class SavepointManager {
  private client: PoolClient;
  private savepointCounter = 0;

  constructor(client: PoolClient) {
    this.client = client;
  }

  /**
   * Create a savepoint
   */
  async createSavepoint(name?: string): Promise<string> {
    const savepointName = name || `sp_${++this.savepointCounter}`;
    await this.client.query(`SAVEPOINT ${savepointName}`);
    log.debug({ savepointName }, "Savepoint created");
    return savepointName;
  }

  /**
   * Rollback to a savepoint
   */
  async rollbackToSavepoint(savepointName: string): Promise<void> {
    await this.client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
    log.debug({ savepointName }, "Rolled back to savepoint");
  }

  /**
   * Release a savepoint
   */
  async releaseSavepoint(savepointName: string): Promise<void> {
    await this.client.query(`RELEASE SAVEPOINT ${savepointName}`);
    log.debug({ savepointName }, "Savepoint released");
  }
}

/**
 * Enhanced transaction wrapper with savepoint support
 */
export async function executeWithSavepoints<T>(
  operations: (client: PoolClient, savepointManager: SavepointManager, context: TransactionContext) => Promise<T>,
  options: Partial<TransactionOptions> = {}
): Promise<T> {
  return executeInTransaction(
    async (client, context) => {
      const savepointManager = new SavepointManager(client);
      return operations(client, savepointManager, context);
    },
    options
  );
}