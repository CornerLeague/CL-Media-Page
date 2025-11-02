import { describe, it, expect, beforeEach, vi } from "vitest";
import { EnhancedPgStorage } from "../enhancedPgStorage";
import { PgStorage } from "../../pgStorage";
import { DatabaseConnectionManager } from "../dbConnection";
import { executeInTransaction } from "../transactionUtils";

// Mock dependencies
vi.mock("../../pgStorage");
vi.mock("../dbConnection");
vi.mock("../transactionUtils");

describe("EnhancedPgStorage", () => {
  let enhancedStorage: EnhancedPgStorage;
  let mockConnectionManager: any;
  let mockPgStorage: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockConnectionManager = {
      executeWithRetry: vi.fn(),
      getHealthStatus: vi.fn(),
      getMetrics: vi.fn(),
    };
    
    mockPgStorage = {
      createUser: vi.fn(),
      createTeam: vi.fn(),
      createGame: vi.fn(),
      updateUser: vi.fn(),
      updateGame: vi.fn(),
      getUserById: vi.fn(),
      getTeamById: vi.fn(),
      getGameById: vi.fn(),
    };
    
    (DatabaseConnectionManager as any).mockImplementation(() => mockConnectionManager);
    (PgStorage as any).mockImplementation(() => mockPgStorage);
    
    enhancedStorage = new EnhancedPgStorage();
  });

  describe("executeInTransaction", () => {
    it("should execute operations in transaction", async () => {
      const mockOperations = vi.fn().mockResolvedValue("success");
      (executeInTransaction as any).mockResolvedValue("success");
      
      const result = await enhancedStorage.executeInTransaction(mockOperations);
      
      expect(result).toBe("success");
      expect(executeInTransaction).toHaveBeenCalledWith(mockOperations);
    });

    it("should pass through transaction options", async () => {
      const mockOperations = vi.fn().mockResolvedValue("success");
      const options = { isolationLevel: "SERIALIZABLE" as const };
      (executeInTransaction as any).mockResolvedValue("success");
      
      await enhancedStorage.executeInTransaction(mockOperations, options);
      
      expect(executeInTransaction).toHaveBeenCalledWith(mockOperations, options);
    });
  });

  describe("batchCreateUsers", () => {
    it("should create users in batches", async () => {
      const users = [
        { username: "user1", password: "password1" },
        { username: "user2", password: "password2" },
        { username: "user3", password: "password3" },
      ];
      
      (executeInTransaction as any).mockImplementation((fn: () => any) => fn());
      mockPgStorage.createUser.mockImplementation((user: any) => 
        Promise.resolve({ id: `user-${Math.random()}`, ...user })
      );
      
      const results = await enhancedStorage.batchCreateUsers(users);
      
      expect(results).toHaveLength(3);
      expect(mockPgStorage.createUser).toHaveBeenCalledTimes(3);
      expect(executeInTransaction).toHaveBeenCalled();
    });

    it("should handle batch creation errors", async () => {
      const users = [{ username: "user1", password: "password1" }];
      const error = new Error("Creation failed");
      
      (executeInTransaction as any).mockRejectedValue(error);
      
      await expect(enhancedStorage.batchCreateUsers(users)).rejects.toThrow("Creation failed");
    });
  });

  describe("batchCreateTeams", () => {
    it("should create teams in batches", async () => {
      const teams = [
        { id: "NBA_LAL", name: "Los Angeles Lakers", league: "NBA", code: "LAL" },
        { id: "NBA_BOS", name: "Boston Celtics", league: "NBA", code: "BOS" },
      ];
      
      (executeInTransaction as any).mockImplementation((fn: () => any) => fn());
      mockPgStorage.createTeam.mockImplementation((team: any) => 
        Promise.resolve({ ...team })
      );
      
      const results = await enhancedStorage.batchCreateTeams(teams);
      
      expect(results).toHaveLength(2);
      expect(mockPgStorage.createTeam).toHaveBeenCalledTimes(2);
      expect(executeInTransaction).toHaveBeenCalled();
    });
  });

  describe("batchCreateGames", () => {
    it("should create games in batches", async () => {
      const games = [
        {
          id: "game1",
          homeTeamId: "NBA_LAL",
          awayTeamId: "NBA_BOS",
          homePts: 110,
          awayPts: 105,
          status: "Final",
          startTime: new Date(),
        },
        {
          id: "game2",
          homeTeamId: "NBA_BOS",
          awayTeamId: "NBA_LAL",
          homePts: 95,
          awayPts: 100,
          status: "Final",
          startTime: new Date(),
        },
      ];
      
      (executeInTransaction as any).mockImplementation((fn: () => any) => fn());
      mockPgStorage.createGame.mockImplementation((game: any) => 
        Promise.resolve({ ...game })
      );
      
      const results = await enhancedStorage.batchCreateGames(games);
      
      expect(results).toHaveLength(2);
      expect(mockPgStorage.createGame).toHaveBeenCalledTimes(2);
      expect(executeInTransaction).toHaveBeenCalled();
    });
  });

  describe("updateUserFavoriteTeams", () => {
    it("should update user favorite teams", async () => {
      const userId = "user1";
      const teamIds = ["NBA_LAL", "NBA_BOS"];
      
      (executeInTransaction as any).mockImplementation((fn: () => any) => fn());
      
      await enhancedStorage.updateUserFavoriteTeams(userId, teamIds);
      
      expect(executeInTransaction).toHaveBeenCalled();
    });
  });

  describe("bulkUpdateGameScores", () => {
    it("should update game scores in bulk", async () => {
      const updates = [
        { gameId: "game1", homePts: 110, awayPts: 105 },
        { gameId: "game2", homePts: 95, awayPts: 100 },
      ];
      
      (executeInTransaction as any).mockImplementation((fn: () => any) => fn());
      mockPgStorage.updateGame.mockResolvedValue({});
      
      await enhancedStorage.bulkUpdateGameScores(updates);
      
      expect(executeInTransaction).toHaveBeenCalled();
      expect(mockPgStorage.updateGame).toHaveBeenCalledTimes(2);
    });
  });

  describe("getConnectionHealth", () => {
    it("should return connection health status", async () => {
      const healthStatus = {
        isHealthy: true,
        activeConnections: 5,
        totalConnections: 10,
        circuitBreakerOpen: false,
      };
      
      mockConnectionManager.getHealthStatus.mockResolvedValue(healthStatus);
      
      const result = await enhancedStorage.getConnectionHealth();
      
      expect(result).toEqual(healthStatus);
      expect(mockConnectionManager.getHealthStatus).toHaveBeenCalled();
    });
  });

  describe("getPerformanceMetrics", () => {
    it("should return performance metrics", async () => {
      const metrics = {
        totalQueries: 100,
        averageLatency: 50,
        errorRate: 0.01,
        cacheHitRate: 0.85,
      };
      
      mockConnectionManager.getMetrics.mockResolvedValue(metrics);
      
      const result = await enhancedStorage.getPerformanceMetrics();
      
      expect(result).toEqual(metrics);
      expect(mockConnectionManager.getMetrics).toHaveBeenCalled();
    });
  });
});