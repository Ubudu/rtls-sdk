import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Live integration suite, started by `npm run test:integration` (scripts/integration.mjs), which picks
// the files of the selected domains, holds the run lock or a read slot, and directs coverage into
// `coverage-live/<runId>/`. One forked worker runs the files one after the other; global setup and teardown
// (lock, ledger, preflight, snapshots, sweep, report.json) run in the main process.
export default defineConfig({
  resolve: {
    // Same mapping as the unit config and examples/tsconfig.json (examples/shared loads the SDK by name).
    alias: { 'ubudu-rtls-sdk': fileURLToPath(new URL('./src/index.ts', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/integration/**/*.int.test.ts', 'test/websocket/**/*.int.test.ts'],
    globalSetup: ['./test/integration/harness/global-setup.ts'],
    setupFiles: ['./test/integration/setup.ts'],
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    sequence: { concurrent: false },
    testTimeout: 60_000,
    hookTimeout: 120_000,
    retry: 0,
    reporters: ['default', 'junit', './test/integration/harness/reporter.ts'],
    outputFile: { junit: 'coverage-live/junit.xml' },
    coverage: {
      provider: 'v8',
      // AST-aware remapping gives every function, anonymous callbacks included, its own fnMap entry
      // (`(anonymous_<n>)`), so the live-coverage gate (`npm run coverage:live:check`) sees a callback that no
      // live data reached. The default remapping
      // drops unnamed functions and counts their line as executed (coverage-live-provider.test.ts).
      experimentalAstAwareRemapping: true,
      enabled: false,
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**'],
      reporter: ['json', 'json-summary', 'text-summary'],
      reportsDirectory: 'coverage-live/unlabelled',
    },
  },
});
