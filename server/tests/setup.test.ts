/**
 * Setup verification test
 * Ensures test infrastructure is working correctly
 */

import { describe, it, expect } from 'vitest';
import testUtils from './helpers/testUtils';

describe('Test Infrastructure Setup', () => {
  it('should have vitest configured correctly', () => {
    expect(true).toBe(true);
  });
  
  it('should be able to use test utilities', () => {
    const article = testUtils.createMockArticle();
    expect(article).toBeDefined();
    expect(article.id).toBeDefined();
    expect(article.teamId).toBe('NBA_LAL');
  });
  
  it('should be able to generate mock articles', () => {
    const articles = testUtils.createMockArticles(5, 'NBA_BOS');
    expect(articles).toHaveLength(5);
    expect(articles[0].teamId).toBe('NBA_BOS');
  });
  
  it('should be able to measure performance', async () => {
    const { duration } = await testUtils.measureTime(() => {
      return 'test';
    });
    expect(duration).toBeGreaterThanOrEqual(0);
  });
  
  it('should be able to generate long articles', () => {
    const longText = testUtils.createLongArticle(100);
    const words = longText.split(' ');
    expect(words.length).toBe(100);
  });
  
  it('should have date helpers working', () => {
    const threeDaysAgo = testUtils.daysAgo(3);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - threeDaysAgo.getTime()) / 86400000);
    expect(diffDays).toBe(3);
  });
});
