import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setActiveHarness } from './active';
import { HarnessPrecondition } from './env';
import { FakeApi, selfItem } from './fake-api';
import { acquireRunLock, holdsReadSlot, lockPaths, newLockToken } from './lock.mjs';
import { testMac } from './names';
import { readJsonFileSync, writeJsonFileAtomicSync } from './state-io.mjs';
import { sweepCli } from './sweep-cli';
import { sweep, type SweepOptions } from './sweeper';
import {
  makeHarness,
  TEST_MAC,
  TEST_NS,
  TEST_RUN_ID,
  tempDir,
  type MakeHarnessOptions,
} from './unit-support';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..');
const moduleUrl = (name: string): string => pathToFileURL(join(HERE, name)).href;

/** An earlier run (crashed or finished), an active one, and the residue names of a run. */
const OLD = 'b0b0b0b0';
const OTHER = 'c0c0c0c0';
const ACTIVE = 'a1a1a1a1';
const TIERS = { R: true, W: true, C: false, S: false };
const name = (run: string, label: string): string => `sdk-test-${run}-${label}`;

let api: FakeApi;
let emptyAllowlist: string;
beforeEach(() => {
  api = new FakeApi().install();
  api.searchIgnoresQuery = true;
  emptyAllowlist = tempDir('allow');
});
afterEach(() => setActiveHarness(null));

function deadPid(): number {
  return spawnSync(process.execPath, ['-e', '0']).pid as number;
}

function world(tiers: MakeHarnessOptions['tiers'] = { W: true }) {
  const t = makeHarness({ tiers });
  const token = newLockToken();
  const runs = join(t.mainStateDir, 'runs');
  const registry = (runId: string, pid: number): void =>
    writeJsonFileAtomicSync(join(runs, `${runId}.json`), {
      pid,
      startedAt: '2026-01-01T00:00:00.000Z',
      domain: 'assets',
      tiers: TIERS,
    });
  const created = (runId: string, record: { ids?: string[]; macs?: string[] }): void =>
    writeJsonFileAtomicSync(join(runs, `${runId}.created.json`), { ids: [], macs: [], ...record });
  const run = async (options: Partial<SweepOptions> = {}) =>
    sweep({
      check: false,
      lockToken: token,
      allowlistDir: emptyAllowlist,
      configLockWait: { wait: false },
      ...options,
    });
  const lock = (): Promise<boolean> => acquireRunLock({ token, stateDir: t.mainStateDir });
  return { ...t, token, runs, registry, created, run, lock };
}

const writePaths = (): string[] => api.writes().map((r) => `${r.method} ${r.path}`);

