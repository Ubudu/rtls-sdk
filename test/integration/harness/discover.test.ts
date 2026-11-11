import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildDiscovery,
  discover as sharedDiscover,
  DiscoveryError,
  safePublishPoint as sharedSafePoint,
  type Discovery,
  type GeoJsonFeature,
} from '../../../examples/shared/discover.js';
import { _resetConfigForTesting } from '../../../examples/shared/config.js';
import { server } from '../../mocks/server';
import { setActiveHarness } from './active';
import type { Harness } from './context';
import { discover, safePublishPoint } from './discover';
import { makeHarness, TEST_BASE_URL, TEST_KEY, TEST_NS, tempDir } from './unit-support';

// Hand-made geometry (no recorded data). Bounds ≈ 111 m × 146 m; their centre is (48.8505, 2.351).
const BOUNDS: [[number, number], [number, number]] = [
  [48.85, 2.35],
  [48.851, 2.352],
];
const CENTRE = { lat: 48.8505, lng: 2.351 };
const M_PER_DEG = (Math.PI * 6371008.8) / 180;

/** Axis-aligned rectangle polygon, [lng, lat]. */
const rect = (lat0: number, lng0: number, lat1: number, lng1: number): number[][][] => [
  [
    [lng0, lat0],
    [lng1, lat0],
    [lng1, lat1],
    [lng0, lat1],
    [lng0, lat0],
  ],
];
const zone = (id: string | null, coordinates: number[][][], level = 0): GeoJsonFeature => ({
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates },
  properties: id === null ? { level } : { id, level },
});
/** Independent check: distance in metres from a point to an axis-aligned rectangle (0 inside). */
function rectDistanceM(p: { lat: number; lng: number }, r: number[][][]): number {
  const ring = r[0] as number[][];
  const lngs = ring.map((q) => q[0] as number);
  const lats = ring.map((q) => q[1] as number);
  const dx = Math.max(Math.min(...lngs) - p.lng, 0, p.lng - Math.max(...lngs));
  const dy = Math.max(Math.min(...lats) - p.lat, 0, p.lat - Math.max(...lats));
  return Math.hypot(dx * M_PER_DEG * Math.cos((p.lat * Math.PI) / 180), dy * M_PER_DEG);
}

const CENTRE_ZONE = rect(48.8503, 2.3507, 48.8507, 2.3513);
const CORNER_ZONE = rect(48.8501, 2.3501, 48.8502, 2.3503);
const venueZones = { type: 'FeatureCollection', features: [zone('z1', CENTRE_ZONE)] };
const mapFeatures = {
  type: 'FeatureCollection',
  features: [
    zone('z1', rect(48.0, 2.0, 48.1, 2.1)), // same id as a venue zone: dropped
    {
      type: 'Feature',
      geometry: { type: 'MultiPolygon', coordinates: [CORNER_ZONE] },
      properties: { id: 'z2' },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [2.351, 48.8505] },
      properties: { id: 'p' },
    },
  ],
};
const venues = [
  { id: 'not-an-int', name: 'x' },
  { id: 7, name: 'Factory' },
];
const maps = [
  { id: 1, uuid: '', map_bounds: BOUNDS, level: 0 },
  { id: 2, uuid: 'map-without-bounds', level: 0 },
  { id: 12, uuid: 'map-12', level: 1, map_bounds: BOUNDS, map_features: mapFeatures },
];
const paths = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [2.35, 48.85] },
      properties: { id: 'n-0', level: 0 },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [2.35, 48.85] },
      properties: { id: 'n-1', level: 1 },
    },
    {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [] },
      properties: { id: 's-1' },
    },
  ],
};

let requested: string[];
let h: Harness;

