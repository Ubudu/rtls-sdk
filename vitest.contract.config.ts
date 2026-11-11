import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Contract and tooling tests: fixture-vs-spec validation, manifest checks and the unit tests of the
// repository tooling under test/contract/tooling. No MSW setup.
export default defineConfig({
  resolve: {
    // Same mapping as examples/tsconfig.json, so tooling tests of examples/shared need no build.
    alias: { 'ubudu-rtls-sdk': fileURLToPath(new URL('./src/index.ts', import.meta.url)) },
  },
  test: {
    globals: true,
    // Several tests start child processes (CLI and compiler runs); on a loaded CI runner they need more than the
    // 5 s default. Tests that assert a duration do so themselves.
    testTimeout: 30_000,
    environment: 'node',
    include: ['test/contract/**/*.test.ts'],
  },
});
