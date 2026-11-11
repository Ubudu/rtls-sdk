// Tier R, Demo Factory (P5 §9.1 L-D1–L-D5): the dashboard lists and get(). No dashboard field value is printed:
// identifiers read from live data are compared as booleans, deep comparisons use the redacted assertion.
import { beforeAll } from 'vitest';
import { NotFoundError, ValidationError, type Dashboard, type RtlsClient } from '../../../src';
import { createLiveClient, describeLive, expectDeepEqualRedacted, getHarness } from '../harness';

const OBJECT_ID = /^[0-9a-f]{24}$/;
const ids = (list: readonly Dashboard[]): string[] => list.map((d) => d._id).sort();

describeLive('R', 'P5 dashboards read', () => {
  let client: RtlsClient;
  let namespace: string;
  let all: Dashboard[];

  beforeAll(async () => {
    client = createLiveClient();
    namespace = getHarness().env.namespace;
    all = await client.dashboards.list();
  });

  it('L-D1 list() holds the fixture dashboard, every item in the documented shape', () => {
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBeGreaterThan(0);
    for (const d of all) {
      expect(OBJECT_ID.test(d._id), 'L-D1 _id is a 24-hex ObjectId').toBe(true);
      expect('id' in d, 'L-D1 no id field').toBe(false);
      expect(d.application_namespace === namespace, 'L-D1 application_namespace').toBe(true);
      expect(typeof d.name).toBe('string');
      expect(typeof d.selected).toBe('boolean');
      expect(typeof d.can_edit).toBe('boolean');
      expect(Number.isNaN(Date.parse(d.created_at)), 'L-D1 created_at parses').toBe(false);
      expect(Number.isNaN(Date.parse(d.updated_at)), 'L-D1 updated_at parses').toBe(false);
      const shares = d.shared_with ?? [];
      expect(Array.isArray(shares), 'L-D1 shared_with is an array when present').toBe(true);
      for (const share of shares) {
        expect(typeof share.username).toBe('string');
        expect(Array.isArray(share.permissions)).toBe(true);
        expect(share.permissions.every((p) => typeof p === 'string')).toBe(true);
      }
    }
  });

  it('L-D2 the legacy string and options.namespace give the same _id set', async () => {
    const legacy = await client.dashboards.list(namespace);
    const bag = await client.dashboards.list({ namespace });
    expectDeepEqualRedacted(ids(legacy), ids(all), 'L-D2 list(namespace) ids');
    expectDeepEqualRedacted(ids(bag), ids(all), 'L-D2 list({ namespace }) ids');
  });

  it('L-D3 created and shared are subsets of list(); selected items are selected', async () => {
    const known = new Set(ids(all));
    const created = await client.dashboards.listCreated();
    const shared = await client.dashboards.listShared();
    const selected = await client.dashboards.listSelected();
    expect(
      created.every((d) => known.has(d._id)),
      'L-D3 created ⊆ list'
    ).toBe(true);
    expect(
      shared.every((d) => known.has(d._id)),
      'L-D3 shared ⊆ list'
    ).toBe(true);
    expect(
      selected.every((d) => d.selected === true),
      'L-D3 selected flag'
    ).toBe(true);
    expect(
      [...created, ...shared, ...selected].every((d) => d.application_namespace === namespace),
      'L-D3 namespace filter'
    ).toBe(true);
  });

  it('L-D4 get(_id) deep-equals the list item (updated_at ignored)', async () => {
    const first = all[0] as Dashboard;
    const one = await client.dashboards.get(first._id);
    expectDeepEqualRedacted(one, first, 'L-D4 get vs list item', { ignorePaths: ['updated_at'] });
  });

  it('L-D5 server errors: invalid id → ValidationError 400, unknown id → NotFoundError 404', async () => {
    const invalid = client.dashboards.get('not-an-id');
    await expect(invalid).rejects.toBeInstanceOf(ValidationError);
    await expect(invalid).rejects.toMatchObject({ status: 400, message: 'Invalid dashboard ID' });
    const unknown = client.dashboards.get('000000000000000000000000');
    await expect(unknown).rejects.toBeInstanceOf(NotFoundError);
    await expect(unknown).rejects.toMatchObject({ status: 404, message: 'Dashboard not found' });
  });
});