beforeEach(() => {
  requested = [];
  const answer =
    (body: unknown) =>
    ({ request }: { request: Request }) => {
      requested.push(new URL(request.url).pathname);
      return HttpResponse.json(body as never);
    };
  server.use(
    http.get(`${TEST_BASE_URL}/venues/${TEST_NS}`, answer(venues)),
    http.get(`${TEST_BASE_URL}/venues/${TEST_NS}/7/maps`, answer(maps)),
    http.get(`${TEST_BASE_URL}/venues/${TEST_NS}/7/zones`, answer(venueZones)),
    http.get(`${TEST_BASE_URL}/venues/${TEST_NS}/7/paths`, answer(paths)),
    http.get(`${TEST_BASE_URL}/venues/${TEST_NS}/7/maps/:mapId/zones`, answer({ features: [] }))
  );
  h = makeHarness().h;
});
afterEach(() => {
  setActiveHarness(null);
  vi.unstubAllEnvs();
  _resetConfigForTesting();
});

describe('buildDiscovery', () => {
  it('selects the first venue with an integer id and its first map with a uuid and map_bounds', () => {
    const d = buildDiscovery({ venues, maps, venueZones, paths });
    expect(d).toMatchObject({
      venueId: 7,
      mapId: 12,
      mapUuid: 'map-12',
      level: 1,
      mapBounds: BOUNDS,
    });
    expect(d.pathNodeId).toBe('n-1');
    expect(buildDiscovery({ venues, maps, venueZones }).pathNodeId).toBeNull();
  });

  it('zones = venue zones ∪ the map_features polygons, deduplicated by properties.id, all levels', () => {
    const d = buildDiscovery({ venues, maps, venueZones, paths });
    expect(d.zones.map((z) => [z.properties?.id, z.geometry.type])).toEqual([
      ['z1', 'Polygon'],
      ['z2', 'MultiPolygon'],
    ]);
    expect(d.zones[0]?.geometry.coordinates).toEqual(CENTRE_ZONE);
  });

  it('no venue, or no map with a uuid and lat-first bounds → DiscoveryError', () => {
    expect(() => buildDiscovery({ venues: [], maps, venueZones })).toThrow(DiscoveryError);
    expect(() =>
      buildDiscovery({ venues, maps: [{ id: 3, uuid: 'u', map_bounds: [[1, 2]] }], venueZones })
    ).toThrow(/no map/);
  });

  it('zoneCentroid lies inside its zone, also for a concave zone whose area centroid does not', () => {
    // U shape: the area centroid (1.5, 1.357) falls in the notch.
    const u = [
      [0, 0],
      [3, 0],
      [3, 3],
      [2, 3],
      [2, 1],
      [1, 1],
      [1, 3],
      [0, 3],
      [0, 0],
    ].map(([x, y]) => [2.3505 + (x as number) * 0.0001, 48.8502 + (y as number) * 0.0001]);
    const d = buildDiscovery({
      venues,
      maps: [{ ...maps[2], level: 0, map_features: undefined }],
      venueZones: [zone('u', [u], 0)],
    });
    const c = d.zoneCentroid;
    const inNotch = c.lng > 2.3506 && c.lng < 2.3507 && c.lat > 48.8503;
    const inBox = c.lng > 2.3505 && c.lng < 2.3508 && c.lat > 48.8502 && c.lat < 48.8505;
    expect([inBox, inNotch]).toEqual([true, false]);
    const square = buildDiscovery({ venues, maps, venueZones, paths }).zoneCentroid;
    expect(square.lat).toBeCloseTo(48.8505, 6);
    expect(square.lng).toBeCloseTo(2.351, 6);
  });
});

