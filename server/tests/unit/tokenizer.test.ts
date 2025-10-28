/**
 * Tokenizer Unit Tests
 * Tests text tokenization, normalization, and related utilities
 */

import { describe, it, expect } from 'vitest';
import {
  tokenize,
  calculateTermFrequencies,
  serializeTermFrequencies,
  deserializeTermFrequencies,
  extractKeywords,
  calculateContentHash,
} from '../../utils/bm25/tokenizer';
import testUtils from '../helpers/testUtils';

describe('Tokenizer - Basic Tokenization', () => {
  it('should tokenize simple text and remove stopwords', () => {
    const text = 'The quick brown fox jumps over the lazy dog';
    const tokens = tokenize(text);
    
    // Should not contain stopwords: 'the'
    expect(tokens).not.toContain('the');
    
    // Should contain content words (including 'over' which is not a stopword)
    expect(tokens).toContain('quick');
    expect(tokens).toContain('brown');
    expect(tokens).toContain('fox');
    expect(tokens).toContain('jumps');
    expect(tokens).toContain('over');
    expect(tokens).toContain('lazy');
    expect(tokens).toContain('dog');
  });

  it('should convert to lowercase by default', () => {
    const text = 'NBA Player LeBron JAMES';
    const tokens = tokenize(text);
    
    expect(tokens).toContain('nba');
    expect(tokens).toContain('player');
    expect(tokens).toContain('lebron');
    expect(tokens).toContain('james');
    
    // Should not contain uppercase versions
    expect(tokens).not.toContain('NBA');
    expect(tokens).not.toContain('LeBron');
    expect(tokens).not.toContain('JAMES');
  });

  it('should preserve case when lowercase option is false', () => {
    const text = 'NBA Player';
    const tokens = tokenize(text, { lowercase: false });
    
    expect(tokens).toContain('NBA');
    expect(tokens).toContain('Player');
  });

  it('should handle empty string', () => {
    const tokens = tokenize('');
    expect(tokens).toEqual([]);
  });

  it('should handle whitespace-only string', () => {
    const tokens = tokenize('   \n\t  ');
    expect(tokens).toEqual([]);
  });

  it('should handle null-like input gracefully', () => {
    const tokens1 = tokenize('');
    const tokens2 = tokenize('   ');
    
    expect(tokens1).toEqual([]);
    expect(tokens2).toEqual([]);
  });
});

describe('Tokenizer - URL and Email Filtering', () => {
  it('should remove URLs from text', () => {
    const text = 'Check https://espn.com and http://nba.com for updates';
    const tokens = tokenize(text);
    
    expect(tokens).toContain('check');
    expect(tokens).toContain('updates');
    
    // URLs should be removed
    expect(tokens).not.toContain('https://espn.com');
    expect(tokens).not.toContain('http://nba.com');
    expect(tokens).not.toContain('espn.com');
    expect(tokens).not.toContain('nba.com');
  });

  it('should remove email addresses from text', () => {
    const text = 'Contact john@example.com or support@nba.com';
    const tokens = tokenize(text);
    
    expect(tokens).toContain('contact');
    
    // Emails should be removed
    expect(tokens).not.toContain('john@example.com');
    expect(tokens).not.toContain('support@nba.com');
  });

  it('should handle text with both URLs and emails', () => {
    const text = 'Visit https://example.com or email test@example.com for info';
    const tokens = tokenize(text);
    
    expect(tokens).toContain('visit');
    expect(tokens).toContain('email');
    expect(tokens).toContain('info');
    
    // Both should be removed
    expect(tokens.join(' ')).not.toContain('example.com');
    expect(tokens.join(' ')).not.toContain('test@');
  });
});

describe('Tokenizer - Special Character Handling', () => {
  it('should remove special characters', () => {
    const text = 'Hello! @User #tag $price 100%';
    const tokens = tokenize(text);
    
    expect(tokens).toContain('hello');
    expect(tokens).toContain('user');
    expect(tokens).toContain('tag');
    expect(tokens).toContain('price');
    
    // Special characters should be removed
    expect(tokens).not.toContain('!');
    expect(tokens).not.toContain('@');
    expect(tokens).not.toContain('#');
    expect(tokens).not.toContain('$');
    expect(tokens).not.toContain('%');
  });

  it('should handle punctuation marks', () => {
    const text = 'Hello, world! How are you? I\'m fine.';
    const tokens = tokenize(text);
    
    expect(tokens).toContain('hello');
    expect(tokens).toContain('world');
    expect(tokens).toContain('fine');
    
    // Punctuation should be removed
    expect(tokens).not.toContain(',');
    expect(tokens).not.toContain('!');
    expect(tokens).not.toContain('?');
    expect(tokens).not.toContain('.');
  });

  it('should handle contractions', () => {
    const text = "don't can't won't it's";
    const tokens = tokenize(text);
    
    // Contractions should have apostrophes removed
    expect(tokens).toContain('dont');
    expect(tokens).toContain('cant');
    expect(tokens).toContain('wont');
    // Note: 'its' is a stopword, so it will be filtered out
    expect(tokens).not.toContain('its');
  });

  it('should handle hyphens in words', () => {
    const text = 'state-of-the-art high-quality';
    const tokens = tokenize(text);
    
    // Hyphens are preserved in token regex but tokens are split
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens.some(t => t.includes('state') || t === 'state')).toBe(true);
  });
});

