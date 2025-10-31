import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./server/tests/setup.ts'],
    // Target only adapter-related integration and performance tests for coverage
    include: [
      'server/tests/integration/*Adapter*.test.ts',
      'server/tests/performance/adapters-rate-limit.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Focus coverage on adapters, agent pipeline, and scraping utils
      include: [
        'server/agents/adapters/**',
        'server/utils/scraping/**',
      ],
      exclude: [
        '**/node_modules/**',
        '**/tests/**',
        '**/dev/**',
        '**/seeds/**',
        '**/*.test.ts',
      ],
      // Enforce realistic thresholds for current adapter phase
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 35,
        statements: 48,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '@server': path.resolve(__dirname, './server'),
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
});