// The coverage options of the live config (vitest.integration.config.ts), applied to one fixture module, so the
// provider output that coverage:live:check reads is produced exactly as in a live run. Started by
// coverage-live-provider.test.ts with `--root <repo> --coverage.reportsDirectory=<temp>`.
import { defineConfig } from 'vitest/config';
import live from '../../../../vitest.integration.config';

const DIR = 'test/contract/__fixtures__/live-coverage';

export default defineConfig({
  test: {
    include: [`${DIR}/callbacks.probe.ts`],
    coverage: {
      ...live.test?.coverage,
      enabled: true,
      include: [`${DIR}/callbacks.ts`, `${DIR}/things.ts`],
      exclude: [],
      reporter: ['json'],
    },
  },
});
