import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./server/tests/setup.ts'],
    include: ['server/tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'server/utils/bm25/**',
        'server/utils/deduplication/**',
        'server/storage.ts',
        'server/pgStorage.ts',
      ],
      exclude: [
        '**/node_modules/**',
        '**/tests/**',
        '**/dev/**',
        '**/seeds/**',
        '**/*.test.ts',
      ],
      all: true,
      lines: 90,
      functions: 90,
      branches: 85,
      statements: 90,
    },
    testTimeout: 30000, // 30 seconds for integration tests
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
