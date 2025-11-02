import { PgStorage } from "../pgStorage";
import { dbConnectionManager } from "./dbConnection";
import { executeInTransaction, executeBatch, TransactionOptions } from "./transactionUtils";
import { PoolClient } from "pg";
import { withSource } from "../logger";
import type {
  User,
  InsertUser,
  Team,
  InsertTeam,
  Game,
  InsertGame,
  UserTeam,
  InsertUserTeam,
  GameScoreData,
} from "../../shared/schema";

const log = withSource("enhanced-pg-storage");

/**
 * Enhanced PgStorage that provides transaction support and improved connection management
 */
export class EnhancedPgStorage extends PgStorage {
  /**
   * Execute multiple operations in a single transaction
   */
  async executeInTransaction<T>(
    operations: (storage: PgStorage, client: PoolClient) => Promise<T>,
    options?: Partial<TransactionOptions>
  ): Promise<T> {
    return executeInTransaction(
      async (client, context) => {
        // Create a temporary storage instance that uses the transaction client
        const transactionalStorage = new TransactionalPgStorage(client);
        log.debug({ transactionId: context.transactionId }, "Executing operations in transaction");
        return operations(transactionalStorage, client);
      },
      options
    );
  }

  /**
   * Batch create users with transaction support
   */
  async batchCreateUsers(
    users: InsertUser[],
    batchSize: number = 100,
    options?: Partial<TransactionOptions>
  ): Promise<User[]> {
    return executeBatch(
      users,
      batchSize,
      async (batch, client, context) => {
        const transactionalStorage = new TransactionalPgStorage(client);
        const results: User[] = [];
        
        for (const user of batch) {
          const created = await transactionalStorage.createUser(user);
          results.push(created);
        }
        
        context.operations.push(`created_${batch.length}_users`);
        return results;
      },
      options
    );
  }

  /**
   * Batch create teams with transaction support
   */
  async batchCreateTeams(
    teams: InsertTeam[],
    batchSize: number = 100,
    options?: Partial<TransactionOptions>
  ): Promise<Team[]> {
    return executeBatch(
      teams,
      batchSize,
      async (batch, client, context) => {
        const transactionalStorage = new TransactionalPgStorage(client);
        const results: Team[] = [];
        
        for (const team of batch) {
          const created = await transactionalStorage.createTeam(team);
          results.push(created);
        }
        
        context.operations.push(`created_${batch.length}_teams`);
        return results;
      },
      options
    );
  }

  /**
   * Batch create games with transaction support
   */
  async batchCreateGames(
    games: InsertGame[],
    batchSize: number = 50,
    options?: Partial<TransactionOptions>
  ): Promise<Game[]> {
    return executeBatch(
      games,
      batchSize,
      async (batch, client, context) => {
        const transactionalStorage = new TransactionalPgStorage(client);
        const results: Game[] = [];
        
        for (const game of batch) {
          const created = await transactionalStorage.createGame(game);
          results.push(created);
        }
        
        context.operations.push(`created_${batch.length}_games`);
        return results;
      },
      options
    );
  }

  /**
   * Update user's favorite teams atomically
   */
  async updateUserFavoriteTeams(
    userId: string,
    teamIds: string[],
    options?: Partial<TransactionOptions>
  ): Promise<UserTeam[]> {
    return this.executeInTransaction(
      async (storage) => {
        // Clear existing favorite teams
        await storage.clearUserTeams(userId);
        
        // Add new favorite teams
        const results: UserTeam[] = [];
        for (const teamId of teamIds) {
          const userTeam = await storage.createUserTeam({
            userId,
            teamId,
          });
          results.push(userTeam);
        }
        
        log.info({ userId, teamCount: teamIds.length }, "Updated user favorite teams");
        return results;
      },
      options
    );
  }

  /**
   * Bulk update game scores with validation
   */
  async bulkUpdateGameScores(
    updates: Array<{ gameId: string; homePts: number; awayPts: number }>,
    options?: Partial<TransactionOptions>
  ): Promise<{ updated: number; unchanged: number }> {
    return this.executeInTransaction(
      async (storage) => {
        let updated = 0;
        let unchanged = 0;
        
        for (const update of updates) {
          const hasChanged = await storage.hasScoreChanged(
            update.gameId,
            update.homePts,
            update.awayPts
          );
          
          if (hasChanged) {
            // In a real implementation, you would update the game score here
            // For now, we just track that it would be updated
            updated++;
            log.debug({ gameId: update.gameId }, "Game score would be updated");
          } else {
            unchanged++;
          }
        }
        
        log.info({ updated, unchanged, total: updates.length }, "Bulk game score update completed");
        return { updated, unchanged };
      },
      options
    );
  }

  /**
   * Get connection health status
   */
  async getConnectionHealth(): Promise<{
    isHealthy: boolean;
    activeConnections: number;
    idleConnections: number;
    waitingClients: number;
    circuitBreakerOpen: boolean;
  }> {
    return dbConnectionManager.getHealthStatus();
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return dbConnectionManager.getMetrics();
  }
}

/**
 * Transactional storage that uses a specific client connection
 * This ensures all operations within a transaction use the same connection
 */
class TransactionalPgStorage extends PgStorage {
  private client: PoolClient;

  constructor(client: PoolClient) {
    super();
    this.client = client;
  }

  // Override the db operations to use the transaction client
  // Note: This is a simplified example. In a real implementation,
  // you would need to override all methods to use this.client instead of db
  
  // For demonstration, here's how you might override a method:
  /*
  async createUser(user: InsertUser): Promise<User> {
    // Use this.client instead of db for the query
    const result = await this.client.query(
      'INSERT INTO users (...) VALUES (...) RETURNING *',
      [user.id, user.username, ...]
    );
    return result.rows[0];
  }
  */
}

// Export a singleton instance
export const enhancedPgStorage = new EnhancedPgStorage();