describe('sweeper: targets and order', () => {
  it('finds and removes every target in order (documents before assets)', async () => {
    const w = world({ W: true, C: true });
    await w.lock();
    const mac = testMac(1, OLD);
    api.assets = [
      { user_udid: mac, user_name: name(OLD, 'asset') },
      { user_udid: 'aabbccddeeff', user_name: 'real' },
    ];
    api.documents.set(mac, [{ documentId: 'doc-1' }]);
    api.dashboards = [
      { _id: 'dash-1', name: name(OLD, 'dash'), application_namespace: TEST_NS, created: true },
      { _id: 'dash-2', name: 'Real', application_namespace: TEST_NS, created: true },
    ];
    api.notifications = [selfItem('item-1', name(OLD, 'dm'))];
    api.notificationRules = [
      { _id: 'rule-1', name: name(OLD, 'rule'), enabled: false },
      { _id: 'rule-2', name: 'Real' },
    ];
    api.savedViews = [
      { _id: 'view-1', name: 'sdk-example-view' },
      { _id: 'view-2', name: 'Mine' },
    ];
    api.recipientMappings = [
      { id: 'map_1', match: { event_types: [`sdk-test-${OLD}`] } },
      { id: 'map_2', match: { event_types: ['ALERT'] } },
    ];
    api.connections = [
      { _id: 'conn-1', channel: 'email' },
      { _id: 'conn-2', channel: 'slack' },
    ];
    api.etlProfiles = [
      { _id: 'etl-1', name: name(OLD, 'profile'), applicationId: TEST_NS },
      { _id: 'etl-2', name: name(OLD, 'elsewhere'), applicationId: 'other-ns' },
    ];
    api.alertRules = {
      name: 'Demo rules',
      rules: [
        { id: 'real', event: { type: 'message' } },
        { id: name(OLD, 'rule'), disabled: true },
      ],
    };
    w.created(OLD, { ids: ['conn-1'] });
    const result = await w.run({ fixConfig: true });
    expect(writePaths()).toEqual([
      `DELETE /assets/${TEST_NS}/${mac}/documents/doc-1`,
      `DELETE /assets/${TEST_NS}/${mac}`,
      'DELETE /dashboards/dash-1',
      `POST /notifications/${TEST_NS}/bulk`,
      `DELETE /notifications/${TEST_NS}/rules/rule-1`,
      `DELETE /notifications/${TEST_NS}/saved-views/view-1`,
      `DELETE /notifications/${TEST_NS}/recipient-mappings/map_1`,
      `DELETE /notifications/${TEST_NS}/connections/conn-1`,
      'DELETE /etl/mapping-profiles/etl-1',
      `POST /alert_rules/${TEST_NS}`,
    ]);
    expect(api.writes().find((r) => r.path.endsWith('/bulk'))?.body).toEqual({
      ids: ['item-1'],
      action: 'delete',
    });
    expect(result).toEqual(expect.objectContaining({ residue: [], removed: 10 }));
    expect(api.assets.map((a) => a.user_udid)).toEqual(['aabbccddeeff']);
    expect([api.dashboards, api.notificationRules, api.savedViews].map((l) => l.length)).toEqual([
      1, 1, 1,
    ]);
    expect(api.alertRules).toEqual({
      name: 'Demo rules',
      rules: [{ id: 'real', event: { type: 'message' } }],
    });
    expect(existsSync(join(w.runs, `${OLD}.created.json`))).toBe(false);
  });

  it('pages the inbox (limit 200) and deletes self-sent items in chunks of at most 500', async () => {
    const w = world();
    await w.lock();
    api.notifications = Array.from({ length: 601 }, (_, i) =>
      selfItem(`it-${i}`, name(OLD, `m${i}`))
    );
    const result = await w.run();
    const pages = api.log.filter(
      (r) => r.method === 'GET' && r.path === `/notifications/${TEST_NS}`
    );
    // the find reads four pages; the confirming find after the removal reads one (empty) page
    expect(pages.map((p) => p.query.offset)).toEqual(['0', '200', '400', '600', '0']);
    expect(pages[0]?.query).toEqual(
      expect.objectContaining({ group_by: 'flat', state: 'all', q: '"sdk-test"', limit: '200' })
    );
    const bulks = api.writes().filter((r) => r.path.endsWith('/bulk'));
    expect(bulks.map((b) => (b.body as { ids: string[] }).ids.length)).toEqual([500, 101]);
    expect([result.removed, api.notifications.length]).toEqual([601, 0]);
  });
});

