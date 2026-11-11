#!/usr/bin/env node
// Ownership map of the repository files per development phase (P0–P10).
// Ordered glob rules, first match wins. Single-file rules come before the glob rules of other phases, so
// `src/utils/geojson.ts` → P4 precedes P1's `src/utils/**`, and `spec/manifest/P[1-8].json` precede P0's
// `spec/**`. A path that no rule matches is "unowned" (a finding on it is a warning, a failure with
// `--release`).
//
// CLI: node scripts/lib/ownership.mjs [--tracked] [<path>…]   prints "<owner>\t<path>" per path.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import picomatch from 'picomatch';
import { listTrackedFiles } from './git.mjs';

/** @typedef {'P0'|'P1'|'P2'|'P3'|'P4'|'P5'|'P6'|'P7'|'P8'|'P9'|'P10'} Phase */
/** @typedef {Phase | 'unowned'} Owner */

/** @type {readonly Phase[]} */
export const PHASES = Object.freeze([
  'P0',
  'P1',
  'P2',
  'P3',
  'P4',
  'P5',
  'P6',
  'P7',
  'P8',
  'P9',
  'P10',
]);
export const UNOWNED = 'unowned';

/** Domain keys → phase (CONVENTIONS §6, P0 §5.6). */
export const DOMAINS = Object.freeze({
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

/** Example numbers per phase (CONVENTIONS §9; examples 20–24 are P9's recipes). */
export const EXAMPLE_NUMBERS = Object.freeze({
  P2: Object.freeze(['02', '11', '12']),
  P3: Object.freeze(['03']),
  P4: Object.freeze(['04', '13']),
  P5: Object.freeze(['14', '15']),
  P6: Object.freeze(['16', '17']),
  P7: Object.freeze(['18']),
  P8: Object.freeze(['08', '09', '10']),
  P9: Object.freeze(['01', '05', '06', '07', '20', '21', '22', '23', '24']),
});

/**
 * Guides under `docs/guides/` per phase (CONVENTIONS §9; P2–P4 also own the 0.2.0 guide their new one
 * replaces). Entries are file names or globs relative to `docs/guides/`.
 */
export const GUIDES = Object.freeze({
  P2: Object.freeze(['assets.md', 'asset-tracking.md']),
  P3: Object.freeze(['positions-spatial.md', 'zone-geofencing.md']),
  P4: Object.freeze(['venues-navigation.md', 'navigation.md']),
  P5: Object.freeze(['dashboards-alert-rules.md']),
  P6: Object.freeze(['notifications.md']),
  P7: Object.freeze(['etl.md']),
  P8: Object.freeze(['websocket.md']),
  P9: Object.freeze([
    'getting-started.md',
    'error-handling.md',
    'pagination-filtering.md',
    'advanced-patterns.md',
    'release-setup.md',
    'migration-*.md',
    'images/**',
  ]),
});

/** Domain-phase source files (README §6). */
const DOMAIN_SOURCES = {
  P2: [
    'src/resources/{assets,asset-documents,asset-tree,data-models,declared-locations,tag-actions}.ts',
    'src/types/assets.ts',
  ],
  P3: ['src/resources/{positions,spatial}.ts', 'src/types/{positions,spatial}.ts'],
  P4: ['src/resources/{venues,zones,navigation}.ts', 'src/types/{venues,navigation,geojson}.ts'],
  P5: [
    'src/resources/{dashboards,alerts,alert-rules,settings}.ts',
    'src/types/{dashboards,alerts}.ts',
  ],
  P6: ['src/resources/notifications/**', 'src/types/notifications.ts'],
  P7: ['src/resources/etl.ts', 'src/types/etl.ts'],
  P8: ['src/websocket/**', 'test/websocket/**'],
};

/**
 * @returns {Array<[Owner, string[]]>}
 */
function buildRules() {
  /** @type {Array<[Owner, string[]]>} */
  const rules = [];
  // 1. Single-file rules that precede the globs of other phases.
  rules.push(['P4', ['src/utils/geojson.ts']]);
  for (const p of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']) {
    rules.push([
      /** @type {Phase} */ (p),
      [`spec/manifest/${p}.json`, `test/integration/allowlist/${p}.json`],
    ]);
  }
  rules.push([
    'P1',
    ['test/mocks/server.ts', 'test/mocks/handlers/index.ts', 'test/mocks/handlers/core.ts'],
  ]);
  // 2. P0.
  rules.push([
    'P0',
    [
      'spec/**',
      'scripts/**',
      'examples/shared/**',
      'examples/package.json',
      'examples/package-lock.json',
      'examples/tsconfig*.json',
      'package.json',
      'package-lock.json',
      '*.config.ts',
      'tsconfig*.json',
      'eslint.config.js',
      '.prettier*',
      '.gitignore',
      '.npmignore',
      '.gitlab-ci.yml',
      '.github/**',
      '.env.example',
      'test/setup.ts',
      'test/contract/**',
      'test/integration/harness/**',
      'test/integration/setup.ts',
    ],
  ]);
  // 3. P1 (core).
  rules.push([
    'P1',
    [
      'src/client/**',
      'src/errors.ts',
      'src/context.ts',
      'src/utils/**',
      'src/types.ts',
      'src/types/index.ts',
      'src/index.ts',
      'src/resources/index.ts',
      'src/generated/overrides.ts',
      'test/unit/core/**',
      'test/integration/core/**',
      'test/fixtures/core/**',
      'test/types/core.test-d.ts',
    ],
  ]);
  // 4. Domain phases P2–P8: sources, per-domain test folders, guides, examples.
  for (const [domain, phase] of Object.entries(DOMAINS)) {
    if (phase === 'P0' || phase === 'P1') continue;
    const p = /** @type {keyof typeof DOMAIN_SOURCES} */ (phase);
    const examples = EXAMPLE_NUMBERS[p].map((n) => `examples/{typescript,javascript}/${n}-*`);
    const guides = GUIDES[p].map((g) => `docs/guides/${g}`);
    rules.push([
      p,
      [
        ...DOMAIN_SOURCES[p],
        `test/{resources,fixtures,integration}/${domain}/**`,
        `test/mocks/handlers/${domain}.ts`,
        `test/types/${domain}.test-d.ts`,
        ...guides,
        ...examples,
      ],
    ]);
  }
  // 5. P9 (docs and examples).
  rules.push([
    'P9',
    [
      'README.md',
      'CHANGELOG.md',
      'CLAUDE.md',
      'docs/README.md',
      'docs/api/**',
      'docs/recipes/**',
      'docs/development/**',
      ...GUIDES.P9.map((g) => `docs/guides/${g}`),
      'examples/README.md',
      'examples/catalogue.json',
      'examples/run-all.{mjs,d.mts}',
      ...EXAMPLE_NUMBERS.P9.map((n) => `examples/{typescript,javascript}/${n}-*`),
      'test/docs/**',
    ],
  ]);
  // 6. P10.
  rules.push(['P10', ['UPSTREAM-ISSUES.md']]);
  return rules;
}

/** Ordered rules as `[owner, globs]`, first match wins (exported for diagnostics). */
export const RULES = Object.freeze(buildRules());

const MATCHERS = RULES.map(
  ([owner, globs]) => /** @type {const} */ ([owner, picomatch(globs, { dot: true })])
);

/**
 * @param {string} path
 * @returns {string}
 */
export function normalizePath(path) {
  let p = path.replace(/\\/g, '/');
  while (p.startsWith('./')) p = p.slice(2);
  return p.replace(/\/+/g, '/');
}

/**
 * Owner of a repository-relative path: a phase id or "unowned".
 *
 * @param {string} path
 * @returns {Owner}
 */
export function ownerOf(path) {
  const p = normalizePath(path);
  for (const [owner, match] of MATCHERS) if (match(p)) return owner;
  return UNOWNED;
}

/**
 * The files of `files` owned by `phase`.
 *
 * @param {Owner} phase
 * @param {readonly string[]} files
 * @returns {string[]}
 */
export function filesOf(phase, files) {
  return files.filter((f) => ownerOf(f) === phase);
}

/**
 * The phase of a domain key, or undefined.
 *
 * @param {string} domain
 * @returns {Phase | undefined}
 */
export function phaseOfDomain(domain) {
  return /** @type {Record<string, Phase>} */ (DOMAINS)[domain];
}

/**
 * The domain key of a phase (P0 → "harness"), or undefined for P9/P10.
 *
 * @param {string} phase
 * @returns {string | undefined}
 */
export function domainOfPhase(phase) {
  for (const [domain, p] of Object.entries(DOMAINS)) if (p === phase) return domain;
  return undefined;
}

/**
 * @param {string} value
 * @returns {value is Phase}
 */
export function isPhase(value) {
  return /** @type {readonly string[]} */ (PHASES).includes(value);
}

/**
 * @param {string[]} argv
 * @returns {number}
 */
function main(argv) {
  const paths = argv.filter((a) => a !== '--tracked');
  if (argv.includes('--tracked')) paths.push(...listTrackedFiles());
  if (paths.length === 0) {
    console.error('usage: ownership.mjs [--tracked] [<path>…]');
    return 2;
  }
  for (const p of paths) console.log(`${ownerOf(p)}\t${normalizePath(p)}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
