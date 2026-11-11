// P2 §9.2: live tests of client.assets. Tier R reads (whole-namespace list, local DSL, history window logic) and
// every local-validation case of §8.1 with the request counter unchanged; tier W writes on the run's test MACs only
// (m1 single CRUD, m2/m3 batch, m4 never created, m8/m9 legacy overloads, m11 never created), each first write
// guarded by get → NotFoundError and its undo registered before the next step. Bodies are asserted, never logged.
import { beforeAll } from 'vitest';
import {
  NotFoundError,
  ValidationError,
  type Asset,
  type AssetHistoryEntry,
  type RtlsClient,
} from '../../../src';
import {
  createLiveClient,
  denyAll,
  describeLive,
  expectKnownServerIssue,
  getHarness,
  rawRequest,
  registerCleanup,
  requestLog,
  runId,
  testMac,
  testName,
  withRequestGuard,
} from '../harness';

const MAC_RE = /^[0-9a-f]{12}$/;
const DAY_MS = 86_400_000;
const TEST_FIELDS = { model: 'sdk-test', tags: ['sdk-test'] };

/** A call the SDK refuses locally: ValidationError, no request attempted, request counter unchanged. */
async function expectLocalValidation(fn: () => Promise<unknown>): Promise<void> {
  const before = requestLog().length;
  const g = await withRequestGuard(denyAll, fn);
  expect(g.error).toBeInstanceOf(ValidationError);
  expect(g.attempts).toHaveLength(0);
  expect(requestLog()).toHaveLength(before);
}

async function drain<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

/** The asset of a test MAC must not exist before the first write (LIVE-TESTING §2.9). */
async function expectFree(client: RtlsClient, mac: string): Promise<void> {
  await expect(client.assets.get(mac)).rejects.toBeInstanceOf(NotFoundError);
}

function registerAssetDelete(mac: string): void {
  registerCleanup({
    label: `asset ${mac}`,
    request: { method: 'DELETE', path: `/assets/{ns}/${mac}` },
    verify: { path: `/assets/{ns}/${mac}`, goneStatus: [404] },
  });
}

const t = (e: AssetHistoryEntry): number => Number(e.timestamp);

