import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import {
  DOMAINS,
  EXAMPLE_NUMBERS,
  GUIDES,
  PHASES,
  UNOWNED,
  domainOfPhase,
  filesOf,
  normalizePath,
  ownerOf,
  phaseOfDomain,
} from '../../../scripts/lib/ownership.mjs';
import { listFiles, listTrackedFiles } from '../../../scripts/lib/git.mjs';

const REPO = resolve(__dirname, '..', '..', '..');
const VALID_OWNERS = new Set<string>([...PHASES, UNOWNED]);

// Sample paths of P0 §5.6 and README §6, one or more per rule.
const SAMPLES: Array<[string, string]> = [
  // P0
  ['spec/rtls-api.swagger.json', 'P0'],
  ['spec/spec.lock.json', 'P0'],
  ['spec/manifest/base.json', 'P0'],
  ['spec/manifest/schema.json', 'P0'],
  ['spec/manifest/README.md', 'P0'],
  ['scripts/quality.mjs', 'P0'],
  ['scripts/lib/ownership.mjs', 'P0'],
  ['scripts/eslint/rules/no-swallowed-catch.mjs', 'P0'],
  ['examples/shared/config.js', 'P0'],
  ['examples/shared/discover.d.ts', 'P0'],
  ['examples/package.json', 'P0'],
  ['examples/package-lock.json', 'P0'],
  ['examples/tsconfig.json', 'P0'],
  ['examples/tsconfig.js.json', 'P0'],
  ['package.json', 'P0'],
  ['package-lock.json', 'P0'],
  ['vitest.config.ts', 'P0'],
  ['vitest.contract.config.ts', 'P0'],
  ['vitest.integration.config.ts', 'P0'],
  ['tsup.config.ts', 'P0'],
  ['tsconfig.json', 'P0'],
  ['tsconfig.test.json', 'P0'],
  ['tsconfig.scripts.json', 'P0'],
  ['tsconfig.snippets.json', 'P0'],
  ['eslint.config.js', 'P0'],
  ['.prettierrc', 'P0'],
  ['.prettierignore', 'P0'],
  ['.gitignore', 'P0'],
  ['.npmignore', 'P0'],
  ['.gitlab-ci.yml', 'P0'],
  ['.github/workflows/ci.yml', 'P0'],
  ['.github/workflows/release.yml', 'P0'],
  ['.env.example', 'P0'],
  ['test/setup.ts', 'P0'],
  ['test/contract/spec.ts', 'P0'],
  ['test/contract/tooling/ownership.test.ts', 'P0'],
  ['test/contract/__fixtures__/surface/index.ts', 'P0'],
  ['test/integration/harness/guard.ts', 'P0'],
  ['test/integration/harness/preload.mjs', 'P0'],
  ['test/integration/harness/harness.int.test.ts', 'P0'],
  ['test/integration/setup.ts', 'P0'],
  // P1
  ['src/client/index.ts', 'P1'],
  ['src/client/transport.ts', 'P1'],
  ['src/errors.ts', 'P1'],
  ['src/context.ts', 'P1'],
  ['src/utils/args.ts', 'P1'],
  ['src/utils/mac.ts', 'P1'],
  ['src/types.ts', 'P1'],
  ['src/types/index.ts', 'P1'],
  ['src/index.ts', 'P1'],
  ['src/resources/index.ts', 'P1'],
  ['src/generated/overrides.ts', 'P1'],
  ['test/unit/core/client.test.ts', 'P1'],
  ['test/unit/core/utils/args.test.ts', 'P1'],
  ['test/mocks/server.ts', 'P1'],
  ['test/mocks/handlers/index.ts', 'P1'],
  ['test/mocks/handlers/core.ts', 'P1'],
  ['test/integration/core/context.int.test.ts', 'P1'],
  ['test/fixtures/core/health.json', 'P1'],
  ['test/types/core.test-d.ts', 'P1'],
  ['spec/manifest/P1.json', 'P1'],
  ['test/integration/allowlist/P1.json', 'P1'],
  // P2
  ['src/resources/assets.ts', 'P2'],
  ['src/resources/asset-documents.ts', 'P2'],
  ['src/resources/asset-tree.ts', 'P2'],
  ['src/resources/data-models.ts', 'P2'],
  ['src/resources/declared-locations.ts', 'P2'],
  ['src/resources/tag-actions.ts', 'P2'],
  ['src/types/assets.ts', 'P2'],
  ['test/resources/assets/assets.test.ts', 'P2'],
  ['test/fixtures/assets/list.json', 'P2'],
  ['test/fixtures/assets/inputs/sample.csv', 'P2'],
  ['test/integration/assets/assets.int.test.ts', 'P2'],
  ['test/mocks/handlers/assets.ts', 'P2'],
  ['test/types/assets.test-d.ts', 'P2'],
  ['spec/manifest/P2.json', 'P2'],
  ['test/integration/allowlist/P2.json', 'P2'],
  ['docs/guides/assets.md', 'P2'],
  ['docs/guides/asset-tracking.md', 'P2'],
  ['examples/typescript/02-assets.ts', 'P2'],
  ['examples/javascript/11-asset-documents.js', 'P2'],
  ['examples/typescript/12-declared-location.ts', 'P2'],
  // P3
  ['src/resources/positions.ts', 'P3'],
  ['src/resources/spatial.ts', 'P3'],
  ['src/types/positions.ts', 'P3'],
  ['src/types/spatial.ts', 'P3'],
  ['test/resources/positions-spatial/positions.test.ts', 'P3'],
  ['test/integration/positions-spatial/publish.int.test.ts', 'P3'],
  ['docs/guides/positions-spatial.md', 'P3'],
  ['docs/guides/zone-geofencing.md', 'P3'],
  ['examples/typescript/03-positions-spatial.ts', 'P3'],
  ['spec/manifest/P3.json', 'P3'],
  // P4 (geojson.ts precedes P1's src/utils/**)
  ['src/utils/geojson.ts', 'P4'],
  ['src/resources/venues.ts', 'P4'],
  ['src/resources/zones.ts', 'P4'],
  ['src/resources/navigation.ts', 'P4'],
  ['src/types/venues.ts', 'P4'],
  ['src/types/navigation.ts', 'P4'],
  ['src/types/geojson.ts', 'P4'],
  ['test/mocks/handlers/venues-navigation.ts', 'P4'],
  ['docs/guides/venues-navigation.md', 'P4'],
  ['docs/guides/navigation.md', 'P4'],
  ['examples/typescript/04-navigation.ts', 'P4'],
  ['examples/javascript/13-venues-maps.js', 'P4'],
  // P5
  ['src/resources/dashboards.ts', 'P5'],
  ['src/resources/alerts.ts', 'P5'],
  ['src/resources/alert-rules.ts', 'P5'],
  ['src/resources/settings.ts', 'P5'],
  ['src/types/dashboards.ts', 'P5'],
  ['src/types/alerts.ts', 'P5'],
  ['test/resources/dashboards-rules/dashboards.test.ts', 'P5'],
  ['docs/guides/dashboards-alert-rules.md', 'P5'],
  ['examples/typescript/14-dashboards.ts', 'P5'],
  ['examples/javascript/15-alert-rules.js', 'P5'],
  // P6
  ['src/resources/notifications/index.ts', 'P6'],
  ['src/resources/notifications/rules.ts', 'P6'],
  ['src/types/notifications.ts', 'P6'],
  ['test/resources/notifications/inbox.test.ts', 'P6'],
  ['test/types/notifications.test-d.ts', 'P6'],
  ['docs/guides/notifications.md', 'P6'],
  ['examples/typescript/16-notifications.ts', 'P6'],
  ['examples/javascript/17-notifications-stream.js', 'P6'],
  // P7
  ['src/resources/etl.ts', 'P7'],
  ['src/types/etl.ts', 'P7'],
  ['test/fixtures/etl/upload.json', 'P7'],
  ['docs/guides/etl.md', 'P7'],
  ['examples/typescript/18-etl-import.ts', 'P7'],
  ['spec/manifest/P7.json', 'P7'],
  // P8
  ['src/websocket/client.ts', 'P8'],
  ['test/websocket/client.test.ts', 'P8'],
  ['test/websocket/mocks/websocket.ts', 'P8'],
  ['test/integration/websocket/subscriber.int.test.ts', 'P8'],
  ['docs/guides/websocket.md', 'P8'],
  ['examples/typescript/08-websocket-subscriber.ts', 'P8'],
  ['examples/javascript/09-websocket-publisher.js', 'P8'],
  ['examples/typescript/10-websocket-unified.ts', 'P8'],
  ['spec/manifest/P8.json', 'P8'],
  // P9
  ['README.md', 'P9'],
  ['CHANGELOG.md', 'P9'],
  ['CLAUDE.md', 'P9'],
  ['docs/README.md', 'P9'],
  ['docs/api/README.md', 'P9'],
  ['docs/api/tools/gen-endpoint-coverage.mjs', 'P9'],
  ['docs/guides/getting-started.md', 'P9'],
  ['docs/guides/error-handling.md', 'P9'],
  ['docs/guides/pagination-filtering.md', 'P9'],
  ['docs/guides/advanced-patterns.md', 'P9'],
  ['docs/guides/release-setup.md', 'P9'],
  ['docs/guides/migration-v2.md', 'P9'],
  ['docs/guides/migration-0.3.md', 'P9'],
  ['docs/guides/images/rtls-profile-menu.png', 'P9'],
  ['docs/development/04_SWAGGER_DOCUMENTATION_CHANGES.md', 'P9'],
  ['docs/recipes/README.md', 'P9'],
  ['examples/README.md', 'P9'],
  ['examples/catalogue.json', 'P9'],
  ['examples/run-all.mjs', 'P9'],
  ['examples/run-all.d.mts', 'P9'],
  ['examples/typescript/01-getting-started.ts', 'P9'],
  ['examples/javascript/05-error-handling.js', 'P9'],
  ['examples/typescript/07-default-context.ts', 'P9'],
  ['examples/javascript/24-bulk-declared-location.js', 'P9'],
  ['test/docs/endpoint-coverage.test.ts', 'P9'],
  // P10
  ['UPSTREAM-ISSUES.md', 'P10'],
  // unowned
  ['.claude-config', UNOWNED],
  ['LICENSE', UNOWNED],
  ['.eslintrc.cjs', UNOWNED],
  ['src/generated/schema.ts', UNOWNED],
  ['src/foo.ts', UNOWNED],
  ['docs/guides/unknown.md', UNOWNED],
  ['docs/workpackages/WP/README.md', UNOWNED],
  ['examples/typescript/19-unallocated.ts', UNOWNED],
  ['examples/vitest.config.ts', UNOWNED],
  ['test/integration/allowlist/P0.json', UNOWNED],
  ['test/integration/allowlist/P9.json', UNOWNED],
];

