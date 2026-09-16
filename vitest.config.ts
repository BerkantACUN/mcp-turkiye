import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Contract tests hit the real public endpoints; they run only when
    // asked (`npm run test:live`), never in the default suite.
    exclude: [
      'node_modules/**',
      'dist/**',
      ...(process.env.MCP_TURKIYE_LIVE ? [] : ['tests/contract/**']),
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
