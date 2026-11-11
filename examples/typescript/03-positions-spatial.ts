// Write section: tier S; budget positions=1 notifications=0 ble=0 etl=0; read skips no-fixture
/**
 * 03 - Positions and spatial analysis: "Where are my tags and what is around them?"
 *
 * Read-only by default:
 * - live snapshot of the position cache and the last stored position of one tag
 * - recent activity from Elasticsearch (last positions, one tag's track)
 * - a custom Elasticsearch aggregation (positions per hour, folded by hour of day)
 * - which zone the tag is in, and the zones, assets and POIs around it
 *
 * With `--write`, publishes ONE position for a test MAC at a point outside every zone and waits until it
 * shows in the cache. `--mac <mac>` publishes for another tag instead: that moves the tag on live dashboards
 * and runs its alert rules. `--lat <lat> --lon <lon>` choose the point yourself.
 *
 * Run read-only (unguarded, your own namespace): npm run ts -- typescript/03-positions-spatial.ts
 * Write section, through the guarded runner only:
 * `RTLS_IT_WRITES=1 RTLS_IT_SIDE_EFFECTS=1 npm run examples:check -- 03 --write`.
 */
import {
  NotFoundError,
  toEpochMs,
  type AnalyzeCustomZonesResult,
  type CustomPoiInput,
  type RtlsClient,
  type ZoneFeature,
} from 'ubudu-rtls-sdk';
import {
  getArg,
  isTestMac,
  preflightAllows,
  preflightRules,
  reportBudget,
  runExample,
  skip,
  testMac,
  type ExampleContext,
} from '../shared/config.js';
import { discover, safePublishPoint } from '../shared/discover.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

interface LatLon {
  lat: number;
  lon: number;
}

interface PerHour {
  per_hour: { buckets: Array<{ key: number; doc_count: number }> };
}

