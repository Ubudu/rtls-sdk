import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setActiveHarness } from './active';
import type { Harness } from './context';
import { ContextMissing } from './env';
import { FakeApi } from './fake-api';
import { startRun } from './global-setup';
import { acquireRunLock, holdsReadSlot, lockPaths, newLockToken } from './lock.mjs';
import { snapshotCli } from './snapshot-cli';
import {
  compareSnapshots,
  stateDiffOf,
  type CompareOptions,
  takeSnapshot,
  type StateDifference,
  type StateSnapshot,
} from './state';
import { writeJsonFileAtomicSync } from './state-io.mjs';
import { makeHarness, RUN_PREFIX, TEST_MAC, TEST_NS, TEST_RUN_ID, tempDir } from './unit-support';

const OWN = { prefix: RUN_PREFIX };
let api: FakeApi;

beforeEach(() => {
  api = new FakeApi().install();
  api.assets = [
    { user_udid: 'aabbccddeeff', user_name: 'forklift 1', dateChanged: 1 },
    { user_udid: '112233445566', user_name: 'forklift 2', dateChanged: 1 },
  ];
  api.dashboards = [{ _id: 'd1', name: 'Ops', application_namespace: TEST_NS }];
  api.alertRules = {
    name: 'Demo rules',
    rules: [{ id: 'r1', conditions: { all: [] }, event: { type: 'message' } }],
  };
  api.notificationRules = [{ _id: 'n1', name: 'forwarding', enabled: true }];
});
afterEach(() => setActiveHarness(null));

async function image(h?: Harness): Promise<StateSnapshot> {
  return takeSnapshot(h ?? makeHarness().h);
}

async function diffAfter(
  change: () => void,
  options: CompareOptions = OWN
): Promise<StateDifference[]> {
  const { h } = makeHarness();
  const before = await takeSnapshot(h);
  change();
  return compareSnapshots(before, await takeSnapshot(h), options);
}

