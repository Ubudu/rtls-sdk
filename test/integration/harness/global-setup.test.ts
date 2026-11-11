import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setActiveHarness } from './active';
import { registerCleanup } from './cleanup';
import { saveBeforeImage } from './config-core';
import { ContextMissing } from './env';
import { FakeApi } from './fake-api';
import { startRun, type StartRunOptions } from './global-setup';
import { expectGuardViolation, guardedFetch } from './guard';
import { ledgerEntry } from './ledger.mjs';
import {
  acquireReadSlot,
  acquireRunLock,
  holdsLock,
  holdsReadSlot,
  listRuns,
  lockPaths,
  newLockToken,
} from './lock.mjs';
import { finalizeRunReport, type RunReport } from './report';
import {
  apiUrl,
  getInit,
  makeHarness,
  TEST_KEY,
  TEST_NS,
  TEST_RUN_ID,
  tempDir,
  type MakeHarnessOptions,
} from './unit-support';

let api: FakeApi;
beforeEach(() => {
  api = new FakeApi().install();
});
afterEach(() => setActiveHarness(null));

function setup(harness: MakeHarnessOptions = {}, options: Partial<StartRunOptions> = {}) {
  const t = makeHarness({ preflight: undefined, ...harness });
  const processEnv: NodeJS.ProcessEnv = { ...(options.processEnv ?? {}) };
  const start = () =>
    startRun({
      runId: TEST_RUN_ID,
      stateDir: t.stateDir,
      createHarness: () => t.h,
      lockWait: { wait: false },
      configLockWait: { wait: false },
      sha: 'test-sha',
      ...options,
      processEnv,
    });
  return { ...t, processEnv, start, paths: lockPaths(t.mainStateDir) };
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

describe('global setup', () => {
  it('runs health, feature probes, preflight and the before-image in order and writes the state files', async () => {
    const t = setup();
    const run = await t.start();
    expect(run.abort).toBeNull();
    const order = api.log.map((r) => `${r.method} ${r.path}`);
    expect(order.slice(0, 6)).toEqual([
      'GET /health',
      `GET /notifications/${TEST_NS}/unread_count`,
      'GET /etl/mapping-profiles',
      `GET /alert_rules/${TEST_NS}`,
      `GET /assets/${TEST_NS}`,
      `GET /settings/${TEST_NS}`,
    ]);
    expect(order).toHaveLength(6 + 11);
    expect(api.writes()).toEqual([]);
    for (const name of [
      'features.json',
      'preflight.json',
      'before.json',
      'budget.json',
      'env.json',
    ]) {
      expect(existsSync(join(t.stateDir, name))).toBe(true);
    }
    expect(readJson(join(t.stateDir, 'features.json'))).toEqual({ notifications: true, etl: true });
    const envText = readFileSync(join(t.stateDir, 'env.json'), 'utf8');
    expect(envText).not.toContain(TEST_KEY);
    expect(envText).not.toContain(TEST_NS);
    expect(JSON.parse(envText)).toEqual(
      expect.objectContaining({ runId: TEST_RUN_ID, baseHost: 'rtls.test', mode: 'integration' })
    );
    expect(t.processEnv.RTLS_IT_RUN_ID).toBe(TEST_RUN_ID);
    // registered with this pid while it runs; a ledger entry with zero counts
    expect(listRuns({ stateDir: t.mainStateDir })).toEqual([
      expect.objectContaining({
        runId: TEST_RUN_ID,
        entry: expect.objectContaining({ pid: process.pid }),
      }),
    ]);
    expect(ledgerEntry(TEST_RUN_ID, { ledgerPath: t.h.ledgerPath })?.counts).toEqual({
      positions: 0,
      notifications: 0,
      bleActions: 0,
      etlWrites: 0,
    });
    await run.finish();
  });

  it('a tier-R-only run holds a read slot for its whole duration and releases it; report ok', async () => {
    const t = setup();
    const run = await t.start();
    const token = t.processEnv.RTLS_IT_INTERNAL_LOCK_TOKEN as string;
    expect(holdsReadSlot(token, { stateDir: t.mainStateDir })).toBe(true);
    expect(existsSync(t.paths.run)).toBe(false);
    const report = await run.finish();
    expect(holdsReadSlot(token, { stateDir: t.mainStateDir })).toBe(false);
    expect(listRuns({ stateDir: t.mainStateDir }).filter((r) => r.entry !== null)).toEqual([]);
    expect(report).toEqual(
      expect.objectContaining({
        runId: TEST_RUN_ID,
        sha: 'test-sha',
        ok: true,
        abort: null,
        stateDiff: 'none',
      })
    );
    expect(readJson(join(t.stateDir, 'report.json'))).toEqual(report);
  });

  it('a write-capable run takes the run lock (token exported) and releases it; the ledger has its entry', async () => {
    const t = setup({ tiers: { W: true } });
    const run = await t.start();
    const token = t.processEnv.RTLS_IT_INTERNAL_LOCK_TOKEN as string;
    expect(holdsLock(t.paths.run, token)).toBe(true);
    const report = await run.finish();
    expect(holdsLock(t.paths.run, token)).toBe(false);
    expect(report.ok).toBe(true);
    expect(ledgerEntry(TEST_RUN_ID, { ledgerPath: t.h.ledgerPath })).toEqual(
      expect.objectContaining({
        kind: 'integration',
        tiers: { R: true, W: true, C: false, S: false },
      })
    );
  });

  it('a listing the own-run sweep cannot read fails the run (cleanup.failed names it)', async () => {
    const t = setup({ tiers: { W: true } });
    const run = await t.start();
    api.status.savedViews = 503;
    const report = await run.finish();
    expect(report.cleanup.failed).toEqual([{ label: 'sweep unreadable saved-views', status: 503 }]);
    expect(report.ok).toBe(false);
  });

  it("uses the driver's token when it holds the run lock, and leaves the lock to the driver", async () => {
    const token = newLockToken();
    const t = setup({ tiers: { W: true } }, { processEnv: { RTLS_IT_INTERNAL_LOCK_TOKEN: token } });
    await acquireRunLock({ token, stateDir: t.mainStateDir });
    const run = await t.start();
    expect([run.abort, run.token]).toEqual([null, token]);
    await run.finish();
    expect(holdsLock(t.paths.run, token)).toBe(true);
  });

  it.each([
    ['a driver token that does not hold the run lock', true],
    ['the run lock held by another live run', false],
  ])('%s → abort no-run-lock before any request; blocks skip', async (_name, withToken) => {
    const other = newLockToken();
    const t = setup(
      { tiers: { W: true } },
      withToken ? { processEnv: { RTLS_IT_INTERNAL_LOCK_TOKEN: newLockToken() } } : {}
    );
    await acquireRunLock({ token: other, stateDir: t.mainStateDir });
    const run = await t.start();
    expect(run.abort).toBe('no-run-lock');
    expect(api.log).toEqual([]);
    expect(t.h.abortState()).toEqual({ reason: 'no-run-lock', label: 'global-setup' });
    const report = await run.finish();
    expect([report.ok, report.abort]).toEqual([false, 'no-run-lock']);
    expect(api.log).toEqual([]);
    expect(holdsLock(t.paths.run, other)).toBe(true);
    expect(ledgerEntry(TEST_RUN_ID, { ledgerPath: t.h.ledgerPath })).toBeNull();
  });

  it('both read slots held → abort no-read-slot, no request sent', async () => {
    const t = setup();
    await acquireReadSlot({ token: newLockToken(), stateDir: t.mainStateDir });
    await acquireReadSlot({ token: newLockToken(), stateDir: t.mainStateDir });
    const run = await t.start();
    expect(run.abort).toBe('no-read-slot');
    expect((await run.finish()).abort).toBe('no-read-slot');
    expect(api.log).toEqual([]);
  });

  it('a non-200 health check aborts the run (blocks skip) and releases the lock', async () => {
    api.status.health = 503;
    const t = setup({ tiers: { W: true } });
    const run = await t.start();
    expect(run.abort).toBe('health-check-failed');
    expect(api.log.map((r) => r.path)).toEqual(['/health']);
    const report = await run.finish();
    expect(report.abort).toBe('health-check-failed');
    expect(existsSync(t.paths.run)).toBe(false);
    expect(listRuns({ stateDir: t.mainStateDir }).filter((r) => r.entry !== null)).toEqual([]);
  });

  it('feature probes: unread_count 404 → notifications off, mapping-profiles 403 → ETL off', async () => {
    api.status = { unreadCount: 404, etlProfiles: 403 };
    const t = setup();
    const run = await t.start();
    expect(readJson(join(t.stateDir, 'features.json'))).toEqual({
      notifications: false,
      etl: false,
    });
    await run.finish();
  });

  it('without credentials: report abort no-credentials, no request, no lock', async () => {
    const stateDir = join(tempDir('nocreds'), 'run');
    const run = await startRun({
      runId: TEST_RUN_ID,
      stateDir,
      createHarness: () => {
        throw new ContextMissing(['RTLS_API_KEY', 'APP_NAMESPACE']);
      },
      processEnv: { RTLS_IT_WRITES: '1' },
      sha: 'test-sha',
    });
    expect(run.abort).toBe('no-credentials');
    const report = await run.finish();
    expect(report).toEqual(
      expect.objectContaining({
        ok: false,
        abort: 'no-credentials',
        tiers: { R: true, W: true, C: false, S: false },
      })
    );
    expect(readJson(join(stateDir, 'report.json'))).toEqual(report);
    expect(api.log).toEqual([]);
  });
});

describe('global teardown', () => {
  it('restores a saved config before-image without .restored and reports it', async () => {
    const before = {
      name: 'Demo rules',
      rules: [{ id: 'r1', conditions: { all: [] }, event: { type: 'message' } }],
    };
    api.alertRules = before;
    const t = setup({ tiers: { C: true } });
    const run = await t.start();
    // a C cycle saved the before-image, added its disabled rule and never restored (crashed worker)
    saveBeforeImage(t.stateDir, 'alert-rules', before, JSON.stringify(before));
    api.alertRules = { ...before, rules: [...before.rules, { id: 'r2-real', disabled: true }] };
    const report = await run.finish();
    expect(api.writes().map((r) => `${r.method} ${r.path}`)).toEqual([
      `POST /alert_rules/${TEST_NS}`,
    ]);
    expect(api.alertRules).toEqual(before);
    expect(report.configRestores).toEqual([{ resource: 'alert-rules', ok: true }]);
    expect(existsSync(join(t.stateDir, 'config', 'alert-rules.restored'))).toBe(true);
    expect(report.ok).toBe(true);
    expect(existsSync(t.paths.config)).toBe(false);
  });

  it('replays every pending cleanup (a crashed worker left them) and reports done and failed ones', async () => {
    const t = setup({ tiers: { W: true } });
    const run = await t.start();
    const mac = (n: number): string => `025d4b${TEST_RUN_ID.slice(0, 4)}0${n}`;
    api.assets = [{ user_udid: mac(1) }];
    // registered outside any block replay (the worker died before its afterAll)
    registerCleanup({
      label: 'asset 1',
      request: { method: 'DELETE', path: `/assets/{ns}/${mac(1)}` },
    });
    registerCleanup({
      label: 'foreign',
      request: { method: 'DELETE', path: '/assets/{ns}/aabbccddeeff' },
    });
    const report = await run.finish();
    expect(api.writes().map((r) => `${r.method} ${r.path}`)[0]).toBe(
      `DELETE /assets/${TEST_NS}/${mac(1)}`
    );
    expect(api.assets).toEqual([]);
    expect(report.cleanup).toEqual({ done: 1, failed: [{ label: 'foreign' }] });
    expect(report.ok).toBe(false);
  });

  it('a value that already equals the before-image is not written', async () => {
    const t = setup({ tiers: { C: true } });
    const run = await t.start();
    saveBeforeImage(t.stateDir, 'alert-rules', api.alertRules, JSON.stringify(api.alertRules));
    const report = await run.finish();
    expect(api.writes()).toEqual([]);
    expect(report.configRestores).toEqual([{ resource: 'alert-rules', ok: true }]);
  });

  it('a restore mismatch aborts the run with restore-failed', async () => {
    const t = setup({ tiers: { C: true } });
    const run = await t.start();
    const before = { name: 'Demo rules', rules: [] };
    saveBeforeImage(t.stateDir, 'alert-rules', before, JSON.stringify(before));
    api.alertRules = {
      name: 'Demo rules',
      rules: [{ id: `sdk-test-${TEST_RUN_ID}-x`, disabled: true }],
    };
    api.alertRulesWriteTransform = (body) => ({ ...(body as object), name: 'changed by someone' });
    const report = await run.finish();
    expect([report.ok, report.abort]).toEqual([false, 'restore-failed']);
    expect(report.configRestores).toEqual([{ resource: 'alert-rules', ok: false }]);
  });

  it('confirms the ledger entry with the budget.json counts and reports budgets, rate and violations', async () => {
    const t = setup({ tiers: { W: true, S: true } });
    const run = await t.start();
    t.h.consume({ positions: 1 }, 'positions-spatial');
    await expectGuardViolation('G3', () => guardedFetch(apiUrl('/assets/other-ns'), getInit()));
    const report = await run.finish();
    expect(report.budgets.positions).toEqual({ used: 1, limit: 10 });
    expect(ledgerEntry(TEST_RUN_ID, { ledgerPath: t.h.ledgerPath })?.counts.positions).toBe(1);
    expect(report.ledger.caps).toEqual({
      positions: 60,
      notifications: 30,
      bleActions: 6,
      etlWrites: 6,
    });
    expect(typeof report.maxRequestRate).toBe('number');
    expect(report.maxRequestRate).toBeGreaterThan(0);
    expect([report.violations, report.ok]).toEqual([[], true]);
  });

  it('an unexpected violation or a budget refusal fails the run', async () => {
    const t = setup({ tiers: { W: true } });
    const run = await t.start();
    await expect(guardedFetch(apiUrl('/assets/other-ns'), getInit())).rejects.toThrow('G3');
    const report = await run.finish();
    expect(report.violations).toEqual([{ rule: 'G3', method: 'GET', template: '/assets/{ns}' }]);
    expect(report.ok).toBe(false);
  });

  it('a preflight.json left by an earlier run of a reused run id is replaced by this run’s preflight', async () => {
    api.alertRules = {
      name: 'Demo rules',
      rules: [{ id: 'e', conditions: { all: [] }, event: { type: 'post_to_email' } }],
    };
    const t = setup();
    mkdirSync(t.stateDir, { recursive: true });
    const stale = {
      ruleEngineSafe: true,
      positionSafe: true,
      declaredPositionSafe: true,
      linkedNamespaceSafe: true,
      linkedCount: 0,
      blocking: [],
    };
    writeFileSync(join(t.stateDir, 'preflight.json'), JSON.stringify(stale));
    const run = await t.start();
    expect(run.abort).toBeNull();
    expect(readJson(join(t.stateDir, 'preflight.json'))).toEqual(
      expect.objectContaining({
        ruleEngineSafe: false,
        positionSafe: false,
        blocking: [{ index: 0, eventType: 'post_to_email' }],
      })
    );
    await run.finish();
  });

  it('the preflight warning reaches the report when notifications are on', async () => {
    api.alertRules = {
      name: 'Demo rules',
      rules: [{ id: 'm', conditions: { all: [] }, event: { type: 'message' } }],
    };
    const t = setup();
    const report = await (await t.start()).finish();
    expect(report.preflight).toEqual(
      expect.objectContaining({
        ruleEngineSafe: true,
        warnings: ['message-rules-reach-notifications'],
      })
    );
  });

  it('test outcomes reach the report before or after teardown; a failed test turns ok false', async () => {
    const outcomes = [
      {
        file: '/r/test/integration/harness/harness.int.test.ts',
        suites: ['[R] reads'],
        test: 'a',
        state: 'pass' as const,
      },
      {
        file: '/r/test/integration/core/context.int.test.ts',
        suites: ['[W] writes'],
        test: 'b',
        state: 'fail' as const,
      },
    ];
    const early = setup();
    const run = await early.start();
    expect(finalizeRunReport(early.stateDir, outcomes)).toBeNull();
    const report = await run.finish();
    expect(report.domains.harness?.tiers.R.passed).toBe(1);
    expect(report.domains.core?.failed).toBe(1);
    expect(report.ok).toBe(false);

    const late = setup();
    const run2 = await late.start();
    expect((await run2.finish()).ok).toBe(true);
    const finalized = finalizeRunReport(late.stateDir, outcomes) as RunReport;
    expect([finalized.ok, finalized.domains.core?.tiers.W.failed]).toEqual([false, 1]);
    expect(readJson(join(late.stateDir, 'report.json'))).toEqual(finalized);
  });
});
