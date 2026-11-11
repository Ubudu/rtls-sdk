// Fixture contract (P0 §5.5.1): every fixture under test/fixtures/<domain>/*.json is a valid envelope,
// `spec` fixtures validate against the vendored spec, `live`/`server-code` fixtures carry a `_note`, and no
// fixture fails the hygiene scan. Results are also written to .cache/contract/fixtures-report.json, from
// which `npm run test:contract -- --release` fails on "override possibly unnecessary" (scripts/contract.mjs).
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  FIXTURES_ROOT,
  REPO_ROOT,
  checkFixture,
  fixtureLabel,
  loadAllFixtures,
  strayFixtureEntries,
} from './fixtures';
import { specValidator } from './spec';

const FIXTURE_REPORT_PATH = join(REPO_ROOT, '.cache', 'contract', 'fixtures-report.json');

describe('fixture contract (P0 §5.5.1)', () => {
  const fixtures = loadAllFixtures(FIXTURES_ROOT);
  const validator = specValidator();
  const results = fixtures.map((f) => ({
    fixture: fixtureLabel(f),
    ...checkFixture(f, validator),
  }));

  mkdirSync(dirname(FIXTURE_REPORT_PATH), { recursive: true });
  writeFileSync(
    FIXTURE_REPORT_PATH,
    JSON.stringify(
      {
        fixtures: fixtures.length,
        errors: results
          .filter((r) => r.errors.length)
          .map((r) => ({ fixture: r.fixture, errors: r.errors })),
        reports: results
          .filter((r) => r.reports.length)
          .map((r) => ({ fixture: r.fixture, reports: r.reports })),
        overrideUnnecessary: results.filter((r) => r.overrideUnnecessary).map((r) => r.fixture),
      },
      null,
      2
    ) + '\n'
  );

  it('test/fixtures holds only domain folders', () => {
    expect(strayFixtureEntries(FIXTURES_ROOT)).toEqual([]);
  });

  it('every fixture satisfies the envelope, spec and hygiene rules', () => {
    const failing = results
      .filter((r) => r.errors.length)
      .map((r) => `${r.fixture}: ${r.errors.join('; ')}`);
    expect(failing).toEqual([]);
    expect(results).toHaveLength(fixtures.length);
  });
});
