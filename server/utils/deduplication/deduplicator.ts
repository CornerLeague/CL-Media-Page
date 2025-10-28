/**
 * Article Deduplication Service
 * 
 * Checks new articles against recent articles to detect near-duplicates
 * using MinHash similarity matching.
 */

import { MinHash, MinHashSignature } from './minHash';
import { logger } from '../../logger';
import { storage } from '../../storage';
import type { Article } from '@shared/schema';

export interface DeduplicationResult {
  isDuplicate: boolean;
  similarArticleId?: string;
  similarity?: number;
  matchedArticle?: Article;
}

export class Deduplicator {
  private minHash: MinHash;
  private similarityThreshold: number;
  private checkWindowDays: number;

  /**
   * @param similarityThreshold - Threshold for duplicate detection (default: 0.85)
   * @param checkWindowDays - Days to look back for duplicates (default: 7)
   */
  constructor(
    similarityThreshold: number = 0.85,
    checkWindowDays: number = 7
  ) {
    this.minHash = new MinHash();
    this.similarityThreshold = similarityThreshold;
    this.checkWindowDays = checkWindowDays;
  }

  /**
   * Check if article content is a duplicate of existing articles
   * 
   * @param content - Article content to check
   * @param teamId - Team ID for scoping the check
   * @returns Deduplication result with match details
   */
  async checkDuplicate(
    content: string,
    teamId: string
  ): Promise<DeduplicationResult> {
    try {
      // Generate signature for new article
      const newSignature = this.minHash.signature(content);

      // Get recent articles for team
      const recentArticles = await storage.getRecentArticles(
        teamId,
        this.checkWindowDays
      );

      logger.debug(
        {
          teamId,
          recentArticlesCount: recentArticles.length,
          checkWindowDays: this.checkWindowDays,
        },
        'Checking for duplicate articles'
      );

      // Check against each article
      for (const article of recentArticles) {
        if (!article.minHash) continue;

        try {
          const existingSignature = MinHash.deserialize(article.minHash);
          const similarity = this.minHash.similarity(
            newSignature,
            existingSignature
          );

          if (similarity >= this.similarityThreshold) {
            logger.info(
              {
                newContentPreview: content.substring(0, 100),
                existingArticleId: article.id,
                existingTitle: article.title,
                similarity,
                threshold: this.similarityThreshold,
              },
              'Duplicate article detected'
            );

            return {
              isDuplicate: true,
              similarArticleId: article.id,
              similarity,
              matchedArticle: article,
            };
          }
        } catch (error) {
          logger.warn(
            { articleId: article.id, err: error },
            'Failed to deserialize MinHash signature'
          );
          continue;
        }
      }

      return { isDuplicate: false };
    } catch (error) {
      logger.error(
        { err: error, teamId },
        'Error checking for duplicate articles'
      );
      // On error, assume not duplicate to avoid blocking article creation
      return { isDuplicate: false };
    }
  }

  /**
   * Generate and store MinHash signature for article
   * 
   * @param articleId - Article ID
   * @param content - Article content
   * @returns Generated signature
   */
  async generateSignature(
    articleId: string,
    content: string
  ): Promise<MinHashSignature> {
    try {
      const signature = this.minHash.signature(content);
      const serialized = MinHash.serialize(signature);

      await storage.updateArticle(articleId, {
        minHash: serialized,
      });

      logger.debug({ articleId }, 'Generated MinHash signature for article');

      return signature;
    } catch (error) {
      logger.error(
        { err: error, articleId },
        'Failed to generate MinHash signature'
      );
      throw error;
    }
  }

  /**
   * Check and generate signature in one operation
   * 
   * @param content - Article content
   * @param teamId - Team ID
   * @returns Deduplication result and generated signature
   */
  async checkAndGenerateSignature(
    content: string,
    teamId: string
  ): Promise<{
    result: DeduplicationResult;
    signature: MinHashSignature;
  }> {
    const signature = this.minHash.signature(content);
    const result = await this.checkDuplicate(content, teamId);

    return { result, signature };
  }

  /**
   * Update similarity threshold
   * 
   * @param threshold - New threshold (0-1)
   */
  setSimilarityThreshold(threshold: number): void {
    if (threshold < 0 || threshold > 1) {
      throw new Error('Threshold must be between 0 and 1');
    }
    this.similarityThreshold = threshold;
    logger.info({ threshold }, 'Updated similarity threshold');
  }

  /**
   * Update check window
   * 
   * @param days - Number of days to look back
   */
  setCheckWindowDays(days: number): void {
    if (days < 1) {
      throw new Error('Check window must be at least 1 day');
    }
    this.checkWindowDays = days;
    logger.info({ days }, 'Updated check window');
  }

  /**
   * Get current configuration
   */
  getConfig(): {
    similarityThreshold: number;
    checkWindowDays: number;
    shingleSize: number;
    numHashes: number;
  } {
    return {
      similarityThreshold: this.similarityThreshold,
      checkWindowDays: this.checkWindowDays,
      shingleSize: 3, // From MinHash default
      numHashes: 128, // From MinHash default
    };
  }
}

// Global singleton instance with default settings
export const deduplicator = new Deduplicator();
