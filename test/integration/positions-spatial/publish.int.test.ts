// P3 live tests L-PUB-0, L-PUB-1, L-PUB-3 (P3 §9.4): REST publishing against production, tier S with W for the
// registered asset cleanups. Budget: 2 REST positions (L-PUB-1, L-PUB-3; the MAC-less L-PUB-0 is rejected
// before any write and is not counted). The guard counts the publishes; this file never calls consumeBudget.
//
// Residue (accepted, P3 §9.4): there is no API to delete positions. The cache entries of the two test MACs
// expire after the namespace's positionsExpirationPeriod; their last-position entries and Elasticsearch history
// stay. Until the cache entries expire, the test MACs show in listCached(), listLast(), nearest-asset results and
// on live dashboards, at the confirmed publish point outside every zone. Assets in the test MAC range, if a
// publish ever created one, are removed by the registered cleanups and the sweeper.
import {
  NotFoundError,
  TimeoutError,
  ValidationError,
  formatMac,
  type CachedAssetPosition,
  type PublishPositionData,
  type RtlsClient,
} from '../../../src';
import { pollUntil } from '../../../src/utils/poll';
import {
  createLiveClient,
  describeLive,
  getHarness,
  recordFact,
  registerCleanup,
  requestLog,
  testMac,
  testName,
} from '../harness';
import { discoverPublishPoint, need, publishPointOrSkip, type LatLon } from './discover';

const PUBLISHER = '/publisher/{app_namespace}';

/** `get(mac)`, or null for a 404 ("not there yet"); any other error propagates. */
async function orNull(
  get: (mac: string) => Promise<CachedAssetPosition>,
  mac: string
): Promise<CachedAssetPosition | null> {
  try {
    return await get(mac);
  } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
}

/** Polls `get(mac)` until a position stamped at or after `after` shows (U11). */
async function waitFor(
  get: (mac: string) => Promise<CachedAssetPosition>,
  mac: string,
  after: number
): Promise<CachedAssetPosition> {
  try {
    const found = await pollUntil(
      () => orNull(get, mac),
      (p) => p !== null && Date.parse(p.timestamp) >= after,
      { intervalMs: 1000, backoff: 1, timeoutMs: 20_000 }
    );
    return need(found, 'a position after polling');
  } catch (e) {
    if (e instanceof TimeoutError) {
      throw new Error('position not visible in the cache within 20 s', { cause: e });
    }
    throw e;
  }
}

/** True when `read()` answers 404. */
async function isAbsent(read: () => Promise<unknown>): Promise<boolean> {
  try {
    await read();
    return false;
  } catch (e) {
    if (e instanceof NotFoundError) return true;
    throw e;
  }
}

function lastPublisherEntry() {
  return need(
    [...requestLog()].reverse().find((e) => e.template === PUBLISHER),
    'a publisher request in the log'
  );
}

describeLive(
  'S',
  'publish',
  () => {
    let client: RtlsClient;
    let ns: string;
    let point: LatLon | null = null;
    let mapUuid = '';
    const mac1 = testMac(31);
    const mac2 = testMac(32);

    beforeAll(async () => {
      client = createLiveClient();
      ns = getHarness().env.namespace;
      const found = await discoverPublishPoint(client);
      point = found.point;
      mapUuid = found.mapUuid;
      recordFact('positions-spatial.publishPoint', point !== null);
      // Fresh run id: neither test MAC may have a cached position or an asset yet; otherwise abort the file.
      for (const mac of [mac1, mac2]) {
        for (const read of [() => client.positions.getCached(mac), () => client.assets.get(mac)]) {
          const absent = await isAbsent(read);
          if (!absent) throw new Error('fixture missing: test MAC already in use (cache or asset)');
        }
        registerCleanup({
          label: `asset of test MAC ${mac}`,
          request: { method: 'DELETE', path: `/assets/{ns}/${mac}` },
        });
      }
    });

    it('L-PUB-0 a MAC-less legacy publish is rejected before any write', async () => {
      await expect(
        client.positions.publish(ns, {} as PublishPositionData, undefined, { timeoutMs: 15_000 })
      ).rejects.toSatisfy(
        (e: unknown) =>
          e instanceof ValidationError &&
          e.status === 400 &&
          e.message === 'Missing MAC address (user_uuid or user_udid)'
      );
      expect(lastPublisherEntry().path.endsWith(`/publisher/${encodeURIComponent(ns)}`)).toBe(true);
    });

    it('L-PUB-1 a publish shows in the cache, the last position and nearest assets (U1, U10, U11)', async (ctx) => {
      const p = publishPointOrSkip(ctx, point);
      if (p === null) return;
      const runId = getHarness().runId;
      const t0 = Date.now() - 1000;
      const result = await client.positions.publish({
        user_udid: mac1,
        lat: p.lat,
        lon: p.lon,
        map_uuid: mapUuid,
        user_name: testName('pos'),
        data: { sdk_test_run: runId },
      });
      expect(result).toBeUndefined();
      const entry = lastPublisherEntry();
      expect(entry.status).toBe(201);
      recordFact(
        'positions-spatial.U1.contentLength0',
        entry.responseHeaders?.['content-length'] === '0'
      );
      recordFact(
        'positions-spatial.U1.contentType',
        entry.responseHeaders?.['content-type'] ?? null
      );

      const cached = await waitFor((m) => client.positions.getCached(m), mac1, t0);
      recordFact('positions-spatial.U11.cacheDelayMs', Date.now() - (t0 + 1000));
      expect(cached.user_udid).toBe(mac1);
      expect(Math.abs(cached.lat - p.lat)).toBeLessThan(1e-7);
      expect(Math.abs(cached.lon - p.lon)).toBeLessThan(1e-7);

      const last = await waitFor((m) => client.positions.getLast(m), mac1, t0);
      expect(Math.abs(last.lat - p.lat)).toBeLessThan(1e-7);
      expect(Math.abs(last.lon - p.lon)).toBeLessThan(1e-7);

      const near = await client.spatial.nearestAssetsRealtime({
        ...p,
        limit: 5,
        search: { field: 'user_udid', pattern: `^${mac1}$` },
      });
      expect(near.assets).toHaveLength(1);
      expect(near.assets[0]?.distance_meters).toBeLessThan(1);

      // U10: a publish to an unknown MAC creates no asset (the registered cleanup removes one if it did).
      await expect(client.assets.get(mac1)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('L-PUB-3 patchAssetData with colon/dash MACs: normalised body, patch skipped (U10)', async (ctx) => {
      const p = publishPointOrSkip(ctx, point);
      if (p === null) return;
      const t2 = Date.now() - 1000;
      await expect(
        client.positions.publish(
          {
            user_udid: formatMac(mac2),
            user_uuid: formatMac(mac2, { separator: '-' }),
            lat: p.lat,
            lon: p.lon,
            map_uuid: mapUuid,
            data: { sdk_test_run: getHarness().runId },
          },
          { patchAssetData: true }
        )
      ).resolves.toBeUndefined();
      const entry = lastPublisherEntry();
      expect(entry.query.patch_asset_data).toBe('true');
      const body = entry.body as { user_udid?: unknown; user_uuid?: unknown };
      expect(body.user_udid).toBe(mac2);
      expect(body.user_uuid).toBe(mac2);

      const cached = await waitFor((m) => client.positions.getCached(m), mac2, t2);
      expect(cached.user_udid).toBe(mac2);
      await expect(client.assets.get(mac2)).rejects.toBeInstanceOf(NotFoundError);
    });
  },
  { ruleEngine: true, positions: 'publish', requires: ['W'] }
);