describeLive('R', 'assets reads', () => {
  let client: RtlsClient;
  let all: Asset[];
  let sample: Asset;

  beforeAll(async () => {
    client = createLiveClient();
    all = await client.assets.list();
    sample = all[0] as Asset;
  });

  it('list returns the whole namespace with normalised MACs', () => {
    expect(all.length).toBeGreaterThan(0);
    for (const a of all) {
      expect(a.user_udid).toMatch(MAC_RE);
      expect(typeof a.user_name).toBe('string');
    }
  });

  it('list key/value is matched by the server', async () => {
    const r = await client.assets.list({ key: 'user_udid', value: sample.user_udid });
    expect(r.map((a) => a.user_udid)).toEqual([sample.user_udid]);
  });

  it('list evaluates filters, sort, limit and fields locally', async () => {
    const eq = await client.assets.list({ 'user_udid:eq': sample.user_udid });
    expect(eq.map((a) => a.user_udid)).toEqual([sample.user_udid]);

    const sorted = await client.assets.list({ sort: 'user_udid', limit: 2 });
    const expected = all
      .map((a) => a.user_udid)
      .sort()
      .slice(0, 2);
    expect(sorted.map((a) => a.user_udid)).toEqual(expected);

    const projected = await client.assets.list({ fields: ['user_udid', 'user_name'], limit: 1 });
    expect(projected).toHaveLength(1);
    expect(
      Object.keys(projected[0] as object).every((k) => ['user_udid', 'user_name'].includes(k))
    ).toBe(true);
  });

  it('USI-P2-1: GET /assets ignores limit', async () => {
    const r = await rawRequest('GET', '/assets/{ns}', { query: { limit: 2 } });
    await expectKnownServerIssue('USI-P2-1', 'GET /assets ignores limit', () => {
      expect(r.status).toBe(200);
      expect((r.json as unknown[]).length).toBeGreaterThan(2);
    });
  });

  it('iterate, getAll and the deprecated second-argument request options', async () => {
    const q = { key: 'user_udid', value: sample.user_udid };
    const it1 = await drain(client.assets.iterate(q));
    expect(it1.map((a) => a.user_udid)).toEqual([sample.user_udid]);
    const listed = await client.assets.list(q);
    expect(await client.assets.getAll(q)).toEqual(listed);
    const withRo = await client.assets.list(q, { timeoutMs: 30_000 });
    expect(withRo.map((a) => a.user_udid)).toEqual([sample.user_udid]);
    const getAllRo = await client.assets.getAll(q, { timeoutMs: 30_000 });
    expect(getAllRo.map((a) => a.user_udid)).toEqual([sample.user_udid]);
  });

  it('get returns the asset; an unknown test MAC is NotFoundError', async () => {
    const a = await client.assets.get(sample.user_udid);
    expect(a.user_udid).toBe(sample.user_udid);
    await expect(client.assets.get(testMac(11))).rejects.toMatchObject({
      name: 'NotFoundError',
      status: 404,
    });
  });

  it('history window logic', async () => {
    let mac: string | undefined;
    let full: AssetHistoryEntry[] = [];
    for (const a of all.slice(0, 3)) {
      const entries = await client.assets.getHistory(a.user_udid, { startTime: 0 });
      if (entries.length > 0) {
        mac = a.user_udid;
        full = entries;
        break;
      }
    }
    if (mac === undefined) throw new Error('no asset history in the first 3 assets');

    for (const e of full) {
      expect(typeof e.id).toBe('string');
      expect(['create', 'update', 'delete']).toContain(e.action);
      expect(e.timestamp).toMatch(/^\d+$/);
    }
    for (let i = 1; i < full.length; i += 1) {
      expect(t(full[i] as AssetHistoryEntry)).toBeLessThanOrEqual(
        t(full[i - 1] as AssetHistoryEntry)
      );
    }

    const a = full[Math.min(5, full.length - 1)] as AssetHistoryEntry;
    const top = t(full[0] as AssetHistoryEntry);
    const w = await client.assets.getHistory(mac, {
      startTime: t(a) * 1000,
      endTime: top * 1000,
    });
    const wIds = new Set(w.map((e) => e.id));
    expect(wIds.has(a.id)).toBe(true);
    for (const e of w) {
      expect(t(e)).toBeGreaterThanOrEqual(t(a));
      expect(t(e)).toBeLessThanOrEqual(top);
    }
    const inWindow = full.filter((e) => t(e) >= t(a) && t(e) < top);
    expect(inWindow.filter((e) => !wIds.has(e.id))).toEqual([]);

    // Default window: the last 24 h. With the server cap of 1000 entries, the oldest entries of `full` can be pushed
    // out by writes between the two reads, so the last 100 entries of a capped read are not compared.
    const before = Date.now();
    const d = await client.assets.getHistory(mac);
    const after = Date.now();
    const dIds = new Set(d.map((e) => e.id));
    const lower = Math.floor((before - DAY_MS) / 1000);
    for (const e of d) expect(t(e)).toBeGreaterThanOrEqual(lower);
    const comparable = full.length >= 1000 ? full.slice(0, full.length - 100) : full;
    const expected = comparable.filter(
      (e) => t(e) >= Math.floor((after - DAY_MS) / 1000) + 1 && t(e) < top
    );
    expect(expected.filter((e) => !dIds.has(e.id))).toEqual([]);
  });

  it('local validation: every assets.* case refused before any request', async () => {
    const m1 = testMac(1);
    const m2 = testMac(2);
    const m3 = testMac(3);
    const ns = getHarness().env.namespace;
    const bad = (v: unknown): never => v as never;
    // MAC
    await expectLocalValidation(() => client.assets.get('zz'));
    await expectLocalValidation(() => client.assets.get(ns, 'zz'));
    await expectLocalValidation(() => client.assets.delete('zz'));
    await expectLocalValidation(() => client.assets.getHistory('zz'));
    // list / iterate / getAll
    await expectLocalValidation(() => client.assets.list({ key: 'a' }));
    await expectLocalValidation(() => client.assets.list({ value: 'a' }));
    await expectLocalValidation(() => client.assets.list({ key: '', value: 'a' }));
    await expectLocalValidation(() => client.assets.list({ key: 'a', value: bad({}) }));
    await expectLocalValidation(() => client.assets.list({ filters: bad('x') }));
    await expectLocalValidation(() => client.assets.list({ page: 0 }));
    await expectLocalValidation(() => client.assets.list({ limit: 1001 }));
    await expectLocalValidation(() => client.assets.list({ limit: 1.5 }));
    await expectLocalValidation(() => client.assets.list(ns, { page: 0 }));
    await expectLocalValidation(() => client.assets.list({ sort: bad(5) }));
    await expectLocalValidation(() => client.assets.list({ fields: bad('user_udid') }));
    await expectLocalValidation(() => client.assets.list(bad({ 'user_udid:nope': 'x' })));
    await expectLocalValidation(() => drain(client.assets.iterate({ key: 'a' })));
    await expectLocalValidation(() => client.assets.getAll({ limit: 0 }));
    // create
    await expectLocalValidation(() => client.assets.create('zz', { user_name: 'x' }));
    await expectLocalValidation(() => client.assets.create(m1, { user_name: '' }));
    await expectLocalValidation(() => client.assets.create(m1, bad({})));
    await expectLocalValidation(() => client.assets.create(m1, bad(null)));
    await expectLocalValidation(() => client.assets.create(m1, { user_name: 'x', data: bad([]) }));
    await expectLocalValidation(() => client.assets.create(m1, { user_name: 'x', data: bad('x') }));
    await expectLocalValidation(() => client.assets.create(m1, { user_name: 'x', user_udid: m2 }));
    await expectLocalValidation(() =>
      client.assets.create(ns, m1, { user_name: 'x', user_udid: bad(5) })
    );
    // update
    await expectLocalValidation(() => client.assets.update('zz', { color: '#000000' }));
    await expectLocalValidation(() => client.assets.update(m1, { user_name: bad(null) }));
    await expectLocalValidation(() => client.assets.update(m1, { user_name: '' }));
    await expectLocalValidation(() => client.assets.update(m1, { user_udid: bad(null) }));
    await expectLocalValidation(() => client.assets.update(m1, { user_udid: m2 }));
    await expectLocalValidation(() => client.assets.update(m1, { data: bad(1) }));
    await expectLocalValidation(() => client.assets.update(m1, bad([])));
    await expectLocalValidation(() => client.assets.update(ns, m1, { user_name: '' }));
    // batchSave
    await expectLocalValidation(() =>
      client.assets.batchSave([{ user_udid: m2, user_name: 'x' }, bad({ user_udid: m3 })])
    );
    await expectLocalValidation(() =>
      client.assets.batchSave([{ user_udid: m2, user_name: 'x' }, bad({ user_name: 'y' })])
    );
    await expectLocalValidation(() =>
      client.assets.batchSave([
        { user_udid: m2, user_name: 'x' },
        { user_udid: 'zz', user_name: 'y' },
      ])
    );
    await expectLocalValidation(() =>
      client.assets.batchSave([{ user_udid: m2, user_name: 'x' }, bad(null)])
    );
    await expectLocalValidation(() =>
      client.assets.batchSave([
        { user_udid: m2, user_name: 'x' },
        { user_udid: m3, user_name: 'y', data: bad([]) },
      ])
    );
    await expectLocalValidation(() => client.assets.batchSave(bad({})));
    await expectLocalValidation(() => client.assets.batchSave(ns, bad('x')));
    // batchDelete
    await expectLocalValidation(() => client.assets.batchDelete(['zz']));
    await expectLocalValidation(() => client.assets.batchDelete(ns, ['zz']));
    await expectLocalValidation(() => client.assets.batchDelete(bad({})));
    await expectLocalValidation(() => client.assets.batchDelete([bad(5)]));
    // getHistory
    await expectLocalValidation(() => client.assets.getHistory(m1, { startTime: 2, endTime: 1 }));
  });
});

