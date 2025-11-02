import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from "vitest";
import { Pool, PoolClient } from "pg";
import { DatabaseConnectionManager, DbConnectionConfig } from "../dbConnection";
import { config } from "../../config";

// Mock dependencies
vi.mock("../../config", () => ({
  config: {
    databaseUrl: "postgresql://test:test@localhost:5432/test",
    dbSlowQueryMs: 1000,
  },
}));

vi.mock("../../logger", () => ({
  withSource: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("../../metrics", () => ({
  metrics: {
    observeDbQuery: vi.fn(),
  },
}));

// Mock pg Pool
const mockPool = {
  connect: vi.fn(),
  end: vi.fn(),
  totalCount: 10,
  idleCount: 5,
  waitingCount: 0,
  on: vi.fn(),
};

const mockClient = {
  query: vi.fn(),
  release: vi.fn(),
};

vi.mock("pg", () => ({
  Pool: vi.fn(() => mockPool),
}));

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: vi.fn(() => ({ mockDb: true })),
}));

describe("DatabaseConnectionManager", () => {
  let connectionManager: DatabaseConnectionManager;
  let testConfig: DbConnectionConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    
    testConfig = {
      connectionString: "postgresql://test:test@localhost:5432/test",
      min: 2,
      max: 10,
      maxRetries: 3,
      retryDelayMs: 100,
      maxRetryDelayMs: 1000,
      circuitBreakerThreshold: 3,
      circuitBreakerTimeout: 5000,
      slowQueryThresholdMs: 500,
      enableMetrics: true,
    };

    connectionManager = new DatabaseConnectionManager(testConfig);
    
    // Setup mock implementations
    mockPool.connect.mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  afterEach(async () => {
    await connectionManager.close();
  });

  describe("initialization", () => {
    it("should initialize successfully with valid config", async () => {
      await connectionManager.initialize();
      
      expect(Pool).toHaveBeenCalledWith({
        connectionString: testConfig.connectionString,
        min: testConfig.min,
        max: testConfig.max,
        idleTimeoutMillis: testConfig.idleTimeoutMillis,
        connectionTimeoutMillis: testConfig.connectionTimeoutMillis,
      });
    });

    it("should skip initialization when no connection string provided", async () => {
      const managerWithoutUrl = new DatabaseConnectionManager({
        connectionString: undefined,
      });
      
      await managerWithoutUrl.initialize();
      
      expect(Pool).not.toHaveBeenCalled();
    });

    it("should test connection during initialization", async () => {
      await connectionManager.initialize();
      
      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith("SELECT 1");
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe("executeWithRetry", () => {
    beforeEach(async () => {
      await connectionManager.initialize();
    });

    it("should execute operation successfully on first attempt", async () => {
      const mockOperation = vi.fn().mockResolvedValue("success");
      
      const result = await connectionManager.executeWithRetry(
        "select",
        "users",
        mockOperation
      );
      
      expect(result).toBe("success");
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it("should retry on retryable errors", async () => {
      const retryableError = new Error("ECONNRESET");
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(retryableError)
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValue("success");
      
      const result = await connectionManager.executeWithRetry(
        "select",
        "users",
        mockOperation
      );
      
      expect(result).toBe("success");
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it("should not retry on non-retryable errors", async () => {
      const nonRetryableError = new Error("Syntax error");
      const mockOperation = vi.fn().mockRejectedValue(nonRetryableError);
      
      await expect(
        connectionManager.executeWithRetry("select", "users", mockOperation)
      ).rejects.toThrow("Syntax error");
      
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it("should respect max retry limit", async () => {
      const retryableError = new Error("ECONNRESET");
      const mockOperation = vi.fn().mockRejectedValue(retryableError);
      
      await expect(
        connectionManager.executeWithRetry("select", "users", mockOperation)
      ).rejects.toThrow();
      
      expect(mockOperation).toHaveBeenCalledTimes(3); // maxRetries = 3
    });

    it("should log slow queries", async () => {
      const slowOperation = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve("success"), 600))
      );
      
      await connectionManager.executeWithRetry(
        "select",
        "users",
        slowOperation
      );
      
      // Verify slow query was detected (duration > 500ms threshold)
      expect(slowOperation).toHaveBeenCalledTimes(1);
    });
  });

  describe("executeInTransaction", () => {
    beforeEach(async () => {
      await connectionManager.initialize();
    });

    it("should execute transaction successfully", async () => {
      const mockOperations = vi.fn().mockResolvedValue("transaction result");
      
      const result = await connectionManager.executeInTransaction(mockOperations);
      
      expect(result).toBe("transaction result");
      expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
      expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("should rollback on error", async () => {
      const error = new Error("Transaction failed");
      const mockOperations = vi.fn().mockRejectedValue(error);
      
      await expect(
        connectionManager.executeInTransaction(mockOperations)
      ).rejects.toThrow("Transaction failed");
      
      expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe("circuit breaker", () => {
    beforeEach(async () => {
      await connectionManager.initialize();
    });

    it("should open circuit breaker after threshold failures", async () => {
      const error = new Error("ECONNRESET");
      const mockOperation = vi.fn().mockRejectedValue(error);
      
      // Trigger failures to reach threshold
      for (let i = 0; i < 3; i++) {
        try {
          await connectionManager.executeWithRetry("select", "users", mockOperation);
        } catch (e) {
          // Expected to fail
        }
      }
      
      const status = connectionManager.getCircuitBreakerStatus();
      expect(status.state).toBe("OPEN");
      expect(status.failureCount).toBe(3);
    });

    it("should reject operations when circuit breaker is open", async () => {
      const error = new Error("ECONNRESET");
      const mockOperation = vi.fn().mockRejectedValue(error);
      
      // Trigger failures to open circuit breaker
      for (let i = 0; i < 3; i++) {
        try {
          await connectionManager.executeWithRetry("select", "users", mockOperation);
        } catch (e) {
          // Expected to fail
        }
      }
      
      // Next operation should be rejected immediately
      await expect(
        connectionManager.executeWithRetry("select", "users", mockOperation)
      ).rejects.toThrow("Circuit breaker is OPEN");
    });
  });

  describe("pool statistics", () => {
    beforeEach(async () => {
      await connectionManager.initialize();
    });

    it("should return pool statistics", () => {
      const stats = connectionManager.getPoolStats();
      
      expect(stats).toEqual({
        totalCount: 10,
        idleCount: 5,
        waitingCount: 0,
      });
    });

    it("should return health status", () => {
      const health = connectionManager.getHealthStatus();
      
      expect(health).toEqual({
        isHealthy: true,
        activeConnections: 5, // totalCount - idleCount
        idleConnections: 5,
        waitingClients: 0,
        circuitBreakerOpen: false,
      });
    });

    it("should return performance metrics", () => {
      const metrics = connectionManager.getMetrics();
      
      expect(metrics).toHaveProperty("circuitBreakerState");
      expect(metrics).toHaveProperty("failureCount");
      expect(metrics).toHaveProperty("connectionPool");
      expect(metrics.connectionPool).toEqual({
        totalCount: 10,
        idleCount: 5,
        waitingCount: 0,
      });
    });
  });

  describe("cleanup", () => {
    it("should close pool and reset state", async () => {
      await connectionManager.initialize();
      
      await connectionManager.close();
      
      expect(mockPool.end).toHaveBeenCalled();
      
      // Should throw error when trying to get database after close
      expect(() => connectionManager.getDatabase()).toThrow(
        "Database not initialized"
      );
    });
  });

  describe("error handling", () => {
    it("should identify retryable errors correctly", async () => {
      await connectionManager.initialize();
      
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
      
      for (const errorMessage of retryableErrors) {
        const error = new Error(errorMessage);
        const mockOperation = vi.fn()
          .mockRejectedValueOnce(error)
          .mockResolvedValue("success");
        
        const result = await connectionManager.executeWithRetry(
          "select",
          "users", 
          mockOperation
        );
        
        expect(result).toBe("success");
        expect(mockOperation).toHaveBeenCalledTimes(2); // 1 failure + 1 success
        
        vi.clearAllMocks();
      }
    });

    it("should not retry non-retryable errors", async () => {
      await connectionManager.initialize();
      
      const nonRetryableErrors = [
        "Syntax error",
        "Permission denied",
        "Invalid input",
      ];
      
      for (const errorMessage of nonRetryableErrors) {
        const error = new Error(errorMessage);
        const mockOperation = vi.fn().mockRejectedValue(error);
        
        await expect(
          connectionManager.executeWithRetry("select", "users", mockOperation)
        ).rejects.toThrow(errorMessage);
        
        expect(mockOperation).toHaveBeenCalledTimes(1); // No retries
        
        vi.clearAllMocks();
      }
    });
  });
});