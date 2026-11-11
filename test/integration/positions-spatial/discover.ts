// P3 live discovery (P3 §9.2): run once per file in beforeAll. Tier-R calls only. The map, the bounds and the
// zone union come from the harness `discover()`; the publish point from `safePublishPoint(d)` (no local copy of
// the algorithm). Nothing here asserts or prints: a missing prerequisite becomes an explicit "fixture missing"
// error in the test that needs it (`need(...)`).
import type {
  CachedAssetPosition,
  POIFeature,
  RtlsClient,
  SpatialPolygonFeature,
  ZoneFeature,
} from '../../../src';
import { discover, isTestMac, recordFact, safePublishPoint, type Discovery } from '../harness';

export interface LatLon {
  lat: number;
  lon: number;
}

export interface InsidePoint extends LatLon {
  zone: ZoneFeature;
  /** index of `zone` in `P3Fixture.zones` */
  zoneIndex: number;
  zoneLevel: number;
}

export interface P3Fixture {
  d: Discovery;
  venueId: number;
  venueCount: number;
  firstVenueMatches: boolean;
  /** Polygon features of `zones.list({ venueId })` */
  zones: ZoneFeature[];
  zoneIdType: string | null;
  mapUuid: string;
  /** Polygon features of `d.zones` (venue zones ∪ map features) */
  allPolygons: SpatialPolygonFeature[];
  /** newest cached position whose MAC is not a test MAC */
  cached: CachedAssetPosition | null;
  mac: string | null;
  insidePoint: InsidePoint | null;
  /** confirmed publish point (outside every zone, ≥ 10 m from every edge), or null */
  outsidePoint: LatLon | null;
  /** `outsidePoint`, else the centre of `d.mapBounds` (compute-only tests) */
  computePoint: LatLon;
  poiCount: number;
  poi: POIFeature | null;
  tag: string | null;
  levelClient: RtlsClient | null;
}

/** Throws the explicit "fixture missing" error of P3 §9.2 when a prerequisite is absent. */
export function need<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`fixture missing: ${what}`);
  return value;
}

/** Vertex average of the outer ring without its closing vertex, as `{ lat, lon }`. */
export function vertexAverage(ring: number[][]): LatLon {
  const open =
    ring.length > 1 && ring[0]?.[0] === ring.at(-1)?.[0] && ring[0]?.[1] === ring.at(-1)?.[1]
      ? ring.slice(0, -1)
      : ring;
  let lon = 0;
  let lat = 0;
  for (const v of open) {
    lon += v[0] ?? 0;
    lat += v[1] ?? 0;
  }
  return { lat: lat / open.length, lon: lon / open.length };
}

