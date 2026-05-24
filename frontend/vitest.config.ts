import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    define: {
      'process.env.NEXT_PUBLIC_BACKEND_URL': JSON.stringify('http://localhost:30000'),
    },
    exclude: [
      'tests/e2e/**',  // Playwright E2E tests
      'tests/integration/**',  // Standalone integration scripts (not vitest tests)
      'node_modules/**',  // Don't run tests in node_modules
    ],
    fakeTimers: {
      enabled: false,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});