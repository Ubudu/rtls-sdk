// P3 live tests L-SP-1…20 (P3 §9.3): zones, POIs and nearest assets against production, tier R. The POST
// routes are read-only compute calls. Known server issues are pinned with expectKnownServerIssue. The Demo
// Factory venue lists no POI (U6 = 0, OP-9): the POI GETs are checked for shape only and L-SP-9 asserts that the
// statistics agree with the venue POI count. Assertions use counts, distances and the run's own names; no
// response body is printed.
import {
  ValidationError,
  type CustomPoiInput,
  type GeoJSONFeature,
  type GeoJSONPoint,
  type RtlsClient,
  type SpatialPolygonFeature,
} from '../../../src';
import {
  createLiveClient,
  denyAll,
  describeLive,
  expectKnownServerIssue,
  getHarness,
  recordFact,
  testName,
  withRequestGuard,
} from '../harness';
import { discoverP3, need, type LatLon, type P3Fixture } from './discover';
import { recordP3 } from './support/fixture-scrub';

const T30 = { timeoutMs: 30_000 };
const DAY = 86_400_000;

/** A 0.002° square polygon centred on `p`. */
function square(p: LatLon, name: string): SpatialPolygonFeature<{ name: string }> {
  const h = 0.001;
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [p.lon - h, p.lat - h],
          [p.lon + h, p.lat - h],
          [p.lon + h, p.lat + h],
          [p.lon - h, p.lat + h],
          [p.lon - h, p.lat - h],
        ],
      ],
    },
    properties: { name },
  };
}

/** `metres` north of `p`. */
function north(p: LatLon, metres: number): LatLon {
  return { lat: p.lat + metres / 111_320, lon: p.lon };
}

function ascending(values: readonly number[]): boolean {
  return values.every((v, i) => i === 0 || v >= (values[i - 1] as number));
}