describeLive(
  'W',
  'assets writes',
  () => {
    let client: RtlsClient;
    const testStart = Date.now();
    const m1 = testMac(1);
    const run = runId();

    beforeAll(() => {
      client = createLiveClient();
    });

    it('single CRUD on m1', async () => {
      await expectFree(client, m1);
      const created = await client.assets.create(m1, {
        user_name: testName('a1'),
        ...TEST_FIELDS,
        data: { sdk_test_run: run },
      });
      registerAssetDelete(m1);
      expect(created.user_udid).toBe(m1);
      expect(created.user_name).toBe(testName('a1'));
      expect(typeof created.createdBy).toBe('string');
      expect(typeof created.dateCreated).toBe('number');
      expect(created.data).toMatchObject({ sdk_test_run: run });

      const upserted = await client.assets.create(m1, { user_name: testName('a1b') });
      expect(upserted.user_name).toBe(testName('a1b'));
      expect(upserted.dateCreated).toBe(created.dateCreated);
      expect(upserted.model).toBe('sdk-test');

      const updated = await client.assets.update(m1, {
        color: '#00ff00',
        data: { sdk_test_run: null },
      });
      expect(updated.color).toBe('#00ff00');
      expect(updated.data ?? {}).not.toHaveProperty('sdk_test_run');
      expect(updated.dateChanged as number).toBeGreaterThanOrEqual(updated.dateCreated as number);

      expect(await client.assets.get(m1)).toEqual(updated);
      const listed = await client.assets.list({ key: 'user_udid', value: m1 });
      expect(listed.map((a) => a.user_udid)).toEqual([m1]);
    });

    it('history of the run holds create and update (USI-P2-7 range ignored)', async () => {
      const deadline = Date.now() + 60_000;
      let entries: AssetHistoryEntry[] = [];
      const done = (): boolean =>
        entries.some((e) => e.action === 'create') && entries.some((e) => e.action === 'update');
      for (;;) {
        entries = await client.assets.getHistory(m1, { startTime: testStart - 60_000 });
        if (done() || Date.now() >= deadline) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      expect(done()).toBe(true);
      for (let i = 1; i < entries.length; i += 1) {
        expect(t(entries[i] as AssetHistoryEntry)).toBeLessThanOrEqual(
          t(entries[i - 1] as AssetHistoryEntry)
        );
      }
      const create = entries.find((e) => e.action === 'create') as AssetHistoryEntry;
      expect(create.data?.user_udid).toBe(m1);

      const now = Date.now();
      const r = await rawRequest('GET', `/asset_history/{ns}/${m1}`, {
        query: { start_time: now + DAY_MS, end_time: now + 2 * DAY_MS },
      });
      await expectKnownServerIssue('USI-P2-7', 'asset history ignores start_time/end_time', () => {
        expect(r.status).toBe(200);
        expect((r.json as unknown[]).length).toBeGreaterThan(0);
      });
    }, 90_000);

    it('delete and the 404 paths', async () => {
      await expect(client.assets.delete(m1)).resolves.toBeUndefined();
      await expect(client.assets.get(m1)).rejects.toBeInstanceOf(NotFoundError);
      await expect(client.assets.delete(m1)).rejects.toBeInstanceOf(NotFoundError);
      await expect(client.assets.update(m1, { color: '#000000' })).rejects.toBeInstanceOf(
        NotFoundError
      );
    });

    it('reserved field is refused by the server', async () => {
      await expectFree(client, testMac(11));
      await expect(
        client.assets.update(testMac(11), { data: { sensor_ils_sdk_test: 1 } })
      ).rejects.toMatchObject({ name: 'ValidationError', apiCode: 'reserved_field_namespace' });
    });

    it('batch save and batch delete', async () => {
      const m2 = testMac(2);
      const m3 = testMac(3);
      const m4 = testMac(4);
      await expectFree(client, m2);
      await expectFree(client, m3);
      await expectFree(client, m4);
      const saved = await client.assets.batchSave([
        { user_udid: m2, user_name: testName('a2'), ...TEST_FIELDS },
        { user_udid: m3, user_name: testName('a3'), ...TEST_FIELDS },
      ]);
      registerAssetDelete(m2);
      registerAssetDelete(m3);
      expect(saved).toHaveLength(2);
      expect(new Set(saved.map((a) => a.user_udid))).toEqual(new Set([m2, m3]));
      for (const a of saved) expect(typeof a.createdBy).toBe('string');

      const r = await client.assets.batchDelete([m2, m3, m4]);
      expect(new Set(r.deleted)).toEqual(new Set([m2, m3]));
      expect(r.not_found).toEqual([m4]);
      await expect(client.assets.get(m2)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('legacy positional-namespace overloads', async () => {
      const ns = getHarness().env.namespace;
      const m8 = testMac(8);
      const m9 = testMac(9);
      await expectFree(client, m8);
      await expectFree(client, m9);

      const c = await client.assets.create(ns, m8, { user_name: testName('a8'), ...TEST_FIELDS });
      registerAssetDelete(m8);
      expect(c.user_udid).toBe(m8);
      expect((await client.assets.get(ns, m8)).user_name).toBe(testName('a8'));
      expect((await client.assets.update(ns, m8, { color: '#0000ff' })).color).toBe('#0000ff');
      const q = { key: 'user_udid', value: m8 };
      expect(await client.assets.list(ns, q)).toHaveLength(1);
      expect(await drain(client.assets.iterate(ns, q))).toHaveLength(1);
      expect(await client.assets.getAll(ns, q)).toHaveLength(1);
      await expect(client.assets.delete(ns, m8)).resolves.toBeUndefined();
      await expect(client.assets.get(m8)).rejects.toBeInstanceOf(NotFoundError);

      const saved = await client.assets.batchSave(ns, [
        { user_udid: m9, user_name: testName('a9'), ...TEST_FIELDS },
      ]);
      registerAssetDelete(m9);
      expect(saved).toHaveLength(1);
      expect((await client.assets.batchDelete(ns, [m9])).deleted).toEqual([m9]);
    });
  },
  { ruleEngine: true }
);