describe('state snapshot: comparison rules', () => {
  it('reads the eleven items and an unchanged namespace gives no difference', async () => {
    const before = await image();
    expect(Object.keys(before.items)).toHaveLength(11);
    expect(compareSnapshots(before, await image(), OWN)).toEqual([]);
  });

  it('is key-order-insensitive (deep items)', async () => {
    api.settings = { a: 1, b: { c: [1, 2], d: 'x' } };
    expect(await diffAfter(() => (api.settings = { b: { d: 'x', c: [1, 2] }, a: 1 }))).toEqual([]);
    const changed = await diffAfter(() => (api.settings = { a: 1, b: { c: [2, 1], d: 'x' } }));
    expect(changed.map((d) => `${d.key} ${d.path}`)).toEqual([
      'settings b.c[0]',
      'settings b.c[1]',
    ]);
  });

  it('ignores updated_at, updatedAt and __v of the cleanup policy and the tenant config', async () => {
    api.cleanupPolicy = { _id: 'p', auto_archive_days: 30, updated_at: 1, __v: 0 };
    api.tenantConfig = { app_namespace: TEST_NS, email: { updatedAt: 'a' } };
    expect(
      await diffAfter(() => {
        api.cleanupPolicy = { _id: 'p', auto_archive_days: 30, updated_at: 2, __v: 1 };
        api.tenantConfig = { app_namespace: TEST_NS, email: { updatedAt: 'b' } };
      })
    ).toEqual([]);
    const changed = await diffAfter(() => {
      api.cleanupPolicy = { _id: 'p', auto_archive_days: 31, updated_at: 3 };
    });
    expect(changed.map((d) => d.path)).toEqual(['auto_archive_days']);
  });

  it('dashboards: sdk-test- names and other namespaces are ignored; another dashboard is a difference', async () => {
    expect(
      await diffAfter(
        () => {
          api.dashboards.push({
            _id: 'd2',
            name: 'sdk-test-0badf00d-x',
            application_namespace: TEST_NS,
          });
          api.dashboards.push({ _id: 'd3', name: 'Other', application_namespace: 'other-ns' });
        },
        { prefix: 'sdk-test-' }
      )
    ).toEqual([]);
    const added = await diffAfter(() =>
      api.dashboards.push({ _id: 'd4', name: 'Ops 2', application_namespace: TEST_NS })
    );
    expect(added).toEqual([{ key: 'dashboards', path: '[d4]', afterHash: expect.any(String) }]);
  });

  it('assets: dateChanged is not a difference; an added or removed non-test MAC is; a test-range MAC is not', async () => {
    expect(
      await diffAfter(() => {
        api.assets[0] = { ...api.assets[0], dateChanged: 99, user_data: { battery: 3 } };
        api.assets.push({ user_udid: '025d4b0bad01', user_name: 'sdk-test-0bad0bad-a' });
      })
    ).toEqual([]);
    const added = await diffAfter(() => api.assets.push({ user_udid: 'a1a2a3a4a5a6' }));
    expect(added.map((d) => d.path).sort()).toEqual(['count', 'hash']);
    const removed = await diffAfter(() => api.assets.splice(1, 1));
    expect(removed.map((d) => `${d.key} ${d.path}`).sort()).toEqual([
      'assets count',
      'assets hash',
    ]);
    // replaced by another non-test MAC: same count, different set
    const replaced = await diffAfter(() => {
      const i = api.assets.findIndex((a) => a.user_udid === 'a1a2a3a4a5a6');
      api.assets[i] = { user_udid: 'b1b2b3b4b5b6' };
    });
    expect(replaced.map((d) => d.path)).toEqual(['hash']);
  });

  it("the run's own rule, alert rule, recipient mappings and recorded connection id are excluded", async () => {
    const created = new Set(['conn-own', 'map-own-2']);
    const diffs = await diffAfter(
      () => {
        api.notificationRules.push({ _id: 'n2', name: `${RUN_PREFIX}rule`, enabled: false });
        (api.alertRules as { rules: unknown[] }).rules.push({
          id: `${RUN_PREFIX}a`,
          disabled: true,
        });
        api.recipientMappings.push({
          id: 'map_1',
          match: { event_types: [`sdk-test-${TEST_RUN_ID}`] },
        });
        api.recipientMappings.push({ id: 'map_2', match: { event_types: [`${RUN_PREFIX}evt`] } });
        api.recipientMappings.push({ id: 'map-own-2', match: { event_types: ['ALERT'] } });
        api.connections.push({ _id: 'conn-own', channel: 'email' });
        api.savedViews.push({ _id: 'v1', name: `${RUN_PREFIX}view` });
      },
      { prefix: RUN_PREFIX, createdIds: created }
    );
    expect(diffs).toEqual([]);
    // another run's entities are not excluded by this run's prefix
    const foreign = await diffAfter(() => {
      api.notificationRules.push({ _id: 'n3', name: 'sdk-test-0badf00d-rule', enabled: false });
      api.recipientMappings.push({ id: 'map_3', match: { event_types: ['sdk-test-0badf00d'] } });
    });
    expect(foreign.map((d) => `${d.key} ${d.path}`)).toEqual([
      'notificationRules [n3]',
      'recipientMappings [map_3]',
    ]);
  });

  it('a saved view, connection or recipient mapping replaced by another id (same count) is a difference', async () => {
    api.savedViews = [{ _id: 'v1', name: 'mine' }];
    api.connections = [{ _id: 'c1', channel: 'email' }];
    api.recipientMappings = [{ id: 'map_1', match: { event_types: ['ALERT'] } }];
    const diffs = await diffAfter(() => {
      api.savedViews = [{ _id: 'v2', name: 'mine' }];
      api.connections = [{ _id: 'c2', channel: 'email' }];
      api.recipientMappings = [{ id: 'map_2', match: { event_types: ['ALERT'] } }];
    });
    expect(diffs.map((d) => `${d.key} ${d.path}`)).toEqual([
      'savedViews [v1]',
      'savedViews [v2]',
      'connections [c1]',
      'connections [c2]',
      'recipientMappings [map_1]',
      'recipientMappings [map_2]',
    ]);
  });

  it('notification rules compare `enabled`; ETL profiles compare `updated_at`', async () => {
    api.etlProfiles = [{ _id: 'e1', name: 'Import', updated_at: 'u1', applicationId: TEST_NS }];
    const diffs = await diffAfter(() => {
      api.notificationRules[0] = { ...api.notificationRules[0], enabled: false, description: 'x' };
      api.etlProfiles[0] = { ...api.etlProfiles[0], updated_at: 'u2' };
    });
    expect(diffs.map((d) => `${d.key} ${d.path}`)).toEqual([
      'notificationRules [n1].enabled',
      'etlProfiles [e1].updated_at',
    ]);
  });

  it('a 403 tenant config and recipient-mapping list are compared by status only', async () => {
    api.status = { tenantConfig: 403, recipientMappings: 403 };
    const diffs = await diffAfter(() => {
      api.tenantConfig = { app_namespace: TEST_NS, changed: true };
      api.recipientMappings.push({ id: 'map_9' });
    });
    expect(diffs).toEqual([]);
    const before = await image();
    api.status = {};
    const after = await image();
    expect(compareSnapshots(before, after, OWN).map((d) => `${d.key} ${d.path}`)).toEqual([
      'tenantConfig status',
      'recipientMappings status',
    ]);
    expect(before.items.tenantConfig).toEqual({ status: 403 });
  });

  it('a difference output contains no value substring', async () => {
    const email = 'night-shift@example.org';
    const hex40 = 'a'.repeat(40);
    api.alertRules = {
      name: 'Demo rules',
      rules: [
        { id: 'r1', event: { type: 'post_to_email', params: { receiver: email, key: hex40 } } },
      ],
    };
    const diffs = await diffAfter(() => {
      api.alertRules = {
        name: 'Demo rules',
        rules: [
          {
            id: 'r1',
            event: { type: 'post_to_email', params: { receiver: `x${email}`, key: `b${hex40}` } },
          },
        ],
      };
      api.settings = { secret: email };
    });
    expect(diffs.length).toBeGreaterThan(0);
    const text = JSON.stringify(diffs);
    expect(text).not.toContain(email);
    expect(text).not.toContain(hex40);
    expect(text).not.toContain('night-shift');
    expect(
      diffs.every((d) =>
        Object.keys(d).every((k) => ['key', 'path', 'beforeHash', 'afterHash'].includes(k))
      )
    ).toBe(true);
  });

  it('stateDiffOf: none without differences, unexpected with the run lock, foreign without it', () => {
    const d = [{ key: 'settings', path: 'a' }];
    expect([stateDiffOf([], true), stateDiffOf(d, true), stateDiffOf(d, false)]).toEqual([
      'none',
      'unexpected',
      'foreign',
    ]);
  });
});