/** Great-circle distance in metres. */
function haversine(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** A point `metres` north of `p`. */
function north(p: LatLon, metres: number): LatLon {
  return { lat: p.lat + metres / 111_320, lon: p.lon };
}

async function findAsset(client: RtlsClient, mac: string): Promise<boolean> {
  try {
    await client.assets.get(mac);
    return true;
  } catch (err) {
    if (err instanceof NotFoundError) return false;
    throw err;
  }
}

async function main({ client, config, log, signal }: ExampleContext): Promise<void> {
  const now = Date.now();

  // ── Live snapshot ───────────────────────────────────────────────────────────
  const cached = await client.positions.listCached({ signal });
  const stale = cached.filter((p) => now - toEpochMs(p.timestamp) > 15 * 60_000);
  log(`Cache: ${cached.length} positions, ${stale.length} older than 15 min`);

  const newest = cached
    .filter((p) => !isTestMac(p.user_udid))
    .sort((a, b) => toEpochMs(b.timestamp) - toEpochMs(a.timestamp))[0];
  if (!newest) skip('no-fixture', 'no cached position');
  const firstMac = newest.user_udid;
  const here: LatLon = { lat: newest.lat, lon: newest.lon };

  const last = await client.positions.getLast(firstMac, { signal });
  log(`Last position of the newest tag: stored, same tag ${last.user_udid === firstMac}`);

  // ── Recent activity ─────────────────────────────────────────────────────────
  const lastHour = await client.positions.listLast({
    timestampFrom: now - HOUR,
    timeoutMs: 60_000,
    signal,
  });
  log(`Last hour: ${lastHour.length} tags reported`);

  const track = await client.positions.getHistory({
    value: firstMac,
    timestampFrom: now - HOUR,
    timeoutMs: 60_000,
    signal,
  });
  const points = track.flatMap((p) => (p.location ? [p.location] : []));
  let travelled = 0;
  for (let i = 1; i < points.length; i++) travelled += haversine(points[i - 1]!, points[i]!);
  log(`Track of the newest tag: ${points.length} points, ${Math.round(travelled)} m travelled`);

  // ── Analytics ───────────────────────────────────────────────────────────────
  const res = await client.positions.query<Record<string, unknown>, PerHour>(
    'positions',
    {
      size: 0,
      query: { range: { timestamp: { gte: now - DAY, lte: now, format: 'epoch_millis' } } },
      aggs: { per_hour: { date_histogram: { field: 'timestamp', fixed_interval: '1h' } } },
    },
    { timeoutMs: 60_000, signal }
  );
  const buckets = res.aggregations?.per_hour.buckets ?? [];
  log(`Positions per hour (last 24 h, ${buckets.length} buckets):`);
  for (const b of buckets.slice(-6))
    log(`  ${new Date(b.key).toISOString().slice(0, 13)}h  ${b.doc_count}`);
  const byHourOfDay = new Array<number>(24).fill(0);
  for (const b of buckets) {
    const h = new Date(b.key).getUTCHours();
    byHourOfDay[h] = (byHourOfDay[h] ?? 0) + b.doc_count;
  }
  const busiest = byHourOfDay.indexOf(Math.max(...byHourOfDay));
  log(`Busiest hour of day (UTC): ${busiest}h`);

  // ── Where is the tag ────────────────────────────────────────────────────────
  const venues = await client.venues.list({ signal });
  const venueId = Number(venues[0]?.id);
  const zoneFc = await client.zones.list({ venueId, signal });
  const zones: ZoneFeature[] = zoneFc.features.filter((f) => f.geometry.type === 'Polygon');
  if (zones.length > 0) {
    const inside = await client.spatial.analyzeCustomZones({ ...here, customZones: zones, signal });
    const names = inside.containing_zones.map((z) => z.properties.name);
    log(`Zones: ${zones.length}; the tag is in ${names.length > 0 ? names.join(', ') : 'no zone'}`);

    const distances = await client.spatial.zoneDistances({
      ...here,
      zoneIds: zones.map((z) => z.properties.id),
      signal,
    });
    for (const z of distances.zones.slice(0, 3)) {
      log(`  ${z.zone_name}: ${z.boundary_distance_meters} m${z.is_inside ? ' (inside)' : ''}`);
    }
  } else {
    log('Zones: none in the first venue');
  }

  const nearest = await client.spatial.nearestZones({ ...here, limit: 3, signal });
  if (nearest.zones.length === 0) {
    log(`nearestZones: 0 zones returned (server issue USI-P3-1); use analyzeCustomZones as above`);
  } else {
    log(`nearestZones: ${nearest.zones.length} zones`);
  }

  // ── What is around ──────────────────────────────────────────────────────────
  const realtime = await client.spatial.nearestAssetsRealtime({ ...here, limit: 5, signal });
  log(`Nearest assets (cache): ${realtime.assets.length}`);
  const fresh = await client.spatial.nearestAssets({ ...here, limit: 5, maxAge: '15m', signal });
  log(`Nearest assets seen in the last 15 min: ${fresh.assets.length}`);

  const stats = await client.spatial.poiStatistics({ signal });
  log(`POIs in the first venue: ${stats.total_pois}`);

  const adHoc: CustomPoiInput[] = [
    { name: 'here', ...here },
    { name: '100 m north', ...north(here, 100) },
    { name: '1 km north', ...north(here, 1000) },
  ];
  const around = await client.spatial.analyzeCustomPois({
    ...here,
    customPois: adHoc,
    operation: 'within-radius',
    radiusMeters: 200,
    signal,
  });
  log(`Ad-hoc points within 200 m: ${around.matching_pois} of ${around.total_custom_pois}`);

  if (!config.write) return;

  // ── Publish (--write, 1 position) ──────────────────────────────────────────
  const pf = await preflightRules();
  if (!(preflightAllows(pf, 'publish') && preflightAllows(pf, 'assets'))) {
    skip('preflight', 'alert rules or position settings make a publish unsafe in this namespace');
  }
  const defaultMac = testMac(75);
  const mac = getArg('mac', defaultMac);

  const discovery = await discover();
  let point: LatLon;
  const latArg = getArg('lat', '');
  const lonArg = getArg('lon', '');
  if (latArg !== '' && lonArg !== '') {
    point = { lat: Number(latArg), lon: Number(lonArg) };
  } else {
    const p = safePublishPoint(discovery);
    if (p === null) skip('no-fixture', 'no safe publish point');
    point = { lat: p.lat, lon: p.lng };
    const polygons = discovery.zones.flatMap((z) =>
      z.geometry.type === 'Polygon'
        ? [
            {
              type: 'Feature' as const,
              geometry: { type: 'Polygon' as const, coordinates: z.geometry.coordinates },
              properties: z.properties ?? {},
            },
          ]
        : []
    );
    const check: AnalyzeCustomZonesResult = await client.spatial.analyzeCustomZones({
      ...point,
      customZones: polygons,
      signal,
    });
    const nearestM = check.nearby_zones[0]?.distance_meters ?? Infinity;
    if (check.containing_zones.length > 0 || nearestM < 10)
      skip('no-fixture', 'no safe publish point');
  }

  const existedBefore = await findAsset(client, mac);
  // The rule preflight covers a publish only on a test MAC without an asset record.
  if (existedBefore && isTestMac(mac))
    skip('no-fixture', 'the test MAC already has an asset record');
  const t0 = Date.now() - 1000;
  await client.positions.publish({
    user_udid: mac,
    lat: point.lat,
    lon: point.lon,
    map_uuid: discovery.mapUuid,
  });
  log('Published 1 position');

  let seenAfterMs: number | null = null;
  for (let waited = 0; waited <= 20_000; waited += 1000) {
    try {
      const p = await client.positions.getCached(mac, { signal });
      if (Date.parse(p.timestamp) >= t0) {
        seenAfterMs = waited;
        const same = Math.abs(p.lat - point.lat) < 1e-7 && Math.abs(p.lon - point.lon) < 1e-7;
        log(`Cached after ~${waited / 1000} s, coordinates as published: ${same}`);
        break;
      }
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (seenAfterMs === null) log('The position did not show in the cache within 20 s');

  if (mac === defaultMac && !existedBefore && (await findAsset(client, mac))) {
    await client.assets.delete(mac);
    log('Warning: the publish created an asset for the test MAC; it was deleted');
  }
  reportBudget({ positions: 1 });
}

await runExample('03-positions-spatial', main);
