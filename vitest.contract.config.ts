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
    environment: 'node',
    include: ['test/contract/**/*.test.ts'],
  },
});