describeLive('R', 'spatial', () => {
  let client: RtlsClient;
  let ns: string;
  let f: P3Fixture;

  beforeAll(async () => {
    client = createLiveClient();
    ns = getHarness().env.namespace;
    f = await discoverP3(client);
  });

  const inside = (): LatLon => {
    const p = need(f.insidePoint, 'a confirmed point inside a venue zone');
    return { lat: p.lat, lon: p.lon };
  };

  it('L-SP-0 discovery: one venue first, polygon zones with numeric ids (U5)', () => {
    expect(f.firstVenueMatches).toBe(true);
    expect(f.venueCount).toBeGreaterThanOrEqual(1);
    expect(f.zones.length).toBeGreaterThanOrEqual(1);
    expect(f.zoneIdType).toBe('number');
    expect(need(f.insidePoint, 'inside point').zone.geometry.type).toBe('Polygon');
  });

  // ── zones ──────────────────────────────────────────────────────────────────

  it('L-SP-1 analyzeCustomZones over the venue zones finds the inside zone', async () => {
    const ip = need(f.insidePoint, 'inside point');
    const res = await client.spatial.analyzeCustomZones({ ...inside(), customZones: f.zones }, T30);
    expect(res.total_zones).toBe(f.zones.length);
    expect(res.containing_zones.map((z) => z.index)).toContain(ip.zoneIndex);
    expect(ascending(res.nearby_zones.map((z) => z.distance_meters))).toBe(true);
    expect(res.nearby_zones[0]?.distance_meters).toBe(0);
    await recordP3(
      'spatial-zones-analyze',
      'POST /spatial/zones/{namespace}/analyze-custom',
      res,
      'L-SP-1'
    );
  });

  it('L-SP-2 a synthetic square around the compute point; legacy wire form', async () => {
    const p = f.computePoint;
    const name = testName('sq');
    const fc = { type: 'FeatureCollection' as const, features: [square(p, name)] };
    const res = await client.spatial.analyzeCustomZones({ ...p, customZones: fc });
    expect(res.containing_zones).toHaveLength(1);
    expect(res.containing_zones[0]?.properties.name).toBe(name);
    const legacy = await client.spatial.analyzeCustomZones(ns, {
      reference_point: p,
      custom_zones: fc,
    });
    expect(legacy.containing_zones).toHaveLength(1);
    expect(legacy.containing_zones[0]?.properties.name).toBe(name);
  });

  it('L-SP-3 a 0 coordinate is rejected by the POST routes (USI-P3-6)', async () => {
    const p = { lat: 0, lon: 0.001 };
    await expectKnownServerIssue(
      'USI-P3-6',
      'POST spatial routes reject a 0 coordinate',
      async () => {
        await expect(
          client.spatial.analyzeCustomZones({ ...p, customZones: [square(p, testName('zero'))] })
        ).rejects.toSatisfy((e: unknown) => e instanceof ValidationError && e.status === 400);
      }
    );
  });

  it('L-SP-4 zoneDistances to the inside zone and to every zone', async () => {
    const ip = need(f.insidePoint, 'inside point');
    const id = ip.zone.properties.id;
    const one = await client.spatial.zoneDistances({ ...inside(), zoneIds: [id] });
    expect(one.found_zones).toBe(1);
    expect(one.zones[0]?.zone_id).toBe(id);
    expect(one.zones[0]?.is_inside).toBe(true);
    expect(one.zones[0]?.boundary_distance_meters).toBe(0);
    const all = await client.spatial.zoneDistances({
      ...inside(),
      zoneIds: f.zones.map((z) => z.properties.id),
    });
    expect(all.found_zones).toBe(f.zones.length);
    expect(ascending(all.zones.map((z) => z.boundary_distance_meters))).toBe(true);
    await recordP3(
      'spatial-zones-distances',
      'POST /spatial/zones/{namespace}/calculate-distances',
      all,
      'L-SP-4'
    );
  });

  it('L-SP-5 zonesContainingPoint returns no zone (USI-P3-1); all call forms', async () => {
    const p = inside();
    const res = await client.spatial.zonesContainingPoint(p);
    expect(res.reference_point).toEqual(p);
    expect(res.level).toBeNull();
    await expectKnownServerIssue('USI-P3-1', 'zone GETs return no zones', () => {
      expect(res.total).toBe(0);
      expect(res.containing_zones).toHaveLength(0);
    });
    const legacy = await client.spatial.zonesContainingPoint(ns, p, T30);
    const deprecated = await client.spatial.zonesContainingPoint(p, T30);
    for (const r of [legacy, deprecated]) {
      expect(r.reference_point).toEqual(p);
      expect(Array.isArray(r.containing_zones)).toBe(true);
    }
    await recordP3(
      'spatial-zones-containing',
      'GET /spatial/zones/{namespace}/containing-point',
      res,
      'L-SP-5'
    );
  });

  it('L-SP-6 nearestZones: USI-P3-1, max distance echo, default and null level', async () => {
    const p = inside();
    const zoneLevel = need(f.insidePoint, 'inside point').zoneLevel;
    const res = await client.spatial.nearestZones({ ...p, limit: 5 });
    const deprecated = await client.spatial.nearestZones({ ...p, limit: 5 }, T30);
    await expectKnownServerIssue('USI-P3-1', 'zone GETs return no zones', () => {
      for (const r of [res, deprecated]) {
        expect(r.total_zones).toBeGreaterThan(0);
        expect(r.zones).toHaveLength(0);
      }
    });
    const legacy = await client.spatial.nearestZones(ns, { ...p, maxDistanceMeters: 500 });
    expect(legacy.max_distance_meters).toBe(500);
    const levelClient = need(f.levelClient, 'a level client');
    const withLevel = await levelClient.spatial.nearestZones(p);
    expect(withLevel.level).toBe(zoneLevel);
    const allLevels = await levelClient.spatial.nearestZones({ ...p, level: null });
    expect(allLevels.level).toBeNull();
    await recordP3(
      'spatial-zones-nearest',
      'GET /spatial/zones/{namespace}/nearest-to-point',
      res,
      'L-SP-6'
    );
  });

  it('L-SP-7 zonesWithinRadius: USI-P3-1, radius echo, radius 0 rejected', async () => {
    const p = inside();
    const res = await client.spatial.zonesWithinRadius({ ...p, radiusMeters: 50 });
    const deprecated = await client.spatial.zonesWithinRadius({ ...p, radiusMeters: 50 }, T30);
    for (const r of [res, deprecated]) expect(r.radius_meters).toBe(50);
    await expectKnownServerIssue('USI-P3-1', 'zone GETs return no zones', () => {
      for (const r of [res, deprecated]) {
        expect(r.total_zones).toBeGreaterThan(0);
        expect(r.zones).toHaveLength(0);
      }
    });
    const legacy = await client.spatial.zonesWithinRadius(ns, { ...p, radiusMeters: 50 });
    expect(legacy.radius_meters).toBe(50);
    await expect(client.spatial.zonesWithinRadius({ ...p, radiusMeters: 0 })).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof ValidationError && e.status === 400 && e.message === 'Radius must be positive'
    );
    await recordP3(
      'spatial-zones-within',
      'GET /spatial/zones/{namespace}/within-radius',
      res,
      'L-SP-7'
    );
  });

  it('L-SP-8 an out-of-range latitude is rejected locally', async () => {
    const g = await withRequestGuard(denyAll, () =>
      client.spatial.zonesContainingPoint({ lat: 91, lon: 0 })
    );
    expect(g.error).toBeInstanceOf(ValidationError);
    expect((g.error as ValidationError).status).toBe(0);
    expect(g.attempts).toHaveLength(0);
  });

  // ── POIs ───────────────────────────────────────────────────────────────────

  it('L-SP-9 poiStatistics agrees with the venue POI count (U6)', async () => {
    const stats = await client.spatial.poiStatistics();
    expect(typeof stats.total_pois).toBe('number');
    for (const o of [stats.levels, stats.tags, stats.venues]) expect(typeof o).toBe('object');
    const levelSum = Object.values(stats.levels).reduce((a, b) => a + b, 0);
    expect(levelSum).toBe(stats.total_pois);
    recordFact('positions-spatial.U6.totalPois', stats.total_pois);
    expect(stats.total_pois).toBe(f.poiCount);
    await recordP3(
      'spatial-pois-statistics',
      'GET /spatial/pois/{namespace}/statistics',
      stats,
      'L-SP-9'
    );
  });

  const poiPoint = (): LatLon => {
    const c = f.poi?.geometry.coordinates;
    return c ? { lat: c[1], lon: c[0] } : inside();
  };

  it('L-SP-10 nearestPois: tags echo, legacy and deprecated forms, default level', async () => {
    const p = poiPoint();
    const tags = [f.tag ?? 'sdk-test-tag'];
    const res = await client.spatial.nearestPois({ ...p, tags, limit: 5 });
    expect(res.tags_filter).toEqual(tags);
    expect(typeof res.total_pois).toBe('number');
    expect(res.pois.length).toBeLessThanOrEqual(f.poiCount);
    const legacy = await client.spatial.nearestPois(ns, p);
    const deprecated = await client.spatial.nearestPois(p, T30);
    for (const r of [legacy, deprecated]) {
      expect(r.tags_filter).toBeNull();
      expect(Array.isArray(r.pois)).toBe(true);
    }
    const withLevel = await need(f.levelClient, 'a level client').spatial.nearestPois(p);
    expect(withLevel.level).toBe(need(f.insidePoint, 'inside point').zoneLevel);
    await recordP3(
      'spatial-pois-nearest',
      'GET /spatial/pois/{namespace}/nearest-to-point',
      res,
      'L-SP-10'
    );
  });

  it('L-SP-11 poisWithinRadius: radius echo in every call form', async () => {
    const p = poiPoint();
    const tags = [f.tag ?? 'sdk-test-tag'];
    const res = await client.spatial.poisWithinRadius({ ...p, radiusMeters: 50, tags });
    const legacy = await client.spatial.poisWithinRadius(ns, { ...p, radiusMeters: 50 });
    const deprecated = await client.spatial.poisWithinRadius({ ...p, radiusMeters: 50 }, T30);
    for (const r of [res, legacy, deprecated]) {
      expect(r.radius_meters).toBe(50);
      expect(r.pois.length).toBeLessThanOrEqual(f.poiCount);
    }
    expect(res.tags_filter).toEqual(tags);
    await recordP3(
      'spatial-pois-within',
      'GET /spatial/pois/{namespace}/within-radius',
      res,
      'L-SP-11'
    );
  });

  it('L-SP-12 poisByTag echoes the tag', async () => {
    const tag = f.tag ?? 'sdk-test-tag';
    const res = await client.spatial.poisByTag({ tag });
    expect(res.tag).toBe(tag);
    expect(res.pois.length).toBeLessThanOrEqual(f.poiCount);
    await recordP3('spatial-pois-by-tag', 'GET /spatial/pois/{namespace}/by-tag', res, 'L-SP-12');
  });

  const three = (): Array<CustomPoiInput & { name: string }> => {
    const p = f.computePoint;
    return [
      { name: 'p0', ...p },
      { name: 'p100', ...north(p, 100) },
      { name: 'p1000', ...north(p, 1000) },
    ];
  };

  it('L-SP-13 analyzeCustomPois nearest with limit 2 (deprecated trailing options)', async () => {
    const res = await client.spatial.analyzeCustomPois(
      { ...f.computePoint, customPois: three(), limit: 2 },
      T30
    );
    expect(res.total_custom_pois).toBe(3);
    expect(res.matching_pois).toBe(2);
    expect(res.pois[0]?.distance_meters).toBeLessThan(1);
    expect(ascending(res.pois.map((x) => x.distance_meters))).toBe(true);
    expect(res.pois[1]?.name).toBe('p100');
    await recordP3(
      'spatial-pois-analyze',
      'POST /spatial/pois/{namespace}/analyze-custom',
      res,
      'L-SP-13'
    );
  });

  it('L-SP-14 Point Features are flattened and coordinate keys stripped', async () => {
    const features: Array<GeoJSONFeature<GeoJSONPoint>> = three().map((x) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [x.lon, x.lat] },
      properties: { name: x.name, coordinates: { lat: 1, lng: 1 } },
    }));
    const res = await client.spatial.analyzeCustomPois({
      ...f.computePoint,
      customPois: features,
      operation: 'within-radius',
      radiusMeters: 200,
    });
    expect(res.matching_pois).toBe(2);
  });

  it('L-SP-15 within-radius needs radiusMeters locally; legacy wire form', async () => {
    const g = await withRequestGuard(denyAll, () =>
      client.spatial.analyzeCustomPois({
        ...f.computePoint,
        customPois: three(),
        operation: 'within-radius',
      })
    );
    expect(g.error).toBeInstanceOf(ValidationError);
    expect(g.attempts).toHaveLength(0);
    const [p0, p100] = three();
    const legacy = await client.spatial.analyzeCustomPois(ns, {
      reference_point: f.computePoint,
      custom_pois: [p0 as CustomPoiInput, p100 as CustomPoiInput],
      operation: 'nearest',
    });
    expect(legacy.matching_pois).toBe(2);
  });

  // ── nearest assets ─────────────────────────────────────────────────────────

  const cachedPoint = (): LatLon => {
    const c = need(f.cached, 'a cached non-test position');
    return { lat: c.lat, lon: c.lon };
  };

  it('L-SP-16 nearestAssetsRealtime finds the discovered tag', async () => {
    const mac = need(f.mac, 'a cached non-test position');
    const res = await client.spatial.nearestAssetsRealtime({ ...cachedPoint(), limit: 20 });
    expect(res.total_assets).toBe(res.assets.length);
    expect(res.assets.length).toBeLessThanOrEqual(20);
    expect(ascending(res.assets.map((a) => a.distance_meters))).toBe(true);
    expect(res.assets.some((a) => a.user_udid === mac)).toBe(true);
    await recordP3(
      'spatial-assets-realtime',
      'GET /api/spatial/assets/:namespace/nearest-realtime',
      res,
      'L-SP-16'
    );
  });

  it('L-SP-17 search include and exclude on user_udid', async () => {
    const mac = need(f.mac, 'a cached non-test position');
    const pattern = `^${mac}$`;
    const only = await client.spatial.nearestAssetsRealtime({
      ...cachedPoint(),
      search: { field: 'user_udid', pattern },
    });
    expect(only.assets).toHaveLength(1);
    expect(only.assets[0]?.user_udid).toBe(mac);
    const others = await client.spatial.nearestAssetsRealtime({
      ...cachedPoint(),
      search: { field: 'user_udid', pattern, mode: 'exclude' },
    });
    expect(others.assets.some((a) => a.user_udid === mac)).toBe(false);
  });

  it('L-SP-18 nearestAssets with maxAge as a string and as milliseconds', async () => {
    const c = need(f.cached, 'a cached non-test position');
    const now = Date.now();
    const fresh = now - Date.parse(c.timestamp) <= DAY;
    const res = await client.spatial.nearestAssets({
      ...cachedPoint(),
      limit: 5,
      maxAge: '1d',
      maxDistanceMeters: 1000,
    });
    expect(res.assets.length).toBeGreaterThanOrEqual(fresh ? 1 : 0);
    expect(res.assets.length).toBeLessThanOrEqual(5);
    expect(res.assets.every((a) => a.distance_meters <= 1000)).toBe(true);
    const stamps = res.assets.map((a) => (a.timestamp ? Date.parse(a.timestamp) : now));
    expect(stamps.every((t) => t >= now - DAY - 60_000)).toBe(true);
    const ms = await client.spatial.nearestAssets({
      ...cachedPoint(),
      limit: 5,
      maxAge: DAY,
      maxDistanceMeters: 1000,
    });
    expect(Math.abs(ms.assets.length - res.assets.length)).toBeLessThanOrEqual(1);
    await recordP3(
      'spatial-assets-nearest',
      'GET /api/spatial/assets/:namespace/nearest-to-point',
      res,
      'L-SP-18'
    );
  });

  it('L-SP-19 limit 101 → ValidationError 400', async () => {
    await expect(
      client.spatial.nearestAssets({ ...cachedPoint(), limit: 101, maxAge: '1h' })
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof ValidationError &&
        e.status === 400 &&
        e.message === 'Limit must be between 1 and 100'
    );
  });

  it('L-SP-20 an invalid maxAge: server 400 for a bad string, local rejection for 0', async () => {
    await expect(
      client.spatial.nearestAssets({ ...cachedPoint(), maxAge: 'bogus' })
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof ValidationError &&
        e.status === 400 &&
        e.message.startsWith('Invalid max_age format')
    );
    const g = await withRequestGuard(denyAll, () =>
      client.spatial.nearestAssets({ ...cachedPoint(), maxAge: 0 })
    );
    expect(g.error).toBeInstanceOf(ValidationError);
    expect((g.error as ValidationError).status).toBe(0);
    expect(g.attempts).toHaveLength(0);
  });
});