/** Ray casting on `[lng, lat]` (test-only helper). */
export function insideRing(p: LatLon, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]?.[0] ?? 0;
    const yi = ring[i]?.[1] ?? 0;
    const xj = ring[j]?.[0] ?? 0;
    const yj = ring[j]?.[1] ?? 0;
    if (yi > p.lat !== yj > p.lat && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

function polygonFeatures(d: Discovery): SpatialPolygonFeature[] {
  return d.zones.flatMap((z) =>
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
}

/** Positions-only discovery (step 4): the newest cached non-test position. */
export async function discoverCached(
  client: RtlsClient
): Promise<{ cached: CachedAssetPosition | null; mac: string | null; cacheCount: number }> {
  const list = await client.positions.listCached({ timeoutMs: 60_000 });
  const cached =
    list
      .filter((p) => typeof p.user_udid === 'string' && !isTestMac(p.user_udid))
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0] ?? null;
  return { cached, mac: cached?.user_udid ?? null, cacheCount: list.length };
}

/** Full discovery of P3 §9.2 (steps 1–8). */
export async function discoverP3(client: RtlsClient): Promise<P3Fixture> {
  // 1. venue
  const d = await discover();
  const venues = (await client.venues.list()) as unknown as Array<{ id?: unknown }>;
  recordFact('positions-spatial.venues', venues.length);
  const venueId = d.venueId;

  // 2. venue zones
  const fc = await client.zones.list({ venueId });
  const zones = fc.features.filter((f) => f.geometry?.type === 'Polygon');
  const zoneIdType = zones[0] ? typeof zones[0].properties.id : null;
  recordFact('positions-spatial.zones', zones.length);
  recordFact('positions-spatial.zoneIdIsNumber', zoneIdType === 'number');

  // 3. map and zone union
  const allPolygons = polygonFeatures(d);

  // 4. cached position
  const { cached, mac } = await discoverCached(client);

  // 5. a confirmed point inside a venue zone
  let insidePoint: InsidePoint | null = null;
  for (let i = 0; i < zones.length && insidePoint === null; i++) {
    const zone = zones[i] as ZoneFeature;
    const ring = zone.geometry.coordinates[0];
    if (!ring || ring.length < 4) continue;
    const c = vertexAverage(ring);
    if (!insideRing(c, ring)) continue;
    const res = await client.spatial.analyzeCustomZones({ ...c, customZones: zones });
    if (res.containing_zones.some((z) => z.index === i)) {
      insidePoint = { ...c, zone, zoneIndex: i, zoneLevel: zone.properties.level ?? 0 };
    }
  }

  // 6. the publish point, confirmed outside every zone polygon
  let outsidePoint: LatLon | null = null;
  const p = safePublishPoint(d);
  if (p !== null && allPolygons.length > 0) {
    const candidate = { lat: p.lat, lon: p.lng };
    const check = await client.spatial.analyzeCustomZones({
      ...candidate,
      customZones: allPolygons,
    });
    const nearest = check.nearby_zones[0]?.distance_meters ?? Infinity;
    if (check.containing_zones.length === 0 && nearest >= 10) outsidePoint = candidate;
  }
  recordFact('positions-spatial.safePublishPoint', outsidePoint !== null);
  const [[lat1, lng1], [lat2, lng2]] = d.mapBounds;
  const computePoint = outsidePoint ?? { lat: (lat1 + lat2) / 2, lon: (lng1 + lng2) / 2 };

  // 7. venue POIs (U6)
  const pois = await client.venues.listPois({ venueId });
  const poiCount = pois.features?.length ?? 0;
  const poi = pois.features?.[0] ?? null;
  const tags = (poi?.properties as { tags?: unknown } | undefined)?.tags;
  const tag = Array.isArray(tags) && typeof tags[0] === 'string' ? tags[0] : null;
  recordFact('positions-spatial.poiCount', poiCount);

  // 8. a client whose default level is the inside zone's level
  const levelClient = insidePoint ? client.withContext({ level: insidePoint.zoneLevel }) : null;

  return {
    d,
    venueId,
    venueCount: venues.length,
    firstVenueMatches: venues[0]?.id === venueId,
    zones,
    zoneIdType,
    mapUuid: d.mapUuid,
    allPolygons,
    cached,
    mac,
    insidePoint,
    outsidePoint,
    computePoint,
    poiCount,
    poi,
    tag,
    levelClient,
  };
}

/**
 * The publish fixture of P3 §9.2 step 6 only: `safePublishPoint(d)` confirmed by one `analyzeCustomZones` over
 * the Polygon features of `d.zones` (no zone contains it, the nearest is ≥ 10 m away); null otherwise.
 */
export async function discoverPublishPoint(
  client: RtlsClient
): Promise<{ point: LatLon | null; mapUuid: string }> {
  const d = await discover();
  const p = safePublishPoint(d);
  const polygons = polygonFeatures(d);
  if (p === null || polygons.length === 0) return { point: null, mapUuid: d.mapUuid };
  const candidate = { lat: p.lat, lon: p.lng };
  const check = await client.spatial.analyzeCustomZones({ ...candidate, customZones: polygons });
  const nearest = check.nearby_zones[0]?.distance_meters ?? Infinity;
  const ok = check.containing_zones.length === 0 && nearest >= 10;
  return { point: ok ? candidate : null, mapUuid: d.mapUuid };
}

/**
 * The run-level skip of P3 §9.2 step 6: without a confirmed publish point the publish test is skipped with
 * reason "no safe publish point" (reported in the run, never a failure), as the harness README shows.
 */
export function publishPointOrSkip(
  ctx: { skip: (note?: string) => void },
  point: LatLon | null
): LatLon | null {
  if (point === null) ctx.skip('no safe publish point');
  return point;
}