describe('Tokenizer - Length Filtering', () => {
  it('should filter tokens by minimum length', () => {
    const text = 'a bb ccc dddd eeeee';
    const tokens = tokenize(text, { minLength: 3 });
    
    expect(tokens).not.toContain('a');
    expect(tokens).not.toContain('bb');
    expect(tokens).toContain('ccc');
    expect(tokens).toContain('dddd');
    expect(tokens).toContain('eeeee');
  });

  it('should filter tokens by maximum length', () => {
    const text = 'short verylongword';
    const tokens = tokenize(text, { maxLength: 10 });
    
    expect(tokens).toContain('short');
    expect(tokens).not.toContain('verylongword');
  });

  it('should apply both min and max length filters', () => {
    const text = 'a bb ccc dddd eeeee verylongword';
    const tokens = tokenize(text, { minLength: 3, maxLength: 5 });
    
    expect(tokens).not.toContain('a');
    expect(tokens).not.toContain('bb');
    expect(tokens).toContain('ccc');
    expect(tokens).toContain('dddd');
    expect(tokens).toContain('eeeee');
    expect(tokens).not.toContain('verylongword');
  });

  it('should use default min/max lengths', () => {
    const text = 'x verylongwordthatexceedsdefaultmax';
    const tokens = tokenize(text);
    
    // Single character 'x' should be filtered (minLength = 2)
    expect(tokens).not.toContain('x');
  });
});

describe('Tokenizer - Stopword Handling', () => {
  it('should remove common stopwords', () => {
    const text = 'the quick brown fox and the lazy dog';
    const tokens = tokenize(text);
    
    // Stopwords
    expect(tokens).not.toContain('the');
    expect(tokens).not.toContain('and');
    
    // Content words
    expect(tokens).toContain('quick');
    expect(tokens).toContain('brown');
    expect(tokens).toContain('fox');
    expect(tokens).toContain('lazy');
    expect(tokens).toContain('dog');
  });

  it('should keep stopwords when removeStopwords is false', () => {
    const text = 'the quick brown fox';
    const tokens = tokenize(text, { removeStopwords: false });
    
    expect(tokens).toContain('the');
    expect(tokens).toContain('quick');
    expect(tokens).toContain('brown');
    expect(tokens).toContain('fox');
  });

  it('should handle text with many stopwords', () => {
    const text = 'this is a test of the stopword removal';
    const tokens = tokenize(text);
    
    // Most stopwords removed
    expect(tokens).not.toContain('this');
    expect(tokens).not.toContain('is');
    expect(tokens).not.toContain('a');
    expect(tokens).not.toContain('of');
    expect(tokens).not.toContain('the');
    
    // Content preserved
    expect(tokens).toContain('test');
    expect(tokens).toContain('stopword');
    expect(tokens).toContain('removal');
  });
});

describe('Tokenizer - Number Filtering', () => {
  it('should remove pure number tokens', () => {
    const text = 'Player scored 35 points in game 7';
    const tokens = tokenize(text);
    
    expect(tokens).toContain('player');
    expect(tokens).toContain('scored');
    expect(tokens).toContain('points');
    expect(tokens).toContain('game');
    
    // Pure numbers should be removed
    expect(tokens).not.toContain('35');
    expect(tokens).not.toContain('7');
  });

  it('should keep alphanumeric tokens', () => {
    const text = 'Team won 3-2 and player23 scored';
    const tokens = tokenize(text);
    
    expect(tokens).toContain('team');
    expect(tokens).toContain('won');
    
    // Alphanumeric kept (after punctuation removal)
    expect(tokens.some(t => t.includes('player'))).toBe(true);
  });
});

