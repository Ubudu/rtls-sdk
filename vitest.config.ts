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
    // Several tests start child processes (CLI and compiler runs); on a loaded CI runner they need more than the
    // 5 s default. Tests that assert a duration do so themselves.
    testTimeout: 30_000,
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
