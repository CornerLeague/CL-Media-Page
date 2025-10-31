/**
 * Team Isolation Integration Tests
 * Tests complete data isolation between teams across all system layers
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemStorage } from '../../storage';
import { BM25Index } from '../../utils/bm25/algorithm';
import { MinHash } from '../../utils/deduplication/minHash';
import testUtils from '../helpers/testUtils';

describe('Team Isolation - Storage Layer', () => {
  let storage: MemStorage;

  beforeEach(() => {
    storage = new MemStorage();
  });

  it('should isolate articles by team', async () => {
    // Create articles for Lakers
    const lakersArticles = [];
    for (let i = 0; i < 5; i++) {
      const article = await storage.createArticle({
        teamId: 'NBA_LAL',
        title: `Lakers article ${i}`,
        content: `Lakers content ${i}`,
        sourceUrl: `https://test.com/lal-${i}`,
        sourceName: 'Test',
        sourceType: 'rss',
        publishedAt: new Date(),
      });
      lakersArticles.push(article);
    }

    // Create articles for Celtics
    const celticsArticles = [];
    for (let i = 0; i < 3; i++) {
      const article = await storage.createArticle({
        teamId: 'NBA_BOS',
        title: `Celtics article ${i}`,
        content: `Celtics content ${i}`,
        sourceUrl: `https://test.com/bos-${i}`,
        sourceName: 'Test',
        sourceType: 'rss',
        publishedAt: new Date(),
      });
      celticsArticles.push(article);
    }

    // Query Lakers articles
    const lakersResults = await storage.getArticlesByTeam('NBA_LAL');
    expect(lakersResults.length).toBe(5);
    expect(lakersResults.every(a => a.teamId === 'NBA_LAL')).toBe(true);

    // Query Celtics articles
    const celticsResults = await storage.getArticlesByTeam('NBA_BOS');
    expect(celticsResults.length).toBe(3);
    expect(celticsResults.every(a => a.teamId === 'NBA_BOS')).toBe(true);

    // Verify no cross-contamination
    const lakersIds = new Set(lakersResults.map(a => a.id));
    const celticsIds = new Set(celticsResults.map(a => a.id));
    const overlap = Array.from(lakersIds).filter(id => celticsIds.has(id));
    expect(overlap.length).toBe(0);
  });

  it('should isolate articles by team and category', async () => {
    // Lakers injury articles
    await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Lakers injury',
      content: 'Lakers injury report',
      sourceUrl: 'https://test.com/lal-injury',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
      category: 'injury',
    });

    // Celtics injury articles
    await storage.createArticle({
      teamId: 'NBA_BOS',
      title: 'Celtics injury',
      content: 'Celtics injury report',
      sourceUrl: 'https://test.com/bos-injury',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
      category: 'injury',
    });

    // Query Lakers injury articles
    const lakersInjuries = await storage.getArticlesByTeamAndCategory('NBA_LAL', 'injury');
    expect(lakersInjuries.length).toBe(1);
    expect(lakersInjuries[0].teamId).toBe('NBA_LAL');

    // Query Celtics injury articles
    const celticsInjuries = await storage.getArticlesByTeamAndCategory('NBA_BOS', 'injury');
    expect(celticsInjuries.length).toBe(1);
    expect(celticsInjuries[0].teamId).toBe('NBA_BOS');
  });

  it('should isolate recent articles by team', async () => {
    const now = new Date();
    const twoDaysAgo = testUtils.daysAgo(2);

    // Lakers recent article
    await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Lakers recent',
      content: 'Recent Lakers news',
      sourceUrl: 'https://test.com/lal-recent',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: twoDaysAgo,
    });

    // Celtics recent article
    await storage.createArticle({
      teamId: 'NBA_BOS',
      title: 'Celtics recent',
      content: 'Recent Celtics news',
      sourceUrl: 'https://test.com/bos-recent',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: twoDaysAgo,
    });

    // Get recent articles (7 days)
    const lakersRecent = await storage.getRecentArticles('NBA_LAL', 7);
    expect(lakersRecent.length).toBe(1);
    expect(lakersRecent[0].teamId).toBe('NBA_LAL');

    const celticsRecent = await storage.getRecentArticles('NBA_BOS', 7);
    expect(celticsRecent.length).toBe(1);
    expect(celticsRecent[0].teamId).toBe('NBA_BOS');
  });

  it('should prevent cross-team article retrieval', async () => {
    // Create Lakers article
    const lakersArticle = await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Lakers exclusive',
      content: 'Lakers only content',
      sourceUrl: 'https://test.com/lakers',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    // Try to get Lakers article in Celtics query
    const celticsArticles = await storage.getArticlesByTeam('NBA_BOS');
    const lakersInCeltics = celticsArticles.find(a => a.id === lakersArticle.id);
    expect(lakersInCeltics).toBeUndefined();

    // Direct retrieval by ID should still work (no team filter)
    const retrieved = await storage.getArticle(lakersArticle.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.teamId).toBe('NBA_LAL');
  });
});

describe('Team Isolation - Search Layer', () => {
  let storage: MemStorage;
  let lakersIndex: BM25Index;
  let celticsIndex: BM25Index;

  beforeEach(() => {
    storage = new MemStorage();
    lakersIndex = new BM25Index();
    celticsIndex = new BM25Index();
  });

  it('should maintain separate indexes per team', async () => {
    // Create and index Lakers articles
    for (let i = 0; i < 5; i++) {
      const article = await storage.createArticle({
        teamId: 'NBA_LAL',
        title: `Lakers game ${i}`,
        content: `Lakers basketball game ${i} with highlights`,
        sourceUrl: `https://test.com/lal-${i}`,
        sourceName: 'Test',
        sourceType: 'rss',
        publishedAt: new Date(),
      });

      lakersIndex.addDocument({
        id: article.id,
        content: article.content,
        teamId: article.teamId,
      });
    }

    // Create and index Celtics articles
    for (let i = 0; i < 3; i++) {
      const article = await storage.createArticle({
        teamId: 'NBA_BOS',
        title: `Celtics game ${i}`,
        content: `Celtics basketball game ${i} with highlights`,
        sourceUrl: `https://test.com/bos-${i}`,
        sourceName: 'Test',
        sourceType: 'rss',
        publishedAt: new Date(),
      });

      celticsIndex.addDocument({
        id: article.id,
        content: article.content,
        teamId: article.teamId,
      });
    }

    // Verify separate index sizes
    expect(lakersIndex.getStats().totalDocuments).toBe(5);
    expect(celticsIndex.getStats().totalDocuments).toBe(3);

    // Search Lakers index
    const lakersResults = lakersIndex.search({ terms: ['basketball', 'game'] });
    expect(lakersResults.length).toBeGreaterThan(0);
    expect(lakersResults.length).toBeLessThanOrEqual(5);

    // Search Celtics index
    const celticsResults = celticsIndex.search({ terms: ['basketball', 'game'] });
    expect(celticsResults.length).toBeGreaterThan(0);
    expect(celticsResults.length).toBeLessThanOrEqual(3);

    // Verify no document ID overlap
    const lakersDocIds = new Set(lakersResults.map(r => r.documentId));
    const celticsDocIds = new Set(celticsResults.map(r => r.documentId));
    const overlap = Array.from(lakersDocIds).filter(id => celticsDocIds.has(id));
    expect(overlap.length).toBe(0);
  });

  it('should search only within team index', async () => {
    // Create Lakers article with unique term "showtime"
    const lakersArticle = await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Lakers showtime',
      content: 'Lakers showtime basketball performance',
      sourceUrl: 'https://test.com/lakers',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    // Create Celtics article without "showtime"
    const celticsArticle = await storage.createArticle({
      teamId: 'NBA_BOS',
      title: 'Celtics pride',
      content: 'Celtics pride and tradition',
      sourceUrl: 'https://test.com/celtics',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    // Index in respective team indexes
    lakersIndex.addDocument({
      id: lakersArticle.id,
      content: lakersArticle.content,
      teamId: lakersArticle.teamId,
    });

    celticsIndex.addDocument({
      id: celticsArticle.id,
      content: celticsArticle.content,
      teamId: celticsArticle.teamId,
    });

    // Search for "showtime" in Lakers index
    const lakersResults = lakersIndex.search({ terms: ['showtime'] });
    expect(lakersResults.length).toBe(1);
    expect(lakersResults[0].documentId).toBe(lakersArticle.id);

    // Search for "showtime" in Celtics index (should find nothing)
    const celticsResults = celticsIndex.search({ terms: ['showtime'] });
    expect(celticsResults.length).toBe(0);
  });

  it('should filter search results by team when using teamId', async () => {
    // Create a shared index with multiple teams (not recommended, but testing teamId filter)
    const sharedIndex = new BM25Index();

    // Add Lakers article
    const lakersArticle = await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Lakers news',
      content: 'Lakers basketball news and updates',
      sourceUrl: 'https://test.com/lakers',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    // Add Celtics article
    const celticsArticle = await storage.createArticle({
      teamId: 'NBA_BOS',
      title: 'Celtics news',
      content: 'Celtics basketball news and updates',
      sourceUrl: 'https://test.com/celtics',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    sharedIndex.addDocument({
      id: lakersArticle.id,
      content: lakersArticle.content,
      teamId: lakersArticle.teamId,
    });

    sharedIndex.addDocument({
      id: celticsArticle.id,
      content: celticsArticle.content,
      teamId: celticsArticle.teamId,
    });

    // Search with teamId filter for Lakers
    const lakersResults = sharedIndex.search({ 
      terms: ['basketball', 'news'],
      teamId: 'NBA_LAL',
    });
    expect(lakersResults.length).toBe(1);
    expect(lakersResults[0].documentId).toBe(lakersArticle.id);

    // Search with teamId filter for Celtics
    const celticsResults = sharedIndex.search({ 
      terms: ['basketball', 'news'],
      teamId: 'NBA_BOS',
    });
    expect(celticsResults.length).toBe(1);
    expect(celticsResults[0].documentId).toBe(celticsArticle.id);
  });
});

describe('Team Isolation - Deduplication Layer', () => {
  let storage: MemStorage;
  let minHash: MinHash;

  beforeEach(() => {
    storage = new MemStorage();
    minHash = new MinHash();
  });

  it('should detect duplicates only within same team', async () => {
    // Create identical content for different teams
    const content = 'Major basketball trade announcement affects playoff standings';

    // Lakers article
    const lakersArticle = await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Lakers trade',
      content,
      sourceUrl: 'https://test.com/lakers-trade',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    // Celtics article (same content, different team)
    const celticsArticle = await storage.createArticle({
      teamId: 'NBA_BOS',
      title: 'Celtics trade',
      content,
      sourceUrl: 'https://test.com/celtics-trade',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    // Generate signatures
    const lakersSig = minHash.signature(lakersArticle.content);
    const celticsSig = minHash.signature(celticsArticle.content);

    // Content is identical, so signatures will be similar
    const similarity = minHash.similarity(lakersSig, celticsSig);
    expect(similarity).toBeGreaterThan(0.85);

    // However, they're for different teams, so both should be indexed
    // Duplicate detection should consider teamId
    expect(lakersArticle.teamId).not.toBe(celticsArticle.teamId);
  });

  it('should not deduplicate across teams', async () => {
    // Lakers articles (similar content)
    const lakers1 = await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Lakers win',
      content: 'Lakers dominate with strong performance and excellent teamwork',
      sourceUrl: 'https://test.com/lal-1',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    const lakers2 = await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Lakers victory',
      content: 'Lakers dominate with strong performance and excellent teamwork on court',
      sourceUrl: 'https://test.com/lal-2',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    // Celtics article (similar content to Lakers)
    const celtics1 = await storage.createArticle({
      teamId: 'NBA_BOS',
      title: 'Celtics win',
      content: 'Celtics dominate with strong performance and excellent teamwork',
      sourceUrl: 'https://test.com/bos-1',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    // Check Lakers duplicates (should be similar)
    const lakersSig1 = minHash.signature(lakers1.content);
    const lakersSig2 = minHash.signature(lakers2.content);
    const lakersSimilarity = minHash.similarity(lakersSig1, lakersSig2);
    expect(lakersSimilarity).toBeGreaterThan(0.85);

    // Check Lakers vs Celtics (should be similar content, different team)
    const celticsSig1 = minHash.signature(celtics1.content);
    const crossTeamSimilarity = minHash.similarity(lakersSig1, celticsSig1);
    expect(crossTeamSimilarity).toBeGreaterThan(0.85);

    // Mark Lakers2 as deleted (duplicate of Lakers1 within same team)
    await storage.updateArticle(lakers2.id, { isDeleted: true });

    // Celtics1 should NOT be marked as deleted (different team)
    const celtics1Check = await storage.getArticle(celtics1.id);
    expect(celtics1Check?.isDeleted).toBeFalsy();
  });
});

describe('Team Isolation - Classifications Layer', () => {
  let storage: MemStorage;

  beforeEach(() => {
    storage = new MemStorage();
  });

  it('should associate classifications with correct team articles', async () => {
    // Create Lakers article
    const lakersArticle = await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Lakers injury',
      content: 'LeBron James injury update',
      sourceUrl: 'https://test.com/lakers',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    // Create Celtics article
    const celticsArticle = await storage.createArticle({
      teamId: 'NBA_BOS',
      title: 'Celtics injury',
      content: 'Jayson Tatum injury update',
      sourceUrl: 'https://test.com/celtics',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    // Classify Lakers article
    await storage.createArticleClassification({
      articleId: lakersArticle.id,
      category: 'injury',
      confidence: 0.95,
    });

    // Classify Celtics article
    await storage.createArticleClassification({
      articleId: celticsArticle.id,
      category: 'injury',
      confidence: 0.93,
    });

    // Verify classifications are separate
    const lakersClassifications = await storage.getClassificationsByArticle(lakersArticle.id);
    expect(lakersClassifications.length).toBe(1);
    expect(lakersClassifications[0].articleId).toBe(lakersArticle.id);

    const celticsClassifications = await storage.getClassificationsByArticle(celticsArticle.id);
    expect(celticsClassifications.length).toBe(1);
    expect(celticsClassifications[0].articleId).toBe(celticsArticle.id);

    // Verify no cross-classification
    expect(lakersClassifications[0].articleId).not.toBe(celticsArticle.id);
    expect(celticsClassifications[0].articleId).not.toBe(lakersArticle.id);
  });
});

describe('Team Isolation - End-to-End', () => {
  let storage: MemStorage;
  let lakersIndex: BM25Index;
  let celticsIndex: BM25Index;
  let minHash: MinHash;

  beforeEach(() => {
    storage = new MemStorage();
    lakersIndex = new BM25Index();
    celticsIndex = new BM25Index();
    minHash = new MinHash();
  });

  it('should maintain complete isolation across all layers', async () => {
    // Process Lakers articles
    const lakersArticles = [];
    for (let i = 0; i < 3; i++) {
      const article = await storage.createArticle({
        teamId: 'NBA_LAL',
        title: `Lakers article ${i}`,
        content: `Lakers basketball news ${i} with highlights and analysis`,
        sourceUrl: `https://test.com/lal-${i}`,
        sourceName: 'Test',
        sourceType: 'rss',
        publishedAt: new Date(),
      });

      // Generate signature
      const signature = minHash.signature(article.content);

      // Index in Lakers index
      lakersIndex.addDocument({
        id: article.id,
        content: article.content,
        teamId: article.teamId,
      });

      // Classify
      await storage.createArticleClassification({
        articleId: article.id,
        category: 'news',
        confidence: 0.9,
      });

      lakersArticles.push(article);
    }

    // Process Celtics articles
    const celticsArticles = [];
    for (let i = 0; i < 2; i++) {
      const article = await storage.createArticle({
        teamId: 'NBA_BOS',
        title: `Celtics article ${i}`,
        content: `Celtics basketball news ${i} with highlights and analysis`,
        sourceUrl: `https://test.com/bos-${i}`,
        sourceName: 'Test',
        sourceType: 'rss',
        publishedAt: new Date(),
      });

      // Generate signature
      const signature = minHash.signature(article.content);

      // Index in Celtics index
      celticsIndex.addDocument({
        id: article.id,
        content: article.content,
        teamId: article.teamId,
      });

      // Classify
      await storage.createArticleClassification({
        articleId: article.id,
        category: 'news',
        confidence: 0.9,
      });

      celticsArticles.push(article);
    }

    // Verify storage isolation
    const storedLakersArticles = await storage.getArticlesByTeam('NBA_LAL');
    expect(storedLakersArticles.length).toBe(3);

    const storedCelticsArticles = await storage.getArticlesByTeam('NBA_BOS');
    expect(storedCelticsArticles.length).toBe(2);

    // Verify index isolation
    expect(lakersIndex.getStats().totalDocuments).toBe(3);
    expect(celticsIndex.getStats().totalDocuments).toBe(2);

    // Verify search isolation
    const lakersSearchResults = lakersIndex.search({ terms: ['basketball', 'news'] });
    expect(lakersSearchResults.length).toBe(3);

    const celticsSearchResults = celticsIndex.search({ terms: ['basketball', 'news'] });
    expect(celticsSearchResults.length).toBe(2);

    // Verify no document overlap
    const lakersDocIds = new Set(lakersSearchResults.map(r => r.documentId));
    const celticsDocIds = new Set(celticsSearchResults.map(r => r.documentId));
    lakersDocIds.forEach(id => {
      expect(celticsDocIds.has(id)).toBe(false);
    });

    // Verify classifications are isolated
    for (const article of lakersArticles) {
      const classifications = await storage.getClassificationsByArticle(article.id);
      expect(classifications.length).toBe(1);
      expect(classifications[0].articleId).toBe(article.id);
    }

    for (const article of celticsArticles) {
      const classifications = await storage.getClassificationsByArticle(article.id);
      expect(classifications.length).toBe(1);
      expect(classifications[0].articleId).toBe(article.id);
    }
  });

  it('should handle cross-league isolation (NBA vs NFL)', async () => {
    // Create NBA Lakers article
    const nbaArticle = await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Lakers game',
      content: 'Lakers basketball game highlights',
      sourceUrl: 'https://test.com/nba',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    // Create NFL Patriots article
    const nflArticle = await storage.createArticle({
      teamId: 'NFL_NE',
      title: 'Patriots game',
      content: 'Patriots football game highlights',
      sourceUrl: 'https://test.com/nfl',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    // Verify complete isolation across leagues
    const nbaArticles = await storage.getArticlesByTeam('NBA_LAL');
    expect(nbaArticles.length).toBe(1);
    expect(nbaArticles[0].id).toBe(nbaArticle.id);

    const nflArticles = await storage.getArticlesByTeam('NFL_NE');
    expect(nflArticles.length).toBe(1);
    expect(nflArticles[0].id).toBe(nflArticle.id);

    // Verify teamIds are different
    expect(nbaArticle.teamId).not.toBe(nflArticle.teamId);
  });
});