describe('sweeper: --check and the CLI', () => {
  function cli(
    argv: string[],
    processEnv: NodeJS.ProcessEnv = {},
    t = makeHarness({ tiers: { W: true } })
  ) {
    const lines: string[] = [];
    const code = sweepCli(argv, {
      createHarness: () => t.h,
      processEnv,
      out: (l) => lines.push(l),
      err: (l) => lines.push(`ERR ${l}`),
      lockWait: { wait: false },
      sweepOptions: { allowlistDir: emptyAllowlist, configLockWait: { wait: false } },
    });
    return { code, lines, t };
  }

  it('`--check` exits 1 on residue, 0 when clean, and changes nothing', async () => {
    api.assets = [{ user_udid: testMac(2, OLD) }];
    const dirty = cli(['--check']);
    expect(await dirty.code).toBe(1);
    expect(dirty.lines).toContain(`residue assets ${testMac(2, OLD)}`);
    expect(api.writes()).toEqual([]);
    api.assets = [];
    expect(await cli(['--check']).code).toBe(0);
  });

  it('`--check` output holds targets and ids only, never content', async () => {
    const secret = 'ops@example.org';
    api.alertRules = {
      name: 'Demo rules',
      rules: [
        {
          id: name(OLD, 'rule'),
          disabled: true,
          event: { type: 'post_to_email', params: { receiver: secret } },
        },
      ],
    };
    api.notifications = [selfItem('item-9', `${name(OLD, 'dm')} body ${secret}`)];
    const run = cli(['--check']);
    expect(await run.code).toBe(1);
    const text = run.lines.join('\n');
    expect(text).not.toContain(secret);
    expect(text).not.toContain('Demo rules');
    expect(run.lines.filter((l) => l.startsWith('residue'))).toEqual([
      'residue notification-items item-9',
      `residue alert-rules ${name(OLD, 'rule')}`,
    ]);
  });

  it('accepted residue is listed separately, not as residue', async () => {
    const allow = tempDir('allow');
    writeFileSync(
      join(allow, 'P7.json'),
      JSON.stringify({
        phase: 'P7',
        entries: [],
        residue: [
          {
            kind: 'etl-mapping-profiles',
            match: 'etl-keep',
            perRun: false,
            category: 'non-removable',
            reason: 'stored import rows are kept by the server',
          },
        ],
      })
    );
    api.etlProfiles = [{ _id: 'etl-keep-1', name: name(OLD, 'p'), applicationId: TEST_NS }];
    makeHarness();
    const result = await sweep({ check: true, allowlistDir: allow });
    expect(result.residue).toEqual([]);
    expect(result.accepted).toEqual([{ kind: 'etl-mapping-profiles', match: 'etl-keep' }]);
  });

  it('removal without RTLS_IT_WRITES is refused, and without the run lock refused', async () => {
    // the run lock is held with the token, but RTLS_IT_WRITES is not set
    const noWrites = world({});
    await noWrites.lock();
    await expect(noWrites.run()).rejects.toThrow(HarnessPrecondition);
    await expect(noWrites.run()).rejects.toThrow(/RTLS_IT_WRITES/);
    const w = world();
    await expect(w.run()).rejects.toThrow(/run lock/);
    expect(api.log).toEqual([]);
    // the CLI exits 2 before any request
    expect(await cli([], {}, makeHarness({ tiers: {} })).code).toBe(2);
    expect(api.log).toEqual([]);
  });

  it('sweep-cli --check without a token holds a read slot while it runs; with a run-lock token it takes none', async () => {
    api.assets = [];
    const t = makeHarness({ tiers: { W: true } });
    const slot0 = lockPaths(t.mainStateDir).readSlots[0];
    const seen: boolean[] = [];
    api.onRequest = () => seen.push(existsSync(slot0));
    const free = cli(['--check'], {}, t);
    expect(await free.code).toBe(0);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every(Boolean)).toBe(true);
    expect(existsSync(slot0)).toBe(false);

    const token = newLockToken();
    await acquireRunLock({ token, stateDir: t.mainStateDir });
    seen.length = 0;
    api.onRequest = () =>
      seen.push(existsSync(slot0) || holdsReadSlot(token, { stateDir: t.mainStateDir }));
    expect(await cli(['--check'], { RTLS_IT_INTERNAL_LOCK_TOKEN: token }, t).code).toBe(0);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.some(Boolean)).toBe(false);
  });
});

