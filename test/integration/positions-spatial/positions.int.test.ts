// P3 live tests L-POS-1…12 (P3 §9.3): cache, last position, Elasticsearch last positions and history against
// production, tier R. Every Elasticsearch call carries a time range and `timeoutMs: 60_000`. Assertions compare
// types, keys, counts and the discovered MAC; observations go to report.json.facts, never a response body.
import {
  NotFoundError,
  ValidationError,
  formatMac,
  type AssetPosition,
  type CachedAssetPosition,
  type RtlsClient,
} from '../../../src';
import {
  createLiveClient,
  denyAll,
  describeLive,
  discover,
  getHarness,
  recordFact,
  requestLog,
  testMac,
  withRequestGuard,
} from '../harness';
import { discoverCached, need } from './discover';
import { recordP3 } from './support/fixture-scrub';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ES = { timeoutMs: 60_000 };

/** Declared `CachedAssetPosition` keys (test-local list, P3 §5.2). */
const CACHED_KEYS: ReadonlySet<string> = new Set<keyof CachedAssetPosition>([
  'app_namespace',
  'user_udid',
  'user_uuid',
  'user_name',
  'user_type',
  'user_motion',
  'external_id',
  'lat',
  'lon',
  'map_uuid',
  'timestamp',
  'origin',
  'zone',
  'prev_pos_distance',
  'prev_pos_time_diff_seconds',
  'speed',
  'tags',
  'model',
  'color',
  'path',
  'data',
  'createdBy',
  'dateCreated',
  'dateChanged',
  'targetApplications',
]);

/** Declared `AssetPosition` keys (test-local list, P3 §5.3). */
const ES_KEYS: ReadonlySet<string> = new Set<keyof AssetPosition>([
  'timestamp',
  'user',
  'location',
  'map_uuid',
  'origin',
  'origin_detail',
  'zone',
  'model',
  'color',
  'path',
  'dateCreated',
  'dateChanged',
  'battery_percent',
  'is_virtual',
  'declared_location',
  'span',
]);

/** Key names of the items that are not declared (names only, never values). */
function undeclaredKeys(items: readonly object[], declared: ReadonlySet<string>): string[] {
  const extra = new Set<string>();
  for (const item of items) for (const k of Object.keys(item)) if (!declared.has(k)) extra.add(k);
  return [...extra].sort();
}

/** The last logged request whose template matches. */
function lastQuery(template: string): Record<string, string> {
  const entry = [...requestLog()].reverse().find((e) => e.template === template);
  return need(entry, `request log entry for ${template}`).query;
}

