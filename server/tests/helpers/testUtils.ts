/**
 * Test Utilities for Phase 1 Testing
 * Provides helpers for mock data generation, assertions, and performance measurement
 */

import { randomUUID } from 'crypto';
import type { 
  Article, 
  InsertArticle, 
  NewsSource, 
  InsertNewsSource,
  ArticleClassification,
  InsertArticleClassification,
  BM25Index,
  InsertBM25Index,
} from '@shared/schema';

// ============================================================================
// Mock Data Generators
// ============================================================================

/**
 * Generate a mock article with realistic data
 */
export function createMockArticle(overrides: Partial<InsertArticle> = {}): InsertArticle {
  const id = randomUUID();
  const teamId = overrides.teamId || 'NBA_LAL';
  const now = new Date();
  
  return {
    teamId,
    title: 'Lakers defeat Celtics in overtime thriller',
    content: 'The Los Angeles Lakers defeated the Boston Celtics 120-118 in an overtime thriller at Crypto.com Arena. LeBron James led the way with 35 points, 10 rebounds, and 8 assists. Anthony Davis added 28 points and 15 rebounds in the victory.',
    summary: 'Lakers win 120-118 in OT against Celtics. LeBron: 35 pts, AD: 28 pts.',
    author: 'John Smith',
    publishedAt: now,
    sourceUrl: `https://espn.com/nba/article-${id}`,
    sourceName: 'ESPN',
    sourceType: 'rss',
    category: 'general',
    confidence: 90,
    relevanceScore: 85,
    isProcessed: false,
    isDeleted: false,
    ...overrides,
  };
}

/**
 * Generate a mock news source
 */
export function createMockNewsSource(overrides: Partial<InsertNewsSource> = {}): InsertNewsSource {
  const now = new Date();
  
  return {
    name: 'ESPN',
    domain: 'espn.com',
    sourceType: 'rss',
    rssUrl: 'https://www.espn.com/espn/rss/news',
    baseUrl: null,
    selectorConfig: null,
    totalArticles: 0,
    relevantArticles: 0,
    duplicateArticles: 0,
    reliabilityScore: null,
    isActive: true,
    requestsPerMinute: 10,
    lastScrapedAt: null,
    lastErrorAt: null,
    errorMessage: null,
    ...overrides,
  };
}

/**
 * Generate a mock article classification
 */
export function createMockClassification(
  articleId: string,
  overrides: Partial<InsertArticleClassification> = {}
): InsertArticleClassification {
  return {
    articleId,
    category: 'injury',
    confidence: 95,
    classifierVersion: 'v1.0-test',
    reasoning: 'Article discusses player injury and recovery timeline',
    keywords: ['injury', 'out', 'recovery'],
    ...overrides,
  };
}

/**
 * Generate a mock BM25 index
 */
export function createMockBM25Index(
  teamId: string,
  overrides: Partial<InsertBM25Index> = {}
): InsertBM25Index {
  const now = new Date();
  
  return {
    teamId,
    totalDocuments: 0,
    avgDocLength: 0,
    k1: '1.5',
    b: '0.75',
    lastRebuiltAt: now,
    rebuildInProgress: false,
    avgQueryTimeMs: null,
    totalQueries: 0,
    ...overrides,
  };
}

/**
 * Generate multiple mock articles for a team
 */
export function createMockArticles(count: number, teamId: string): InsertArticle[] {
  const templates = [
    {
      title: '{player} scores 40 points in {team} victory',
      content: '{player} put on a spectacular performance scoring 40 points to lead {team} to victory.',
      category: 'general',
    },
    {
      title: '{player} out with {injury} injury',
      content: '{team} announced that {player} will miss games due to a {injury} injury.',
      category: 'injury',
    },
    {
      title: '{team} trades for All-Star {player}',
      content: 'Breaking: {team} has acquired {player} in a blockbuster trade.',
      category: 'trade',
    },
    {
      title: '{team} signs veteran {player}',
      content: '{team} has signed experienced player {player} to bolster their roster.',
      category: 'roster',
    },
  ];
  
  const players = ['LeBron James', 'Stephen Curry', 'Kevin Durant', 'Giannis Antetokounmpo'];
  const injuries = ['knee', 'ankle', 'shoulder', 'hamstring'];
  
  return Array.from({ length: count }, (_, i) => {
    const template = templates[i % templates.length];
    const player = players[i % players.length];
    const injury = injuries[i % injuries.length];
    
    const title = template.title
      .replace('{player}', player)
      .replace('{team}', teamId)
      .replace('{injury}', injury);
      
    const content = template.content
      .replace('{player}', player)
      .replace('{team}', teamId)
      .replace('{injury}', injury);
    
    return createMockArticle({
      teamId,
      title,
      content,
      summary: content.substring(0, 100),
      category: template.category,
      publishedAt: new Date(Date.now() - i * 86400000), // Stagger by days
    });
  });
}

/**
 * Generate a long article for performance testing
 */
export function createLongArticle(wordCount: number = 1000): string {
  const words = [
    'the', 'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog',
    'basketball', 'player', 'team', 'game', 'score', 'win', 'loss', 'injury',
    'season', 'playoffs', 'championship', 'coach', 'strategy', 'defense', 'offense',
  ];
  
  const result: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    result.push(words[i % words.length]);
  }
  
  return result.join(' ');
}

