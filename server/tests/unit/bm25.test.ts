/**
 * BM25 Algorithm Unit Tests
 * Tests BM25 indexing, search, and ranking functionality
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BM25Index, type BM25Document, type BM25Query } from '../../utils/bm25/algorithm';
import testUtils from '../helpers/testUtils';

describe('BM25 Index - Creation and Initialization', () => {
  it('should create index with default parameters', () => {
    const index = new BM25Index();
    const stats = index.getStats();

    expect(stats.totalDocuments).toBe(0);
    expect(stats.avgDocLength).toBe(0);
    expect(stats.vocabularySize).toBe(0);
  });

  it('should create index with custom parameters', () => {
    const index = new BM25Index(2.0, 0.5);
    expect(index).toBeDefined();
    expect(index.size()).toBe(0);
  });

  it('should start with empty state', () => {
    const index = new BM25Index();
    
    expect(index.size()).toBe(0);
    expect(index.getDocumentIds()).toEqual([]);
    expect(index.hasDocument('any-id')).toBe(false);
  });
});

describe('BM25 Index - Add Documents', () => {
  let index: BM25Index;

  beforeEach(() => {
    index = new BM25Index();
  });

  it('should add single document', () => {
    const doc: BM25Document = {
      id: 'doc1',
      content: 'The Lakers won the game',
      teamId: 'NBA_LAL',
    };

    index.addDocument(doc);

    expect(index.size()).toBe(1);
    expect(index.hasDocument('doc1')).toBe(true);
    expect(index.getDocument('doc1')).toEqual(doc);
  });

  it('should add multiple documents', () => {
    const docs = testUtils.createMockArticles(5, 'NBA_LAL').map((article, i) => ({
      id: article.id,
      content: article.content,
      teamId: article.teamId,
    }));

    for (const doc of docs) {
      index.addDocument(doc);
    }

    expect(index.size()).toBe(5);
    expect(index.getDocumentIds()).toHaveLength(5);
  });

  it('should update statistics after adding documents', () => {
    const doc: BM25Document = {
      id: 'doc1',
      content: 'Short content',
      teamId: 'NBA_LAL',
    };

    index.addDocument(doc);
    const stats = index.getStats();

    expect(stats.totalDocuments).toBe(1);
    expect(stats.avgDocLength).toBeGreaterThan(0);
    expect(stats.vocabularySize).toBeGreaterThan(0);
  });

  it('should replace existing document when adding with same ID', () => {
    const doc1: BM25Document = {
      id: 'doc1',
      content: 'Original content',
      teamId: 'NBA_LAL',
    };

    const doc2: BM25Document = {
      id: 'doc1',
      content: 'Updated content',
      teamId: 'NBA_LAL',
    };

    index.addDocument(doc1);
    expect(index.size()).toBe(1);
    expect(index.getDocument('doc1')?.content).toBe('Original content');

    index.addDocument(doc2);
    expect(index.size()).toBe(1);
    expect(index.getDocument('doc1')?.content).toBe('Updated content');
  });

  it('should handle documents with metadata', () => {
    const doc: BM25Document = {
      id: 'doc1',
      content: 'Content with metadata',
      teamId: 'NBA_LAL',
      metadata: { category: 'injury', score: 95 },
    };

    index.addDocument(doc);
    const retrieved = index.getDocument('doc1');

    expect(retrieved?.metadata).toEqual({ category: 'injury', score: 95 });
  });

  it('should build inverted index correctly', () => {
    const doc: BM25Document = {
      id: 'doc1',
      content: 'basketball game',
      teamId: 'NBA_LAL',
    };

    index.addDocument(doc);

    // Check that terms are in vocabulary
    expect(index.getTermDocFreq('basketball')).toBe(1);
    expect(index.getTermDocFreq('game')).toBe(1);
  });
});

describe('BM25 Index - Remove Documents', () => {
  let index: BM25Index;

  beforeEach(() => {
    index = new BM25Index();
  });

  it('should remove document by ID', () => {
    const doc: BM25Document = {
      id: 'doc1',
      content: 'Test content',
      teamId: 'NBA_LAL',
    };

    index.addDocument(doc);
    expect(index.size()).toBe(1);

    index.removeDocument('doc1');
    expect(index.size()).toBe(0);
    expect(index.hasDocument('doc1')).toBe(false);
  });

  it('should update statistics after removing document', () => {
    const docs = testUtils.createMockArticles(3, 'NBA_LAL').map(article => ({
      id: article.id,
      content: article.content,
      teamId: article.teamId,
    }));

    for (const doc of docs) {
      index.addDocument(doc);
    }

    expect(index.size()).toBe(3);

    index.removeDocument(docs[0].id);
    expect(index.size()).toBe(2);

    const stats = index.getStats();
    expect(stats.totalDocuments).toBe(2);
  });

  it('should handle removing non-existent document', () => {
    index.removeDocument('non-existent');
    expect(index.size()).toBe(0); // Should not crash
  });

  it('should remove terms with zero document frequency', () => {
    const doc: BM25Document = {
      id: 'doc1',
      content: 'unique word here',
      teamId: 'NBA_LAL',
    };

    index.addDocument(doc);
    expect(index.getTermDocFreq('unique')).toBe(1);

    index.removeDocument('doc1');
    expect(index.getTermDocFreq('unique')).toBe(0);
  });

  it('should keep terms that appear in other documents', () => {
    const doc1: BM25Document = {
      id: 'doc1',
      content: 'basketball game',
      teamId: 'NBA_LAL',
    };

    const doc2: BM25Document = {
      id: 'doc2',
      content: 'basketball match',
      teamId: 'NBA_LAL',
    };

    index.addDocument(doc1);
    index.addDocument(doc2);

    expect(index.getTermDocFreq('basketball')).toBe(2);

    index.removeDocument('doc1');
    expect(index.getTermDocFreq('basketball')).toBe(1);
  });
});

describe('BM25 Index - Search - Single Term', () => {
  let index: BM25Index;

  beforeEach(() => {
    index = new BM25Index();
    
    // Add sample documents
    const docs: BM25Document[] = [
      { id: 'doc1', content: 'Lakers injury report LeBron James', teamId: 'NBA_LAL' },
      { id: 'doc2', content: 'Celtics game recap victory', teamId: 'NBA_BOS' },
      { id: 'doc3', content: 'Lakers trade rumors and news', teamId: 'NBA_LAL' },
    ];

    for (const doc of docs) {
      index.addDocument(doc);
    }
  });

  it('should find documents containing search term', () => {
    const query: BM25Query = { terms: ['Lakers'] };
    const results = index.search(query);

    expect(results.length).toBeGreaterThan(0);
    expect(results.every(r => index.getDocument(r.documentId)?.content.toLowerCase().includes('lakers'))).toBe(true);
  });

  it('should return results sorted by score descending', () => {
    const query: BM25Query = { terms: ['Lakers'] };
    const results = index.search(query);

    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
    }
  });

  it('should return empty results for non-existent term', () => {
    const query: BM25Query = { terms: ['nonexistent'] };
    const results = index.search(query);

    expect(results).toEqual([]);
  });

  it('should assign higher scores to documents with higher term frequency', () => {
    // Add document with term appearing multiple times
    const doc: BM25Document = {
      id: 'doc4',
      content: 'injury injury injury report',
      teamId: 'NBA_LAL',
    };
    index.addDocument(doc);

    const query: BM25Query = { terms: ['injury'] };
    const results = index.search(query);

    // doc4 should rank high due to multiple occurrences
    const doc4Result = results.find(r => r.documentId === 'doc4');
    expect(doc4Result).toBeDefined();
    expect(doc4Result!.score).toBeGreaterThan(0);
  });
});

describe('BM25 Index - Search - Multiple Terms', () => {
  let index: BM25Index;

  beforeEach(() => {
    index = new BM25Index();
    
    const docs: BM25Document[] = [
      { id: 'doc1', content: 'LeBron James injury update Lakers', teamId: 'NBA_LAL' },
      { id: 'doc2', content: 'Lakers game tonight against Celtics', teamId: 'NBA_LAL' },
      { id: 'doc3', content: 'Celtics injury report update', teamId: 'NBA_BOS' },
    ];

    for (const doc of docs) {
      index.addDocument(doc);
    }
  });

  it('should find documents matching multiple terms', () => {
    const query: BM25Query = { terms: ['Lakers', 'injury'] };
    const results = index.search(query);

    expect(results.length).toBeGreaterThan(0);
    // doc1 should be top result (contains both Lakers and injury)
    const topDoc = index.getDocument(results[0].documentId);
    expect(topDoc?.content.toLowerCase()).toContain('lakers');
    expect(topDoc?.content.toLowerCase()).toContain('injury');
  });

  it('should rank documents with all query terms higher', () => {
    const query: BM25Query = { terms: ['Lakers', 'injury'] };
    const results = index.search(query);

    // doc1 (Lakers + injury) should rank higher than doc2 (Lakers only)
    const doc1Rank = results.findIndex(r => r.documentId === 'doc1');
    const doc2Rank = results.findIndex(r => r.documentId === 'doc2');

    if (doc1Rank !== -1 && doc2Rank !== -1) {
      expect(doc1Rank).toBeLessThan(doc2Rank);
    }
  });

  it('should handle query with common and rare terms', () => {
    const query: BM25Query = { terms: ['LeBron', 'James'] };
    const results = index.search(query);

    expect(results.length).toBeGreaterThan(0);
  });
});

describe('BM25 Index - Search - Team Filtering', () => {
  let index: BM25Index;

  beforeEach(() => {
    index = new BM25Index();
    
    const docs: BM25Document[] = [
      { id: 'doc1', content: 'Lakers injury report', teamId: 'NBA_LAL' },
      { id: 'doc2', content: 'Celtics injury report', teamId: 'NBA_BOS' },
      { id: 'doc3', content: 'Patriots injury report', teamId: 'NFL_NE' },
    ];

    for (const doc of docs) {
      index.addDocument(doc);
    }
  });

  it('should filter results by team', () => {
    const query: BM25Query = { terms: ['injury'], teamId: 'NBA_LAL' };
    const results = index.search(query);

    expect(results.length).toBeGreaterThan(0);
    expect(results.every(r => index.getDocument(r.documentId)?.teamId === 'NBA_LAL')).toBe(true);
  });

  it('should return all matching documents when no team filter', () => {
    const queryWithTeam: BM25Query = { terms: ['injury'], teamId: 'NBA_LAL' };
    const queryWithoutTeam: BM25Query = { terms: ['injury'] };

    const resultsWithTeam = index.search(queryWithTeam);
    const resultsWithoutTeam = index.search(queryWithoutTeam);

    expect(resultsWithoutTeam.length).toBeGreaterThanOrEqual(resultsWithTeam.length);
  });

  it('should return empty results for team with no matching documents', () => {
    const query: BM25Query = { terms: ['injury'], teamId: 'MLB_BOS' };
    const results = index.search(query);

    expect(results).toEqual([]);
  });
});

describe('BM25 Index - Search - Result Limiting', () => {
  let index: BM25Index;

  beforeEach(() => {
    index = new BM25Index();
    
    // Add 10 documents
    for (let i = 1; i <= 10; i++) {
      const doc: BM25Document = {
        id: `doc${i}`,
        content: `Article about basketball game number ${i}`,
        teamId: 'NBA_LAL',
      };
      index.addDocument(doc);
    }
  });

  it('should respect limit parameter', () => {
    const query: BM25Query = { terms: ['basketball'] };
    const results = index.search(query, 5);

    expect(results.length).toBeLessThanOrEqual(5);
  });

  it('should return all results when limit exceeds result count', () => {
    const query: BM25Query = { terms: ['basketball'] };
    const results = index.search(query, 100);

    expect(results.length).toBeLessThanOrEqual(10);
  });

  it('should return top-ranked results within limit', () => {
    const query: BM25Query = { terms: ['basketball'] };
    const allResults = index.search(query, 100);
    const limitedResults = index.search(query, 3);

    expect(limitedResults.length).toBe(3);
    // Limited results should be the top 3 from all results
    expect(limitedResults[0].documentId).toBe(allResults[0].documentId);
    expect(limitedResults[1].documentId).toBe(allResults[1].documentId);
    expect(limitedResults[2].documentId).toBe(allResults[2].documentId);
  });
});

describe('BM25 Index - Statistics', () => {
  let index: BM25Index;

  beforeEach(() => {
    index = new BM25Index();
  });

  it('should calculate average document length', () => {
    const docs: BM25Document[] = [
      { id: 'doc1', content: 'short', teamId: 'NBA_LAL' },
      { id: 'doc2', content: 'medium length content', teamId: 'NBA_LAL' },
      { id: 'doc3', content: 'very long content here with many words', teamId: 'NBA_LAL' },
    ];

    for (const doc of docs) {
      index.addDocument(doc);
    }

    const stats = index.getStats();
    expect(stats.avgDocLength).toBeGreaterThan(0);
    expect(stats.avgDocLength).toBeLessThan(100); // Reasonable upper bound
  });

  it('should track vocabulary size', () => {
    const doc: BM25Document = {
      id: 'doc1',
      content: 'unique words basketball game match sport',
      teamId: 'NBA_LAL',
    };

    index.addDocument(doc);
    const stats = index.getStats();

    expect(stats.vocabularySize).toBeGreaterThan(0);
    expect(stats.vocabularySize).toBeLessThanOrEqual(6); // At most 6 unique words
  });

  it('should update stats when documents added/removed', () => {
    const doc: BM25Document = {
      id: 'doc1',
      content: 'test content',
      teamId: 'NBA_LAL',
    };

    index.addDocument(doc);
    const stats1 = index.getStats();
    expect(stats1.totalDocuments).toBe(1);

    index.removeDocument('doc1');
    const stats2 = index.getStats();
    expect(stats2.totalDocuments).toBe(0);
    expect(stats2.avgDocLength).toBe(0);
  });
});

describe('BM25 Index - Clear', () => {
  let index: BM25Index;

  beforeEach(() => {
    index = new BM25Index();
    
    const docs = testUtils.createMockArticles(5, 'NBA_LAL').map(article => ({
      id: article.id,
      content: article.content,
      teamId: article.teamId,
    }));

    for (const doc of docs) {
      index.addDocument(doc);
    }
  });

  it('should clear all documents', () => {
    expect(index.size()).toBe(5);

    index.clear();

    expect(index.size()).toBe(0);
    expect(index.getDocumentIds()).toEqual([]);
  });

  it('should reset statistics', () => {
    index.clear();
    const stats = index.getStats();

    expect(stats.totalDocuments).toBe(0);
    expect(stats.avgDocLength).toBe(0);
    expect(stats.vocabularySize).toBe(0);
  });

  it('should allow adding documents after clear', () => {
    index.clear();

    const doc: BM25Document = {
      id: 'new-doc',
      content: 'New content after clear',
      teamId: 'NBA_LAL',
    };

    index.addDocument(doc);
    expect(index.size()).toBe(1);
    expect(index.hasDocument('new-doc')).toBe(true);
  });
});

describe('BM25 Index - Export and Import', () => {
  it('should export index state', () => {
    const index = new BM25Index(1.5, 0.75);
    const doc: BM25Document = {
      id: 'doc1',
      content: 'Test content',
      teamId: 'NBA_LAL',
    };

    index.addDocument(doc);
    const exported = index.export();

    expect(exported.k1).toBe(1.5);
    expect(exported.b).toBe(0.75);
    expect(exported.documents).toHaveLength(1);
    expect(exported.documentLengths).toHaveLength(1);
  });

  it('should import index state', () => {
    const index1 = new BM25Index(1.5, 0.75);
    const docs: BM25Document[] = [
      { id: 'doc1', content: 'First document', teamId: 'NBA_LAL' },
      { id: 'doc2', content: 'Second document', teamId: 'NBA_BOS' },
    ];

    for (const doc of docs) {
      index1.addDocument(doc);
    }

    const exported = index1.export();

    // Create new index and import
    const index2 = new BM25Index();
    index2.import(exported);

    expect(index2.size()).toBe(2);
    expect(index2.hasDocument('doc1')).toBe(true);
    expect(index2.hasDocument('doc2')).toBe(true);
  });

  it('should produce same search results after export/import', () => {
    const index1 = new BM25Index();
    const docs: BM25Document[] = [
      { id: 'doc1', content: 'Lakers injury report', teamId: 'NBA_LAL' },
      { id: 'doc2', content: 'Celtics game recap', teamId: 'NBA_BOS' },
    ];

    for (const doc of docs) {
      index1.addDocument(doc);
    }

    const query: BM25Query = { terms: ['Lakers'] };
    const results1 = index1.search(query);

    // Export and import
    const exported = index1.export();
    const index2 = new BM25Index();
    index2.import(exported);

    const results2 = index2.search(query);

    expect(results2.length).toBe(results1.length);
    expect(results2[0].documentId).toBe(results1[0].documentId);
    expect(results2[0].score).toBeCloseTo(results1[0].score, 5);
  });

  it('should clear existing data before import', () => {
    const index = new BM25Index();
    const doc1: BM25Document = {
      id: 'old-doc',
      content: 'Old document',
      teamId: 'NBA_LAL',
    };

    index.addDocument(doc1);
    expect(index.size()).toBe(1);

    // Import new state
    const exportedState = {
      k1: 1.5,
      b: 0.75,
      documents: [['new-doc', { id: 'new-doc', content: 'New document', teamId: 'NBA_BOS' }]] as [string, BM25Document][],
      documentLengths: [['new-doc', 10]] as [string, number][],
    };

    index.import(exportedState);

    expect(index.size()).toBe(1);
    expect(index.hasDocument('old-doc')).toBe(false);
    expect(index.hasDocument('new-doc')).toBe(true);
  });
});

describe('BM25 Index - Edge Cases', () => {
  let index: BM25Index;

  beforeEach(() => {
    index = new BM25Index();
  });

  it('should handle empty document content', () => {
    const doc: BM25Document = {
      id: 'empty-doc',
      content: '',
      teamId: 'NBA_LAL',
    };

    index.addDocument(doc);
    expect(index.size()).toBe(1);
  });

  it('should handle document with only stopwords', () => {
    const doc: BM25Document = {
      id: 'stopwords-doc',
      content: 'the and is it was',
      teamId: 'NBA_LAL',
    };

    index.addDocument(doc);
    expect(index.size()).toBe(1);
  });

  it('should handle very long document', () => {
    const longContent = testUtils.createLongArticle(1000);
    const doc: BM25Document = {
      id: 'long-doc',
      content: longContent,
      teamId: 'NBA_LAL',
    };

    index.addDocument(doc);
    expect(index.size()).toBe(1);
  });

  it('should handle special characters in content', () => {
    const doc: BM25Document = {
      id: 'special-doc',
      content: 'Test! @#$% content (with) special {chars}',
      teamId: 'NBA_LAL',
    };

    index.addDocument(doc);
    const query: BM25Query = { terms: ['test', 'content'] };
    const results = index.search(query);

    expect(results.length).toBeGreaterThan(0);
  });

  it('should handle empty query', () => {
    const doc: BM25Document = {
      id: 'doc1',
      content: 'Some content',
      teamId: 'NBA_LAL',
    };

    index.addDocument(doc);
    const query: BM25Query = { terms: [] };
    const results = index.search(query);

    expect(results).toEqual([]);
  });

  it('should handle query with only stopwords', () => {
    const doc: BM25Document = {
      id: 'doc1',
      content: 'Basketball game today',
      teamId: 'NBA_LAL',
    };

    index.addDocument(doc);
    const query: BM25Query = { terms: ['the', 'and', 'is'] };
    const results = index.search(query);

    // Stopwords filtered out, no matches
    expect(results).toEqual([]);
  });
});

describe('BM25 Index - Performance', () => {
  it('should add documents quickly', async () => {
    const index = new BM25Index();
    const doc: BM25Document = {
      id: 'perf-doc',
      content: testUtils.createLongArticle(100),
      teamId: 'NBA_LAL',
    };

    const { duration } = await testUtils.measureTime(() => {
      index.addDocument(doc);
    });

    expect(duration).toBeLessThan(10); // Should be very fast
  });

  it('should search efficiently', async () => {
    const index = new BM25Index();
    
    // Add multiple documents
    for (let i = 0; i < 100; i++) {
      const doc: BM25Document = {
        id: `doc${i}`,
        content: `Article ${i} about basketball game and sports news`,
        teamId: 'NBA_LAL',
      };
      index.addDocument(doc);
    }

    const query: BM25Query = { terms: ['basketball', 'game'] };
    
    const { duration } = await testUtils.measureTime(() => {
      return index.search(query, 10);
    });

    // Should be fast even with 100 documents
    testUtils.assertPerformance(duration, 100, 'BM25 search with 100 docs');
    expect(duration).toBeLessThan(200);
  });

  it('should handle large index efficiently', async () => {
    const index = new BM25Index();
    
    // Add 1000 small documents
    const { duration } = await testUtils.measureTime(() => {
      for (let i = 0; i < 1000; i++) {
        const doc: BM25Document = {
          id: `doc${i}`,
          content: `Document ${i} content`,
          teamId: 'NBA_LAL',
        };
        index.addDocument(doc);
      }
    });

    expect(duration).toBeLessThan(1000); // Should complete in reasonable time
    expect(index.size()).toBe(1000);
  });
});

describe('BM25 Index - Real-World Usage', () => {
  let index: BM25Index;

  beforeEach(() => {
    index = new BM25Index();
  });

  it('should index real article content', () => {
    const article = testUtils.createMockArticle();
    const doc: BM25Document = {
      id: article.id,
      content: article.content,
      teamId: article.teamId,
    };

    index.addDocument(doc);
    expect(index.size()).toBe(1);
  });

  it('should search across multiple real articles', () => {
    const articles = testUtils.createMockArticles(10, 'NBA_LAL');
    
    for (const article of articles) {
      const doc: BM25Document = {
        id: article.id,
        content: article.content,
        teamId: article.teamId,
        metadata: { category: article.category },
      };
      index.addDocument(doc);
    }

    const query: BM25Query = { terms: ['injury'], teamId: 'NBA_LAL' };
    const results = index.search(query);

    expect(results.length).toBeGreaterThan(0);
    // Should find injury-related articles
    results.forEach(result => {
      const doc = index.getDocument(result.documentId);
      expect(doc).toBeDefined();
    });
  });

  it('should rank relevant articles higher', () => {
    const relevantArticle = testUtils.createMockArticle({
      content: 'LeBron James injury update: Lakers star out with ankle injury for several games',
    });

    const lessRelevantArticle = testUtils.createMockArticle({
      content: 'Lakers win game against Celtics in overtime thriller',
    });

    index.addDocument({
      id: relevantArticle.id,
      content: relevantArticle.content,
      teamId: relevantArticle.teamId,
    });

    index.addDocument({
      id: lessRelevantArticle.id,
      content: lessRelevantArticle.content,
      teamId: lessRelevantArticle.teamId,
    });

    const query: BM25Query = { terms: ['injury'] };
    const results = index.search(query);

    // Relevant article should rank first
    expect(results[0].documentId).toBe(relevantArticle.id);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('should include metadata in search results', () => {
    const article = testUtils.createMockArticle();
    const doc: BM25Document = {
      id: article.id,
      content: article.content,
      teamId: article.teamId,
      metadata: { category: 'injury', source: 'ESPN' },
    };

    index.addDocument(doc);

    const query: BM25Query = { terms: ['Lakers'] };
    const results = index.search(query);

    if (results.length > 0) {
      expect(results[0].metadata).toBeDefined();
      expect(results[0].metadata?.category).toBe('injury');
    }
  });
});