describe('Term Frequency Calculation', () => {
  it('should calculate term frequencies correctly', () => {
    const tokens = ['apple', 'banana', 'apple', 'cherry', 'apple', 'banana'];
    const freqs = calculateTermFrequencies(tokens);
    
    expect(freqs.get('apple')).toBe(3);
    expect(freqs.get('banana')).toBe(2);
    expect(freqs.get('cherry')).toBe(1);
  });

  it('should handle empty token array', () => {
    const freqs = calculateTermFrequencies([]);
    expect(freqs.size).toBe(0);
  });

  it('should handle single occurrence', () => {
    const tokens = ['unique'];
    const freqs = calculateTermFrequencies(tokens);
    
    expect(freqs.get('unique')).toBe(1);
  });

  it('should handle all same tokens', () => {
    const tokens = ['same', 'same', 'same'];
    const freqs = calculateTermFrequencies(tokens);
    
    expect(freqs.get('same')).toBe(3);
    expect(freqs.size).toBe(1);
  });
});

describe('Term Frequency Serialization', () => {
  it('should serialize and deserialize term frequencies', () => {
    const original = new Map([
      ['apple', 3],
      ['banana', 2],
      ['cherry', 1],
    ]);
    
    const serialized = serializeTermFrequencies(original);
    const deserialized = deserializeTermFrequencies(serialized);
    
    expect(deserialized.get('apple')).toBe(3);
    expect(deserialized.get('banana')).toBe(2);
    expect(deserialized.get('cherry')).toBe(1);
    expect(deserialized.size).toBe(3);
  });

  it('should handle empty map', () => {
    const original = new Map<string, number>();
    const serialized = serializeTermFrequencies(original);
    const deserialized = deserializeTermFrequencies(serialized);
    
    expect(deserialized.size).toBe(0);
  });

  it('should handle invalid JSON gracefully', () => {
    const deserialized = deserializeTermFrequencies('invalid json');
    expect(deserialized.size).toBe(0);
  });

  it('should preserve numeric values', () => {
    const original = new Map([
      ['word1', 100],
      ['word2', 1],
      ['word3', 999],
    ]);
    
    const serialized = serializeTermFrequencies(original);
    const deserialized = deserializeTermFrequencies(serialized);
    
    expect(deserialized.get('word1')).toBe(100);
    expect(deserialized.get('word2')).toBe(1);
    expect(deserialized.get('word3')).toBe(999);
  });
});

describe('Keyword Extraction', () => {
  it('should extract top keywords by frequency', () => {
    const text = 'injury injury injury player player team player injury team';
    const keywords = extractKeywords(text, 3);
    
    // Should get top 3: injury (4), player (3), team (2)
    expect(keywords).toHaveLength(3);
    expect(keywords[0]).toBe('injury');
    expect(keywords[1]).toBe('player');
    expect(keywords[2]).toBe('team');
  });

  it('should handle topN larger than unique terms', () => {
    const text = 'one two three';
    const keywords = extractKeywords(text, 10);
    
    expect(keywords.length).toBeLessThanOrEqual(3);
    expect(keywords).toContain('one');
    expect(keywords).toContain('two');
    expect(keywords).toContain('three');
  });

  it('should extract default 10 keywords', () => {
    const longText = testUtils.createLongArticle(100);
    const keywords = extractKeywords(longText);
    
    expect(keywords.length).toBeGreaterThan(0);
    expect(keywords.length).toBeLessThanOrEqual(10);
  });

  it('should return empty array for empty text', () => {
    const keywords = extractKeywords('');
    expect(keywords).toEqual([]);
  });

  it('should rank by frequency correctly', () => {
    const text = 'a b c a b a'.replace(/[abc]/g, (m) => {
      return { a: 'apple', b: 'banana', c: 'cherry' }[m] || m;
    });
    
    const realText = 'apple banana cherry apple banana apple';
    const keywords = extractKeywords(realText, 3);
    
    expect(keywords[0]).toBe('apple'); // 3 occurrences
    expect(keywords[1]).toBe('banana'); // 2 occurrences
    expect(keywords[2]).toBe('cherry'); // 1 occurrence
  });
});