describeLive('R', 'positions', () => {
  let client: RtlsClient;
  let ns: string;
  let mac: string | null = null;
  let mapUuid = '';
  let cachedCount = 0;

  beforeAll(async () => {
    client = createLiveClient();
    ns = getHarness().env.namespace;
    const found = await discoverCached(client);
    mac = found.mac;
    cachedCount = found.cacheCount;
    mapUuid = (await discover()).mapUuid;
  });

  it('L-POS-1 listCached() returns typed positions with 12-hex MACs (U7)', async () => {
    const list = await client.positions.listCached();
    expect(list.length).toBeGreaterThanOrEqual(1);
    const badMacs = list.filter((p) => !/^[0-9a-f]{12}$/.test(p.user_udid)).length;
    recordFact('positions-spatial.U7.cachedMacs12Hex', badMacs === 0);
    expect(badMacs).toBe(0);
    expect(list.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))).toBe(true);
    expect(list.every((p) => Number.isFinite(Date.parse(p.timestamp)))).toBe(true);
    expect(undeclaredKeys(list, CACHED_KEYS)).toEqual([]);
    recordFact('positions-spatial.U8.cacheZoneNull', list.filter((p) => p.zone === null).length);
    await recordP3('cache-positions', 'GET /cache/{app_namespace}/positions', list, 'L-POS-1');
  });

  it('L-POS-2 legacy and object forms of listCached() return arrays', async () => {
    const legacy = await client.positions.listCached(ns);
    const object = await client.positions.listCached({ namespace: ns, timeoutMs: 60_000 });
    expect(legacy.length).toBeGreaterThanOrEqual(1);
    expect(object.length).toBeGreaterThanOrEqual(1);
    expect(cachedCount).toBeGreaterThanOrEqual(1);
  });

  it('L-POS-3 getCached() finds the discovered tag in any MAC form', async () => {
    const m = need(mac, 'a cached non-test position');
    const one = await client.positions.getCached(m);
    expect(one.user_udid).toBe(m);
    const upper = await client.positions.getCached(formatMac(m).toUpperCase());
    expect(upper.user_udid).toBe(m);
    const legacy = await client.positions.getCached(ns, m, { timeoutMs: 30_000 });
    expect(legacy.user_udid).toBe(m);
    await recordP3(
      'cache-position',
      'GET /cache/{app_namespace}/positions/{mac_address}',
      one,
      'L-POS-3'
    );
  });

  it('L-POS-4 getCached() of an unknown test MAC is NotFoundError with an empty body (U2)', async () => {
    await expect(client.positions.getCached(testMac(39))).rejects.toSatisfy((e: unknown) => {
      recordFact(
        'positions-spatial.U2.emptyBody',
        e instanceof NotFoundError && e.body === undefined
      );
      return e instanceof NotFoundError && e.status === 404;
    });
  });

  it('L-POS-5 getLast() returns the last position; unknown MAC → NotFoundError', async () => {
    const m = need(mac, 'a cached non-test position');
    const last = await client.positions.getLast(m);
    expect(last.user_udid).toBe(m);
    const legacy = await client.positions.getLast(ns, m);
    expect(legacy.user_udid).toBe(m);
    await expect(client.positions.getLast(testMac(39))).rejects.toSatisfy(
      (e: unknown) => e instanceof NotFoundError && e.status === 404
    );
    await recordP3(
      'asset-last-position',
      'GET /asset_last_position/{app_namespace}/{mac_address}',
      last,
      'L-POS-5'
    );
  });

  it('L-POS-6 an invalid MAC is rejected locally', async () => {
    const before = requestLog().length;
    const g = await withRequestGuard(denyAll, () => client.positions.getCached('not-a-mac'));
    expect(g.error).toBeInstanceOf(ValidationError);
    expect((g.error as ValidationError).status).toBe(0);
    expect(g.attempts).toHaveLength(0);
    expect(requestLog().length).toBe(before);
  });

  it('L-POS-7 listLast() over the last hour: numeric timestamps (U12), declared keys', async () => {
    const from = Date.now() - HOUR;
    const list = await client.positions.listLast({ timestampFrom: from, ...ES });
    expect(Array.isArray(list)).toBe(true);
    const numeric = list.every((p) => typeof p.timestamp === 'number');
    // An empty list satisfies every `every` below: U12 is a fact only with data.
    recordFact('positions-spatial.U12.lastTimestampNumber', numeric && list.length > 0);
    expect(list.length).toBeGreaterThan(0);
    expect(numeric).toBe(true);
    expect(list.every((p) => p.timestamp >= from - 1000)).toBe(true);
    expect(list.every((p) => typeof p.user.udid === 'string')).toBe(true);
    expect(undeclaredKeys(list, ES_KEYS)).toEqual([]);
    recordFact('positions-spatial.U8.lastZoneNull', list.filter((p) => p.zone === null).length);
    const deprecated = await client.positions.listLast({ timestampFrom: from }, ES);
    expect(Array.isArray(deprecated)).toBe(true);
    await recordP3('es-last-positions', 'GET /es/last_positions/{appNamespace}', list, 'L-POS-7');
  });

  it('L-POS-8 listLast() without bounds sends the 24 h default', async () => {
    const now = Date.now();
    const list = await client.positions.listLast(ES);
    const q = lastQuery('/es/last_positions/{appNamespace}');
    expect(Math.abs(Number(q.timestampFrom) - (now - DAY))).toBeLessThanOrEqual(60_000);
    expect(Math.abs(Number(q.timestampTo) - now)).toBeLessThanOrEqual(60_000);
    expect(list.every((p) => p.timestamp >= now - DAY - 60_000)).toBe(true);
  });

  it('L-POS-9 listLast() with mapUuids and current=true', async () => {
    const list = await client.positions.listLast({
      mapUuids: [need(mapUuid || null, 'a map uuid')],
      timestampFrom: Date.now() - HOUR,
      current: true,
      ...ES,
    });
    expect(list.every((p) => p.map_uuid === mapUuid)).toBe(true);
    const entry = need(
      [...requestLog()].reverse().find((e) => e.template === '/es/last_positions/{appNamespace}'),
      'request log entry'
    );
    expect(entry.query.current).toBe('true');
    const header = entry.responseHeaders?.['x-last-positions-source'] ?? null;
    recordFact('positions-spatial.lastPositionsSourceHeader', header !== null);
    // USI-P1-9 was not recorded (P1 L-T6 observed the header), so the header is asserted present.
    expect(['latest', 'aggregation']).toContain(header);
  });

  it('L-POS-10 legacy listLast() with only timestampTo sends from = to − 24 h', async () => {
    const to = Date.now();
    const list = await client.positions.listLast(ns, { timestampTo: to }, ES);
    expect(Array.isArray(list)).toBe(true);
    const q = lastQuery('/es/last_positions/{appNamespace}');
    expect(Number(q.timestampTo)).toBe(to);
    expect(Number(q.timestampFrom)).toBe(to - DAY);
  });

  it('L-POS-11 getHistory() over 50 min: ascending numeric timestamps, MAC normalised', async () => {
    const m = need(mac, 'a cached non-test position');
    const now = Date.now();
    const track = await client.positions.getHistory({
      value: m,
      timestampFrom: new Date(now - 50 * 60_000),
      ...ES,
    });
    expect(track.length).toBeLessThanOrEqual(3000);
    const numeric = track.every((p) => typeof p.timestamp === 'number');
    // An empty track satisfies every `every` below: U12 is a fact only with data.
    recordFact('positions-spatial.U12.historyTimestampNumber', numeric && track.length > 0);
    expect(track.length).toBeGreaterThan(0);
    expect(numeric).toBe(true);
    expect(
      track.every((p, i) => i === 0 || p.timestamp >= (track[i - 1] as AssetPosition).timestamp)
    ).toBe(true);
    expect(track.every((p) => p.user.udid === m)).toBe(true);
    const legacy = await client.positions.getHistory(
      ns,
      { value: formatMac(m), timestampFrom: now - 50 * 60_000, timestampTo: Date.now() },
      ES
    );
    expect(lastQuery('/es/position_history/{appNamespace}').value).toBe(m);
    expect(Math.abs(legacy.length - track.length)).toBeLessThanOrEqual(5);
    recordFact('positions-spatial.historyPoints50min', track.length);
    await recordP3(
      'es-position-history',
      'GET /es/position_history/{appNamespace}',
      track,
      'L-POS-11'
    );
  });

  it('L-POS-12 getHistory() with an empty value → ValidationError 400', async () => {
    await expect(
      client.positions.getHistory({ value: '', timestampFrom: Date.now() - HOUR }, ES)
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof ValidationError &&
        e.status === 400 &&
        e.message === 'value parameter is required'
    );
  });
});