describe('ownership map (P0 §5.6)', () => {
  it.each(SAMPLES)('%s → %s', (path, owner) => {
    expect(ownerOf(path)).toBe(owner);
  });

  it('every tracked file resolves to exactly one owner or "unowned"', () => {
    const tracked = listTrackedFiles();
    expect(tracked.length).toBeGreaterThan(50);
    const invalid = tracked.filter((f) => !VALID_OWNERS.has(ownerOf(f)));
    expect(invalid).toEqual([]);
    expect(tracked).toContain('spec/rtls-api.swagger.json');
    expect(ownerOf('spec/rtls-api.swagger.json')).toBe('P0');
  });

  it('listFiles adds untracked files that are not ignored, and never ignored ones', () => {
    const all = listFiles();
    const tracked = new Set(listTrackedFiles());
    expect(all.filter((f) => tracked.has(f)).length).toBeGreaterThan(0);
    expect(all.some((f) => f.startsWith('node_modules/'))).toBe(false);
    expect(all).not.toContain('.env');
    expect(all.some((f) => f.startsWith('.wp-discovery/'))).toBe(false);
  });

  it('path normalisation: backslashes, leading ./ and duplicate slashes', () => {
    expect(normalizePath('.\\src\\utils\\geojson.ts')).toBe('src/utils/geojson.ts');
    expect(normalizePath('./scripts//lib/git.mjs')).toBe('scripts/lib/git.mjs');
    expect(ownerOf('./src//utils/geojson.ts')).toBe('P4');
    expect(ownerOf('src\\utils\\args.ts')).toBe('P1');
  });

  it('first match wins: single-file rules precede the globs of other phases', () => {
    expect(ownerOf('src/utils/geojson.ts')).toBe('P4');
    expect(ownerOf('src/utils/pagination.ts')).toBe('P1');
    expect(ownerOf('spec/manifest/P6.json')).toBe('P6');
    expect(ownerOf('spec/manifest/base.json')).toBe('P0');
    expect(ownerOf('test/mocks/handlers/index.ts')).toBe('P1');
    expect(ownerOf('test/mocks/handlers/etl.ts')).toBe('P7');
  });

  it('filesOf selects the files of one phase', () => {
    const files = [
      'src/utils/geojson.ts',
      'src/utils/args.ts',
      'src/resources/zones.ts',
      'scripts/quality.mjs',
      'LICENSE',
    ];
    expect(filesOf('P4', files)).toEqual(['src/utils/geojson.ts', 'src/resources/zones.ts']);
    expect(filesOf('P1', files)).toEqual(['src/utils/args.ts']);
    expect(filesOf(UNOWNED, files)).toEqual(['LICENSE']);
    expect(filesOf('P9', files)).toEqual([]);
  });

  it('domain keys map to phases and back', () => {
    expect(DOMAINS).toEqual({
      harness: 'P0',
      core: 'P1',
      assets: 'P2',
      'positions-spatial': 'P3',
      'venues-navigation': 'P4',
      'dashboards-rules': 'P5',
      notifications: 'P6',
      etl: 'P7',
      websocket: 'P8',
    });
    expect(phaseOfDomain('etl')).toBe('P7');
    expect(phaseOfDomain('nope')).toBeUndefined();
    expect(domainOfPhase('P0')).toBe('harness');
    expect(domainOfPhase('P8')).toBe('websocket');
    expect(domainOfPhase('P9')).toBeUndefined();
  });

  it('example numbers are disjoint and match CONVENTIONS §9; guides per phase', () => {
    const all = Object.values(EXAMPLE_NUMBERS).flat();
    expect(new Set(all).size).toBe(all.length);
    expect(EXAMPLE_NUMBERS).toEqual({
      P2: ['02', '11', '12'],
      P3: ['03'],
      P4: ['04', '13'],
      P5: ['14', '15'],
      P6: ['16', '17'],
      P7: ['18'],
      P8: ['08', '09', '10'],
      P9: ['01', '05', '06', '07', '20', '21', '22', '23', '24'],
    });
    for (const [phase, numbers] of Object.entries(EXAMPLE_NUMBERS)) {
      for (const n of numbers) {
        expect(ownerOf(`examples/typescript/${n}-x.ts`)).toBe(phase);
        expect(ownerOf(`examples/javascript/${n}-x.js`)).toBe(phase);
      }
    }
    expect(GUIDES.P2).toContain('assets.md');
    expect(GUIDES.P8).toEqual(['websocket.md']);
    for (const [phase, guides] of Object.entries(GUIDES)) {
      for (const g of guides.filter((name) => !name.includes('*'))) {
        expect(ownerOf(`docs/guides/${g}`)).toBe(phase);
      }
    }
  });

  it('CLI prints "<owner>\\t<path>" and exits 2 without arguments', () => {
    const cli = join(REPO, 'scripts', 'lib', 'ownership.mjs');
    const ok = spawnSync(process.execPath, [cli, 'src/utils/geojson.ts', 'LICENSE'], {
      encoding: 'utf8',
      cwd: REPO,
    });
    expect(ok.status).toBe(0);
    expect(ok.stdout).toBe('P4\tsrc/utils/geojson.ts\nunowned\tLICENSE\n');
    expect(spawnSync(process.execPath, [cli], { encoding: 'utf8' }).status).toBe(2);
  });
});
