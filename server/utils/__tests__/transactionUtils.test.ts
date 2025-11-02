import { describe, it, expect, beforeEach, vi } from "vitest";
import { PoolClient } from "pg";
import {
  executeInTransaction,
  executeBatch,
  SavepointManager,
  executeWithSavepoints,
  TransactionOptions,
  TransactionContext,
} from "../transactionUtils";
import { dbConnectionManager } from "../dbConnection";

// Mock dependencies
vi.mock("../dbConnection", () => ({
  dbConnectionManager: {
    getPool: vi.fn(),
    executeWithRetry: vi.fn(),
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

describe("Transaction Utilities", () => {
  let mockPool: any;
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    
    mockPool = {
      connect: vi.fn().mockResolvedValue(mockClient),
    };
    
    (dbConnectionManager.getPool as any).mockReturnValue(mockPool);
  });

  describe("executeInTransaction", () => {
    it("should execute operations in transaction successfully", async () => {
      const mockOperations = vi.fn().mockResolvedValue("success");
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
      
      const result = await executeInTransaction(mockOperations);
      
      expect(result).toBe("success");
      expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
      expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
      expect(mockClient.release).toHaveBeenCalled();
      expect(mockOperations).toHaveBeenCalledWith(
        mockClient,
        expect.objectContaining({
          transactionId: expect.any(String),
          startTime: expect.any(Number),
        })
      );
    });

    it("should rollback on operation failure", async () => {
      const error = new Error("Operation failed");
      const mockOperations = vi.fn().mockRejectedValue(error);
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
      
      await expect(executeInTransaction(mockOperations)).rejects.toThrow("Operation failed");
      
      expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("should retry serialization failures", async () => {
      const serializationError = new Error("serialization_failure");
      (serializationError as any).code = "40001";
      
      const mockOperations = vi.fn()
        .mockRejectedValueOnce(serializationError)
        .mockResolvedValue("success");
      
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
      
      const result = await executeInTransaction(mockOperations, {
        maxRetries: 3,
      });
      
      expect(result).toBe("success");
      expect(mockOperations).toHaveBeenCalledTimes(2);
    });

    it("should respect max retry limit for serialization failures", async () => {
      const serializationError = new Error("serialization_failure");
      (serializationError as any).code = "40001";
      
      const mockOperations = vi.fn().mockRejectedValue(serializationError);
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
      
      await expect(
        executeInTransaction(mockOperations, {
          maxRetries: 2,
        })
      ).rejects.toThrow("serialization_failure");
      
      expect(mockOperations).toHaveBeenCalledTimes(2);
    });

    it("should not retry non-serialization errors", async () => {
      const nonSerializationError = new Error("Syntax error");
      const mockOperations = vi.fn().mockRejectedValue(nonSerializationError);
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
      
      await expect(executeInTransaction(mockOperations)).rejects.toThrow("Syntax error");
      
      expect(mockOperations).toHaveBeenCalledTimes(1);
    });

    it("should handle custom isolation level", async () => {
      const mockOperations = vi.fn().mockResolvedValue("success");
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
      
      await executeInTransaction(mockOperations, {
        isolationLevel: "SERIALIZABLE",
      });
      
      expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
      expect(mockClient.query).toHaveBeenCalledWith("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
      expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
    });
  });

  describe("executeBatch", () => {
    it("should process items in batches", async () => {
      const items = Array.from({ length: 25 }, (_, i) => ({ id: i }));
      const processor = vi.fn().mockImplementation((batch: any[]) => 
        Promise.resolve(batch.map((item: any) => ({ ...item, processed: true })))
      );
      
      const results = await executeBatch(items, 10, processor);
      
      expect(results).toHaveLength(25);
      expect(processor).toHaveBeenCalledTimes(3); // 25 items / 10 batch size = 3 batches
      expect(results.every((item: any) => item.processed)).toBe(true);
    });

    it("should handle empty input", async () => {
      const processor = vi.fn();
      
      const results = await executeBatch([], 10, processor);
      
      expect(results).toEqual([]);
      expect(processor).not.toHaveBeenCalled();
    });

    it("should handle batch processing errors", async () => {
      const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const processor = vi.fn()
        .mockResolvedValueOnce([{ id: 1, processed: true }])
        .mockRejectedValueOnce(new Error("Batch failed"));
      
      await expect(executeBatch(items, 1, processor)).rejects.toThrow("Batch failed");
      
      expect(processor).toHaveBeenCalledTimes(2); // Should stop on first error
    });
  });

  describe("SavepointManager", () => {
    let savepointManager: SavepointManager;

    beforeEach(() => {
      savepointManager = new SavepointManager(mockClient);
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
    });

    it("should create and release savepoints", async () => {
      const savepointName = await savepointManager.createSavepoint();
      
      expect(savepointName).toMatch(/^sp_\d+$/);
      expect(mockClient.query).toHaveBeenCalledWith(`SAVEPOINT ${savepointName}`);
      
      await savepointManager.releaseSavepoint(savepointName);
      expect(mockClient.query).toHaveBeenCalledWith(`RELEASE SAVEPOINT ${savepointName}`);
    });

    it("should rollback to savepoint", async () => {
      const savepointName = await savepointManager.createSavepoint();
      
      await savepointManager.rollbackToSavepoint(savepointName);
      
      expect(mockClient.query).toHaveBeenCalledWith(`ROLLBACK TO SAVEPOINT ${savepointName}`);
    });

    it("should create savepoint with custom name", async () => {
      const customName = "custom_savepoint";
      const savepointName = await savepointManager.createSavepoint(customName);
      
      expect(savepointName).toBe(customName);
      expect(mockClient.query).toHaveBeenCalledWith(`SAVEPOINT ${customName}`);
    });
  });

  describe("executeWithSavepoints", () => {
    beforeEach(() => {
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
    });

    it("should execute operations with savepoint management", async () => {
      const mockOperations = vi.fn().mockResolvedValue("success");
      
      const result = await executeWithSavepoints(mockOperations);
      
      expect(result).toBe("success");
      expect(mockOperations).toHaveBeenCalledWith(
        mockClient,
        expect.any(SavepointManager),
        expect.objectContaining({
          transactionId: expect.any(String),
        })
      );
    });

    it("should handle nested savepoints", async () => {
      const mockOperations = vi.fn().mockImplementation(async (client, savepointManager) => {
        const sp1 = await savepointManager.createSavepoint();
        const sp2 = await savepointManager.createSavepoint();
        
        await savepointManager.releaseSavepoint(sp2);
        await savepointManager.releaseSavepoint(sp1);
        
        return "nested success";
      });
      
      const result = await executeWithSavepoints(mockOperations);
      
      expect(result).toBe("nested success");
      expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
      expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
    });

    it("should cleanup on transaction rollback", async () => {
      const error = new Error("Transaction failed");
      const mockOperations = vi.fn().mockImplementation(async (client, savepointManager) => {
        await savepointManager.createSavepoint();
        await savepointManager.createSavepoint();
        throw error;
      });
      
      await expect(executeWithSavepoints(mockOperations)).rejects.toThrow("Transaction failed");
      
      expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    });
  });

  describe("error scenarios", () => {
    it("should handle connection errors gracefully", async () => {
      const connectionError = new Error("Connection failed");
      mockPool.connect.mockRejectedValue(connectionError);
      
      await expect(
        executeInTransaction(vi.fn())
      ).rejects.toThrow("Connection failed");
    });

    it("should handle BEGIN statement failures", async () => {
      const beginError = new Error("BEGIN failed");
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === "BEGIN") {
          throw beginError;
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      });
      
      await expect(
        executeInTransaction(vi.fn())
      ).rejects.toThrow("BEGIN failed");
      
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("should handle COMMIT statement failures", async () => {
      const commitError = new Error("COMMIT failed");
      const mockOperations = vi.fn().mockResolvedValue("success");
      
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === "COMMIT") {
          throw commitError;
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      });
      
      await expect(
        executeInTransaction(mockOperations)
      ).rejects.toThrow("COMMIT failed");
    });
  });
});