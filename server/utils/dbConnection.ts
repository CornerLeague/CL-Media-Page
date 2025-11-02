import { Pool, PoolClient, PoolConfig } from "pg";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../../shared/schema";
import { config } from "../config";
import { withSource } from "../logger";
import { metrics } from "../metrics";

const log = withSource("db-connection");

/**
 * Database connection configuration
 */
export interface DbConnectionConfig {
  // Connection string
  connectionString?: string;
  
  // Pool configuration
  min?: number;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  
  // Retry configuration
  maxRetries?: number;
  retryDelayMs?: number;
  maxRetryDelayMs?: number;
  
  // Circuit breaker configuration
  circuitBreakerThreshold?: number;
  circuitBreakerTimeout?: number;
  
  // Performance monitoring
  slowQueryThresholdMs?: number;
  enableMetrics?: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: DbConnectionConfig = {
  // Connection
  connectionString: config.databaseUrl || "",
  
  // Pool settings
  min: 2,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  
  // Retry settings
  maxRetries: 3,
  retryDelayMs: 1000,
  maxRetryDelayMs: 10000,
  
  // Circuit breaker settings
  circuitBreakerThreshold: 5,
  circuitBreakerTimeout: 60000,
  
  // Performance settings
  slowQueryThresholdMs: config.dbSlowQueryMs || 1000,
  enableMetrics: true,
};

/**
 * Circuit breaker states
 */
enum CircuitBreakerState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

/**
 * Circuit breaker implementation
 */
class DatabaseCircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly threshold: number;
  private readonly timeout: number;

  constructor(threshold: number, timeout: number) {
    this.threshold = threshold;
    this.timeout = timeout;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = CircuitBreakerState.HALF_OPEN;
        log.info("Circuit breaker transitioning to HALF_OPEN");
      } else {
        throw new Error("Circuit breaker is OPEN");
      }
    }

    try {
      const result = await operation();
      if (this.state === CircuitBreakerState.HALF_OPEN) {
        this.reset();
      }
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.threshold) {
      this.state = CircuitBreakerState.OPEN;
      log.warn({ failureCount: this.failureCount }, "Circuit breaker opened");
    }
  }

  private reset(): void {
    this.failureCount = 0;
    this.state = CircuitBreakerState.CLOSED;
    log.info("Circuit breaker reset to CLOSED");
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getFailureCount(): number {
    return this.failureCount;
  }
}

/**
 * Enhanced database connection manager with pooling, retry logic, and circuit breaker
 */
export class DatabaseConnectionManager {
  private pool: Pool | undefined;
  private db: NodePgDatabase<typeof schema> | undefined;
  private config: DbConnectionConfig;
  private circuitBreaker: DatabaseCircuitBreaker;
  private isInitialized = false;
  private circuitBreakerState: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;