describe('safePublishPoint', () => {
  const base = (): Discovery => buildDiscovery({ venues, maps, venueZones, paths });

  it('is outside every polygon and at least 10 m from every edge', () => {
    const p = sharedSafePoint(base());
    expect(p).not.toBeNull();
    const point = p as { lat: number; lng: number; level: number };
    expect(point.level).toBe(1);
    expect(rectDistanceM(point, CENTRE_ZONE)).toBeGreaterThanOrEqual(10);
    expect(rectDistanceM(point, CORNER_ZONE)).toBeGreaterThanOrEqual(10);
    // a point of the 9 × 9 grid inside the bounds inset by 10 % (steps of 1/8 of the inset box)
    const onGrid = (v: number, lo: number, hi: number): boolean =>
      Array.from({ length: 9 }, (_, k) => lo + ((hi - lo) * k) / 8).some(
        (g) => Math.abs(g - v) < 1e-9
      );
    expect([onGrid(point.lat, 48.8501, 48.8509), onGrid(point.lng, 2.3502, 2.3518)]).toEqual([
      true,
      true,
    ]);
  });

  it('takes the centre when it qualifies, and skips a point closer than 10 m to an edge', () => {
    const open = sharedSafePoint({ ...base(), zones: [] });
    expect(open).toEqual({ ...CENTRE, level: 1 });
    // a zone whose edge passes 5 m south of the centre: the centre is outside but too close
    const near = rect(48.85, 2.3505, CENTRE.lat - 5 / M_PER_DEG, 2.3515);
    expect(rectDistanceM(CENTRE, near)).toBeCloseTo(5, 3);
    const p = sharedSafePoint({ ...base(), zones: [zone('n', near)] });
    expect(p).not.toBeNull();
    expect(p).not.toEqual({ ...CENTRE, level: 1 });
    expect(rectDistanceM(p as { lat: number; lng: number }, near)).toBeGreaterThanOrEqual(10);
  });

  it('a map covered by a zone → null', () => {
    const all = rect(48.849, 2.349, 48.852, 2.353);
    expect(sharedSafePoint({ ...base(), zones: [zone('all', all)] })).toBeNull();
  });

  it('reads mapBounds, level and zones only', () => {
    const d = base();
    const changed: Discovery = {
      ...d,
      venueId: 99,
      mapId: 98,
      mapUuid: 'other',
      zoneCentroid: { lat: 0, lng: 0 },
      pathNodeId: null,
    };
    expect(sharedSafePoint(changed)).toEqual(sharedSafePoint(d));
    expect(safePublishPoint(changed)).toEqual(sharedSafePoint(d));
  });
});

describe('discover() in the harness and in examples/shared', () => {
  it('give the same discovery and point for the same responses; …/maps/{mapId}/zones is never requested', async () => {
    const fromHarness = await discover();
    expect(requested).toEqual([
      `/api/venues/${TEST_NS}`,
      `/api/venues/${TEST_NS}/7/maps`,
      `/api/venues/${TEST_NS}/7/zones`,
      `/api/venues/${TEST_NS}/7/paths`,
    ]);
    const harnessRequests = requested.length;
    vi.stubEnv('RTLS_API_KEY', TEST_KEY);
    vi.stubEnv('APP_NAMESPACE', TEST_NS);
    vi.stubEnv('RTLS_BASE_URL', TEST_BASE_URL);
    _resetConfigForTesting({ envPath: join(tempDir('noenv'), '.env') });
    const fromExamples = await sharedDiscover();
    expect(requested.slice(harnessRequests)).toEqual(requested.slice(0, harnessRequests));
    expect(fromExamples).toEqual(fromHarness);
    expect(sharedSafePoint(fromExamples)).toEqual(safePublishPoint(fromHarness));
    expect(requested.some((p) => /\/maps\/[^/]+\/zones$/.test(p))).toBe(false);
  });

  it('is cached per run and writes discovery.json with ids and the safe-point flag only', async () => {
    const first = await discover();
    const count = requested.length;
    expect(await discover()).toBe(first);
    expect(requested).toHaveLength(count);
    expect(JSON.parse(readFileSync(join(h.stateDir, 'discovery.json'), 'utf8'))).toEqual({
      venueId: 7,
      mapId: 12,
      hasSafePoint: true,
    });
  });
});
