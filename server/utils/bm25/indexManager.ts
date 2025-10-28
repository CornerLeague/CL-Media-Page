/**
 * BM25 Index Manager
 * 
 * Manages per-team BM25 indexes with database persistence.
 * Coordinates between in-memory indexes and database storage.
 */

import { BM25Index, BM25Document, BM25Query, BM25Result } from './algorithm';
import { logger } from '../../logger';
import { storage } from '../../storage';
import type { Article } from '@shared/schema';

export class BM25IndexManager {
  private indexes: Map<string, BM25Index>; // teamId -> index
  private k1: number;
  private b: number;

  constructor(k1: number = 1.5, b: number = 0.75) {
    this.indexes = new Map();
    this.k1 = k1;
    this.b = b;
  }

  /**
   * Get or create index for team
   */
  getIndex(teamId: string): BM25Index {
    if (!this.indexes.has(teamId)) {
      const index = new BM25Index(this.k1, this.b);
      this.indexes.set(teamId, index);
      logger.info({ teamId }, 'Created new BM25 index for team');
    }
    return this.indexes.get(teamId)!;
  }

  /**
   * Add document to team index
   */
  async addDocument(doc: BM25Document): Promise<void> {
    const index = this.getIndex(doc.teamId);
    index.addDocument(doc);

    // Update metadata in database
    await this.updateIndexMetadata(doc.teamId);

    logger.debug(
      { docId: doc.id, teamId: doc.teamId },
      'Added document to BM25 index'
    );
  }

  /**
   * Add article to team index
   */
  async addArticle(article: Article): Promise<void> {
    const doc: BM25Document = {
      id: article.id,
      content: `${article.title} ${article.content || ''}`,
      teamId: article.teamId,
      metadata: {
        category: article.category,
        publishedAt: article.publishedAt,
        sourceUrl: article.sourceUrl,
        relevanceScore: article.relevanceScore,
      },
    };

    await this.addDocument(doc);
  }

  /**
   * Remove document from team index
   */
  async removeDocument(docId: string, teamId: string): Promise<void> {
    const index = this.getIndex(teamId);
    index.removeDocument(docId);

    await this.updateIndexMetadata(teamId);

    logger.debug({ docId, teamId }, 'Removed document from BM25 index');
  }

  /**
   * Search across team index
   */
  async search(
    query: BM25Query,
    limit: number = 10
  ): Promise<BM25Result[]> {
    const startTime = Date.now();
    const index = this.getIndex(query.teamId || '');
    
    const results = index.search(query, limit);
    const queryTime = Date.now() - startTime;

    // Update query stats in database (async, don't block)
    if (query.teamId) {
      this.updateQueryStats(query.teamId, queryTime).catch(err => {
        logger.error({ err, teamId: query.teamId }, 'Failed to update query stats');
      });
    }

    logger.debug(
      {
        teamId: query.teamId,
        terms: query.terms,
        resultsCount: results.length,
        queryTimeMs: queryTime,
      },
      'BM25 search completed'
    );

    return results;
  }

  /**
   * Rebuild index from database for a specific team
   */
  async rebuildIndex(teamId: string): Promise<void> {
    logger.info({ teamId }, 'Rebuilding BM25 index');

    // Mark rebuild in progress
    const existingIndex = await storage.getBM25IndexByTeam(teamId);
    if (existingIndex) {
      await storage.updateBM25IndexStats(teamId, {
        rebuildInProgress: true,
      });
    } else {
      await storage.createBM25Index({
        teamId,
        rebuildInProgress: true,
      });
    }

    try {
      // Clear existing index
      const index = new BM25Index(this.k1, this.b);
      this.indexes.set(teamId, index);

      // Load articles from database
      const articles = await storage.getArticlesByTeam(teamId, 10000);

      logger.info(
        { teamId, articleCount: articles.length },
        'Loading articles for BM25 index'
      );

      // Add each article to index
      for (const article of articles) {
        const doc: BM25Document = {
          id: article.id,
          content: `${article.title} ${article.content || ''}`,
          teamId: article.teamId,
          metadata: {
            category: article.category,
            publishedAt: article.publishedAt,
            sourceUrl: article.sourceUrl,
          },
        };
        index.addDocument(doc);
      }

      // Update metadata
      await this.updateIndexMetadata(teamId);

      // Mark rebuild complete
      await storage.updateBM25IndexStats(teamId, {
        rebuildInProgress: false,
        lastRebuiltAt: new Date(),
      });

      logger.info(
        { teamId, docCount: articles.length },
        'BM25 index rebuilt successfully'
      );
    } catch (error) {
      // Mark rebuild failed
      await storage.updateBM25IndexStats(teamId, {
        rebuildInProgress: false,
      });
      
      logger.error(
        { err: error, teamId },
        'Failed to rebuild BM25 index'
      );
      throw error;
    }
  }

