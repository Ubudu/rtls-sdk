// The root package.json carries every script name of P0 §6.1, and the P9 targets that P0 answers in §12.1
// (H-P0-1: docs:api, docs:coverage, examples:all) with the §6.1 commands verbatim. P9 and P10 run them;
// they cannot add them, because package.json is P0's file (README §6).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const scripts = (
  JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  }
).scripts;

/** Every script name of the §6.1 table. */
const SECTION_6_1 = [
  'prepare',
  'generate',
  'spec:check',
  'spec:update',
  'spec:drift',
  'build',
  'dev',
  'typecheck',
  'lint',
  'lint:fix',
  'format',
  'format:check',
  'test',
  'test:watch',
  'test:coverage',
  'test:ws',
  'test:ws:watch',
  'test:contract',
  'manifest:report',
  'test:integration',
  'test:integration:sweep',
  'test:integration:snapshot',
  'test:integration:scan',
  'coverage:live:check',
  'test:pack',
  'docs:snippets',
  'docs:links',
  'docs:api',
  'docs:api:check',
  'docs:coverage',
  'docs:coverage:check',
  'docs:endpoint-coverage',
  'examples:install',
  'examples:check',
  'examples:all',
  'ci:offline',
  'prepublishOnly',
];

describe('package.json scripts (P0 §6.1)', () => {
  it('defines every §6.1 script name', () => {
    expect(SECTION_6_1.filter((name) => !(name in scripts))).toEqual([]);
  });

  it('runs the P9 targets with the §6.1 commands (H-P0-1, P10 H3)', () => {
    expect(scripts['docs:api']).toBe('typedoc --options docs/api/typedoc.json');
    expect(scripts['docs:api:check']).toBe(
      'npm run docs:api && git diff --exit-code -- docs/api/reference && test -z "$(git status --porcelain -- docs/api/reference)"'
    );
    expect(scripts['docs:coverage']).toBe('node docs/api/tools/gen-endpoint-coverage.mjs');
    expect(scripts['docs:coverage:check']).toBe(
      'node docs/api/tools/gen-endpoint-coverage.mjs --check'
    );
    expect(scripts['docs:endpoint-coverage']).toBe('npm run docs:coverage');
    expect(scripts['examples:all']).toBe('npm run build && node examples/run-all.mjs');
  });

  it('keeps the P9 targets out of the offline CI chain until P9 provides them', () => {
    const chain = scripts['ci:offline'] ?? '';
    expect(chain).not.toMatch(/docs:api|docs:coverage|examples:all/);
  });
});