describe('sweeper: a listing that cannot be read is a failure, never "no residue"', () => {
  function cli(argv: string[], t = makeHarness({ tiers: { W: true } })) {
    const lines: string[] = [];
    const code = sweepCli(argv, {
      createHarness: () => t.h,
      processEnv: {},
      out: (l) => lines.push(l),
      err: (l) => lines.push(`ERR ${l}`),
      lockWait: { wait: false },
      sweepOptions: { allowlistDir: emptyAllowlist, configLockWait: { wait: false } },
    });
    return { code, lines };
  }

  it('assets 503: --check exits 1 and names the unreadable listing (the test-MAC asset is not "gone")', async () => {
    api.assets = [{ user_udid: TEST_MAC }];
    const readable = cli(['--check']);
    expect(await readable.code).toBe(1);
    expect(readable.lines).toContain(`residue assets ${TEST_MAC}`);
    api.status.assets = 503;
    const unreadable = cli(['--check']);
    expect(await unreadable.code).toBe(1);
    expect(unreadable.lines).toContain('unreadable assets status 503');
    expect(unreadable.lines.at(-1)).toMatch(/0 residue, 1 unreadable/);
    makeHarness();
    const result = await sweep({ check: true, allowlistDir: emptyAllowlist });
    expect([result.residue, result.readFailures]).toEqual([
      [],
      [{ target: 'assets', status: 503 }],
    ]);
  });

  it('cleanup-policy 403, a document listing 500 and alert rules 500 each fail --check', async () => {
    const mac = testMac(4, OLD);
    const w = world();
    w.created(OLD, { macs: [mac] });
    api.status = { cleanupPolicy: 403, documents: 500, alertRules: 500 };
    expect(await cli(['--check'], w).code).toBe(1);
    setActiveHarness(w.h);
    const result = await sweep({ check: true, allowlistDir: emptyAllowlist });
    expect(result.residue).toEqual([]);
    expect(result.readFailures).toEqual([
      { target: 'asset-documents', status: 500 },
      { target: 'cleanup-policy', status: 403 },
      { target: 'alert-rules', status: 500 },
    ]);
    // every other listing still counts: a clean namespace passes
    api.status = {};
    expect(await cli(['--check'], w).code).toBe(0);
  });

  it('a removal pass whose confirming find cannot read the connections keeps the created record and the entry', async () => {
    const w = world();
    await w.lock();
    w.registry(OLD, deadPid());
    w.created(OLD, { ids: ['conn-5'] });
    api.connections = [{ _id: 'conn-5', channel: 'email' }];
    // the listing fails only after the removal, so the confirming find is the one that cannot read it
    api.onRequest = (r) => {
      if (r.method === 'DELETE' && r.path.endsWith('/connections/conn-5'))
        api.status.connections = 500;
    };
    const result = await w.run();
    expect(writePaths()).toEqual([`DELETE /notifications/${TEST_NS}/connections/conn-5`]);
    expect(api.connections).toEqual([]);
    expect(result.readFailures).toEqual([{ target: 'connections', status: 500 }]);
    expect([
      existsSync(join(w.runs, `${OLD}.created.json`)),
      existsSync(join(w.runs, `${OLD}.json`)),
    ]).toEqual([true, true]);
    // a later pass that reads every listing confirms and deletes both
    api.onRequest = null;
    api.status = {};
    const next = await w.run();
    expect(next.readFailures).toEqual([]);
    expect([
      existsSync(join(w.runs, `${OLD}.created.json`)),
      existsSync(join(w.runs, `${OLD}.json`)),
    ]).toEqual([false, false]);
  });

  it('the CLI removal pass exits 1 when the confirming find had a read failure', async () => {
    const t = makeHarness({ tiers: { W: true } });
    api.assets = [{ user_udid: testMac(6, OLD) }];
    api.onRequest = (r) => {
      if (r.method === 'DELETE') api.status.etlProfiles = 503;
    };
    const run = cli([], t);
    expect(await run.code).toBe(1);
    expect(run.lines).toContain('unreadable etl-mapping-profiles status 503');
    expect(api.assets).toEqual([]);
  });
});

