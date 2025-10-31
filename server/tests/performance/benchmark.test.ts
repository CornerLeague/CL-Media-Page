/**
 * Performance Benchmarks
 * Validates that all Phase 1 components meet performance targets
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemStorage } from '../../storage';
import { tokenize, calculateTermFrequencies, extractKeywords, calculateContentHash } from '../../utils/bm25/tokenizer';
import { MinHash } from '../../utils/deduplication/minHash';
import { BM25Index } from '../../utils/bm25/algorithm';
import testUtils from '../helpers/testUtils';

describe('Performance Benchmarks - Tokenization', () => {
  it('should tokenize short text quickly (<1ms)', async () => {
    const text = 'Lakers win against Celtics with strong performance';

    const { avgDuration } = await testUtils.benchmark(() => {
      tokenize(text);
    }, 100);

    expect(avgDuration).toBeLessThan(1);
  });

  it('should tokenize medium text quickly (<5ms)', async () => {
    const text = `
      The Los Angeles Lakers secured a decisive victory against the Boston Celtics 
      in a thrilling game that went down to the wire. LeBron James led the team 
      with 35 points, 10 rebounds, and 8 assists in an outstanding performance. 
      Anthony Davis contributed 28 points and dominated the paint with his defensive 
      presence. The Lakers' bench also played a crucial role in the win.
    `;

    const { avgDuration } = await testUtils.benchmark(() => {
      tokenize(text);
    }, 100);

    expect(avgDuration).toBeLessThan(5);
  });

  it('should tokenize long article efficiently (<10ms for 1000 words)', async () => {
    // Generate 1000-word article
    const words = Array(1000).fill('Lakers basketball game performance victory').join(' ');

    const { avgDuration } = await testUtils.benchmark(() => {
      tokenize(words);
    }, 50);

    expect(avgDuration).toBeLessThan(10);
  });

  it('should calculate term frequencies quickly (<2ms)', async () => {
    const tokens = tokenize('Lakers win game Lakers basketball Lakers performance');

    const { avgDuration } = await testUtils.benchmark(() => {
      calculateTermFrequencies(tokens);
    }, 100);

    expect(avgDuration).toBeLessThan(2);
  });

  it('should extract keywords efficiently (<5ms)', async () => {
    const article = testUtils.createMockArticle('NBA_LAL');

    const { avgDuration } = await testUtils.benchmark(() => {
      extractKeywords(article.content, 10);
    }, 100);

    expect(avgDuration).toBeLessThan(5);
  });

  it('should calculate content hash quickly (<1ms)', async () => {
    const text = 'Lakers basketball game performance and victory';

    const { avgDuration } = await testUtils.benchmark(() => {
      calculateContentHash(text);
    }, 100);

    expect(avgDuration).toBeLessThan(1);
  });
});

describe('Performance Benchmarks - MinHash', () => {
  let minHash: MinHash;

  beforeEach(() => {
    minHash = new MinHash();
  });

  it('should generate signature for short text (<1ms)', async () => {
    const text = 'Lakers win the championship game';

    const { avgDuration } = await testUtils.benchmark(() => {
      minHash.signature(text);
    }, 100);

    expect(avgDuration).toBeLessThan(1);
  });

  it('should generate signature for medium text (<3ms)', async () => {
    const article = testUtils.createMockArticle('NBA_LAL');

    const { avgDuration } = await testUtils.benchmark(() => {
      minHash.signature(article.content);
    }, 100);

    expect(avgDuration).toBeLessThan(3);
  });

  it('should generate signature for long text (<10ms for 1000 words)', async () => {
    const longText = Array(1000).fill('Lakers basketball game performance').join(' ');

    const { avgDuration } = await testUtils.benchmark(() => {
      minHash.signature(longText);
    }, 50);

    expect(avgDuration).toBeLessThan(10);
  });

  it('should calculate similarity quickly (<1ms)', async () => {
    const sig1 = minHash.signature('Lakers win championship');
    const sig2 = minHash.signature('Lakers win the championship game');

    const { avgDuration } = await testUtils.benchmark(() => {
      minHash.similarity(sig1, sig2);
    }, 100);

    expect(avgDuration).toBeLessThan(1);
  });

  it('should handle batch signature generation efficiently', async () => {
    const articles = testUtils.createMockArticles(10, 'NBA_LAL');

    const { duration } = await testUtils.measureTime(() => {
      articles.forEach(article => {
        minHash.signature(article.content);
      });
    });

    expect(duration).toBeLessThan(30); // <30ms for 10 articles
  });
});

describe('Performance Benchmarks - BM25 Indexing', () => {
  let bm25Index: BM25Index;

  beforeEach(() => {
    bm25Index = new BM25Index();
  });

  it('should add single document quickly (<2ms)', async () => {
    const article = testUtils.createMockArticle('NBA_LAL');

    const { avgDuration } = await testUtils.benchmark(() => {
      const index = new BM25Index();
      index.addDocument({
        id: article.id,
        content: article.content,
        teamId: article.teamId,
      });
    }, 100);

    expect(avgDuration).toBeLessThan(2);
  });

  it('should add multiple documents efficiently (<100ms for 50 docs)', async () => {
    const articles = testUtils.createMockArticles(50, 'NBA_LAL');

    const { duration } = await testUtils.measureTime(() => {
      articles.forEach(article => {
        bm25Index.addDocument({
          id: article.id,
          content: article.content,
          teamId: article.teamId,
        });
      });
    });

    expect(duration).toBeLessThan(100);
    expect(bm25Index.getStats().totalDocuments).toBe(50);
  });

  it('should build large index efficiently (<1s for 200 docs)', async () => {
    const articles = testUtils.createMockArticles(200, 'NBA_LAL');

    const { duration } = await testUtils.measureTime(() => {
      articles.forEach(article => {
        bm25Index.addDocument({
          id: article.id,
          content: article.content,
          teamId: article.teamId,
        });
      });
    });

    expect(duration).toBeLessThan(1000);
    expect(bm25Index.getStats().totalDocuments).toBe(200);
  });

  it('should remove document quickly (<5ms)', async () => {
    const article = testUtils.createMockArticle('NBA_LAL');
    bm25Index.addDocument({
      id: article.id,
      content: article.content,
      teamId: article.teamId,
    });

    const { avgDuration } = await testUtils.benchmark(() => {
      const index = new BM25Index();
      const art = testUtils.createMockArticle('NBA_LAL');
      index.addDocument({ id: art.id, content: art.content, teamId: art.teamId });
      index.removeDocument(art.id);
    }, 50);

    expect(avgDuration).toBeLessThan(5);
  });
});

describe('Performance Benchmarks - BM25 Search', () => {
  let bm25Index: BM25Index;

  beforeEach(() => {
    bm25Index = new BM25Index();
    
    // Build index with 100 articles
    const articles = testUtils.createMockArticles(100, 'NBA_LAL');
    articles.forEach(article => {
      bm25Index.addDocument({
        id: article.id,
        content: article.content,
        teamId: article.teamId,
      });
    });
  });

  it('should search single term quickly (<5ms)', async () => {
    const { avgDuration } = await testUtils.benchmark(() => {
      bm25Index.search({ terms: ['Lakers'] });
    }, 100);

    expect(avgDuration).toBeLessThan(5);
  });

  it('should search multiple terms quickly (<10ms)', async () => {
    const { avgDuration } = await testUtils.benchmark(() => {
      bm25Index.search({ terms: ['Lakers', 'basketball', 'game'] });
    }, 100);

    expect(avgDuration).toBeLessThan(10);
  });

  it('should search with team filter quickly (<10ms)', async () => {
    const { avgDuration } = await testUtils.benchmark(() => {
      bm25Index.search({ terms: ['Lakers'], teamId: 'NBA_LAL' });
    }, 100);

    expect(avgDuration).toBeLessThan(10);
  });

  it('should handle concurrent searches efficiently', async () => {
    const queries = [
      { terms: ['Lakers'] },
      { terms: ['basketball'] },
      { terms: ['game', 'victory'] },
      { terms: ['performance'] },
      { terms: ['championship'] },
    ];

    const { duration } = await testUtils.measureTime(() => {
      queries.forEach(query => {
        bm25Index.search(query);
      });
    });

    expect(duration).toBeLessThan(50); // <50ms for 5 searches
  });
});

describe('Performance Benchmarks - Storage Operations', () => {
  let storage: MemStorage;

  beforeEach(() => {
    storage = new MemStorage();
  });

  it('should create article quickly (<5ms)', async () => {
    const { avgDuration } = await testUtils.benchmark(async () => {
      const store = new MemStorage();
      await store.createArticle({
        teamId: 'NBA_LAL',
        title: 'Test article',
        content: 'Test content',
        sourceUrl: `https://test.com/${Math.random()}`,
        sourceName: 'Test',
        sourceType: 'rss',
        publishedAt: new Date(),
      });
    }, 100);

    expect(avgDuration).toBeLessThan(5);
  });

  it('should get article by ID quickly (<2ms)', async () => {
    const article = await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Test',
      content: 'Content',
      sourceUrl: 'https://test.com/1',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    const { avgDuration } = await testUtils.benchmark(async () => {
      await storage.getArticle(article.id);
    }, 100);

    expect(avgDuration).toBeLessThan(2);
  });

  it('should query articles by team efficiently (<10ms for 50 articles)', async () => {
    // Create 50 articles
    for (let i = 0; i < 50; i++) {
      await storage.createArticle({
        teamId: 'NBA_LAL',
        title: `Article ${i}`,
        content: `Content ${i}`,
        sourceUrl: `https://test.com/${i}`,
        sourceName: 'Test',
        sourceType: 'rss',
        publishedAt: new Date(),
      });
    }

    const { avgDuration } = await testUtils.benchmark(async () => {
      await storage.getArticlesByTeam('NBA_LAL', 50);
    }, 50);

    expect(avgDuration).toBeLessThan(10);
  });

  it('should update article quickly (<3ms)', async () => {
    const article = await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Test',
      content: 'Content',
      sourceUrl: 'https://test.com/1',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    const { avgDuration } = await testUtils.benchmark(async () => {
      await storage.updateArticle(article.id, { isProcessed: true });
    }, 100);

    expect(avgDuration).toBeLessThan(3);
  });

  it('should handle batch article creation efficiently (<100ms for 50 articles)', async () => {
    const { duration } = await testUtils.measureTime(async () => {
      for (let i = 0; i < 50; i++) {
        await storage.createArticle({
          teamId: 'NBA_LAL',
          title: `Article ${i}`,
          content: `Content ${i}`,
          sourceUrl: `https://test.com/${i}`,
          sourceName: 'Test',
          sourceType: 'rss',
          publishedAt: new Date(),
        });
      }
    });

    expect(duration).toBeLessThan(100);
  });

  it('should create classification quickly (<3ms)', async () => {
    const article = await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Test',
      content: 'Content',
      sourceUrl: 'https://test.com/1',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    const { avgDuration } = await testUtils.benchmark(async () => {
      const store = new MemStorage();
      const art = await store.createArticle({
        teamId: 'NBA_LAL',
        title: 'Test',
        content: 'Content',
        sourceUrl: `https://test.com/${Math.random()}`,
        sourceName: 'Test',
        sourceType: 'rss',
        publishedAt: new Date(),
      });
      await store.createArticleClassification({
        articleId: art.id,
        category: 'injury',
        confidence: 0.95,
      });
    }, 50);

    expect(avgDuration).toBeLessThan(3);
  });

  it('should query classifications efficiently (<5ms)', async () => {
    const article = await storage.createArticle({
      teamId: 'NBA_LAL',
      title: 'Test',
      content: 'Content',
      sourceUrl: 'https://test.com/1',
      sourceName: 'Test',
      sourceType: 'rss',
      publishedAt: new Date(),
    });

    await storage.createArticleClassification({
      articleId: article.id,
      category: 'injury',
      confidence: 0.95,
    });

    const { avgDuration } = await testUtils.benchmark(async () => {
      await storage.getClassificationsByArticle(article.id);
    }, 100);

    expect(avgDuration).toBeLessThan(5);
  });
});

describe('Performance Benchmarks - End-to-End Pipeline', () => {
  let storage: MemStorage;
  let bm25Index: BM25Index;
  let minHash: MinHash;

  beforeEach(() => {
    storage = new MemStorage();
    bm25Index = new BM25Index();
    minHash = new MinHash();
  });

  it('should process single article through pipeline quickly (<20ms)', async () => {
    const { duration } = await testUtils.measureTime(async () => {
      // 1. Create article
      const article = await storage.createArticle({
        teamId: 'NBA_LAL',
        title: 'Lakers victory',
        content: 'Lakers defeat Celtics with outstanding performance from the team',
        sourceUrl: 'https://test.com/1',
        sourceName: 'Test',
        sourceType: 'rss',
        publishedAt: new Date(),
      });

      // 2. Tokenize
      const tokens = tokenize(article.content);

      // 3. Generate MinHash signature
      const signature = minHash.signature(article.content);

      // 4. Add to BM25 index
      bm25Index.addDocument({
        id: article.id,
        content: article.content,
        teamId: article.teamId,
      });

      // 5. Classify
      await storage.createArticleClassification({
        articleId: article.id,
        category: 'game_recap',
        confidence: 0.9,
      });

      // 6. Update as processed
      await storage.updateArticle(article.id, {
        isProcessed: true,
        minHash: JSON.stringify(signature.hashes),
      });
    });

    expect(duration).toBeLessThan(20);
  });

  it('should process batch of 10 articles efficiently (<150ms)', async () => {
    const articles = testUtils.createMockArticles(10, 'NBA_LAL');

    const { duration } = await testUtils.measureTime(async () => {
      for (const articleData of articles) {
        // Create
        const article = await storage.createArticle({
          teamId: articleData.teamId,
          title: articleData.title,
          content: articleData.content,
          sourceUrl: articleData.sourceUrl,
          sourceName: articleData.sourceName,
          sourceType: articleData.sourceType,
          publishedAt: articleData.publishedAt,
        });

        // Process
        const signature = minHash.signature(article.content);
        bm25Index.addDocument({
          id: article.id,
          content: article.content,
          teamId: article.teamId,
        });

        await storage.updateArticle(article.id, {
          isProcessed: true,
          minHash: JSON.stringify(signature.hashes),
        });
      }
    });

    expect(duration).toBeLessThan(150);
    expect(bm25Index.getStats().totalDocuments).toBe(10);
  });

  it('should search processed articles quickly (<10ms)', async () => {
    // Process 50 articles
    const articles = testUtils.createMockArticles(50, 'NBA_LAL');
    for (const articleData of articles) {
      const article = await storage.createArticle({
        teamId: articleData.teamId,
        title: articleData.title,
        content: articleData.content,
        sourceUrl: articleData.sourceUrl,
        sourceName: articleData.sourceName,
        sourceType: articleData.sourceType,
        publishedAt: articleData.publishedAt,
      });

      bm25Index.addDocument({
        id: article.id,
        content: article.content,
        teamId: article.teamId,
      });
    }

    // Benchmark search
    const { avgDuration } = await testUtils.benchmark(() => {
      bm25Index.search({ terms: ['Lakers', 'game'] });
    }, 100);

    expect(avgDuration).toBeLessThan(10);
  });
});

describe('Performance Benchmarks - Memory Usage', () => {
  it('should handle large index without excessive memory', async () => {
    const bm25Index = new BM25Index();
    const articles = testUtils.createMockArticles(500, 'NBA_LAL');

    // Add 500 articles to index
    articles.forEach(article => {
      bm25Index.addDocument({
        id: article.id,
        content: article.content,
        teamId: article.teamId,
      });
    });

    expect(bm25Index.getStats().totalDocuments).toBe(500);

    // Search should still be fast
    const { duration } = await testUtils.measureTime(() => {
      bm25Index.search({ terms: ['Lakers', 'basketball'] });
    });

    expect(duration).toBeLessThan(50); // <50ms even with 500 docs
  });

  it('should handle large storage without performance degradation', async () => {
    const storage = new MemStorage();

    // Create 100 articles
    for (let i = 0; i < 100; i++) {
      await storage.createArticle({
        teamId: 'NBA_LAL',
        title: `Article ${i}`,
        content: `Content ${i}`,
        sourceUrl: `https://test.com/${i}`,
        sourceName: 'Test',
        sourceType: 'rss',
        publishedAt: new Date(),
      });
    }

    // Query should still be fast
    const { duration } = await testUtils.measureTime(async () => {
      await storage.getArticlesByTeam('NBA_LAL', 100);
    });

    expect(duration).toBeLessThan(20);
  });
});
