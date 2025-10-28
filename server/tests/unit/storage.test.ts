/**
 * Storage Interface Unit Tests
 * Tests all new storage methods for Articles, News Sources, Classifications, and BM25 Indexes
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemStorage } from '../../storage';
import type { InsertArticle, InsertNewsSource, InsertArticleClassification, InsertBM25Index } from '@shared/schema';
import testUtils from '../helpers/testUtils';

describe('Storage - Articles', () => {
  let storage: MemStorage;

  beforeEach(() => {
    storage = new MemStorage();
  });

  it('should create article', async () => {
    const article: InsertArticle = {
      teamId: 'NBA_LAL',
      title: 'Lakers win big',
      content: 'The Lakers defeated the Celtics 120-110',
      summary: 'Lakers win',
      sourceUrl: 'https://espn.com/article-1',
      sourceName: 'ESPN',
      sourceType: 'rss',
      publishedAt: new Date(),
    };

    const created = await storage.createArticle(article);

    expect(created.id).toBeDefined();
    expect(created.teamId).toBe('NBA_LAL');
    expect(created.title).toBe('Lakers win big');
    expect(created.isProcessed).toBe(false);
    expect(created.isDeleted).toBe(false);
  });

  it('should get article by ID', async () => {
    const article: InsertArticle = {
      teamId: 'NBA_LAL',
      title: 'Test article',
      content: 'Content',
      sourceUrl: 'https://test.com/1',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
    };

    const created = await storage.createArticle(article);
    const retrieved = await storage.getArticle(created.id);

    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(created.id);
    expect(retrieved?.title).toBe('Test article');
  });

  it('should return undefined for non-existent article', async () => {
    const result = await storage.getArticle('non-existent-id');
    expect(result).toBeUndefined();
  });

  it('should get articles by team', async () => {
    const articles = testUtils.createMockArticles(3, 'NBA_LAL');
    
    for (const article of articles) {
      await storage.createArticle({
        teamId: article.teamId,
        title: article.title,
        content: article.content,
        sourceUrl: article.sourceUrl,
        sourceName: article.sourceName,
        sourceType: article.sourceType,
        publishedAt: article.publishedAt,
      });
    }

    const result = await storage.getArticlesByTeam('NBA_LAL');

    expect(result.length).toBe(3);
    expect(result.every(a => a.teamId === 'NBA_LAL')).toBe(true);
  });

  it('should filter articles by team', async () => {
    await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Lakers',
      content: 'Lakers content',
      sourceUrl: 'https://test.com/1',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    await storage.createArticle({
      teamId: 'NBA_BOS',
      title: 'Celtics',
      content: 'Celtics content',
      sourceUrl: 'https://test.com/2',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    const lakersArticles = await storage.getArticlesByTeam('NBA_LAL');
    expect(lakersArticles.length).toBe(1);
    expect(lakersArticles[0].teamId).toBe('NBA_LAL');
  });

  it('should get articles by team and category', async () => {
    await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Injury report',
      content: 'Player injured',
      sourceUrl: 'https://test.com/1',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
      category: 'injury',
    });

    await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Trade news',
      content: 'Trade happened',
      sourceUrl: 'https://test.com/2',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
      category: 'trade',
    });

    const injuryArticles = await storage.getArticlesByTeamAndCategory('NBA_LAL', 'injury');
    
    expect(injuryArticles.length).toBe(1);
    expect(injuryArticles[0].category).toBe('injury');
  });

  it('should get article by source URL', async () => {
    const url = 'https://unique-url.com/article';
    
    await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Test',
      content: 'Content',
      sourceUrl: url,
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    const result = await storage.getArticleBySourceUrl(url);
    
    expect(result).toBeDefined();
    expect(result?.sourceUrl).toBe(url);
  });

  it('should get recent articles within date range', async () => {
    const threeDaysAgo = testUtils.daysAgo(3);
    const eightDaysAgo = testUtils.daysAgo(8);

    await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Recent',
      content: 'Recent article',
      sourceUrl: 'https://test.com/recent',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: threeDaysAgo,
    });

    await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Old',
      content: 'Old article',
      sourceUrl: 'https://test.com/old',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: eightDaysAgo,
    });

    const recentArticles = await storage.getRecentArticles('NBA_LAL', 7);
    
    expect(recentArticles.length).toBe(1);
    expect(recentArticles[0].title).toBe('Recent');
  });

  it('should update article', async () => {
    const created = await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Original',
      content: 'Original content',
      sourceUrl: 'https://test.com/1',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    const updated = await storage.updateArticle(created.id, {
      title: 'Updated',
      isProcessed: true,
    });

    expect(updated).toBeDefined();
    expect(updated?.title).toBe('Updated');
    expect(updated?.isProcessed).toBe(true);
    expect(updated?.content).toBe('Original content'); // Unchanged
  });

  it('should soft delete article', async () => {
    const created = await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'To delete',
      content: 'Content',
      sourceUrl: 'https://test.com/1',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    await storage.deleteArticle(created.id);

    const retrieved = await storage.getArticle(created.id);
    expect(retrieved?.isDeleted).toBe(true);

    // Should not appear in team articles
    const teamArticles = await storage.getArticlesByTeam('NBA_LAL');
    expect(teamArticles.length).toBe(0);
  });

  it('should get unprocessed articles', async () => {
    await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Unprocessed',
      content: 'Content',
      sourceUrl: 'https://test.com/1',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
      isProcessed: false,
    });

    await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Processed',
      content: 'Content',
      sourceUrl: 'https://test.com/2',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
      isProcessed: true,
    });

    const unprocessed = await storage.getUnprocessedArticles();
    
    expect(unprocessed.length).toBe(1);
    expect(unprocessed[0].title).toBe('Unprocessed');
  });

  it('should respect limit parameter', async () => {
    for (let i = 0; i < 10; i++) {
      await storage.createArticle({
        teamId: 'NBA_LAL',
        title: `Article ${i}`,
        content: 'Content',
        sourceUrl: `https://test.com/${i}`,
        sourceName: 'Test',
        sourceType: 'rss',
        publishedAt: new Date(),
      });
    }

    const limited = await storage.getArticlesByTeam('NBA_LAL', 5);
    expect(limited.length).toBe(5);
  });

  it('should sort articles by published date descending', async () => {
    await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Old',
      content: 'Content',
      sourceUrl: 'https://test.com/old',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: testUtils.daysAgo(5),
    });

    await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'New',
      content: 'Content',
      sourceUrl: 'https://test.com/new',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    const articles = await storage.getArticlesByTeam('NBA_LAL');
    
    expect(articles[0].title).toBe('New');
    expect(articles[1].title).toBe('Old');
  });
});

describe('Storage - News Sources', () => {
  let storage: MemStorage;

  beforeEach(() => {
    storage = new MemStorage();
  });

  it('should create news source', async () => {
    const source: InsertNewsSource = {
      name: 'ESPN',
      domain: 'espn.com',
      sourceType: 'rss',
      rssUrl: 'https://www.espn.com/rss/news',
    };

    const created = await storage.createNewsSource(source);

    expect(created.id).toBeDefined();
    expect(created.name).toBe('ESPN');
    expect(created.isActive).toBe(true);
    expect(created.totalArticles).toBe(0);
  });

  it('should get news source by ID', async () => {
    const created = await storage.createNewsSource({
      name: 'ESPN',
      domain: 'espn.com',
      sourceType: 'rss',
    });

    const retrieved = await storage.getNewsSource(created.id);
    
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(created.id);
  });

  it('should get news source by name', async () => {
    await storage.createNewsSource({
      name: 'The Athletic',
      domain: 'theathletic.com',
      sourceType: 'scraper',
    });

    const retrieved = await storage.getNewsSourceByName('The Athletic');
    
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('The Athletic');
  });

  it('should get all news sources', async () => {
    await storage.createNewsSource({
      name: 'ESPN',
      domain: 'espn.com',
      sourceType: 'rss',
    });

    await storage.createNewsSource({
      name: 'Bleacher Report',
      domain: 'bleacherreport.com',
      sourceType: 'rss',
    });

    const all = await storage.getAllNewsSources();
    expect(all.length).toBe(2);
  });

  it('should get only active news sources', async () => {
    await storage.createNewsSource({
      name: 'Active',
      domain: 'active.com',
      sourceType: 'rss',
      isActive: true,
    });

    const inactive = await storage.createNewsSource({
      name: 'Inactive',
      domain: 'inactive.com',
      sourceType: 'rss',
      isActive: false,
    });

    await storage.updateNewsSource(inactive.id, { isActive: false });

    const active = await storage.getActiveNewsSources();
    
    expect(active.length).toBe(1);
    expect(active[0].name).toBe('Active');
  });

  it('should update news source', async () => {
    const created = await storage.createNewsSource({
      name: 'ESPN',
      domain: 'espn.com',
      sourceType: 'rss',
      totalArticles: 0,
    });

    const updated = await storage.updateNewsSource(created.id, {
      totalArticles: 100,
      relevantArticles: 75,
    });

    expect(updated?.totalArticles).toBe(100);
    expect(updated?.relevantArticles).toBe(75);
  });

  it('should return undefined when updating non-existent source', async () => {
    const result = await storage.updateNewsSource('non-existent', {
      totalArticles: 100,
    });

    expect(result).toBeUndefined();
  });

  it('should set default values for news source', async () => {
    const created = await storage.createNewsSource({
      name: 'Test',
      domain: 'test.com',
      sourceType: 'rss',
    });

    expect(created.totalArticles).toBe(0);
    expect(created.relevantArticles).toBe(0);
    expect(created.duplicateArticles).toBe(0);
    expect(created.isActive).toBe(true);
    expect(created.requestsPerMinute).toBe(10);
  });
});

describe('Storage - BM25 Indexes', () => {
  let storage: MemStorage;

  beforeEach(() => {
    storage = new MemStorage();
  });

  it('should create BM25 index', async () => {
    const index: InsertBM25Index = {
      teamId: 'NBA_LAL',
      totalDocuments: 100,
      avgDocLength: 150,
    };

    const created = await storage.createBM25Index(index);

    expect(created.id).toBeDefined();
    expect(created.teamId).toBe('NBA_LAL');
    expect(created.totalDocuments).toBe(100);
    expect(created.k1).toBe('1.5');
    expect(created.b).toBe('0.75');
  });

  it('should get BM25 index by team', async () => {
    await storage.createBM25Index({
      teamId: 'NBA_LAL',
      totalDocuments: 50,
      avgDocLength: 120,
    });

    const retrieved = await storage.getBM25IndexByTeam('NBA_LAL');
    
    expect(retrieved).toBeDefined();
    expect(retrieved?.teamId).toBe('NBA_LAL');
    expect(retrieved?.totalDocuments).toBe(50);
  });

  it('should return undefined for non-existent team index', async () => {
    const result = await storage.getBM25IndexByTeam('NON_EXISTENT');
    expect(result).toBeUndefined();
  });

  it('should update BM25 index stats', async () => {
    await storage.createBM25Index({
      teamId: 'NBA_LAL',
      totalDocuments: 50,
      avgDocLength: 120,
    });

    const updated = await storage.updateBM25IndexStats('NBA_LAL', {
      totalDocuments: 100,
      avgDocLength: 150,
      totalQueries: 1000,
    });

    expect(updated).toBeDefined();
    expect(updated?.totalDocuments).toBe(100);
    expect(updated?.avgDocLength).toBe(150);
    expect(updated?.totalQueries).toBe(1000);
  });

  it('should return undefined when updating non-existent index', async () => {
    const result = await storage.updateBM25IndexStats('NON_EXISTENT', {
      totalDocuments: 100,
    });

    expect(result).toBeUndefined();
  });

  it('should set default values for BM25 index', async () => {
    const created = await storage.createBM25Index({
      teamId: 'NBA_LAL',
    });

    expect(created.totalDocuments).toBe(0);
    expect(created.avgDocLength).toBe(0);
    expect(created.totalQueries).toBe(0);
    expect(created.rebuildInProgress).toBe(false);
  });
});

describe('Storage - Article Classifications', () => {
  let storage: MemStorage;
  let articleId: string;

  beforeEach(async () => {
    storage = new MemStorage();
    
    // Create an article to classify
    const article = await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Test article',
      content: 'Content',
      sourceUrl: 'https://test.com/1',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
    });
    articleId = article.id;
  });

  it('should create article classification', async () => {
    const classification: InsertArticleClassification = {
      articleId,
      category: 'injury',
      confidence: 0.95,
    };

    const created = await storage.createArticleClassification(classification);

    expect(created.id).toBeDefined();
    expect(created.articleId).toBe(articleId);
    expect(created.category).toBe('injury');
    expect(created.confidence).toBe(0.95);
  });

  it('should get classification by ID', async () => {
    const created = await storage.createArticleClassification({
      articleId,
      category: 'trade',
      confidence: 0.88,
    });

    const retrieved = await storage.getArticleClassification(created.id);
    
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(created.id);
  });

  it('should get classifications by article', async () => {
    await storage.createArticleClassification({
      articleId,
      category: 'injury',
      confidence: 0.95,
    });

    await storage.createArticleClassification({
      articleId,
      category: 'roster',
      confidence: 0.85,
    });

    const classifications = await storage.getClassificationsByArticle(articleId);
    
    expect(classifications.length).toBe(2);
    expect(classifications.some(c => c.category === 'injury')).toBe(true);
    expect(classifications.some(c => c.category === 'roster')).toBe(true);
  });

  it('should sort classifications by date descending', async () => {
    const old = await storage.createArticleClassification({
      articleId,
      category: 'old',
      confidence: 0.9,
    });

    // Wait a tiny bit to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));

    await storage.createArticleClassification({
      articleId,
      category: 'new',
      confidence: 0.95,
    });

    const classifications = await storage.getClassificationsByArticle(articleId);
    
    expect(classifications[0].category).toBe('new');
    expect(classifications[1].category).toBe('old');
  });

  it('should delete classification', async () => {
    const created = await storage.createArticleClassification({
      articleId,
      category: 'injury',
      confidence: 0.95,
    });

    await storage.deleteArticleClassification(created.id);

    const retrieved = await storage.getArticleClassification(created.id);
    expect(retrieved).toBeUndefined();
  });

  it('should support optional fields', async () => {
    const created = await storage.createArticleClassification({
      articleId,
      category: 'injury',
      confidence: 0.95,
      classifierVersion: 'v1.0',
      reasoning: 'Player injury mentioned',
      keywords: ['injury', 'out', 'miss'],
    });

    expect(created.classifierVersion).toBe('v1.0');
    expect(created.reasoning).toBe('Player injury mentioned');
    expect(created.keywords).toEqual(['injury', 'out', 'miss']);
  });
});

describe('Storage - Edge Cases', () => {
  let storage: MemStorage;

  beforeEach(() => {
    storage = new MemStorage();
  });

  it('should handle empty results gracefully', async () => {
    const articles = await storage.getArticlesByTeam('NBA_LAL');
    expect(articles).toEqual([]);

    const sources = await storage.getAllNewsSources();
    expect(sources).toEqual([]);

    const classifications = await storage.getClassificationsByArticle('non-existent');
    expect(classifications).toEqual([]);
  });

  it('should handle concurrent article creation', async () => {
    const promises = Array.from({ length: 10 }, (_, i) =>
      storage.createArticle({
        teamId: 'NBA_LAL',
        title: `Article ${i}`,
        content: 'Content',
        sourceUrl: `https://test.com/${i}`,
        sourceName: 'Test',
        sourceType: 'rss',
        publishedAt: new Date(),
      })
    );

    const results = await Promise.all(promises);
    
    expect(results.length).toBe(10);
    expect(new Set(results.map(r => r.id)).size).toBe(10); // All unique IDs
  });

  it('should handle null/undefined optional fields', async () => {
    const article = await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Test',
      content: 'Content',
      sourceUrl: 'https://test.com/1',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
      summary: null,
      author: null,
      category: null,
    });

    expect(article.summary).toBeNull();
    expect(article.author).toBeNull();
    expect(article.category).toBeNull();
  });
});

describe('Storage - Performance', () => {
  let storage: MemStorage;

  beforeEach(() => {
    storage = new MemStorage();
  });

  it('should create articles quickly', async () => {
    const { avgDuration } = await testUtils.benchmark(async () => {
      await storage.createArticle({
        teamId: 'NBA_LAL',
        title: 'Test',
        content: 'Content',
        sourceUrl: `https://test.com/${Math.random()}`,
        sourceName: 'Test',
        sourceType: 'rss',
        publishedAt: new Date(),
      });
    }, 100);

    expect(avgDuration).toBeLessThan(5); // Very fast for in-memory
  });

  it('should query articles quickly', async () => {
    // Add 100 articles
    for (let i = 0; i < 100; i++) {
      await storage.createArticle({
        teamId: 'NBA_LAL',
        title: `Article ${i}`,
        content: 'Content',
        sourceUrl: `https://test.com/${i}`,
        sourceName: 'Test',
        sourceType: 'rss',
        publishedAt: new Date(),
      });
    }

    const { duration } = await testUtils.measureTime(async () => {
      return storage.getArticlesByTeam('NBA_LAL');
    });

    expect(duration).toBeLessThan(10);
  });
});