  /**
   * Rebuild all team indexes
   */
  async rebuildAllIndexes(): Promise<void> {
    logger.info('Rebuilding all BM25 indexes');

    const teams = await storage.getAllTeams();
    
    for (const team of teams) {
      try {
        await this.rebuildIndex(team.id);
      } catch (error) {
        logger.error(
          { err: error, teamId: team.id },
          'Failed to rebuild index for team'
        );
        // Continue with other teams
      }
    }

    logger.info('Completed rebuilding all BM25 indexes');
  }

  /**
   * Update index metadata in database
   */
  private async updateIndexMetadata(teamId: string): Promise<void> {
    const index = this.getIndex(teamId);
    const stats = index.getStats();

    // Check if index exists
    const existingIndex = await storage.getBM25IndexByTeam(teamId);

    if (existingIndex) {
      await storage.updateBM25IndexStats(teamId, {
        totalDocuments: stats.totalDocuments,
        avgDocLength: Math.round(stats.avgDocLength),
      });
    } else {
      await storage.createBM25Index({
        teamId,
        totalDocuments: stats.totalDocuments,
        avgDocLength: Math.round(stats.avgDocLength),
      });
    }
  }

  /**
   * Update query statistics
   */
  private async updateQueryStats(
    teamId: string,
    queryTimeMs: number
  ): Promise<void> {
    const existingIndex = await storage.getBM25IndexByTeam(teamId);
    
    if (!existingIndex) {
      return;
    }

    const totalQueries = (existingIndex.totalQueries || 0) + 1;
    const currentAvg = existingIndex.avgQueryTimeMs || 0;
    
    // Calculate running average
    const newAvg = Math.round(
      (currentAvg * (totalQueries - 1) + queryTimeMs) / totalQueries
    );

    await storage.updateBM25IndexStats(teamId, {
      totalQueries,
      avgQueryTimeMs: newAvg,
    });
  }

  /**
   * Get index statistics for team
   */
  async getIndexStats(teamId: string) {
    const index = this.getIndex(teamId);
    const memoryStats = index.getStats();
    
    // Get database stats
    const dbStats = await storage.getBM25IndexByTeam(teamId);

    return {
      ...memoryStats,
      lastRebuiltAt: dbStats?.lastRebuiltAt,
      rebuildInProgress: dbStats?.rebuildInProgress || false,
      avgQueryTimeMs: dbStats?.avgQueryTimeMs,
      totalQueries: dbStats?.totalQueries || 0,
    };
  }

  /**
   * Check if team has an index
   */
  hasIndex(teamId: string): boolean {
    return this.indexes.has(teamId);
  }

  /**
   * Get number of documents in team index
   */
  getDocumentCount(teamId: string): number {
    const index = this.indexes.get(teamId);
    return index ? index.size() : 0;
  }

  /**
   * Clear specific team index
   */
  clearIndex(teamId: string): void {
    const index = this.indexes.get(teamId);
    if (index) {
      index.clear();
      logger.info({ teamId }, 'Cleared BM25 index');
    }
  }

  /**
   * Clear all indexes
   */
  clearAll(): void {
    for (const [teamId, index] of Array.from(this.indexes.entries())) {
      index.clear();
      logger.info({ teamId }, 'Cleared BM25 index');
    }
    this.indexes.clear();
  }

  /**
   * Get all team IDs with loaded indexes
   */
  getLoadedTeamIds(): string[] {
    return Array.from(this.indexes.keys());
  }
}

// Global singleton instance
export const bm25Manager = new BM25IndexManager();
