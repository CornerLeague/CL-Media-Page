/**
 * Global test setup for Vitest
 * This file runs before all tests
 */

import { beforeAll, afterAll } from 'vitest';

// Global test configuration
beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error'; // Suppress logs during tests
});

afterAll(async () => {
  // Cleanup after all tests complete
});

// Extend vitest matchers if needed
// You can add custom matchers here