describe('Content Hash Calculation', () => {
  it('should generate consistent hash for same content', () => {
    const text = 'The Lakers won the championship';
    const hash1 = calculateContentHash(text);
    const hash2 = calculateContentHash(text);
    
    expect(hash1).toBe(hash2);
  });

  it('should generate different hashes for different content', () => {
    const text1 = 'The Lakers won';
    const text2 = 'The Celtics lost';
    
    const hash1 = calculateContentHash(text1);
    const hash2 = calculateContentHash(text2);
    
    expect(hash1).not.toBe(hash2);
  });

  it('should generate hash in correct format', () => {
    const text = 'Sample text';
    const hash = calculateContentHash(text);
    
    // Should be 8-character hex string
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
    expect(hash.length).toBe(8);
  });

  it('should be case-insensitive due to tokenization', () => {
    const text1 = 'The Quick Brown Fox';
    const text2 = 'the quick brown fox';
    
    const hash1 = calculateContentHash(text1);
    const hash2 = calculateContentHash(text2);
    
    expect(hash1).toBe(hash2);
  });

  it('should handle empty string', () => {
    const hash = calculateContentHash('');
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('should generate same hash for semantically similar text', () => {
    // After tokenization and normalization, these should be similar
    const text1 = 'The player scored';
    const text2 = 'the player scored';
    
    const hash1 = calculateContentHash(text1);
    const hash2 = calculateContentHash(text2);
    
    expect(hash1).toBe(hash2);
  });
});

describe('Tokenizer - Performance', () => {
  it('should tokenize short text quickly', async () => {
    const text = 'The quick brown fox jumps over the lazy dog';
    
    const { duration } = await testUtils.measureTime(() => {
      return tokenize(text);
    });
    
    // Should be very fast for short text
    expect(duration).toBeLessThan(1);
  });

  it('should tokenize long articles efficiently', async () => {
    const longText = testUtils.createLongArticle(1000);
    
    const { duration } = await testUtils.measureTime(() => {
      return tokenize(longText);
    });
    
    // Should complete within 1ms even for 1000 words
    testUtils.assertPerformance(duration, 1, 'Tokenize 1000 words');
    expect(duration).toBeLessThan(5); // Generous upper bound
  });

  it('should handle multiple tokenizations efficiently', async () => {
    const text = 'Sample article text for tokenization';
    
    const { avgDuration } = await testUtils.benchmark(() => {
      return tokenize(text);
    }, 100);
    
    expect(avgDuration).toBeLessThan(1);
  });
});

describe('Tokenizer - Edge Cases', () => {
  it('should handle text with only stopwords', () => {
    const text = 'the and is it was';
    const tokens = tokenize(text);
    
    expect(tokens).toEqual([]);
  });

  it('should handle text with only numbers', () => {
    const text = '123 456 789';
    const tokens = tokenize(text);
    
    expect(tokens).toEqual([]);
  });

  it('should handle text with only special characters', () => {
    const text = '!@#$%^&*()';
    const tokens = tokenize(text);
    
    expect(tokens).toEqual([]);
  });

  it('should handle mixed content correctly', () => {
    const text = 'LeBron James scored 35 points! Visit https://nba.com for more.';
    const tokens = tokenize(text);
    
    expect(tokens).toContain('lebron');
    expect(tokens).toContain('james');
    expect(tokens).toContain('scored');
    expect(tokens).toContain('points');
    expect(tokens).toContain('visit');
    expect(tokens).toContain('more');
    
    // Filtered out
    expect(tokens).not.toContain('35');
    expect(tokens.join(' ')).not.toContain('nba.com');
  });

  it('should handle very long words', () => {
    const text = 'normal supercalifragilisticexpialidocious';
    const tokens = tokenize(text, { maxLength: 20 });
    
    expect(tokens).toContain('normal');
    expect(tokens).not.toContain('supercalifragilisticexpialidocious');
  });

  it('should handle Unicode characters', () => {
    const text = 'café résumé naïve';
    const tokens = tokenize(text);
    
    // Should handle accent characters
    expect(tokens.length).toBeGreaterThan(0);
  });
});

describe('Tokenizer - Real-World Articles', () => {
  it('should tokenize a sports article correctly', () => {
    const article = testUtils.createMockArticle();
    const tokens = tokenize(article.content);
    
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens).toContain('lakers');
    expect(tokens).toContain('celtics');
    expect(tokens).toContain('lebron');
    expect(tokens).toContain('james');
  });

  it('should extract keywords from article', () => {
    const article = testUtils.createMockArticle();
    const keywords = extractKeywords(article.content, 5);
    
    expect(keywords.length).toBeGreaterThan(0);
    expect(keywords.length).toBeLessThanOrEqual(5);
  });

  it('should generate consistent hashes for articles', () => {
    const article = testUtils.createMockArticle();
    const hash1 = calculateContentHash(article.content);
    const hash2 = calculateContentHash(article.content);
    
    expect(hash1).toBe(hash2);
  });
});