describe('sweeper: runs, registry and created records', () => {
  it('a run whose registry entry has a live pid is skipped; --force removes', async () => {
    const w = world();
    await w.lock();
    w.registry(ACTIVE, process.pid);
    api.assets = [{ user_udid: testMac(1, ACTIVE) }];
    const skipped = await w.run();
    expect([skipped.residue, skipped.skippedRuns, api.writes()]).toEqual([[], [ACTIVE], []]);
    const forced = await w.run({ force: true });
    expect(writePaths()).toEqual([`DELETE /assets/${TEST_NS}/${testMac(1, ACTIVE)}`]);
    expect(forced.residue).toEqual([]);
    // an active run keeps its registry entry
    expect(existsSync(join(w.runs, `${ACTIVE}.json`))).toBe(true);
  });

  it('a dead-pid entry is not skipped, is listed by --check, and is deleted after a pass that leaves none of its residue', async () => {
    const w = world();
    await w.lock();
    w.registry(OLD, deadPid());
    w.created(OLD, { ids: ['view-7'], macs: [testMac(3, OLD)] });
    api.assets = [{ user_udid: testMac(3, OLD) }];
    api.savedViews = [{ _id: 'view-7', name: 'renamed by the test' }];
    const check = await sweep({ check: true, allowlistDir: emptyAllowlist });
    expect(check.crashedRuns).toEqual([OLD]);
    expect(check.residue.map((r) => r.target)).toEqual(['assets', 'saved-views']);
    const removal = await w.run();
    expect(removal.residue).toEqual([]);
    expect(existsSync(join(w.runs, `${OLD}.json`))).toBe(false);
    expect(existsSync(join(w.runs, `${OLD}.created.json`))).toBe(false);
  });

  it('a saved view whose _id is in a created record is removed whatever its name', async () => {
    const w = world();
    await w.lock();
    w.created(OTHER, { ids: ['view-3'] });
    api.savedViews = [
      { _id: 'view-3', name: 'No prefix at all' },
      { _id: 'view-4', name: 'No prefix at all' },
    ];
    await w.run();
    expect(api.savedViews).toEqual([{ _id: 'view-4', name: 'No prefix at all' }]);
  });

  it('a connection recorded by a run of another worktree is removed from the main checkout; a record whose residue stays is kept', async () => {
    const w = world();
    await w.lock();
    // OLD started in another worktree: its per-run state folder is elsewhere, its records are in the main checkout
    w.registry(OLD, deadPid());
    w.created(OLD, { ids: ['conn-9'] });
    w.registry(OTHER, deadPid());
    w.created(OTHER, { ids: ['map_77'] });
    api.connections = [{ _id: 'conn-9', channel: 'email' }];
    api.recipientMappings = [{ id: 'map_77', match: { event_types: [`sdk-test-${OTHER}`] } }];
    const result = await w.run();
    expect(api.connections).toEqual([]);
    expect([
      existsSync(join(w.runs, `${OLD}.created.json`)),
      existsSync(join(w.runs, `${OLD}.json`)),
    ]).toEqual([false, false]);
    // the mapping needs RTLS_IT_CONFIG: it stays, and so do OTHER's record and entry
    expect(result.residue).toEqual([{ target: 'recipient-mappings', id: 'map_77' }]);
    expect([
      existsSync(join(w.runs, `${OTHER}.created.json`)),
      existsSync(join(w.runs, `${OTHER}.json`)),
    ]).toEqual([true, true]);
  });

  it('a document on a MAC listed in a created record whose asset is already deleted is found and removed', async () => {
    const w = world();
    await w.lock();
    const mac = testMac(9, OLD);
    w.created(OLD, { macs: [mac] });
    api.documents.set(mac, [{ documentId: 'doc-orphan' }]);
    const result = await w.run();
    expect(writePaths()).toEqual([`DELETE /assets/${TEST_NS}/${mac}/documents/doc-orphan`]);
    expect(result.residue).toEqual([]);
  });

  it('own-run sweep (runId + force) touches only that run and deletes its created record when clean', async () => {
    const w = world();
    await w.lock();
    w.registry(TEST_RUN_ID, process.pid);
    w.created(TEST_RUN_ID, { macs: [TEST_MAC] });
    api.assets = [{ user_udid: TEST_MAC }, { user_udid: testMac(1, OLD) }];
    const result = await w.run({ runId: TEST_RUN_ID, force: true });
    expect(writePaths()).toEqual([`DELETE /assets/${TEST_NS}/${TEST_MAC}`]);
    expect(result.residue).toEqual([]);
    expect(existsSync(join(w.runs, `${TEST_RUN_ID}.created.json`))).toBe(false);
    expect(existsSync(join(w.runs, `${TEST_RUN_ID}.json`))).toBe(true);
  });

  it('the guard writes a tracked id to the created record before the response reaches the caller (killed process)', async () => {
    const root = tempDir('kill');
    const stateDir = join(root, 'run');
    const mainStateDir = join(root, 'main');
    mkdirSync(stateDir, { recursive: true });
    const server = createServer((_req, res) => {
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ _id: 'view-killed' }));
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', () => done()));
    const { port } = server.address() as AddressInfo;
    const script = join(tempDir('child'), 'create.mts');
    writeFileSync(
      script,
      `
import { setActiveHarness } from ${JSON.stringify(moduleUrl('active.ts'))};
import { blockStorage, createHarnessContext } from ${JSON.stringify(moduleUrl('context.ts'))};
import { makeLiveEnv } from ${JSON.stringify(moduleUrl('env.ts'))};
import { guardedFetch } from ${JSON.stringify(moduleUrl('guard.ts'))};
const [baseUrl, stateDir, mainStateDir] = process.argv.slice(2);
const env = makeLiveEnv({ apiKey: 'child-key', namespace: 'test-ns', baseUrl, tiers: { R: true, W: true, C: false, S: false } });
const h = createHarnessContext({ env, runId: ${JSON.stringify(TEST_RUN_ID)}, stateDir, mainStateDir, preflight: null });
setActiveHarness(h);
const block = { id: 'child', tier: 'W', name: 'child', domain: 'notifications' } as const;
h.blocks.push(block);
blockStorage.enterWith(block);
await guardedFetch(baseUrl + '/notifications/test-ns/saved-views', { method: 'POST',
  headers: { 'X-API-Key': 'child-key', 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'sdk-test-${TEST_RUN_ID}-view', query: {} }) });
process.kill(process.pid, 'SIGKILL');
`
    );
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', script, `http://127.0.0.1:${port}/api`, stateDir, mainStateDir],
      { cwd: REPO_ROOT, env: { PATH: process.env.PATH ?? '' }, stdio: 'ignore' }
    );
    const signal = await new Promise<NodeJS.Signals | null>((done) =>
      child.on('exit', (_c, s) => done(s))
    );
    server.close();
    expect(signal).toBe('SIGKILL');
    expect(
      readJsonFileSync(join(mainStateDir, 'runs', `${TEST_RUN_ID}.created.json`), null)
    ).toEqual({
      ids: ['view-killed'],
      macs: [],
    });
  }, 120_000);
});

