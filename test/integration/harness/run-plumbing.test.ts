// Unit tests of the integration-run plumbing added with P0-T19: run facts (`recordFact` → report.json.facts),
// guard installation that survives the per-file re-evaluation of the harness in the single integration worker,
// the process-wide G15 bucket, the merged `guard/<pid>.json` record, the vitest reporter that hands outcomes to
// report.json, and the shares exported by ledger.mjs for the `.mjs` driver and runner.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setActiveHarness } from './active';
import { DOMAIN_CAPS, EXAMPLES_SHARE, integrationShare } from './budgets';
import { processBucket } from './context';
import { checkFactValue, readFacts, recordFact } from './facts';
import * as ledger from './ledger.mjs';
import { DOMAIN_KEYS } from './policy';
import { buildRunReport, mergeProcessStats, processStatsPath, writeProcessStats } from './report';
import HarnessReporter, { reportStateDir, runOutcomes } from './reporter';
import { makeHarness, SAFE_PREFLIGHT, tempDir, TEST_KEY, TEST_NS } from './unit-support';

afterEach(() => setActiveHarness(null));

describe('recordFact', () => {
  it('records booleans, finite numbers, null and media types in facts.json', () => {
    const { stateDir } = makeHarness();
    recordFact('U6.createStatus', 201);
    recordFact('U6.createContentType', 'text/plain; charset=utf-8');
    recordFact('U6.deleteContentType', null);
    recordFact('U4.wsModuleGuarded', true);
    recordFact('U6.createStatus', 200);
    expect(readFacts(stateDir)).toEqual({
      'U6.createStatus': 200,
      'U6.createContentType': 'text/plain; charset=utf-8',
      'U6.deleteContentType': null,
      'U4.wsModuleGuarded': true,
    });
  });

  it('refuses free text, values containing the key or namespace, and bad names', () => {
    makeHarness();
    expect(() => recordFact('x', 'Created')).toThrow(TypeError);
    expect(() => recordFact('x', `text/${TEST_NS}`)).toThrow('value refused');
    expect(() => recordFact('x', `text/${TEST_KEY}`)).toThrow('value refused');
    expect(() => recordFact('x', Number.NaN)).toThrow('finite');
    expect(() => recordFact('x', { a: 1 } as unknown as boolean)).toThrow(TypeError);
    expect(() => recordFact('bad name', true)).toThrow('name must match');
    expect(() => recordFact('', true)).toThrow('name must match');
    expect(checkFactValue('application/json')).toBe('application/json');
    expect(() => checkFactValue('a'.repeat(60) + '/' + 'b'.repeat(60))).toThrow('media type');
  });

  it('copies the recorded facts into report.json', () => {
    const { h } = makeHarness();
    recordFact('U9.blackholeRejectMs', 10_012);
    const report = buildRunReport({
      h,
      sha: 'abc',
      tiers: { R: true, W: false, C: false, S: false },
      preflight: SAFE_PREFLIGHT,
      warnings: [],
      othersBefore: ledger.zeroCounts(),
      differences: [],
      stateDiff: 'none',
      abort: null,
    });
    expect(report.facts).toEqual({ 'U9.blackholeRejectMs': 10_012 });
    expect(report.ok).toBe(true);
  });
});

describe('installGuards across module instances', () => {
  it('installs one guard layer over the true originals, also after the harness is evaluated again', async () => {
    const trueFetch = globalThis.fetch;
    vi.resetModules();
    const first = await import('./install');
    const firstGuard = await import('./guard');
    first.installGuards();
    try {
      expect(globalThis.fetch).toBe(firstGuard.guardedFetch);
      expect((await import('./active')).originalFetch()).toBe(trueFetch);

      // A fresh evaluation of the harness (the next test file of the single worker).
      vi.resetModules();
      const second = await import('./install');
      const secondGuard = await import('./guard');
      const secondActive = await import('./active');
      second.installGuards();
      try {
        expect(secondGuard.guardedFetch).not.toBe(firstGuard.guardedFetch);
        expect(globalThis.fetch).toBe(secondGuard.guardedFetch);
        expect(secondActive.originalFetch()).toBe(trueFetch);
        expect(second.processOriginals()?.fetch).toBe(trueFetch);
      } finally {
        second.uninstallGuards();
      }
      expect(globalThis.fetch).toBe(trueFetch);
      expect(second.processOriginals()).toBeNull();
    } finally {
      globalThis.fetch = trueFetch;
      first.uninstallGuards();
      vi.resetModules();
    }
    expect(globalThis.fetch).toBe(trueFetch);
  });
});

describe('process-wide G15 bucket', () => {
  it('returns the same bucket for every live context of the process', () => {
    expect(processBucket()).toBe(processBucket());
    const { h } = makeHarness();
    expect(h.bucket).not.toBe(processBucket());
  });
});