describe('state comparison in a run (global teardown)', () => {
  async function runWith(tiers: { W?: boolean }, change: () => void) {
    const { h, stateDir, mainStateDir } = makeHarness({ tiers, preflight: undefined });
    const run = await startRun({
      runId: TEST_RUN_ID,
      stateDir,
      createHarness: () => h,
      processEnv: {},
      lockWait: { wait: false },
      sha: 'test-sha',
    });
    change();
    const report = await run.finish();
    return { report, stateDir, mainStateDir };
  }

  it('a difference with the run lock held → stateDiff unexpected and the run fails', async () => {
    const { report, stateDir } = await runWith({ W: true }, () =>
      api.dashboards.push({ _id: 'd9', name: 'Real', application_namespace: TEST_NS })
    );
    expect([report.stateDiff, report.ok]).toEqual(['unexpected', false]);
    expect(report.state.differences).toEqual([
      { key: 'dashboards', path: '[d9]', afterHash: expect.any(String) },
    ]);
    expect(existsSync(join(stateDir, 'before.json'))).toBe(true);
    expect(existsSync(join(stateDir, 'after.json'))).toBe(true);
  });

  it('the same difference in a tier-R-only run → stateDiff foreign and the run stays ok', async () => {
    const { report } = await runWith({}, () =>
      api.dashboards.push({ _id: 'd9', name: 'Real', application_namespace: TEST_NS })
    );
    expect([report.stateDiff, report.ok]).toEqual(['foreign', true]);
  });

  it("a recipient-mapping id listed in this run's created record is excluded", async () => {
    const t = makeHarness({ tiers: { W: true } });
    const run = await startRun({
      runId: TEST_RUN_ID,
      stateDir: t.stateDir,
      createHarness: () => t.h,
      processEnv: {},
      lockWait: { wait: false },
      sha: 'test-sha',
    });
    // the guard wrote both ids to runs/<runId>.created.json (main checkout) when they were created
    writeJsonFileAtomicSync(join(t.mainStateDir, 'runs', `${TEST_RUN_ID}.created.json`), {
      ids: ['map_43', 'conn-2'],
      macs: [TEST_MAC],
    });
    api.recipientMappings.push({ id: 'map_43', match: { event_types: ['ALERT'] } });
    api.connections.push({ _id: 'conn-2', channel: 'email' });
    const report = await run.finish();
    // excluded from the comparison: no state difference
    expect([report.stateDiff, report.state.differences]).toEqual(['none', []]);
    // the own-run sweep removed the connection; the mapping needs tier C, so it is residue and fails the run
    expect(api.connections).toEqual([]);
    expect(report.cleanup.failed).toEqual([{ label: 'residue recipient-mappings map_43' }]);
    expect(report.ok).toBe(false);
  });
});

