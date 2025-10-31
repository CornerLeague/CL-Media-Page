/**
 * Search and Deduplication Integration Tests
 * Tests BM25 search behavior with duplicate detection and filtering
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemStorage } from '../../storage';
import { BM25Index } from '../../utils/bm25/algorithm';
import { MinHash } from '../../utils/deduplication/minHash';
import testUtils from '../helpers/testUtils';

describe('Search and Deduplication - Index Rebuild', () => {
  let storage: MemStorage;
  let bm25Index: BM25Index;
  let minHash: MinHash;

  beforeEach(async () => {
    storage = new MemStorage();
    bm25Index = new BM25Index();
    minHash = new MinHash();
  });

  it('should rebuild index from existing articles', async () => {
    // Create 20 articles in storage
    const articles = [];
    for (let i = 0; i < 20; i++) {
      const article = await storage.createArticle({
        teamId: 'NBA_LAL',
        title: `Lakers article ${i}`,
        content: `Content about Lakers game ${i} with players and stats`,
        sourceUrl: `https://test.com/article-${i}`,
        sourceName: 'Test Source',
        sourceType: 'rss',
        publishedAt: new Date(),
        isProcessed: true,
      });
      articles.push(article);
    }

    // Rebuild index from storage
    const storedArticles = await storage.getArticlesByTeam('NBA_LAL');
    expect(storedArticles.length).toBe(20);

    for (const article of storedArticles) {
      bm25Index.addDocument({
        id: article.id,
        content: article.content,
        teamId: article.teamId,
      });
    }

    // Verify index built correctly
    expect(bm25Index.getStats().totalDocuments).toBe(20);

    // Search should return results
    const results = bm25Index.search({ terms: ['Lakers', 'game'] });
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(10); // Default limit
  });

  it('should rebuild index excluding deleted articles', async () => {
    // Create 10 articles
    const articles = [];
    for (let i = 0; i < 10; i++) {
      const article = await storage.createArticle({
        teamId: 'NBA_LAL',
        title: `Article ${i}`,
        content: `Content ${i}`,
        sourceUrl: `https://test.com/${i}`,
        sourceName: 'Test',
        sourceType: 'rss',
        publishedAt: new Date(),
      });
      articles.push(article);
    }

    // Delete 3 articles
    await storage.deleteArticle(articles[0].id);
    await storage.deleteArticle(articles[1].id);
    await storage.deleteArticle(articles[2].id);

    // Rebuild index (should exclude deleted)
    const activeArticles = await storage.getArticlesByTeam('NBA_LAL');
    expect(activeArticles.length).toBe(7); // 10 - 3 deleted

    for (const article of activeArticles) {
      bm25Index.addDocument({
        id: article.id,
        content: article.content,
        teamId: article.teamId,
      });
    }

    expect(bm25Index.getStats().totalDocuments).toBe(7);
  });

  it('should rebuild index excluding duplicates', async () => {
    // Create original article
    const original = await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Original article',
      content: 'The Lakers won the championship game with an outstanding performance',
      sourceUrl: 'https://test.com/original',
      sourceName: 'Source A',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    // Create duplicate article
    const duplicate = await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Duplicate article',
      content: 'The Lakers won the championship game with an outstanding performance from the team',
      sourceUrl: 'https://test.com/duplicate',
      sourceName: 'Source B',
      sourceType: 'rss',
      publishedAt: new Date(),
      isDeleted: true,
    });

    // Rebuild index - exclude duplicates
    const allArticles = await storage.getArticlesByTeam('NBA_LAL');
    const nonDuplicates = allArticles.filter(a => !a.isDeleted);

    for (const article of nonDuplicates) {
      bm25Index.addDocument({
        id: article.id,
        content: article.content,
        teamId: article.teamId,
      });
    }

    // Index should only have 1 article (original)
    expect(bm25Index.getStats().totalDocuments).toBe(1);

    // Search should only return original
    const results = bm25Index.search({ terms: ['Lakers', 'championship'] });
    expect(results.length).toBe(1);
    expect(results[0].documentId).toBe(original.id);
  });

  it('should maintain index performance after rebuild', async () => {
    // Create 100 articles
    for (let i = 0; i < 100; i++) {
      await storage.createArticle({
        teamId: 'NBA_LAL',
        title: `Article ${i}`,
        content: `Lakers basketball game ${i} with players scoring points`,
        sourceUrl: `https://test.com/${i}`,
        sourceName: 'Test',
        sourceType: 'rss',
        publishedAt: new Date(),
      });
    }

    // Measure rebuild time
    const { duration: rebuildDuration } = await testUtils.measureTime(async () => {
      const articles = await storage.getArticlesByTeam('NBA_LAL', 100); // Get all 100
      for (const article of articles) {
        bm25Index.addDocument({
          id: article.id,
          content: article.content,
          teamId: article.teamId,
        });
      }
    });

    expect(rebuildDuration).toBeLessThan(5000); // <5 seconds for 100 articles

    // Measure search time
    const { duration: searchDuration } = await testUtils.measureTime(async () => {
      return bm25Index.search({ terms: ['Lakers', 'basketball'] });
    });

    expect(searchDuration).toBeLessThan(100); // <100ms search time
    expect(bm25Index.getStats().totalDocuments).toBe(100);
  });
});

describe('Search and Deduplication - Duplicate Exclusion', () => {
  let storage: MemStorage;
  let bm25Index: BM25Index;
  let minHash: MinHash;

  beforeEach(async () => {
    storage = new MemStorage();
    bm25Index = new BM25Index();
    minHash = new MinHash();
  });

  it('should exclude duplicates from search results', async () => {
    // Create original article
    const original = await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'LeBron scores 40 points',
      content: 'LeBron James scored 40 points in an impressive victory for the Lakers',
      sourceUrl: 'https://test.com/original',
      sourceName: 'Source A',
      sourceType: 'rss',
      publishedAt: new Date(),
      isDeleted: false,
    });

    // Create duplicate (not indexed)
    const duplicate = await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'LeBron scores 40',
      content: 'LeBron James scored 40 points in an impressive victory for the Lakers team',
      sourceUrl: 'https://test.com/duplicate',
      sourceName: 'Source B',
      sourceType: 'rss',
      publishedAt: new Date(),
      isDeleted: true,
    });

    // Index only non-duplicates
    bm25Index.addDocument({
      id: original.id,
      content: original.content,
      teamId: original.teamId,
    });

    // Search should only return original
    const results = bm25Index.search({ terms: ['LeBron', 'points'] });
    expect(results.length).toBe(1);
    expect(results[0].documentId).toBe(original.id);
    
    // Duplicate should not appear in results
    expect(results.find(r => r.documentId === duplicate.id)).toBeUndefined();
  });

  it('should handle multiple duplicates of same article', async () => {
    // Create original
    const original = await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Trade news',
      content: 'Lakers make significant trade for star player',
      sourceUrl: 'https://source-a.com/trade',
      sourceName: 'Source A',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    // Create 3 duplicates from different sources
    const dup1 = await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Trade update',
      content: 'Lakers make significant trade for star player addition',
      sourceUrl: 'https://source-b.com/trade',
      sourceName: 'Source B',
      sourceType: 'rss',
      publishedAt: new Date(),
      isDeleted: true,
    });

    const dup2 = await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Breaking trade',
      content: 'Lakers make significant trade for star player to strengthen roster',
      sourceUrl: 'https://source-c.com/trade',
      sourceName: 'Source C',
      sourceType: 'rss',
      publishedAt: new Date(),
      isDeleted: true,
    });

    // Index only original
    bm25Index.addDocument({
      id: original.id,
      content: original.content,
      teamId: original.teamId,
    });

    // Search should return exactly 1 result (original)
    const results = bm25Index.search({ terms: ['trade', 'player'] });
    expect(results.length).toBe(1);
    expect(results[0].documentId).toBe(original.id);
  });

  it('should not exclude similar but different articles', async () => {
    // Create two articles that are similar but not duplicates (<85% similarity)
    const article1 = await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'LeBron injury report',
      content: 'LeBron James suffered an ankle injury during practice and will miss the next game',
      sourceUrl: 'https://test.com/injury1',
      sourceName: 'Source A',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    const article2 = await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Anthony Davis injury update',
      content: 'Anthony Davis has been cleared to play after recovering from his knee injury',
      sourceUrl: 'https://test.com/injury2',
      sourceName: 'Source B',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    // Check similarity (should be low)
    const sig1 = minHash.signature(article1.content);
    const sig2 = minHash.signature(article2.content);
    const similarity = minHash.similarity(sig1, sig2);
    expect(similarity).toBeLessThan(0.85); // Not duplicates

    // Index both articles
    bm25Index.addDocument({
      id: article1.id,
      content: article1.content,
      teamId: article1.teamId,
    });

    bm25Index.addDocument({
      id: article2.id,
      content: article2.content,
      teamId: article2.teamId,
    });

    // Search for "injury" should return both
    const results = bm25Index.search({ terms: ['injury'] });
    expect(results.length).toBe(2);
    expect(results.map(r => r.documentId).sort()).toEqual([article1.id, article2.id].sort());
  });
});

describe('Search and Deduplication - Multi-Term Ranking', () => {
  let storage: MemStorage;
  let bm25Index: BM25Index;

  beforeEach(async () => {
    storage = new MemStorage();
    bm25Index = new BM25Index();
  });

  it('should rank articles with all terms higher', async () => {
    // Article with both "LeBron" and "injury"
    const article1 = await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'LeBron injury update',
      content: 'LeBron James injury report shows he will miss three games',
      sourceUrl: 'https://test.com/1',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    // Article with only "LeBron"
    const article2 = await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'LeBron scores 30',
      content: 'LeBron James scores 30 points in victory',
      sourceUrl: 'https://test.com/2',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    // Article with only "injury"
    const article3 = await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Davis injury',
      content: 'Anthony Davis injury update from coaching staff',
      sourceUrl: 'https://test.com/3',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    // Index all articles
    for (const article of [article1, article2, article3]) {
      bm25Index.addDocument({
        id: article.id,
        content: article.content,
        teamId: article.teamId,
      });
    }

    // Search for both terms
    const results = bm25Index.search({ terms: ['LeBron', 'injury'] });

    // Article 1 (has both terms) should rank highest
    expect(results.length).toBe(3);
    expect(results[0].documentId).toBe(article1.id);
    expect(results[0].score).toBeGreaterThan(results[1].score);
    expect(results[0].score).toBeGreaterThan(results[2].score);
  });

  it('should handle queries with common and rare terms', async () => {
    // Common term: "Lakers" (appears in all)
    // Rare term: "championship" (appears in one)
    const articles = [];
    
    for (let i = 0; i < 5; i++) {
      const article = await storage.createArticle({
        teamId: 'NBA_LAL',
        title: `Lakers article ${i}`,
        content: i === 0 
          ? 'Lakers win the championship with outstanding performance'
          : `Lakers game ${i} recap with highlights`,
        sourceUrl: `https://test.com/${i}`,
        sourceName: 'Test',
        sourceType: 'rss',
        publishedAt: new Date(),
      });
      articles.push(article);

      bm25Index.addDocument({
        id: article.id,
        content: article.content,
        teamId: article.teamId,
      });
    }

    // Search for "Lakers championship"
    const results = bm25Index.search({ terms: ['Lakers', 'championship'] });

    // Article with rare term should rank highest (due to high IDF)
    expect(results[0].documentId).toBe(articles[0].id);
  });

  it('should handle deduplication across time window', async () => {
    const now = new Date();
    const eightDaysAgo = testUtils.daysAgo(8);

    // Create original article (recent)
    const recentArticle = await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Recent news',
      content: 'Lakers recent game performance and stats',
      sourceUrl: 'https://test.com/recent',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: now,
    });

    // Create similar article (8 days ago - outside 7-day window)
    const oldArticle = await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Old news',
      content: 'Lakers game performance and statistics',
      sourceUrl: 'https://test.com/old',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: eightDaysAgo,
    });

    // Both should be indexed (outside duplicate window)
    bm25Index.addDocument({
      id: recentArticle.id,
      content: recentArticle.content,
      teamId: recentArticle.teamId,
    });

    bm25Index.addDocument({
      id: oldArticle.id,
      content: oldArticle.content,
      teamId: oldArticle.teamId,
    });

    // Both should appear in search results
    const results = bm25Index.search({ terms: ['Lakers', 'performance'] });
    expect(results.length).toBe(2);
  });
});

describe('Search and Deduplication - Edge Cases', () => {
  let storage: MemStorage;
  let bm25Index: BM25Index;

  beforeEach(async () => {
    storage = new MemStorage();
    bm25Index = new BM25Index();
  });

  it('should handle search with no index built', async () => {
    // Create articles but don't build index
    await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Test article',
      content: 'Test content',
      sourceUrl: 'https://test.com/1',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    // Search empty index should return empty results
    const results = bm25Index.search({ terms: ['Lakers'] });
    expect(results).toEqual([]);
  });

  it('should handle search with only duplicates', async () => {
    // Create only duplicate articles (all marked as duplicates)
    for (let i = 0; i < 5; i++) {
      await storage.createArticle({
        teamId: 'NBA_LAL',
        title: `Duplicate ${i}`,
        content: 'Same content duplicated',
        sourceUrl: `https://test.com/${i}`,
        sourceName: 'Test',
        sourceType: 'rss',
        publishedAt: new Date(),
        isDeleted: true,
      });
    }

    // Don't index duplicates
    // Search should return no results
    const results = bm25Index.search({ terms: ['content'] });
    expect(results).toEqual([]);
  });

  it('should handle empty search query', async () => {
    // Create and index article
    const article = await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Test',
      content: 'Test content',
      sourceUrl: 'https://test.com/1',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    bm25Index.addDocument({
      id: article.id,
      content: article.content,
      teamId: article.teamId,
    });

    // Empty search terms
    const results = bm25Index.search({ terms: [] });
    expect(results).toEqual([]);
  });

  it('should handle search terms with no matches', async () => {
    // Create and index article about Lakers
    const article = await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Lakers game',
      content: 'Lakers basketball game recap',
      sourceUrl: 'https://test.com/1',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    bm25Index.addDocument({
      id: article.id,
      content: article.content,
      teamId: article.teamId,
    });

    // Search for terms not in any document
    const results = bm25Index.search({ terms: ['football', 'soccer'] });
    expect(results).toEqual([]);
  });
});
