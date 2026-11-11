import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit suite: MSW-backed resource tests, core tests, harness unit tests, WebSocket unit tests and the
// documentation tooling tests. Live files (*.int.test.ts), contract/tooling tests and type tests are excluded.
// Coverage thresholds are applied by scripts/coverage/unit-check.mjs (`npm run test:coverage`), not here.
export default defineConfig({
  resolve: {
    // Same mapping as examples/tsconfig.json: harness tests that load examples/shared need no build.
    alias: { 'ubudu-rtls-sdk': fileURLToPath(new URL('./src/index.ts', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['**/*.int.test.ts', 'test/contract/**', 'test/types/**', '**/node_modules/**'],
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/index.ts'],
      reporter: ['text-summary', 'json', 'json-summary', 'html', 'cobertura'],
      reportsDirectory: 'coverage',
    },
  },
});
