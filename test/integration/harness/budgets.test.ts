import { spawn, spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setActiveHarness } from './active';
import {
  BudgetExceeded,
  budgetReport,
  consumeBudget,
  consumeUnits,
  integrationShare,
  ledgerRefusal,
  readBudgetFile,
  type BudgetCounts,
  type BudgetName,
  type BudgetTarget,
} from './budgets';
import { FakeApi } from './fake-api';
import { startRun } from './global-setup';
import { guardedFetch } from './guard';
import { ledgerEntry, readLedger, recordLedger } from './ledger.mjs';
import { lockPaths } from './lock.mjs';
import type { DomainKey } from './policy';
import {
  apiUrl,
  inBlock,
  jsonInit,
  makeHarness,
  TEST_MAC,
  TEST_RUN_ID,
  tempDir,
  useDefaultApi,
} from './unit-support';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..');
const moduleUrl = (name: string): string => pathToFileURL(join(HERE, name)).href;
const S_TIERS = { R: true, W: false, C: false, S: true };

beforeEach(() => useDefaultApi());
afterEach(() => setActiveHarness(null));

function target(
  stateDir: string,
  ledgerPath: string,
  mode: 'integration' | 'example' = 'integration'
): BudgetTarget {
  return { stateDir, runId: TEST_RUN_ID, mode, ledgerTiers: S_TIERS, ledgerPath };
}

function refusal(fn: () => void): BudgetExceeded | null {
  try {
    fn();
  } catch (error) {
    if (error instanceof BudgetExceeded) return error;
    throw error;
  }
  return null;
}

/** Writes a child script that runs with `node --import tsx`; returns its path. */
function childScript(name: string, body: string): string {
  const path = join(tempDir('child'), name);
  writeFileSync(path, body);
  return path;
}

function runChild(script: string, args: string[]): { status: number | null; stderr: string } {
  const result = spawnSync(process.execPath, ['--import', 'tsx', script, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '' },
    timeout: 60_000,
  });
  return { status: result.status, stderr: result.stderr };
}

const CONSUME_CHILD = `
import { consumeUnits } from ${JSON.stringify(moduleUrl('budgets.ts'))};
const [stateDir, ledgerPath, domain, n] = process.argv.slice(2);
try {
  consumeUnits({ stateDir, runId: ${JSON.stringify(TEST_RUN_ID)}, mode: 'integration',
    ledgerTiers: { R: true, W: false, C: false, S: true }, ledgerPath }, { positions: Number(n) }, domain);
} catch (error) {
  process.stderr.write(String(error.name));
  process.exit(1);
}
`;