describe('mergeProcessStats', () => {
  it('adds the counts and requests of a later context of the same process and keeps the peak', () => {
    const first = makeHarness();
    first.h.processCounts.positions = 1;
    first.h.requestsSent = 3;
    first.h.bucket.peak = 4;
    expect(mergeProcessStats(first.h).requests).toBe(3);

    const second = makeHarness({ stateDir: first.stateDir, mainStateDir: first.mainStateDir });
    second.h.processCounts.notifications = 2;
    second.h.requestsSent = 5;
    second.h.bucket.peak = 2;
    const merged = mergeProcessStats(second.h);
    expect(merged.counts).toEqual({ positions: 1, notifications: 2, bleActions: 0, etlWrites: 0 });
    expect(merged.requests).toBe(8);
    expect(merged.maxRequestRate).toBe(4);
    expect(JSON.parse(readFileSync(processStatsPath(first.stateDir), 'utf8'))).toEqual(merged);
  });

  it('replaces a record of another mode instead of adding to it', () => {
    const example = makeHarness({ mode: 'example' });
    example.h.requestsSent = 7;
    writeProcessStats(example.h);
    const integration = makeHarness({
      stateDir: example.stateDir,
      mainStateDir: example.mainStateDir,
    });
    integration.h.requestsSent = 1;
    expect(mergeProcessStats(integration.h).requests).toBe(1);
  });
});

describe('integration reporter', () => {
  const file = (state: string, tests: { name: string; state?: string }[]) => ({
    type: 'suite',
    name: 'test/integration/harness/x.int.test.ts',
    filepath: '/repo/test/integration/harness/x.int.test.ts',
    result: { state },
    tasks: [
      {
        type: 'suite',
        name: '[R] block',
        tasks: tests.map((t) => ({
          type: 'test',
          name: t.name,
          result: t.state ? { state: t.state } : undefined,
        })),
      },
    ],
  });

  it('adds a failed (file) outcome for a file that failed outside its tests', () => {
    const outcomes = runOutcomes([file('fail', [{ name: 'a', state: 'pass' }])]);
    expect(outcomes.map((o) => [o.test, o.state])).toEqual([
      ['a', 'pass'],
      ['(file)', 'fail'],
    ]);
    expect(runOutcomes([file('fail', [{ name: 'a', state: 'fail' }])]).map((o) => o.test)).toEqual([
      'a',
    ]);
    expect(runOutcomes([file('pass', [{ name: 'a', state: 'pass' }])])).toHaveLength(1);
  });

  it('writes outcomes.json into the run named by RTLS_IT_RUN_ID, and nothing without a valid run id', () => {
    expect(reportStateDir({ RTLS_IT_RUN_ID: 'ABC' })).toBeNull();
    expect(reportStateDir({})).toBeNull();
    const dir = reportStateDir({ RTLS_IT_RUN_ID: '0badc0de' });
    expect(dir?.endsWith(join('.state', '0badc0de'))).toBe(true);

    const root = tempDir('reporter');
    const reporter = new HarnessReporter({ stateRoot: root });
    vi.stubEnv('RTLS_IT_RUN_ID', 'not-a-run');
    try {
      reporter.onFinished([file('pass', [{ name: 'a', state: 'pass' }])]);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(readdirSync(root)).toEqual([]);

    vi.stubEnv('RTLS_IT_RUN_ID', '0badc0de');
    try {
      reporter.onFinished([file('fail', [{ name: 'a', state: 'pass' }])]);
    } finally {
      vi.unstubAllEnvs();
    }
    const outcomes = JSON.parse(readFileSync(join(root, '0badc0de', 'outcomes.json'), 'utf8'));
    expect(outcomes.map((o: { test: string }) => o.test)).toEqual(['a', '(file)']);
    expect(existsSync(join(root, '0badc0de', 'report.json'))).toBe(false);
  });
});

describe('shares in ledger.mjs', () => {
  it('equal the budgets.ts constants and sums for every domain', () => {
    expect(ledger.EXAMPLES_SHARE).toEqual(EXAMPLES_SHARE);
    expect(ledger.DOMAIN_CAPS).toEqual(DOMAIN_CAPS);
    for (const domain of DOMAIN_KEYS)
      expect(ledger.integrationShare([domain])).toEqual(integrationShare([domain]));
    expect(ledger.integrationShare()).toEqual({
      positions: 6,
      notifications: 3,
      bleActions: 1,
      etlWrites: 1,
    });
    expect(ledger.integrationShare(['harness', 'core'])).toEqual(ledger.zeroCounts());
    expect(ledger.integrationShare(['unknown-domain'])).toEqual(ledger.zeroCounts());
  });
});
