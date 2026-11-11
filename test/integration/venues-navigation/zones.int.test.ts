/**
 * Live tests of `client.zones` (P4 spec §9.3), tier R, filter mode SERVER (O1). Six zone-presence reads, each
 * over a window of at most 1 h. No writes; nothing logs a body.
 */
import { beforeAll, expect, it } from 'vitest';
import { ContextError, ValidationError, type ZonePresenceSlot } from '../../../src';
import {
  createLiveClient,
  denyAll,
  describeLive,
  expectKnownServerIssue,
  testName,
  withRequestGuard,
} from '../harness';
import {
  discoverVenue,
  presentOrSkip,
  presenceFixture,
  type PresenceFixture,
  type VenueDiscovery,
} from './discovery';

const ascending = (slots: ZonePresenceSlot[]): boolean =>
  slots.every((s, i) => i === 0 || s.timestamp > (slots[i - 1] as ZonePresenceSlot).timestamp);
/** 12 lowercase hex → upper case with colons */
const colonUpper = (mac: string): string => (mac.toUpperCase().match(/.{2}/g) ?? []).join(':');

describeLive('R', 'zones', () => {
  let d: VenueDiscovery;
  let p: PresenceFixture;

  beforeAll(async () => {
    d = await discoverVenue();
    p = await presenceFixture(d.client);
  });

  it('list: Polygon zones with the live property keys and zones metadata', async () => {
    const col = await d.client.zones.list();
    const keys = ['id', 'level', 'name', 'rgb_color', 'tags', 'type'];
    expect(col.features.length).toBeGreaterThanOrEqual(1);
    expect(
      col.features.every(
        (f) => f.geometry.type === 'Polygon' && keys.every((k) => k in f.properties)
      ),
      'zone features shaped'
    ).toBe(true);
    expect(col.metadata?.type).toBe('zones');
  });

  it('list({ level }): every feature on the level, total equals features', async () => {
    const first = (await d.client.zones.list()).features[0];
    const level = first?.properties.level ?? 0;
    const col = await d.client.zones.list({ level });
    expect(col.features.length).toBeGreaterThanOrEqual(1);
    expect(
      col.features.every((f) => f.properties.level === level),
      'every zone on the level'
    ).toBe(true);
    expect(col.total).toBe(col.features.length);
  });

  it('list({ tag }): never-matching tag is empty; a live tag keeps only tagged zones', async (ctx) => {
    const none = await d.client.zones.list({ tag: testName('none') });
    expect(none.features).toEqual([]);
    expect(none.total).toBe(0);
    const tagged = (await d.client.zones.list()).features.find((f) => f.properties.tags.length > 0);
    const tag = presentOrSkip(ctx, tagged?.properties.tags[0], 'Demo Factory has no tagged zone');
    const col = await d.client.zones.list({ tag });
    expect(col.features.length).toBeGreaterThanOrEqual(1);
    expect(
      col.features.every((f) => f.properties.tags.includes(tag)),
      'every zone carries the tag'
    ).toBe(true);
  });

  it('listAsArray, iterate, getAll: same ids as list, color from rgb_color', async () => {
    const col = await d.client.zones.list();
    const ids = col.features.map((f) => String(f.properties.id));
    const colors = new Map(
      col.features.map((f) => [String(f.properties.id), f.properties.rgb_color])
    );
    const flat = await d.client.zones.listAsArray();
    const all = await d.client.zones.getAll();
    const iterated: string[] = [];
    for await (const z of d.client.zones.iterate()) iterated.push(String(z.id));
    expect(flat.map((z) => String(z.id))).toEqual(ids);
    expect(all.map((z) => String(z.id))).toEqual(ids);
    expect(iterated).toEqual(ids);
    expect(
      flat.every((z) => z.color === colors.get(String(z.id))),
      'color equals rgb_color'
    ).toBe(true);
  });

  it('listByMap / listByMapAsArray: sample-data route, empty for the venue map (USI-P4-6)', async () => {
    const r = await d.client.zones.listByMap({ mapId: d.mapId });
    const flat = await d.client.zones.listByMapAsArray({ mapId: d.mapId });
    expect(r.type).toBe('FeatureCollection');
    await expectKnownServerIssue('USI-P4-6', 'map zones route serves sample data only', () =>
      expect(r.features.length, 'map zone count').toBe(0)
    );
    expect(flat).toEqual([]);
  });

  it('legacy positional forms reach the same zones', async () => {
    const ns = d.namespace;
    const id = d.venue.id;
    const ids = (await d.client.zones.listAsArray()).map((z) => String(z.id));
    const col = await d.client.zones.list(ns, String(id));
    const flat = await d.client.zones.listAsArray(ns, id);
    const all = await d.client.zones.getAll(ns, id);
    const iterated: string[] = [];
    for await (const z of d.client.zones.iterate(ns, id)) iterated.push(String(z.id));
    const byMap = await d.client.zones.listByMap(ns, id, d.mapId);
    const byMapFlat = await d.client.zones.listByMapAsArray(ns, id, String(d.mapId));
    expect(col.features.map((f) => String(f.properties.id))).toEqual(ids);
    expect(flat.map((z) => String(z.id))).toEqual(ids);
    expect(all.map((z) => String(z.id))).toEqual(ids);
    expect(iterated).toEqual(ids);
    expect(byMap.features).toHaveLength(0);
    expect(byMapFlat).toEqual([]);
  });

  it('getPresence with the MAC: 5 min slots of one asset; colon upper-case MAC is normalised', async () => {
    const slots = await d.client.zones.getPresence({
      value: p.mac,
      timestampFrom: p.t0,
      timestampTo: p.t1,
      interval: '5m',
    });
    const legacyUpper = await d.client.zones.getPresence(d.namespace, {
      value: colonUpper(p.mac),
      timestampFrom: p.t0,
      timestampTo: p.t1,
      interval: '5m',
    });
    expect(slots.length).toBeGreaterThanOrEqual(1);
    expect(slots.length).toBeLessThanOrEqual(13);
    expect(ascending(slots), 'strictly ascending timestamps').toBe(true);
    expect(
      slots.every((s) => s.timestamp % 300_000 === 0 && typeof s.name === 'string'),
      'aligned slots with a name'
    ).toBe(true);
    expect(legacyUpper.map((s) => s.timestamp)).toEqual(slots.map((s) => s.timestamp));
  });

  it('getPresence without value: one asset timeline, no duplicate slot', async () => {
    const slots = await d.client.zones.getPresence({ timestampFrom: p.t0, timestampTo: p.t1 });
    expect(Array.isArray(slots), 'array').toBe(true);
    expect(ascending(slots), 'strictly ascending, no duplicates').toBe(true);
  });

  it('getPresence with only timestampFrom: the SDK sends to = now (1 h window)', async () => {
    const from = Date.now() - 3_600_000;
    const slots = await d.client.zones.getPresence({ value: p.mac, timestampFrom: from });
    expect(Array.isArray(slots), 'array').toBe(true);
    expect(
      slots.every((s) => s.timestamp >= from - 300_000),
      'slots inside the window'
    ).toBe(true);
  });

  it('getPresence semantics: key other than user.udid and an unknown value give no slot', async () => {
    const byZoneKey = await d.client.zones.getPresence({
      key: 'zone.name',
      value: p.mac,
      timestampFrom: p.t0,
      timestampTo: p.t1,
    });
    const unknown = await d.client.zones.getPresence({
      value: testName('none'),
      timestampFrom: p.t0,
      timestampTo: p.t1,
    });
    await expectKnownServerIssue('USI-P4-18', 'a key other than user.udid returns no slot', () =>
      expect(byZoneKey.length, 'slot count').toBe(0)
    );
    expect(unknown).toEqual([]);
  });

  it('local validation: calendar interval, reversed range and missing namespace send no request', async () => {
    const results = [
      await withRequestGuard(denyAll, () =>
        d.client.zones.getPresence({ value: p.mac, interval: '1M' })
      ),
      await withRequestGuard(denyAll, () =>
        d.client.zones.getPresence({ value: p.mac, timestampFrom: p.t1, timestampTo: p.t0 })
      ),
      await withRequestGuard(denyAll, () =>
        d.client.zones.getPresence({ value: p.mac, timestampFrom: 'not a date' })
      ),
    ];
    const noNamespace = createLiveClient({ namespace: null });
    const missing = await withRequestGuard(denyAll, () =>
      noNamespace.zones.getPresence({ value: p.mac, timestampFrom: p.t0, timestampTo: p.t1 })
    );
    expect(
      results.every((r) => r.error instanceof ValidationError),
      'ValidationError'
    ).toBe(true);
    expect(missing.error).toBeInstanceOf(ContextError);
    expect([...results, missing].flatMap((r) => r.attempts)).toHaveLength(0);
  });
});