describe('budgets: limits and caps', () => {
  it('consumes within the limit; exceeding throws BudgetExceeded and marks the run failed', async () => {
    const { h, stateDir } = makeHarness({ tiers: { S: true } });
    h.consume({ positions: 2 }, 'websocket');
    expect(h.budgetReport().positions).toEqual({ used: 2, limit: 10 });
    expect(h.failureReasons()).toEqual([]);
    const refused = refusal(() => h.consume({ positions: 1 }, 'websocket'));
    expect(refused).toBeInstanceOf(BudgetExceeded);
    expect([refused?.budget, refused?.limitKind]).toEqual(['positions', 'domain']);
    expect(h.budgetReport().positions.used).toBe(2);
    expect(readBudgetFile(stateDir).exceeded).toEqual([
      { budget: 'positions', limit: 'domain', domain: 'websocket' },
    ]);
    expect(h.failureReasons()).toEqual(['1 budget refusal(s)']);
    await inBlock(
      h,
      'S',
      async () => {
        expect(() => consumeBudget('positions')).toThrow(BudgetExceeded);
        expect(budgetReport().positions.used).toBe(2);
      },
      'websocket'
    );
  });

  it.each<[DomainKey, BudgetName, number]>([
    ['assets', 'positions', 2],
    ['positions-spatial', 'positions', 2],
    ['websocket', 'positions', 2],
    ['notifications', 'notifications', 3],
    ['assets', 'bleActions', 1],
    ['etl', 'etlWrites', 1],
    ['harness', 'positions', 0],
    ['core', 'positions', 0],
    ['dashboards-rules', 'notifications', 0],
    ['venues-navigation', 'positions', 0],
  ])('domain cap: %s allows %s up to %d and rejects the next', (domain, name, cap) => {
    const { h } = makeHarness({ tiers: { S: true } });
    for (let i = 0; i < cap; i += 1) h.consume({ [name]: 1 }, domain);
    const refused = refusal(() => h.consume({ [name]: 1 }, domain));
    expect(refused).toBeInstanceOf(BudgetExceeded);
    expect(refused?.budget).toBe(name);
    // BLE and ETL: the per-run limit (1) equals the domain cap and is checked first
    expect(refused?.limitKind).toBe(cap === 1 && name !== 'positions' ? 'run' : 'domain');
    expect(h.budgetReport()[name].used).toBe(cap);
  });

  it('a domain cap is enforced on guarded requests (4th send of the notifications domain)', async () => {
    const { h, calls } = makeHarness({ tiers: { S: true } });
    const sendToSelf = (): Promise<Response> =>
      guardedFetch(
        apiUrl('/notifications/{ns}/send'),
        jsonInit('POST', { recipients: [{ target_type: 'user', id: 'self-user-1' }], title: 't' })
      );
    await inBlock(
      h,
      'S',
      async () => {
        for (let i = 0; i < 3; i += 1) await sendToSelf();
        await expect(sendToSelf()).rejects.toBeInstanceOf(BudgetExceeded);
      },
      'notifications'
    );
    expect(calls.filter((c) => c.url.endsWith('/send'))).toHaveLength(3);
  });

  it('example mode applies the examples share (4/2/0/0) and no domain caps', () => {
    const { h } = makeHarness({ mode: 'example', exampleWrite: true, tiers: { W: true, S: true } });
    for (let i = 0; i < 4; i += 1) h.consume({ positions: 1 }, null);
    expect(refusal(() => h.consume({ positions: 1 }, null))?.limitKind).toBe('examples');
    h.consume({ notifications: 2 }, 'harness');
    expect(refusal(() => h.consume({ notifications: 1 }, 'harness'))?.limitKind).toBe('examples');
    expect(refusal(() => h.consume({ bleActions: 1 }, 'assets'))?.limitKind).toBe('examples');
    expect(refusal(() => h.consume({ etlWrites: 1 }, 'etl'))?.limitKind).toBe('examples');
    expect(h.budgetReport()).toEqual({
      positions: { used: 4, limit: 4 },
      notifications: { used: 2, limit: 2 },
      bleActions: { used: 0, limit: 0 },
      etlWrites: { used: 0, limit: 0 },
    });
  });
});

describe('budgets: persistence', () => {
  it('persists across a fresh context on the same state dir', () => {
    const first = makeHarness({ tiers: { S: true } });
    first.h.consume({ positions: 1 }, 'assets');
    const second = makeHarness({
      tiers: { S: true },
      stateDir: first.stateDir,
      mainStateDir: first.mainStateDir,
    });
    expect(second.h.budgetReport().positions.used).toBe(1);
    second.h.consume({ positions: 1 }, 'assets');
    expect(refusal(() => second.h.consume({ positions: 1 }, 'assets'))?.limitKind).toBe('domain');
  });

  it('persists across two processes of the same run; the ledger entry equals budget.json', () => {
    const root = tempDir('procs');
    const stateDir = join(root, 'run');
    const ledgerPath = join(root, 'main', 'ledger.json');
    const script = childScript('consume.mts', CONSUME_CHILD);
    expect(runChild(script, [stateDir, ledgerPath, 'websocket', '1']).status).toBe(0);
    consumeUnits(target(stateDir, ledgerPath), { positions: 1 }, 'websocket');
    const third = runChild(script, [stateDir, ledgerPath, 'websocket', '1']);
    expect([third.status, third.stderr]).toEqual([1, 'BudgetExceeded']);
    expect(readBudgetFile(stateDir).counts.positions).toBe(2);
    expect(ledgerEntry(TEST_RUN_ID, { ledgerPath })?.counts).toEqual(
      readBudgetFile(stateDir).counts
    );
  }, 120_000);
});