// ============================================================================
// Performance Measurement
// ============================================================================

/**
 * Measure execution time of a function
 */
export async function measureTime<T>(
  fn: () => T | Promise<T>,
  label?: string
): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  const duration = end - start;
  
  if (label) {
    console.log(`[${label}] Duration: ${duration.toFixed(2)}ms`);
  }
  
  return { result, duration };
}

/**
 * Run a function multiple times and return average duration
 */
export async function benchmark<T>(
  fn: () => T | Promise<T>,
  iterations: number = 10
): Promise<{ result: T; avgDuration: number; minDuration: number; maxDuration: number }> {
  const durations: number[] = [];
  let result: T;
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    result = await fn();
    const end = performance.now();
    durations.push(end - start);
  }
  
  return {
    result: result!,
    avgDuration: durations.reduce((a, b) => a + b, 0) / iterations,
    minDuration: Math.min(...durations),
    maxDuration: Math.max(...durations),
  };
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Assert that a value is within a range
 */
export function assertInRange(value: number, min: number, max: number, message?: string) {
  if (value < min || value > max) {
    throw new Error(
      message || `Expected ${value} to be between ${min} and ${max}`
    );
  }
}

/**
 * Assert that duration is below threshold
 */
export function assertPerformance(duration: number, threshold: number, operation: string) {
  if (duration > threshold) {
    console.warn(
      `⚠️  Performance warning: ${operation} took ${duration.toFixed(2)}ms (threshold: ${threshold}ms)`
    );
  }
}

/**
 * Assert arrays are approximately equal (for floating point comparisons)
 */
export function assertArraysApproxEqual(
  actual: number[],
  expected: number[],
  tolerance: number = 0.01
) {
  if (actual.length !== expected.length) {
    throw new Error(
      `Array lengths differ: ${actual.length} vs ${expected.length}`
    );
  }
  
  for (let i = 0; i < actual.length; i++) {
    if (Math.abs(actual[i] - expected[i]) > tolerance) {
      throw new Error(
        `Arrays differ at index ${i}: ${actual[i]} vs ${expected[i]}`
      );
    }
  }
}

/**
 * Assert similarity score is within expected range
 */
export function assertSimilarity(
  actual: number,
  expected: number,
  tolerance: number = 0.05,
  message?: string
) {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(
      message || 
      `Similarity ${actual} differs from expected ${expected} by ${diff} (tolerance: ${tolerance})`
    );
  }
}

// ============================================================================
// Test Data Cleanup
// ============================================================================

/**
 * Clean up test data from storage
 */
export async function cleanupTestData(storage: any, testIds: {
  articleIds?: string[];
  sourceIds?: string[];
  classificationIds?: string[];
  indexIds?: string[];
}) {
  const { articleIds = [], sourceIds = [], classificationIds = [], indexIds = [] } = testIds;
  
  // Delete classifications first (foreign key dependency)
  for (const id of classificationIds) {
    await storage.deleteArticleClassification(id);
  }
  
  // Delete articles
  for (const id of articleIds) {
    await storage.deleteArticle(id);
  }
  
  // Delete sources (usually done last)
  for (const id of sourceIds) {
    // Assuming we have a delete method, if not just update isActive
    if (storage.deleteNewsSource) {
      await storage.deleteNewsSource(id);
    } else {
      await storage.updateNewsSource(id, { isActive: false });
    }
  }
}

// ============================================================================
// Date/Time Helpers
// ============================================================================

/**
 * Create a date N days ago
 */
export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86400000);
}

/**
 * Create a date N hours ago
 */
export function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3600000);
}

/**
 * Check if two dates are approximately equal (within 1 second)
 */
export function datesEqual(date1: Date, date2: Date, toleranceMs: number = 1000): boolean {
  return Math.abs(date1.getTime() - date2.getTime()) <= toleranceMs;
}

// ============================================================================
// String Helpers
// ============================================================================

/**
 * Generate a random string of specified length
 */
export function randomString(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate similar text by making minor modifications
 */
export function generateSimilarText(original: string, changePercent: number = 0.1): string {
  const words = original.split(' ');
  const numChanges = Math.floor(words.length * changePercent);
  
  for (let i = 0; i < numChanges; i++) {
    const index = Math.floor(Math.random() * words.length);
    words[index] = randomString(words[index].length);
  }
  
  return words.join(' ');
}

// ============================================================================
// Exports
// ============================================================================

export const testUtils = {
  // Mock data
  createMockArticle,
  createMockNewsSource,
  createMockClassification,
  createMockBM25Index,
  createMockArticles,
  createLongArticle,
  
  // Performance
  measureTime,
  benchmark,
  
  // Assertions
  assertInRange,
  assertPerformance,
  assertArraysApproxEqual,
  assertSimilarity,
  
  // Cleanup
  cleanupTestData,
  
  // Date/Time
  daysAgo,
  hoursAgo,
  datesEqual,
  
  // Strings
  randomString,
  generateSimilarText,
};

export default testUtils;