  constructor(customConfig?: Partial<DbConnectionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...customConfig };
    this.circuitBreaker = new DatabaseCircuitBreaker(
      this.config.circuitBreakerThreshold || 5,
      this.config.circuitBreakerTimeout || 60000
    );
  }

  /**
   * Initialize the connection pool and database instance
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (!this.config.connectionString) {
      log.warn("No database connection string provided, skipping initialization");
      return;
    }

    try {
      // Create connection pool
      this.pool = new Pool({
        connectionString: this.config.connectionString,
        min: this.config.min,
        max: this.config.max,
        idleTimeoutMillis: this.config.idleTimeoutMillis,
        connectionTimeoutMillis: this.config.connectionTimeoutMillis,
      });

      // Set up event listeners
      this.setupPoolEventListeners();

      // Create Drizzle instance
      this.db = drizzle(this.pool, { schema });

      // Test connection
      await this.testConnection();

      this.isInitialized = true;
      log.info({
        min: this.config.min,
        max: this.config.max,
        circuitBreakerThreshold: this.config.circuitBreakerThreshold,
      }, "Database connection manager initialized");

    } catch (error) {
      log.error({ error }, "Failed to initialize database connection manager");
      throw error;
    }
  }

  /**
   * Test database connection
   */
  private async testConnection(): Promise<void> {
    if (!this.pool) {
      throw new Error("Pool not initialized");
    }

    const client = await this.pool.connect();
    try {
      await client.query("SELECT 1");
      log.info("Database connection test successful");
    } finally {
      client.release();
    }
  }

  /**
   * Set up pool event listeners for monitoring
   */
  private setupPoolEventListeners(): void {
    if (!this.pool) return;

    this.pool.on("connect", () => {
      log.debug("New database connection established");
    });

    this.pool.on("error", (err: any) => {
      log.error({ error: err }, "Database pool error");
    });

    this.pool.on("remove", () => {
      log.debug("Database connection removed from pool");
    });
  }

  /**
   * Execute operation with retry logic and circuit breaker
   */
  async executeWithRetry<T>(
    operation: string,
    table: string,
    exec: () => Promise<T>,
    context?: Record<string, any>
  ): Promise<T> {
    const maxRetries = this.config.maxRetries || 3;
    const retryDelayMs = this.config.retryDelayMs || 1000;
    const maxRetryDelayMs = this.config.maxRetryDelayMs || 10000;
    const slowQueryThresholdMs = this.config.slowQueryThresholdMs || 1000;
    const enableMetrics = this.config.enableMetrics !== false;

    return this.circuitBreaker.execute(async () => {
      let lastError: Error | undefined;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const start = performance.now();
        
        try {
          const result = await exec();
          const duration = performance.now() - start;

          // Record metrics on success
          if (enableMetrics) {
            this.recordMetrics(operation, table, duration, result, true);
          }

          // Log slow queries
          if (duration > slowQueryThresholdMs) {
            log.warn({
              operation,
              table,
              duration_ms: Math.round(duration),
              attempt,
              context,
            }, "Slow database query detected");
          }

          return result;

        } catch (error) {
          lastError = error as Error;
          const duration = performance.now() - start;

          // Record metrics on failure
          if (enableMetrics) {
            this.recordMetrics(operation, table, duration, null, false);
          }

          log.error({
            operation,
            table,
            attempt,
            maxRetries,
            duration_ms: Math.round(duration),
            error: lastError.message,
            context,
          }, "Database operation failed");

          // Don't retry on the last attempt
          if (attempt === maxRetries) {
            break;
          }

          // Check if error is retryable
          if (!this.isRetryableError(lastError)) {
            log.debug({ error: lastError.message }, "Error is not retryable, aborting");
            break;
          }

          // Calculate delay with exponential backoff
          const delay = Math.min(
            retryDelayMs * Math.pow(2, attempt - 1),
            maxRetryDelayMs
          );

          log.info({
            operation,
            table,
            attempt,
            nextAttempt: attempt + 1,
            delayMs: delay,
          }, "Retrying database operation");

          await this.sleep(delay);
        }
      }

      throw lastError || new Error(`Database operation failed after ${maxRetries} attempts`);
    });
  }

  /**
   * Execute operations within a transaction
   */
  async executeInTransaction<T>(
    operations: (client: PoolClient) => Promise<T>,
    context?: Record<string, any>
  ): Promise<T> {
    if (!this.pool) {
      throw new Error("Database pool not initialized");
    }

    const client = await this.pool.connect();
    
    try {
      await client.query("BEGIN");
      log.debug({ context }, "Transaction started");

      const result = await operations(client);

      await client.query("COMMIT");
      log.debug({ context }, "Transaction committed");

      return result;

    } catch (error) {
      await client.query("ROLLBACK");
      log.error({ error, context }, "Transaction rolled back");
      throw error;

    } finally {
      client.release();
    }
  }

  /**
   * Get the Drizzle database instance
   */
  getDatabase(): NodePgDatabase<typeof schema> {
    if (!this.db) {
      throw new Error("Database not initialized. Call initialize() first.");
    }
    return this.db;
  }

  /**
   * Get the connection pool
   */
  getPool(): Pool {
    if (!this.pool) {
      throw new Error("Pool not initialized. Call initialize() first.");
    }
    return this.pool;
  }

  /**
   * Get pool statistics
   */
  getPoolStats(): {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  } {
    if (!this.pool) {
      return { totalCount: 0, idleCount: 0, waitingCount: 0 };
    }

    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(): {
    state: CircuitBreakerState;
    failureCount: number;
  } {
    return {
      state: this.circuitBreaker.getState(),
      failureCount: this.circuitBreaker.getFailureCount(),
    };
  }

  /**
   * Get connection health status
   */
  getHealthStatus(): {
    isHealthy: boolean;
    activeConnections: number;
    idleConnections: number;
    waitingClients: number;
    circuitBreakerOpen: boolean;
  } {
    const poolStats = this.pool ? {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    } : { totalCount: 0, idleCount: 0, waitingCount: 0 };

    return {
      isHealthy: this.circuitBreaker.getState() === CircuitBreakerState.CLOSED && !!this.pool,
      activeConnections: poolStats.totalCount - poolStats.idleCount,
      idleConnections: poolStats.idleCount,
      waitingClients: poolStats.waitingCount,
      circuitBreakerOpen: this.circuitBreaker.getState() === CircuitBreakerState.OPEN,
    };
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    return {
      circuitBreakerState: this.circuitBreaker.getState(),
      failureCount: this.circuitBreaker.getFailureCount(),
      lastFailureTime: this.lastFailureTime,
      connectionPool: this.pool ? {
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        waitingCount: this.pool.waitingCount,
      } : null,
    };
  }

  /**
   * Close the connection pool
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = undefined;
      this.db = undefined;
      this.isInitialized = false;
      log.info("Database connection pool closed");
    }
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const retryableErrors = [
      "ECONNRESET",
      "ENOTFOUND",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "connection terminated unexpectedly",
      "server closed the connection unexpectedly",
      "Connection terminated",
      "Client has encountered a connection error",
    ];

    return retryableErrors.some(retryableError =>
      error.message.includes(retryableError)
    );
  }

  /**
   * Record performance metrics
   */
  private recordMetrics<T>(
    operation: string,
    table: string,
    duration: number,
    result: T,
    success: boolean
  ): void {
    // Use the existing observeDbQuery function which handles both latency and rows
    const rowCount = success && result 
      ? Array.isArray(result) ? result.length : 1
      : 0;
    
    metrics.observeDbQuery(operation, table, duration, rowCount);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const dbConnectionManager = new DatabaseConnectionManager();

// Enhanced database utilities
export const enhancedDb = {
  get instance() {
    return dbConnectionManager.getDatabase();
  },
  executeWithRetry: dbConnectionManager.executeWithRetry.bind(dbConnectionManager),
  executeInTransaction: dbConnectionManager.executeInTransaction.bind(dbConnectionManager),
  getPoolStats: dbConnectionManager.getPoolStats.bind(dbConnectionManager),
  getCircuitBreakerStatus: dbConnectionManager.getCircuitBreakerStatus.bind(dbConnectionManager),
};