describe('snapshot CLI (test:integration:snapshot)', () => {
  function cli(argv: string[], extra: { processEnv?: NodeJS.ProcessEnv; root?: string } = {}) {
    const root = extra.root ?? tempDir('snap');
    const lines: string[] = [];
    const t = makeHarness();
    const run = snapshotCli(argv, {
      createHarness: () => t.h,
      stateRoot: root,
      processEnv: extra.processEnv ?? {},
      out: (l) => lines.push(l),
      err: (l) => lines.push(`ERR ${l}`),
      slotWait: { wait: false },
    });
    return { run, lines, root, mainStateDir: t.mainStateDir };
  }

  it('writes the image under <state>/<label>/ and compares: 0 equal, 1 on a difference outside sdk-test- entities', async () => {
    const first = cli(['--label', 'p0-before']);
    expect(await first.run).toBe(0);
    expect(existsSync(join(first.root, 'p0-before', 'snapshot.json'))).toBe(true);
    const equal = cli(['--label', 'p0-after', '--compare', 'p0-before'], { root: first.root });
    expect(await equal.run).toBe(0);
    expect(equal.lines.at(-1)).toBe('compare p0-before -> p0-after: 0 difference(s)');
    api.notificationRules.push({ _id: 'n7', name: 'sdk-test-0badf00d-x', enabled: false });
    expect(
      await cli(['--label', 'p0-sdk', '--compare', 'p0-before'], { root: first.root }).run
    ).toBe(0);
    api.notificationRules.push({ _id: 'n8', name: 'real rule', enabled: true });
    const differ = cli(['--label', 'p0-real', '--compare', 'p0-before'], { root: first.root });
    expect(await differ.run).toBe(1);
    expect(differ.lines).toContain('difference notificationRules [n8]');
    expect(differ.lines.join('\n')).not.toContain('real rule');
  });

  it('holds a read slot while it runs and frees it; a token holding the run lock takes none', async () => {
    const seen: boolean[] = [];
    const run = cli(['--label', 'slot']);
    api.onRequest = () => seen.push(existsSync(lockPaths(run.mainStateDir).readSlots[0]));
    expect(await run.run).toBe(0);
    expect(seen.length).toBe(11);
    expect(seen.every(Boolean)).toBe(true);
    expect(existsSync(lockPaths(run.mainStateDir).readSlots[0])).toBe(false);

    const token = newLockToken();
    const held = makeHarness();
    await acquireRunLock({ token, stateDir: held.mainStateDir });
    const lines: string[] = [];
    seen.length = 0;
    api.onRequest = () =>
      seen.push(
        holdsReadSlot(token, { stateDir: held.mainStateDir }) ||
          existsSync(lockPaths(held.mainStateDir).readSlots[0])
      );
    const code = await snapshotCli(['--label', 'child'], {
      createHarness: () => held.h,
      stateRoot: tempDir('snap'),
      processEnv: { RTLS_IT_INTERNAL_LOCK_TOKEN: token },
      out: (l) => lines.push(l),
    });
    expect(code).toBe(0);
    expect(seen.every((x) => x === false)).toBe(true);
  });

  it('exit 2 on a bad label or a missing compare image; exit 3 without credentials', async () => {
    expect(await cli(['--label', '../escape']).run).toBe(2);
    expect(await cli(['--label', 'a', '--compare', 'missing']).run).toBe(2);
    const code = await snapshotCli(['--label', 'x'], {
      createHarness: () => {
        throw new ContextMissing(['RTLS_API_KEY']);
      },
      stateRoot: tempDir('snap'),
      out: () => undefined,
      err: () => undefined,
    });
    expect(code).toBe(3);
  });

  it('the stored image holds no credential and no asset MAC (assets: count and hash only)', async () => {
    const run = cli(['--label', 'clean']);
    expect(await run.run).toBe(0);
    const text = readFileSync(join(run.root, 'clean', 'snapshot.json'), 'utf8');
    expect(text).not.toContain('unit-test-configured-key');
    expect(text).not.toContain('aabbccddeeff');
    expect(JSON.parse(text).items.assets.value).toEqual({
      count: 2,
      hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });
});
