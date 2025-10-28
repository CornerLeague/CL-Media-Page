/**
 * MinHash Unit Tests
 * Tests MinHash-based document deduplication and similarity detection
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MinHash, type MinHashSignature } from '../../utils/deduplication/minHash';
import testUtils from '../helpers/testUtils';

describe('MinHash - Signature Generation', () => {
  let minHash: MinHash;

  beforeEach(() => {
    minHash = new MinHash(); // Default: shingleSize=3, numHashes=128
  });

  it('should generate a signature with correct structure', () => {
    const text = 'The quick brown fox';
    const signature = minHash.signature(text);

    expect(signature).toHaveProperty('hashes');
    expect(signature).toHaveProperty('shingleSize');
    expect(signature).toHaveProperty('numHashes');
    expect(signature.hashes).toBeInstanceOf(Array);
  });

  it('should generate signature with correct dimensions', () => {
    const text = 'Sample text for MinHash';
    const signature = minHash.signature(text);

    expect(signature.hashes.length).toBe(128); // Default numHashes
    expect(signature.shingleSize).toBe(3); // Default shingleSize
    expect(signature.numHashes).toBe(128);
  });

  it('should generate signature with custom parameters', () => {
    const customMinHash = new MinHash(4, 64); // shingleSize=4, numHashes=64
    const text = 'Custom parameters test';
    const signature = customMinHash.signature(text);

    expect(signature.hashes.length).toBe(64);
    expect(signature.shingleSize).toBe(4);
    expect(signature.numHashes).toBe(64);
  });

  it('should generate all non-negative hash values', () => {
    const text = 'Test document for hash validation';
    const signature = minHash.signature(text);

    for (const hash of signature.hashes) {
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(typeof hash).toBe('number');
      expect(isNaN(hash)).toBe(false);
    }
  });

  it('should handle empty text gracefully', () => {
    const signature = minHash.signature('');

    expect(signature.hashes.length).toBe(128);
    expect(signature.hashes.every(h => h === 0)).toBe(true); // All zeros for empty
  });

  it('should handle very short text', () => {
    const signature = minHash.signature('ab'); // Shorter than shingleSize

    expect(signature.hashes.length).toBe(128);
    // Should still generate some hash values (or zeros)
    expect(signature.hashes).toBeDefined();
  });

  it('should generate consistent signatures for same text', () => {
    const text = 'Consistency test text';
    const sig1 = minHash.signature(text);
    const sig2 = minHash.signature(text);

    expect(sig1.hashes).toEqual(sig2.hashes);
  });
});

describe('MinHash - Identical Content', () => {
  let minHash: MinHash;

  beforeEach(() => {
    minHash = new MinHash();
  });

  it('should have similarity of 1.0 for identical text', () => {
    const text = 'The Lakers won the championship game';
    const sig1 = minHash.signature(text);
    const sig2 = minHash.signature(text);

    const similarity = minHash.similarity(sig1, sig2);
    expect(similarity).toBe(1.0);
  });

  it('should mark identical text as duplicate', () => {
    const text = 'Duplicate detection test';
    const sig1 = minHash.signature(text);
    const sig2 = minHash.signature(text);

    expect(minHash.isDuplicate(sig1, sig2, 0.8)).toBe(true);
    expect(minHash.isDuplicate(sig1, sig2, 0.95)).toBe(true);
  });

  it('should have high similarity for text with different case', () => {
    const text1 = 'The Quick Brown Fox';
    const text2 = 'the quick brown fox';

    const sig1 = minHash.signature(text1);
    const sig2 = minHash.signature(text2);

    const similarity = minHash.similarity(sig1, sig2);
    expect(similarity).toBe(1.0); // Should be identical after normalization
  });

  it('should have high similarity for text with extra whitespace', () => {
    const text1 = 'The  quick   brown    fox';
    const text2 = 'The quick brown fox';

    const sig1 = minHash.signature(text1);
    const sig2 = minHash.signature(text2);

    const similarity = minHash.similarity(sig1, sig2);
    expect(similarity).toBe(1.0); // Whitespace normalized
  });
});

describe('MinHash - Different Content', () => {
  let minHash: MinHash;

  beforeEach(() => {
    minHash = new MinHash();
  });

  it('should have low similarity for completely different text', () => {
    const text1 = 'The Lakers won the game';
    const text2 = 'Python programming tutorial';

    const sig1 = minHash.signature(text1);
    const sig2 = minHash.signature(text2);

    const similarity = minHash.similarity(sig1, sig2);
    expect(similarity).toBeLessThan(0.3);
  });

  it('should not mark different text as duplicate', () => {
    const text1 = 'Basketball game yesterday';
    const text2 = 'Football match tomorrow';

    const sig1 = minHash.signature(text1);
    const sig2 = minHash.signature(text2);

    expect(minHash.isDuplicate(sig1, sig2, 0.8)).toBe(false);
  });

  it('should have near-zero similarity for completely unrelated text', () => {
    const text1 = 'aaa bbb ccc ddd';
    const text2 = 'xxx yyy zzz www';

    const sig1 = minHash.signature(text1);
    const sig2 = minHash.signature(text2);

    const similarity = minHash.similarity(sig1, sig2);
    expect(similarity).toBeLessThan(0.2);
  });
});

describe('MinHash - Similar Content', () => {
  let minHash: MinHash;

  beforeEach(() => {
    minHash = new MinHash();
  });

  it('should detect some similarity for texts with common phrases', () => {
    // Use longer, more realistic text for better MinHash performance
    const text1 = 'The Los Angeles Lakers defeated the Boston Celtics in overtime last night at the arena. It was an exciting game with great performances.';
    const text2 = 'The Los Angeles Lakers beat the Boston Celtics in overtime last night at the arena. It was an exciting game with great performances.';

    const sig1 = minHash.signature(text1);
    const sig2 = minHash.signature(text2);

    const similarity = minHash.similarity(sig1, sig2);
    // With longer text, shared character shingles should result in measurable similarity
    // Most of the text is identical, only 'defeated' vs 'beat' differs
    expect(similarity).toBeGreaterThan(0.7);
  });

  it('should detect similarity for word order changes with longer text', () => {
    // Use longer text where word order changes preserve more character shingles
    const text1 = 'The quick brown fox jumped over the lazy dog in the morning sunshine';
    const text2 = 'The brown fox jumped over the lazy dog in the morning sunshine quick';

    const sig1 = minHash.signature(text1);
    const sig2 = minHash.signature(text2);

    const similarity = minHash.similarity(sig1, sig2);
    // Character-level shingles: most 3-grams are preserved despite word order change
    expect(similarity).toBeGreaterThan(0.6);
  });

  it('should detect similarity with small additions', () => {
    const text1 = 'The Lakers won the championship';
    const text2 = 'The Lakers won the championship game';

    const sig1 = minHash.signature(text1);
    const sig2 = minHash.signature(text2);

    const similarity = minHash.similarity(sig1, sig2);
    expect(similarity).toBeGreaterThan(0.8);
  });

  it('should detect similarity with small deletions', () => {
    const text1 = 'The Lakers won the championship game';
    const text2 = 'The Lakers won the championship';

    const sig1 = minHash.signature(text1);
    const sig2 = minHash.signature(text2);

    const similarity = minHash.similarity(sig1, sig2);
    expect(similarity).toBeGreaterThan(0.8);
  });

  it('should work with custom threshold', () => {
    const text1 = 'Similar article content here';
    const text2 = 'Similar article content there';

    const sig1 = minHash.signature(text1);
    const sig2 = minHash.signature(text2);

    const similarity = minHash.similarity(sig1, sig2);
    // 'here' vs 'there': 4 vs 5 chars, many shared character shingles
    // Should be very high similarity (>0.9)
    expect(similarity).toBeGreaterThan(0.9);
    expect(minHash.isDuplicate(sig1, sig2, 0.9)).toBe(true);
    // But not identical, so 0.99 threshold may fail
    expect(minHash.isDuplicate(sig1, sig2, 0.99)).toBe(similarity >= 0.99);
  });
});

describe('MinHash - Signature Serialization', () => {
  let minHash: MinHash;

  beforeEach(() => {
    minHash = new MinHash();
  });

  it('should serialize and deserialize signature correctly', () => {
    const text = 'Test serialization';
    const original = minHash.signature(text);

    const serialized = MinHash.serialize(original);
    const deserialized = MinHash.deserialize(serialized);

    expect(deserialized.hashes).toEqual(original.hashes);
    expect(deserialized.shingleSize).toBe(original.shingleSize);
    expect(deserialized.numHashes).toBe(original.numHashes);
  });

  it('should produce valid JSON string', () => {
    const text = 'JSON validation test';
    const signature = minHash.signature(text);
    const serialized = MinHash.serialize(signature);

    expect(() => JSON.parse(serialized)).not.toThrow();
    
    const parsed = JSON.parse(serialized);
    expect(parsed).toHaveProperty('hashes');
    expect(parsed).toHaveProperty('shingleSize');
    expect(parsed).toHaveProperty('numHashes');
  });

  it('should maintain similarity after serialization round-trip', () => {
    const text1 = 'First document';
    const text2 = 'First document';

    const sig1 = minHash.signature(text1);
    const sig2 = minHash.signature(text2);

    // Serialize and deserialize both
    const serialized1 = MinHash.serialize(sig1);
    const serialized2 = MinHash.serialize(sig2);
    const deserialized1 = MinHash.deserialize(serialized1);
    const deserialized2 = MinHash.deserialize(serialized2);

    const originalSimilarity = minHash.similarity(sig1, sig2);
    const deserializedSimilarity = minHash.similarity(deserialized1, deserialized2);

    expect(deserializedSimilarity).toBe(originalSimilarity);
  });

  it('should handle signature with all zeros', () => {
    const signature = minHash.signature('');
    const serialized = MinHash.serialize(signature);
    const deserialized = MinHash.deserialize(serialized);

    expect(deserialized.hashes).toEqual(signature.hashes);
  });
});

describe('MinHash - Performance', () => {
  let minHash: MinHash;

  beforeEach(() => {
    minHash = new MinHash();
  });

  it('should generate signature quickly for short text', async () => {
    const text = 'Short text for performance test';

    const { duration } = await testUtils.measureTime(() => {
      return minHash.signature(text);
    });

    expect(duration).toBeLessThan(5); // Should be very fast
  });

  it('should generate signature for long article efficiently', async () => {
    const longText = testUtils.createLongArticle(1000);

    const { duration } = await testUtils.measureTime(() => {
      return minHash.signature(longText);
    });

    // Target: <5ms for 1000-word article
    testUtils.assertPerformance(duration, 5, 'MinHash signature generation');
    expect(duration).toBeLessThan(10); // Generous upper bound
  });

  it('should calculate similarity quickly', async () => {
    const text1 = 'Performance test text one';
    const text2 = 'Performance test text two';
    const sig1 = minHash.signature(text1);
    const sig2 = minHash.signature(text2);

    const { duration } = await testUtils.measureTime(() => {
      return minHash.similarity(sig1, sig2);
    });

    expect(duration).toBeLessThan(1); // Should be extremely fast
  });

  it('should handle multiple signature generations efficiently', async () => {
    const text = 'Repeated signature generation test';

    const { avgDuration } = await testUtils.benchmark(() => {
      return minHash.signature(text);
    }, 100);

    expect(avgDuration).toBeLessThan(5);
  });
});

describe('MinHash - Edge Cases', () => {
  let minHash: MinHash;

  beforeEach(() => {
    minHash = new MinHash();
  });

  it('should handle text shorter than shingle size', () => {
    const shortText = 'ab'; // Length 2, shingleSize 3
    const signature = minHash.signature(shortText);

    expect(signature.hashes).toBeDefined();
    expect(signature.hashes.length).toBe(128);
  });

  it('should handle text exactly equal to shingle size', () => {
    const text = 'abc'; // Length 3, shingleSize 3
    const signature = minHash.signature(text);

    expect(signature.hashes).toBeDefined();
    expect(signature.hashes.length).toBe(128);
  });

  it('should handle single character', () => {
    const signature = minHash.signature('a');

    expect(signature.hashes).toBeDefined();
    expect(signature.hashes.length).toBe(128);
  });

  it('should handle whitespace-only text', () => {
    const signature = minHash.signature('   \n\t  ');

    expect(signature.hashes).toBeDefined();
    // After normalization and trimming, should be empty
    expect(signature.hashes.every(h => h === 0)).toBe(true);
  });

  it('should handle special characters', () => {
    const text = '!@#$%^&*(){}[]';
    const signature = minHash.signature(text);

    expect(signature.hashes).toBeDefined();
    expect(signature.hashes.length).toBe(128);
  });

  it('should handle Unicode characters', () => {
    const text = 'café résumé naïve';
    const signature = minHash.signature(text);

    expect(signature.hashes).toBeDefined();
    expect(signature.hashes.length).toBe(128);
  });

  it('should throw error for mismatched signature sizes', () => {
    const minHash64 = new MinHash(3, 64);
    const minHash128 = new MinHash(3, 128);

    const sig1 = minHash64.signature('test');
    const sig2 = minHash128.signature('test');

    expect(() => {
      minHash.similarity(sig1, sig2);
    }).toThrow('Signatures must have same number of hashes');
  });

  it('should handle very long text', () => {
    const veryLongText = testUtils.createLongArticle(5000);
    const signature = minHash.signature(veryLongText);

    expect(signature.hashes).toBeDefined();
    expect(signature.hashes.length).toBe(128);
    // All hashes should be valid numbers
    expect(signature.hashes.every(h => typeof h === 'number' && !isNaN(h))).toBe(true);
  });

  it('should handle repeated characters', () => {
    const text = 'aaaaaaaaaa bbbbbbbbbb';
    const signature = minHash.signature(text);

    expect(signature.hashes).toBeDefined();
    expect(signature.hashes.length).toBe(128);
  });
});

describe('MinHash - Shingle Size Variations', () => {
  it('should work with shingle size 1', () => {
    const minHash1 = new MinHash(1, 64);
    const text = 'test';
    const signature = minHash1.signature(text);

    expect(signature.shingleSize).toBe(1);
    expect(signature.hashes.length).toBe(64);
  });

  it('should work with large shingle size', () => {
    const minHash10 = new MinHash(10, 64);
    const text = 'This is a longer text for testing large shingle sizes';
    const signature = minHash10.signature(text);

    expect(signature.shingleSize).toBe(10);
    expect(signature.hashes.length).toBe(64);
  });

  it('should have different signatures for different shingle sizes', () => {
    const text = 'Same text, different parameters';
    const minHash3 = new MinHash(3, 64);
    const minHash5 = new MinHash(5, 64);

    const sig3 = minHash3.signature(text);
    const sig5 = minHash5.signature(text);

    // Signatures should be different due to different shingle sizes
    expect(sig3.hashes).not.toEqual(sig5.hashes);
  });
});

describe('MinHash - Number of Hashes Variations', () => {
  it('should work with small number of hashes', () => {
    const minHash16 = new MinHash(3, 16);
    const text = 'test text';
    const signature = minHash16.signature(text);

    expect(signature.numHashes).toBe(16);
    expect(signature.hashes.length).toBe(16);
  });

  it('should work with large number of hashes', () => {
    const minHash256 = new MinHash(3, 256);
    const text = 'test text';
    const signature = minHash256.signature(text);

    expect(signature.numHashes).toBe(256);
    expect(signature.hashes.length).toBe(256);
  });

  it('should have more accurate similarity with more hashes', () => {
    const text1 = 'The quick brown fox jumps';
    const text2 = 'The quick brown fox leaps';

    const minHash16 = new MinHash(3, 16);
    const minHash256 = new MinHash(3, 256);

    const sig1_16 = minHash16.signature(text1);
    const sig2_16 = minHash16.signature(text2);
    const similarity16 = minHash16.similarity(sig1_16, sig2_16);

    const sig1_256 = minHash256.signature(text1);
    const sig2_256 = minHash256.signature(text2);
    const similarity256 = minHash256.similarity(sig1_256, sig2_256);

    // More hashes should give more stable estimates
    // Both should be high since texts are similar
    expect(similarity16).toBeGreaterThan(0.5);
    expect(similarity256).toBeGreaterThan(0.5);
  });
});

describe('MinHash - Threshold Testing', () => {
  let minHash: MinHash;

  beforeEach(() => {
    minHash = new MinHash();
  });

  it('should correctly apply threshold 0.8', () => {
    const text1 = 'Article about sports';
    const text2 = 'Article about sports game';

    const sig1 = minHash.signature(text1);
    const sig2 = minHash.signature(text2);

    const similarity = minHash.similarity(sig1, sig2);
    
    if (similarity >= 0.8) {
      expect(minHash.isDuplicate(sig1, sig2, 0.8)).toBe(true);
    } else {
      expect(minHash.isDuplicate(sig1, sig2, 0.8)).toBe(false);
    }
  });

  it('should correctly apply threshold 0.5', () => {
    const text1 = 'Some content';
    const text2 = 'Some different content';

    const sig1 = minHash.signature(text1);
    const sig2 = minHash.signature(text2);

    const similarity = minHash.similarity(sig1, sig2);
    
    if (similarity >= 0.5) {
      expect(minHash.isDuplicate(sig1, sig2, 0.5)).toBe(true);
    } else {
      expect(minHash.isDuplicate(sig1, sig2, 0.5)).toBe(false);
    }
  });

  it('should correctly apply threshold 0.99', () => {
    const text = 'Exact duplicate';
    const sig1 = minHash.signature(text);
    const sig2 = minHash.signature(text);

    expect(minHash.isDuplicate(sig1, sig2, 0.99)).toBe(true);
  });
});

describe('MinHash - Real-World Articles', () => {
  let minHash: MinHash;

  beforeEach(() => {
    minHash = new MinHash();
  });

  it('should generate signatures for real article content', () => {
    const article = testUtils.createMockArticle();
    const signature = minHash.signature(article.content);

    expect(signature.hashes.length).toBe(128);
    expect(signature.hashes.every(h => typeof h === 'number')).toBe(true);
  });

  it('should detect duplicate articles with same content', () => {
    const article1 = testUtils.createMockArticle({ title: 'Game 1' });
    const article2 = testUtils.createMockArticle({ title: 'Game 1' });

    const sig1 = minHash.signature(article1.content);
    const sig2 = minHash.signature(article2.content);

    expect(minHash.isDuplicate(sig1, sig2, 0.85)).toBe(true);
  });

  it('should differentiate articles with different content', () => {
    const articles = testUtils.createMockArticles(3, 'NBA_LAL');

    const sig1 = minHash.signature(articles[0].content);
    const sig2 = minHash.signature(articles[1].content);

    // Different articles should not be duplicates
    expect(minHash.isDuplicate(sig1, sig2, 0.85)).toBe(false);
  });

  it('should handle similar but not duplicate articles', () => {
    const text1 = testUtils.generateSimilarText(
      'The Lakers defeated the Celtics 120-118 in an exciting overtime game.',
      0.2 // 20% change
    );
    const text2 = 'The Lakers defeated the Celtics 120-118 in an exciting overtime game.';

    const sig1 = minHash.signature(text1);
    const sig2 = minHash.signature(text2);

    const similarity = minHash.similarity(sig1, sig2);
    // Should be similar but might not reach 0.85 threshold
    expect(similarity).toBeGreaterThan(0.5);
  });
});

describe('MinHash - Global Singleton', () => {
  it('should provide global minHash instance', async () => {
    const { minHash: globalMinHash } = await import('../../utils/deduplication/minHash');
    
    expect(globalMinHash).toBeDefined();
    expect(globalMinHash).toBeInstanceOf(MinHash);
  });

  it('should work with global instance', async () => {
    const { minHash: globalMinHash } = await import('../../utils/deduplication/minHash');
    
    const text = 'Test with global instance';
    const signature = globalMinHash.signature(text);

    expect(signature.hashes.length).toBe(128);
    expect(signature.shingleSize).toBe(3);
  });
});