describe('sweeper: report-only targets', () => {
  it('a dashboard of another namespace is ignored', async () => {
    const w = world();
    await w.lock();
    api.dashboards = [
      { _id: 'dash-x', name: name(OLD, 'd'), application_namespace: 'other-ns', created: true },
    ];
    const result = await w.run();
    expect([result.residue, api.writes()]).toEqual([[], []]);
  });

  it('an asset outside the test range named sdk-test- is reported, never deleted', async () => {
    const w = world();
    await w.lock();
    api.assets = [
      { user_udid: 'aabbccddeeff', user_name: name(OLD, 'misnamed') },
      { user_udid: '112233445566', external_id: 'sdk-test-x' },
    ];
    const result = await w.run();
    expect(result.residue).toEqual([
      { target: 'assets-outside-test-range', id: 'aabbccddeeff' },
      { target: 'assets-outside-test-range', id: '112233445566' },
    ]);
    expect(api.writes()).toEqual([]);
    expect(api.assets).toHaveLength(2);
  });

  it('inbox items: only items the own user sent to itself with an sdk-test- title are selected', async () => {
    api.notifications = [
      selfItem('i-ok', name(OLD, 'dm')),
      selfItem('i-src', name(OLD, 'dm'), { source_ref: 'user:someone-else' }),
      selfItem('i-user', name(OLD, 'dm'), { user_id: 'someone-else' }),
      selfItem('i-example', 'sdk-example-greeting'),
      selfItem('i-alert', name(OLD, 'alert'), { kind: 'alert' }),
      selfItem('i-plain', 'hello'),
    ];
    makeHarness();
    const result = await sweep({ check: true, allowlistDir: emptyAllowlist });
    expect(result.residue).toEqual([
      { target: 'notification-items', id: 'i-ok' },
      { target: 'notification-items', id: 'i-alert' },
    ]);
    // the self id comes from the cleanup policy (`user_id`)
    expect(api.log.filter((r) => r.path.endsWith('/cleanup-policy')).map((r) => r.method)).toEqual([
      'GET',
    ]);
  });

  it('recipient mappings are report-only without RTLS_IT_CONFIG, removed with it under the config lock', async () => {
    const w = world();
    await w.lock();
    api.recipientMappings = [{ id: 'map_5', match: { event_types: [name(OLD, 'evt')] } }];
    const without = await w.run();
    expect([without.residue, api.writes()]).toEqual([
      [{ target: 'recipient-mappings', id: 'map_5' }],
      [],
    ]);
    const c = world({ W: true, C: true });
    await c.lock();
    let configLockHeld = false;
    api.onRequest = (r) => {
      if (r.method === 'DELETE') configLockHeld = existsSync(lockPaths(c.mainStateDir).config);
    };
    const withConfig = await c.run();
    expect([withConfig.residue, configLockHeld, api.recipientMappings]).toEqual([[], true, []]);
    expect(existsSync(lockPaths(c.mainStateDir).config)).toBe(false);
  });

  it('alert rules: report-only without --fix-config; with it one write of the document minus the disabled sdk-test- rules', async () => {
    const real = { id: 'real', conditions: { all: [] }, event: { type: 'message' } };
    const doc = {
      name: 'Demo rules',
      rules: [
        real,
        { id: name(OLD, 'a'), disabled: true },
        { id: name(OTHER, 'b'), disabled: true },
      ],
    };
    api.alertRules = structuredClone(doc);
    const w = world({ W: true, C: true });
    await w.lock();
    const reportOnly = await w.run();
    expect(reportOnly.residue.map((r) => r.id)).toEqual([name(OLD, 'a'), name(OTHER, 'b')]);
    expect(api.writes()).toEqual([]);
    const fixed = await w.run({ fixConfig: true });
    expect(api.writes()).toEqual([
      expect.objectContaining({
        method: 'POST',
        path: `/alert_rules/${TEST_NS}`,
        body: { name: 'Demo rules', rules: [real] },
      }),
    ]);
    expect([fixed.residue, fixed.removed]).toEqual([[], 2]);
    // the cycle's before-image is kept in the sweeper's own state folder
    expect(
      readJsonFileSync(join(w.stateDir, 'sweeper', 'config', 'alert-rules.before.json'), null)
    ).toEqual(doc);
  });

  it('alert rules: an enabled sdk-test- rule → no write', async () => {
    api.alertRules = {
      name: 'Demo rules',
      rules: [{ id: name(OLD, 'a'), disabled: true }, { id: name(OLD, 'b') }],
    };
    const w = world({ W: true, C: true });
    await w.lock();
    const result = await w.run({ fixConfig: true });
    expect(api.writes()).toEqual([]);
    expect(result.residue).toHaveLength(2);
  });

  it('alert rules: a write the server does not apply is restored and the residue stays', async () => {
    const doc = { name: 'Demo rules', rules: [{ id: name(OLD, 'a'), disabled: true }] };
    api.alertRules = structuredClone(doc);
    let writes = 0;
    api.alertRulesWriteTransform = (body) => {
      writes += 1;
      return writes === 1 ? { ...(body as object), name: 'mangled' } : body;
    };
    const w = world({ W: true, C: true });
    await w.lock();
    const result = await w.run({ fixConfig: true });
    expect(api.writes()).toHaveLength(2);
    expect(api.alertRules).toEqual(doc);
    expect(result.residue).toEqual([{ target: 'alert-rules', id: name(OLD, 'a') }]);
  });
});