describe('budgets: cumulative ledger', () => {
  function seedLedger(ledgerPath: string, counts: Partial<BudgetCounts>): void {
    recordLedger('other-run-1', 'integration', S_TIERS, counts, { ledgerPath });
  }

  it('an S run whose share would cross a cumulative cap is refused; an R or W run with the same totals is not', () => {
    const ledgerPath = join(tempDir('ledger'), 'ledger.json');
    seedLedger(ledgerPath, { positions: 55, notifications: 10 });
    const share = integrationShare([]);
    expect(share).toEqual({ positions: 6, notifications: 3, bleActions: 1, etlWrites: 1 });
    expect(integrationShare(['harness'])).toEqual({
      positions: 0,
      notifications: 0,
      bleActions: 0,
      etlWrites: 0,
    });
    expect(ledgerRefusal({ runId: TEST_RUN_ID, tiers: S_TIERS, share, ledgerPath })).toEqual([
      'positions',
    ]);
    for (const tiers of [
      { R: true, W: false, C: false, S: false },
      { R: true, W: true, C: true, S: false },
    ]) {
      expect(ledgerRefusal({ runId: TEST_RUN_ID, tiers, share, ledgerPath })).toEqual([]);
    }
    expect(
      ledgerRefusal({
        runId: TEST_RUN_ID,
        tiers: S_TIERS,
        share: integrationShare(['etl']),
        ledgerPath,
      })
    ).toEqual([]);
  });

  it('global setup refuses such an S run before any request (abort ledger-cap); a W run with the same totals starts', async () => {
    const api = new FakeApi().install();
    const start = (tiers: { W?: boolean; S?: boolean }, domains: DomainKey[] = []) => {
      const t = makeHarness({ tiers });
      seedLedger(t.h.ledgerPath, { positions: 55 });
      return startRun({
        runId: TEST_RUN_ID,
        stateDir: t.stateDir,
        createHarness: () => t.h,
        domains,
        processEnv: {},
        lockWait: { wait: false },
        sha: 'test-sha',
      }).then((run) => ({ run, t }));
    };
    const refused = await start({ W: true, S: true });
    expect(refused.run.abort).toBe('ledger-cap');
    expect(api.log).toEqual([]);
    expect(ledgerEntry(TEST_RUN_ID, { ledgerPath: refused.t.h.ledgerPath })).toBeNull();
    const report = await refused.run.finish();
    expect([report.abort, report.ok]).toEqual(['ledger-cap', false]);
    expect(api.log).toEqual([]);
    expect(existsSync(lockPaths(refused.t.mainStateDir).run)).toBe(false);
    // the share of an ETL-only S run (positions 0) fits next to the same totals
    const etlOnly = await start({ W: true, S: true }, ['etl']);
    expect(etlOnly.run.abort).toBeNull();
    await etlOnly.run.finish();
    const writes = await start({ W: true });
    expect(writes.run.abort).toBeNull();
    expect((await writes.run.finish()).ok).toBe(true);
  });

  it('each counted unit is in the ledger entry of its run before the request leaves', async () => {
    let atSend: number | undefined;
    const { h } = makeHarness({
      tiers: { S: true },
      fetchImpl: async () => {
        atSend = ledgerEntry(TEST_RUN_ID, { ledgerPath: h.ledgerPath })?.counts.positions;
        return new Response(null, { status: 201 });
      },
    });
    await inBlock(
      h,
      'S',
      () => guardedFetch(apiUrl('/publisher/{ns}'), jsonInit('POST', { user_udid: TEST_MAC })),
      'positions-spatial'
    );
    expect(atSend).toBe(1);
    expect(ledgerEntry(TEST_RUN_ID, { ledgerPath: h.ledgerPath })).toEqual(
      expect.objectContaining({
        kind: 'integration',
        tiers: { R: true, W: false, C: false, S: true },
      })
    );
  });

  it('a process killed after one publish leaves that position in the ledger', async () => {
    const root = tempDir('kill');
    const stateDir = join(root, 'run');
    const mainStateDir = join(root, 'main');
    let arrived: () => void = () => undefined;
    const requestArrived = new Promise<void>((resolveArrival) => {
      arrived = resolveArrival;
    });
    const server = createServer(() => arrived()); // never answers
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', () => done()));
    const { port } = server.address() as AddressInfo;
    const script = childScript(
      'publish.mts',
      `
import { setActiveHarness } from ${JSON.stringify(moduleUrl('active.ts'))};
import { blockStorage, createHarnessContext } from ${JSON.stringify(moduleUrl('context.ts'))};
import { makeLiveEnv } from ${JSON.stringify(moduleUrl('env.ts'))};
import { guardedFetch } from ${JSON.stringify(moduleUrl('guard.ts'))};
const [baseUrl, stateDir, mainStateDir] = process.argv.slice(2);
const env = makeLiveEnv({ apiKey: 'child-key', namespace: 'test-ns', baseUrl, tiers: { R: true, W: false, C: false, S: true } });
const verdicts = { ruleEngineSafe: true, positionSafe: true, declaredPositionSafe: true, linkedNamespaceSafe: true, linkedCount: 0, blocking: [] };
const h = createHarnessContext({ env, runId: ${JSON.stringify(TEST_RUN_ID)}, stateDir, mainStateDir, preflight: verdicts });
setActiveHarness(h);
const block = { id: 'child', tier: 'S', name: 'child', domain: 'positions-spatial' } as const;
h.blocks.push(block);
blockStorage.enterWith(block);
await guardedFetch(baseUrl + '/publisher/test-ns', { method: 'POST',
  headers: { 'X-API-Key': 'child-key', 'Content-Type': 'application/json' }, body: JSON.stringify({ user_udid: ${JSON.stringify(TEST_MAC)} }) });
`
    );
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', script, `http://127.0.0.1:${port}/api`, stateDir, mainStateDir],
      {
        cwd: REPO_ROOT,
        env: { PATH: process.env.PATH ?? '' },
        stdio: 'ignore',
      }
    );
    const exited = new Promise<NodeJS.Signals | null>((done) =>
      child.on('exit', (_code, signal) => done(signal))
    );
    try {
      await requestArrived;
      child.kill('SIGKILL');
      expect(await exited).toBe('SIGKILL');
    } finally {
      server.closeAllConnections();
      server.close();
    }
    const ledgerPath = join(mainStateDir, 'ledger.json');
    expect(ledgerEntry(TEST_RUN_ID, { ledgerPath })?.counts.positions).toBe(1);
    expect(readBudgetFile(stateDir).counts.positions).toBe(1);
  }, 120_000);

  it('teardown, a preload exit or a second process confirm the counts without adding', () => {
    const { h, stateDir } = makeHarness({ tiers: { S: true } });
    h.consume({ positions: 2 }, 'assets');
    const counts = readBudgetFile(stateDir).counts;
    recordLedger(TEST_RUN_ID, 'integration', S_TIERS, counts, { ledgerPath: h.ledgerPath });
    recordLedger(TEST_RUN_ID, 'integration', S_TIERS, counts, { ledgerPath: h.ledgerPath });
    recordLedger(
      TEST_RUN_ID,
      'integration',
      S_TIERS,
      { positions: 1 },
      { ledgerPath: h.ledgerPath }
    );
    expect(ledgerEntry(TEST_RUN_ID, { ledgerPath: h.ledgerPath })?.counts).toEqual(counts);
    expect(readLedger({ ledgerPath: h.ledgerPath }).runs).toHaveLength(1);
  });

  it('a unit that would take the ledger total over a cumulative cap is refused and not sent', async () => {
    const { h, calls, stateDir } = makeHarness({ tiers: { S: true } });
    seedLedger(h.ledgerPath, { positions: 60 });
    await inBlock(
      h,
      'S',
      async () => {
        await expect(
          guardedFetch(apiUrl('/publisher/{ns}'), jsonInit('POST', { user_udid: TEST_MAC }))
        ).rejects.toThrow(
          expect.objectContaining({ name: 'BudgetExceeded', limitKind: 'cumulative' })
        );
      },
      'positions-spatial'
    );
    expect(calls).toHaveLength(0);
    expect(readBudgetFile(stateDir).counts.positions).toBe(0);
    expect(ledgerEntry(TEST_RUN_ID, { ledgerPath: h.ledgerPath })).toBeNull();
  });

  it('two processes writing the ledger at once lose no update (ledger.json.lock)', async () => {
    const ledgerPath = join(tempDir('race'), 'ledger.json');
    const script = childScript(
      'race.mjs',
      `
import { recordLedger } from ${JSON.stringify(moduleUrl('ledger.mjs'))};
const [ledgerPath, tag] = process.argv.slice(2);
for (let i = 0; i < 40; i += 1) {
  recordLedger('run-' + tag + '-' + i, 'integration', { R: true, W: false, C: false, S: false }, { positions: 1 }, { ledgerPath });
}
`
    );
    const run = (tag: string): Promise<number | null> =>
      new Promise((done) => {
        const child = spawn(process.execPath, [script, ledgerPath, tag], {
          env: { PATH: process.env.PATH ?? '' },
          stdio: 'ignore',
        });
        child.on('exit', (code) => done(code));
      });
    expect(await Promise.all([run('a'), run('b')])).toEqual([0, 0]);
    const runs = readLedger({ ledgerPath }).runs;
    expect(runs).toHaveLength(80);
    expect(runs.reduce((n, r) => n + r.counts.positions, 0)).toBe(80);
  }, 120_000);
});
