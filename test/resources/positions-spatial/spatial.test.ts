// Unit tests of client.spatial zone and POI methods (P3 §8.3): the real resource code against MSW, requests
// captured with recordRequests(), results compared with the fixture bodies.
import { describe, expect, expectTypeOf, it } from 'vitest';
import { delay } from 'msw';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';
import { loadFixture } from '../../contract/fixtures';
import {
  AbortError,
  ContextError,
  createRtlsClient,
  ServerError,
  TimeoutError,
  ValidationError,
  type AnalyzeCustomPoisResult,
  type AnalyzeCustomZonesResult,
  type CustomPoiInput,
  type NearestPoisResult,
  type NearestZonesResult,
  type PoiStatistics,
  type PoisByTagResult,
  type PoisWithinRadiusResult,
  type RtlsClient,
  type SpatialPoiFeature,
  type SpatialPolygonFeature,
  type ZoneDistancesResult,
  type ZonesContainingPointResult,
  type ZonesWithinRadiusResult,
} from '../../../src';
import {
  jsonError,
  POIS_OPERATION_REQUIRED,
  POIS_RADIUS_REQUIRED,
  POIS_STATISTICS_FAILED,
  POIS_TAG_REQUIRED,
  POIS_UNKNOWN_OPERATION,
  REFERENCE_POINT_REQUIRED,
  spatialFixture,
  spatialRoute,
  SPATIAL_ROUTES,
  ZONES_IDS_REQUIRED,
  ZONES_INVALID_COORDINATES,
  ZONES_INVALID_FEATURE_COLLECTION,
  ZONES_RADIUS_NOT_POSITIVE,
  type SpatialRoute,
} from './support/spatial-handlers';

const API_KEY = 'test-key';
const P = { lat: 48.1, lon: 2.2 };
const PQ = { lat: '48.1', lon: '2.2' };

const client = createRtlsClient({ apiKey: API_KEY, namespace: 'ns-test' });
const levelClient = createRtlsClient({ apiKey: API_KEY, namespace: 'ns-test', level: 2 });
const noNamespace = createRtlsClient({ apiKey: API_KEY });
const retryClient = createRtlsClient({
  apiKey: API_KEY,
  namespace: 'ns-test',
  retry: { retries: 2, baseDelayMs: 1 },
});

const body = (name: string): unknown => loadFixture('positions-spatial', name).body;

function queryOf(request: RecordedRequest): Record<string, string> {
  const out: Record<string, string> = {};
  request.url.searchParams.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

/** Method, full path, exact query, auth header, and the JSON body (with its Content-Type) or none. */
async function expectRequest(
  request: RecordedRequest | undefined,
  method: string,
  path: string,
  query: Record<string, string> = {},
  json?: unknown
): Promise<void> {
  expect(request).toBeDefined();
  const r = request as RecordedRequest;
  const text = await r.text();
  expect({
    method: r.method,
    path: r.url.pathname,
    query: queryOf(r),
    auth: r.headers.get('x-api-key'),
    contentType: r.headers.get('content-type'),
    body: text === '' ? undefined : (JSON.parse(text) as unknown),
  }).toStrictEqual({
    method,
    path: `/api${path}`,
    query,
    auth: API_KEY,
    contentType: json === undefined ? null : 'application/json',
    body: json,
  });
}

async function bodyOf(request: RecordedRequest | undefined): Promise<unknown> {
  return JSON.parse(await (request as RecordedRequest).text()) as unknown;
}

const isLocalValidation = (e: unknown): boolean => e instanceof ValidationError && e.status === 0;
const isHttp =
  (cls: typeof ValidationError | typeof ServerError, status: number, message: string) =>
  (e: unknown): boolean =>
    e instanceof cls && e.status === status && e.message === message;

function answer(route: SpatialRoute, status: number, json: Record<string, unknown>): void {
  server.use(spatialRoute(route, () => jsonError(status, json)));
}

function serve(route: SpatialRoute, fixture: string): void {
  server.use(spatialRoute(route, () => spatialFixture(fixture)));
}

function slow(route: SpatialRoute): void {
  server.use(
    spatialRoute(route, async () => {
      await delay(200);
      return spatialFixture(SPATIAL_ROUTES[route][2]);
    })
  );
}

/** 503 on the first request, then the default fixture. */
function flaky(route: SpatialRoute): void {
  let calls = 0;
  server.use(
    spatialRoute(route, () =>
      ++calls === 1
        ? jsonError(503, { error: 'unavailable' })
        : spatialFixture(SPATIAL_ROUTES[route][2])
    )
  );
}

const square: SpatialPolygonFeature<{ name: string }> = {
  type: 'Feature',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [2.2, 48.1],
        [2.201, 48.1],
        [2.201, 48.101],
        [2.2, 48.101],
        [2.2, 48.1],
      ],
    ],
  },
  properties: { name: 'sq' },
};

type Call = (c: RtlsClient, extra?: Record<string, unknown>) => Promise<unknown>;

/** Every method of this file in its object form, with the route its default handler answers. */
const METHODS: Array<[string, SpatialRoute, Call]> = [
  [
    'zonesContainingPoint',
    'zonesContaining',
    (c, x) => c.spatial.zonesContainingPoint({ ...P, ...x }),
  ],
  ['nearestZones', 'zonesNearest', (c, x) => c.spatial.nearestZones({ ...P, ...x })],
  [
    'zonesWithinRadius',
    'zonesWithin',
    (c, x) => c.spatial.zonesWithinRadius({ ...P, radiusMeters: 50, ...x }),
  ],
  [
    'zoneDistances',
    'zonesDistances',
    (c, x) => c.spatial.zoneDistances({ ...P, zoneIds: [1], ...x }),
  ],
  [
    'analyzeCustomZones',
    'zonesAnalyze',
    (c, x) => c.spatial.analyzeCustomZones({ ...P, customZones: [square], ...x }),
  ],
  ['nearestPois', 'poisNearest', (c, x) => c.spatial.nearestPois({ ...P, ...x })],
  [
    'poisWithinRadius',
    'poisWithin',
    (c, x) => c.spatial.poisWithinRadius({ ...P, radiusMeters: 25, ...x }),
  ],
  ['poisByTag', 'poisByTag', (c, x) => c.spatial.poisByTag({ tag: 'exit', ...x })],
  ['poiStatistics', 'poisStatistics', (c, x) => c.spatial.poiStatistics({ ...x })],
  [
    'analyzeCustomPois',
    'poisAnalyze',
    (c, x) => c.spatial.analyzeCustomPois({ ...P, customPois: [{ lat: 48.1, lon: 2.2 }], ...x }),
  ],
];

describe('every zone and POI method', () => {
  it.each(METHODS)(
    '%s: no namespace → ContextError, zero requests',
    async (_name, _route, call) => {
      const rec = recordRequests();
      await expect(call(noNamespace)).rejects.toBeInstanceOf(ContextError);
      expect(rec.requests).toHaveLength(0);
    }
  );

  it.each(METHODS)(
    '%s: timeoutMs: 5 against a delayed handler → TimeoutError',
    async (_n, route, call) => {
      slow(route);
      await expect(call(client, { timeoutMs: 5 })).rejects.toBeInstanceOf(TimeoutError);
    }
  );

  it.each(METHODS)(
    '%s: pre-aborted signal → AbortError, zero requests',
    async (_n, _route, call) => {
      const rec = recordRequests();
      await expect(call(client, { signal: AbortSignal.abort() })).rejects.toBeInstanceOf(
        AbortError
      );
      expect(rec.requests).toHaveLength(0);
    }
  );

  it.each(METHODS)('%s: { namespace } overrides the client default', async (_n, _route, call) => {
    const rec = recordRequests();
    await call(client, { namespace: 'other' });
    expect(rec.requests).toHaveLength(1);
    expect(rec.requests[0]?.url.pathname).toMatch(/^\/api\/spatial\/(zones|pois)\/other\//);
  });
});

// ─── Zone GETs ─────────────────────────────────────────────────────────────────

const ZONE_GETS: Array<[string, SpatialRoute, string, Call, Record<string, string>]> = [
  [
    'zonesContainingPoint',
    'zonesContaining',
    '/spatial/zones/ns-test/containing-point',
    (c, x) => c.spatial.zonesContainingPoint({ ...P, ...x }),
    {},
  ],
  [
    'nearestZones',
    'zonesNearest',
    '/spatial/zones/ns-test/nearest-to-point',
    (c, x) => c.spatial.nearestZones({ ...P, ...x }),
    {},
  ],
  [
    'zonesWithinRadius',
    'zonesWithin',
    '/spatial/zones/ns-test/within-radius',
    (c, x) => c.spatial.zonesWithinRadius({ ...P, radiusMeters: 50, ...x }),
    { radius_meters: '50' },
  ],
];

describe('zone GETs', () => {
  it('U-SZ-1 zonesContainingPoint({ lat, lon }) → query exactly { lat, lon }; result = fixture body', async () => {
    const rec = recordRequests();
    const res = await client.spatial.zonesContainingPoint(P);
    await expectRequest(rec.requests[0], 'GET', '/spatial/zones/ns-test/containing-point', PQ);
    expect(rec.requests).toHaveLength(1);
    expect(res).toStrictEqual(body('spatial-zones-containing'));
    expectTypeOf(res).toEqualTypeOf<ZonesContainingPointResult>();
  });

  it.each(ZONE_GETS)(
    'U-SZ-2 %s: client level 2 → level=2; per-call 0 → level=0; null → none; 1.5 → ContextError',
    async (_n, _route, path, call, extra) => {
      const rec = recordRequests();
      await call(levelClient);
      await call(client, { level: 0 });
      await call(levelClient, { level: null });
      await call(levelClient, { level: 3 });
      await expectRequest(rec.requests[0], 'GET', path, { ...PQ, ...extra, level: '2' });
      await expectRequest(rec.requests[1], 'GET', path, { ...PQ, ...extra, level: '0' });
      await expectRequest(rec.requests[2], 'GET', path, { ...PQ, ...extra });
      await expectRequest(rec.requests[3], 'GET', path, { ...PQ, ...extra, level: '3' });
      await expect(call(client, { level: 1.5 })).rejects.toBeInstanceOf(ContextError);
      expect(rec.requests).toHaveLength(4);
    }
  );

  it('U-SZ-3 nearestZones limit / maxDistanceMeters → limit, max_distance_meters', async () => {
    const rec = recordRequests();
    const res = await client.spatial.nearestZones({ ...P, limit: 5, maxDistanceMeters: 30 });
    await expectRequest(rec.requests[0], 'GET', '/spatial/zones/ns-test/nearest-to-point', {
      ...PQ,
      limit: '5',
      max_distance_meters: '30',
    });
    expect(res).toStrictEqual(body('spatial-zones-nearest'));
    expectTypeOf(res).toEqualTypeOf<NearestZonesResult>();
  });

  it('U-SZ-4 zonesWithinRadius radiusMeters → radius_meters', async () => {
    const rec = recordRequests();
    const res = await client.spatial.zonesWithinRadius({ ...P, radiusMeters: 50 });
    await expectRequest(rec.requests[0], 'GET', '/spatial/zones/ns-test/within-radius', {
      ...PQ,
      radius_meters: '50',
    });
    expect(res).toStrictEqual(body('spatial-zones-within'));
    expectTypeOf(res).toEqualTypeOf<ZonesWithinRadiusResult>();
  });

  it('U-SZ-5 legacy forms: positional namespace, options level and the client default level', async () => {
    const rec = recordRequests();
    await levelClient.spatial.zonesContainingPoint('ns2', P);
    await levelClient.spatial.nearestZones('ns2', { ...P, limit: 3, level: null });
    await client.spatial.zonesWithinRadius('ns2', { ...P, radiusMeters: 10, level: 1 });
    await expectRequest(rec.requests[0], 'GET', '/spatial/zones/ns2/containing-point', {
      ...PQ,
      level: '2',
    });
    await expectRequest(rec.requests[1], 'GET', '/spatial/zones/ns2/nearest-to-point', {
      ...PQ,
      limit: '3',
    });
    await expectRequest(rec.requests[2], 'GET', '/spatial/zones/ns2/within-radius', {
      ...PQ,
      radius_meters: '10',
      level: '1',
    });
  });

  it.each(ZONE_GETS)(
    'U-SZ-6 %s: lat 91, lon -181, lat NaN → ValidationError status 0, zero requests',
    async (_n, _route, _path, call) => {
      const rec = recordRequests();
      await expect(call(client, { lat: 91 })).rejects.toSatisfy(isLocalValidation);
      await expect(call(client, { lon: -181 })).rejects.toSatisfy(
        (e) => isLocalValidation(e) && (e as ValidationError).details?.[0] === 'lon'
      );
      await expect(call(client, { lat: Number.NaN })).rejects.toSatisfy(
        (e) => isLocalValidation(e) && (e as ValidationError).details?.[0] === 'lat'
      );
      expect(rec.requests).toHaveLength(0);
    }
  );

  it('U-SZ-6 legacy form: out-of-range point → ValidationError, zero requests', async () => {
    const rec = recordRequests();
    await expect(
      client.spatial.zonesContainingPoint('ns2', { lat: 0, lon: 180.5 })
    ).rejects.toSatisfy(isLocalValidation);
    expect(rec.requests).toHaveLength(0);
  });

  it('U-SZ-7 typed results: live-shaped fixtures (empty) and server-code fixtures (one item)', async () => {
    serve('zonesContaining', 'spatial-zones-containing.server-code');
    serve('zonesNearest', 'spatial-zones-nearest.server-code');
    serve('zonesWithin', 'spatial-zones-within.server-code');
    const containing = await client.spatial.zonesContainingPoint(P);
    const nearest = await client.spatial.nearestZones(P);
    const within = await client.spatial.zonesWithinRadius({ ...P, radiusMeters: 50 });
    expect(containing).toStrictEqual(body('spatial-zones-containing.server-code'));
    expect(nearest).toStrictEqual(body('spatial-zones-nearest.server-code'));
    expect(within).toStrictEqual(body('spatial-zones-within.server-code'));
    expect(typeof containing.containing_zones[0]?.properties.name).toBe('string');
    expect(typeof nearest.zones[0]?.properties.name).toBe('string');
    expect(typeof nearest.zones[0]?.is_inside).toBe('boolean');
    expect(typeof within.zones[0]?.centroid.lat).toBe('number');
    expectTypeOf(nearest.zones[0]!.properties.name).toEqualTypeOf<string>();
    expectTypeOf(nearest.zones[0]!.is_inside).toEqualTypeOf<boolean>();
    expectTypeOf(containing.containing_zones[0]!.level).toEqualTypeOf<number>();
    expectTypeOf(nearest.hasMore).toEqualTypeOf<boolean | undefined>();
  });

  it('U-SZ-8 400 {"error":"Radius must be positive"} → ValidationError status 400', async () => {
    answer('zonesWithin', 400, ZONES_RADIUS_NOT_POSITIVE);
    await expect(client.spatial.zonesWithinRadius({ ...P, radiusMeters: 0 })).rejects.toSatisfy(
      isHttp(ValidationError, 400, 'Radius must be positive')
    );
  });

  it('U-SZ-9 500 {"error":"Invalid coordinates"} → ServerError', async () => {
    answer('zonesNearest', 500, ZONES_INVALID_COORDINATES);
    await expect(client.spatial.nearestZones(P)).rejects.toSatisfy(
      isHttp(ServerError, 500, 'Invalid coordinates')
    );
  });

  it('U-SZ-10 deprecated trailing requestOptions honoured (headers, and timeoutMs winning over the bag)', async () => {
    const rec = recordRequests();
    await client.spatial.zonesContainingPoint(P, { headers: { 'x-trace': 't1' } });
    await client.spatial.nearestZones('ns2', P, { headers: { 'x-trace': 't2' } });
    expect(rec.requests.map((r) => r.headers.get('x-trace'))).toStrictEqual(['t1', 't2']);
    slow('zonesWithin');
    await expect(
      client.spatial.zonesWithinRadius(
        { ...P, radiusMeters: 5, timeoutMs: 10_000 },
        { timeoutMs: 5 }
      )
    ).rejects.toBeInstanceOf(TimeoutError);
  });
});

// ─── zoneDistances ─────────────────────────────────────────────────────────────

describe('zoneDistances', () => {
  it('U-ZD-1 POST body exactly { reference_point, zone_ids }; string ids unchanged', async () => {
    const rec = recordRequests();
    await client.spatial.zoneDistances({ ...P, zoneIds: [1, 2] });
    await client.spatial.zoneDistances({ ...P, zoneIds: ['1', 'z-2'] });
    await expectRequest(
      rec.requests[0],
      'POST',
      '/spatial/zones/ns-test/calculate-distances',
      {},
      {
        reference_point: P,
        zone_ids: [1, 2],
      }
    );
    await expectRequest(
      rec.requests[1],
      'POST',
      '/spatial/zones/ns-test/calculate-distances',
      {},
      {
        reference_point: P,
        zone_ids: ['1', 'z-2'],
      }
    );
  });

  it('U-ZD-2 400 {"error":"Zone IDs array is required"} → ValidationError', async () => {
    answer('zonesDistances', 400, ZONES_IDS_REQUIRED);
    await expect(client.spatial.zoneDistances({ ...P, zoneIds: [] })).rejects.toSatisfy(
      isHttp(ValidationError, 400, 'Zone IDs array is required')
    );
  });

  it('U-ZD-3 client default level not sent (no query, no level in the body)', async () => {
    const rec = recordRequests();
    await levelClient.spatial.zoneDistances({ ...P, zoneIds: [1] });
    await expectRequest(
      rec.requests[0],
      'POST',
      '/spatial/zones/ns-test/calculate-distances',
      {},
      {
        reference_point: P,
        zone_ids: [1],
      }
    );
  });

  it('U-ZD-4 typed result = spatial-zones-distances.json', async () => {
    const res = await client.spatial.zoneDistances({ ...P, zoneIds: [1, 2] });
    expect(res).toStrictEqual(body('spatial-zones-distances'));
    expectTypeOf(res).toEqualTypeOf<ZoneDistancesResult>();
    expectTypeOf(res.zones[0]!.level).toEqualTypeOf<number | undefined>();
  });

  it('U-ZD-5 idempotent retry: 503 then 200 → resolves after 2 requests', async () => {
    flaky('zonesDistances');
    const rec = recordRequests();
    await expect(retryClient.spatial.zoneDistances({ ...P, zoneIds: [1] })).resolves.toStrictEqual(
      body('spatial-zones-distances')
    );
    expect(rec.requests).toHaveLength(2);
  });

  it('out-of-range point → ValidationError, zero requests', async () => {
    const rec = recordRequests();
    await expect(
      client.spatial.zoneDistances({ lat: -90.01, lon: 0, zoneIds: [1] })
    ).rejects.toSatisfy(isLocalValidation);
    expect(rec.requests).toHaveLength(0);
  });
});

// ─── analyzeCustomZones ────────────────────────────────────────────────────────

describe('analyzeCustomZones', () => {
  const PATH = '/spatial/zones/ns-test/analyze-custom';

  it('U-ACZ-1 Feature array → custom_zones FeatureCollection; result = fixture body', async () => {
    const rec = recordRequests();
    const res = await client.spatial.analyzeCustomZones({ ...P, customZones: [square] });
    await expectRequest(
      rec.requests[0],
      'POST',
      PATH,
      {},
      {
        reference_point: P,
        custom_zones: { type: 'FeatureCollection', features: [square] },
      }
    );
    expect(res).toStrictEqual(body('spatial-zones-analyze'));
  });

  it('U-ACZ-2 FeatureCollection → sent as given (metadata included)', async () => {
    const fc = {
      type: 'FeatureCollection' as const,
      features: [square],
      metadata: { type: 'zones', count: 1, timestamp: '2026-01-01T00:00:00.000Z' },
    };
    const rec = recordRequests();
    await client.spatial.analyzeCustomZones({ ...P, customZones: fc });
    await expectRequest(
      rec.requests[0],
      'POST',
      PATH,
      {},
      { reference_point: P, custom_zones: fc }
    );
  });

  it('U-ACZ-3 legacy analyzeCustomZones(ns2, request) → body verbatim', async () => {
    const request = {
      reference_point: P,
      custom_zones: { type: 'FeatureCollection' as const, features: [square] },
    };
    const rec = recordRequests();
    await client.spatial.analyzeCustomZones('ns2', request, { headers: { 'x-trace': 'l' } });
    await expectRequest(rec.requests[0], 'POST', '/spatial/zones/ns2/analyze-custom', {}, request);
    expect(rec.requests[0]?.headers.get('x-trace')).toBe('l');
  });

  it('U-ACZ-4 legacy with reference_point.lat 95, lon 200 (or no reference_point) → ValidationError, zero requests', async () => {
    const rec = recordRequests();
    await expect(
      client.spatial.analyzeCustomZones('ns2', {
        reference_point: { lat: 95, lon: 2 },
        custom_zones: { type: 'FeatureCollection', features: [square] },
      })
    ).rejects.toSatisfy(isLocalValidation);
    await expect(
      client.spatial.analyzeCustomZones('ns2', {
        reference_point: { lat: 48, lon: 200 },
        custom_zones: { type: 'FeatureCollection', features: [square] },
      })
    ).rejects.toSatisfy(
      (e) => isLocalValidation(e) && (e as ValidationError).details?.[0] === 'lon'
    );
    await expect(
      client.spatial.analyzeCustomZones('ns2', {
        custom_zones: { type: 'FeatureCollection', features: [] },
      } as never)
    ).rejects.toSatisfy(isLocalValidation);
    expect(rec.requests).toHaveLength(0);
  });

  it('U-ACZ-5 400 reference point required; 500 Invalid GeoJSON FeatureCollection', async () => {
    answer('zonesAnalyze', 400, REFERENCE_POINT_REQUIRED);
    await expect(
      client.spatial.analyzeCustomZones({ lat: 0, lon: 2.2, customZones: [square] })
    ).rejects.toSatisfy(
      isHttp(ValidationError, 400, 'Reference point with lat and lon is required')
    );
    answer('zonesAnalyze', 500, ZONES_INVALID_FEATURE_COLLECTION);
    await expect(
      client.spatial.analyzeCustomZones({ ...P, customZones: { type: 'Feature' } as never })
    ).rejects.toSatisfy(isHttp(ServerError, 500, 'Invalid GeoJSON FeatureCollection'));
  });

  it('U-ACZ-6 the generic P flows to containing_zones[0].properties', async () => {
    const res = await client.spatial.analyzeCustomZones<{ name: string }>({
      ...P,
      customZones: [square],
    });
    const fixture = body('spatial-zones-analyze') as AnalyzeCustomZonesResult<{ name: string }>;
    expect(res.containing_zones[0]?.properties).toStrictEqual(
      fixture.containing_zones[0]?.properties
    );
    expect(typeof res.containing_zones[0]?.properties.name).toBe('string');
    expectTypeOf(res).toEqualTypeOf<AnalyzeCustomZonesResult<{ name: string }>>();
    expectTypeOf(res.containing_zones[0]!.properties.name).toEqualTypeOf<string>();
  });

  it('U-ACZ-7 client default level not sent', async () => {
    const rec = recordRequests();
    await levelClient.spatial.analyzeCustomZones({ ...P, customZones: [square] });
    await expectRequest(
      rec.requests[0],
      'POST',
      PATH,
      {},
      {
        reference_point: P,
        custom_zones: { type: 'FeatureCollection', features: [square] },
      }
    );
  });

  it('U-ACZ-8 idempotent retry: 503 then 200 → resolves after 2 requests', async () => {
    flaky('zonesAnalyze');
    const rec = recordRequests();
    await expect(
      retryClient.spatial.analyzeCustomZones({ ...P, customZones: [square] })
    ).resolves.toStrictEqual(body('spatial-zones-analyze'));
    expect(rec.requests).toHaveLength(2);
  });
});

// ─── POI GETs ──────────────────────────────────────────────────────────────────

const POI_GETS: Array<[string, SpatialRoute, string, Call, Record<string, string>]> = [
  [
    'nearestPois',
    'poisNearest',
    '/spatial/pois/ns-test/nearest-to-point',
    (c, x) => c.spatial.nearestPois({ ...P, ...x }),
    {},
  ],
  [
    'poisWithinRadius',
    'poisWithin',
    '/spatial/pois/ns-test/within-radius',
    (c, x) => c.spatial.poisWithinRadius({ ...P, radiusMeters: 25, ...x }),
    { radius_meters: '25' },
  ],
];

describe('POI GETs', () => {
  it('U-SP-1 nearestPois tags → tags=exit,wc; tags [] → absent; limit / maxDistanceMeters', async () => {
    const rec = recordRequests();
    const res = await client.spatial.nearestPois({ ...P, tags: ['exit', 'wc'] });
    await client.spatial.nearestPois({ ...P, tags: [], limit: 2, maxDistanceMeters: 9 });
    await expectRequest(rec.requests[0], 'GET', '/spatial/pois/ns-test/nearest-to-point', {
      ...PQ,
      tags: 'exit,wc',
    });
    await expectRequest(rec.requests[1], 'GET', '/spatial/pois/ns-test/nearest-to-point', {
      ...PQ,
      limit: '2',
      max_distance_meters: '9',
    });
    expect(res).toStrictEqual(body('spatial-pois-nearest'));
    expectTypeOf(res).toEqualTypeOf<NearestPoisResult>();
  });

  it('U-SP-2 poisWithinRadius radiusMeters + tags', async () => {
    const rec = recordRequests();
    const res = await client.spatial.poisWithinRadius({ ...P, radiusMeters: 25, tags: ['exit'] });
    await expectRequest(rec.requests[0], 'GET', '/spatial/pois/ns-test/within-radius', {
      ...PQ,
      radius_meters: '25',
      tags: 'exit',
    });
    expect(res).toStrictEqual(body('spatial-pois-within'));
    expectTypeOf(res).toEqualTypeOf<PoisWithinRadiusResult>();
  });

  it.each(POI_GETS)(
    'U-SP-3 %s: level rule (client 2, per-call 0, null, 1.5)',
    async (_n, _route, path, call, extra) => {
      const rec = recordRequests();
      await call(levelClient);
      await call(client, { level: 0 });
      await call(levelClient, { level: null });
      await expectRequest(rec.requests[0], 'GET', path, { ...PQ, ...extra, level: '2' });
      await expectRequest(rec.requests[1], 'GET', path, { ...PQ, ...extra, level: '0' });
      await expectRequest(rec.requests[2], 'GET', path, { ...PQ, ...extra });
      await expect(call(client, { level: 1.5 })).rejects.toBeInstanceOf(ContextError);
      expect(rec.requests).toHaveLength(3);
    }
  );

  it.each(POI_GETS)(
    '%s: out-of-range point → ValidationError, zero requests',
    async (_n, _r, _p, call) => {
      const rec = recordRequests();
      await expect(call(client, { lat: 90.5 })).rejects.toSatisfy(isLocalValidation);
      expect(rec.requests).toHaveLength(0);
    }
  );

  it('U-SP-4 legacy forms (positional namespace, client default level, trailing options)', async () => {
    const rec = recordRequests();
    await levelClient.spatial.nearestPois('ns2', { ...P, tags: ['a'] });
    await client.spatial.poisWithinRadius(
      'ns2',
      { ...P, radiusMeters: 5 },
      { headers: { 'x-trace': 'p' } }
    );
    await expectRequest(rec.requests[0], 'GET', '/spatial/pois/ns2/nearest-to-point', {
      ...PQ,
      tags: 'a',
      level: '2',
    });
    await expectRequest(rec.requests[1], 'GET', '/spatial/pois/ns2/within-radius', {
      ...PQ,
      radius_meters: '5',
    });
    expect(rec.requests[1]?.headers.get('x-trace')).toBe('p');
  });

  it('U-SP-5 typed results from the server-code fixtures, tags_filter included', async () => {
    serve('poisNearest', 'spatial-pois-nearest.server-code');
    serve('poisWithin', 'spatial-pois-within.server-code');
    const nearest = await client.spatial.nearestPois({ ...P, tags: ['tag-1'] });
    const within = await client.spatial.poisWithinRadius({ ...P, radiusMeters: 50 });
    expect(nearest).toStrictEqual(body('spatial-pois-nearest.server-code'));
    expect(within).toStrictEqual(body('spatial-pois-within.server-code'));
    expect(nearest.tags_filter).toStrictEqual(['tag-1']);
    expect(typeof within.pois[0]?.distance_meters).toBe('number');
    expectTypeOf(nearest.tags_filter).toEqualTypeOf<string[] | null>();
    expectTypeOf(within.pois[0]!.distance_meters).toEqualTypeOf<number>();
    expectTypeOf(within.pois[0]!.name).toEqualTypeOf<string | undefined>();
  });

  it('U-SP-6 400 {"error":"Latitude, longitude, and radius are required"} → ValidationError', async () => {
    answer('poisWithin', 400, POIS_RADIUS_REQUIRED);
    await expect(
      client.spatial.poisWithinRadius({ ...P, radiusMeters: undefined as unknown as number })
    ).rejects.toSatisfy(
      isHttp(ValidationError, 400, 'Latitude, longitude, and radius are required')
    );
  });
});

describe('poisByTag', () => {
  it('U-PT-1 tag=exit; level rule', async () => {
    const rec = recordRequests();
    const res = await client.spatial.poisByTag({ tag: 'exit' });
    await levelClient.spatial.poisByTag({ tag: 'exit' });
    await levelClient.spatial.poisByTag({ tag: 'exit', level: null });
    await client.spatial.poisByTag({ tag: 'exit', level: 0 });
    const path = '/spatial/pois/ns-test/by-tag';
    await expectRequest(rec.requests[0], 'GET', path, { tag: 'exit' });
    await expectRequest(rec.requests[1], 'GET', path, { tag: 'exit', level: '2' });
    await expectRequest(rec.requests[2], 'GET', path, { tag: 'exit' });
    await expectRequest(rec.requests[3], 'GET', path, { tag: 'exit', level: '0' });
    expect(res).toStrictEqual(body('spatial-pois-by-tag'));
    await expect(client.spatial.poisByTag({ tag: 'exit', level: 1.5 })).rejects.toBeInstanceOf(
      ContextError
    );
    expect(rec.requests).toHaveLength(4);
  });

  it('U-PT-2 400 {"error":"Tag is required"} (tag "") → ValidationError', async () => {
    answer('poisByTag', 400, POIS_TAG_REQUIRED);
    await expect(client.spatial.poisByTag({ tag: '' })).rejects.toSatisfy(
      isHttp(ValidationError, 400, 'Tag is required')
    );
  });

  it('U-PT-3 typed pois: SpatialPoiFeature[]', async () => {
    serve('poisByTag', 'spatial-pois-by-tag.server-code');
    const res = await client.spatial.poisByTag({ tag: 'tag-1' });
    expect(res).toStrictEqual(body('spatial-pois-by-tag.server-code'));
    expect(typeof res.pois[0]?.properties.name).toBe('string');
    expect(typeof res.pois[0]?.venue_id).not.toBe('undefined');
    expectTypeOf(res).toEqualTypeOf<PoisByTagResult>();
    expectTypeOf(res.pois).toEqualTypeOf<SpatialPoiFeature[]>();
  });

  it('U-PT-4 { namespace } override', async () => {
    const rec = recordRequests();
    await client.spatial.poisByTag({ tag: 'exit', namespace: 'ns3' });
    await expectRequest(rec.requests[0], 'GET', '/spatial/pois/ns3/by-tag', { tag: 'exit' });
  });
});

describe('poiStatistics', () => {
  it('U-PS-1 GET /spatial/pois/ns-test/statistics, no query, even with a client default level', async () => {
    const rec = recordRequests();
    await client.spatial.poiStatistics();
    await levelClient.spatial.poiStatistics({ level: 4 } as never);
    await expectRequest(rec.requests[0], 'GET', '/spatial/pois/ns-test/statistics');
    await expectRequest(rec.requests[1], 'GET', '/spatial/pois/ns-test/statistics');
  });

  it('U-PS-2 typed result = spatial-pois-statistics.json', async () => {
    const res = await client.spatial.poiStatistics();
    expect(res).toStrictEqual(body('spatial-pois-statistics'));
    expectTypeOf(res).toEqualTypeOf<PoiStatistics>();
  });

  it('U-PS-3 500 {error} → ServerError', async () => {
    answer('poisStatistics', 500, POIS_STATISTICS_FAILED);
    await expect(client.spatial.poiStatistics()).rejects.toSatisfy(
      isHttp(ServerError, 500, POIS_STATISTICS_FAILED.error)
    );
  });
});

// ─── analyzeCustomPois ─────────────────────────────────────────────────────────

describe('analyzeCustomPois', () => {
  const PATH = '/spatial/pois/ns-test/analyze-custom';
  const flat = [
    { lat: 48.1, lon: 2.2, name: 'p0' },
    { lat: 48.101, lon: 2.2, name: 'p100', tags: ['x'] },
  ];

  it('U-ACP-1 flat items → custom_pois deep-equal input, operation nearest, no options key', async () => {
    const rec = recordRequests();
    const res = await client.spatial.analyzeCustomPois({ ...P, customPois: flat });
    await expectRequest(
      rec.requests[0],
      'POST',
      PATH,
      {},
      {
        reference_point: P,
        custom_pois: flat,
        operation: 'nearest',
      }
    );
    expect(res).toStrictEqual(body('spatial-pois-analyze'));
  });

  it('U-ACP-2 limit / maxDistanceMeters → options { limit, maxDistance }', async () => {
    const rec = recordRequests();
    await client.spatial.analyzeCustomPois({
      ...P,
      customPois: flat,
      limit: 2,
      maxDistanceMeters: 300,
    });
    await client.spatial.analyzeCustomPois({ ...P, customPois: flat, maxDistanceMeters: 300 });
    // radiusMeters belongs to 'within-radius' only: never sent with 'nearest'.
    await client.spatial.analyzeCustomPois({
      ...P,
      customPois: flat,
      operation: 'nearest',
      limit: 2,
      maxDistanceMeters: 300,
      radiusMeters: 50,
    });
    expect(await bodyOf(rec.requests[2])).toStrictEqual({
      reference_point: P,
      custom_pois: flat,
      operation: 'nearest',
      options: { limit: 2, maxDistance: 300 },
    });
    expect(await bodyOf(rec.requests[0])).toStrictEqual({
      reference_point: P,
      custom_pois: flat,
      operation: 'nearest',
      options: { limit: 2, maxDistance: 300 },
    });
    expect(await bodyOf(rec.requests[1])).toStrictEqual({
      reference_point: P,
      custom_pois: flat,
      operation: 'nearest',
      options: { maxDistance: 300 },
    });
  });

  it('U-ACP-3 within-radius + radiusMeters → options { radius } (limit / maxDistance ignored)', async () => {
    const rec = recordRequests();
    await client.spatial.analyzeCustomPois({
      ...P,
      customPois: flat,
      operation: 'within-radius',
      radiusMeters: 200,
      limit: 1,
      maxDistanceMeters: 5,
    });
    expect(await bodyOf(rec.requests[0])).toStrictEqual({
      reference_point: P,
      custom_pois: flat,
      operation: 'within-radius',
      options: { radius: 200 },
    });
  });

  it('U-ACP-4 within-radius without radiusMeters, with 0, with -1 → ValidationError, zero requests', async () => {
    const rec = recordRequests();
    for (const radiusMeters of [undefined, 0, -1]) {
      await expect(
        client.spatial.analyzeCustomPois({
          ...P,
          customPois: flat,
          operation: 'within-radius',
          radiusMeters,
        })
      ).rejects.toSatisfy(
        (e) => isLocalValidation(e) && (e as ValidationError).details?.[0] === 'radiusMeters'
      );
    }
    expect(rec.requests).toHaveLength(0);
  });

  it('U-ACP-5 Point Feature → { ...properties, lat, lon } with coordinates removed', async () => {
    const rec = recordRequests();
    await client.spatial.analyzeCustomPois({
      ...P,
      customPois: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [2.2, 48.1] },
          properties: { name: 'A', coordinates: { lat: 1, lng: 1 } },
        },
      ],
    });
    expect(await bodyOf(rec.requests[0])).toStrictEqual({
      reference_point: P,
      custom_pois: [{ name: 'A', lat: 48.1, lon: 2.2 }],
      operation: 'nearest',
    });
  });

  it('U-ACP-6 flat item with location / position / latitude / longitude → those keys removed', async () => {
    const rec = recordRequests();
    await client.spatial.analyzeCustomPois({
      ...P,
      customPois: [
        {
          lat: 48.1,
          lon: 2.2,
          name: 'B',
          location: { lat: 1, lon: 1 },
          position: { lat: 2, lon: 2 },
          latitude: 3,
          longitude: 4,
          coordinates: { lat: 5, lng: 5 },
        },
      ],
    });
    expect(await bodyOf(rec.requests[0])).toStrictEqual({
      reference_point: P,
      custom_pois: [{ lat: 48.1, lon: 2.2, name: 'B' }],
      operation: 'nearest',
    });
  });

  it('U-ACP-7 legacy analyzeCustomPois(ns2, request) → body verbatim', async () => {
    const request = {
      reference_point: P,
      custom_pois: [{ lat: 48.1, lon: 2.2, location: { lat: 48.1, lon: 2.2 } }],
      operation: 'within-radius' as const,
    };
    const rec = recordRequests();
    await client.spatial.analyzeCustomPois('ns2', request);
    await expectRequest(rec.requests[0], 'POST', '/spatial/pois/ns2/analyze-custom', {}, request);
  });

  it('U-ACP-7 legacy with an out-of-range reference_point → ValidationError, zero requests', async () => {
    const rec = recordRequests();
    await expect(
      client.spatial.analyzeCustomPois('ns2', {
        reference_point: { lat: 48, lon: 200 },
        custom_pois: [],
        operation: 'nearest',
      })
    ).rejects.toSatisfy(isLocalValidation);
    await expect(
      client.spatial.analyzeCustomPois('ns2', {
        reference_point: { lat: 95, lon: 2 },
        custom_pois: [],
        operation: 'nearest',
      })
    ).rejects.toSatisfy(
      (e) => isLocalValidation(e) && (e as ValidationError).details?.[0] === 'lat'
    );
    expect(rec.requests).toHaveLength(0);
  });

  it('U-ACP-8 400 Operation is required; 500 Unknown operation: x', async () => {
    answer('poisAnalyze', 400, POIS_OPERATION_REQUIRED);
    await expect(
      client.spatial.analyzeCustomPois('ns-test', {
        reference_point: P,
        custom_pois: flat,
      } as never)
    ).rejects.toSatisfy(
      isHttp(ValidationError, 400, 'Operation is required (nearest or within-radius)')
    );
    answer('poisAnalyze', 500, POIS_UNKNOWN_OPERATION);
    const rec = recordRequests();
    await expect(
      client.spatial.analyzeCustomPois({ ...P, customPois: flat, operation: 'x' as never })
    ).rejects.toSatisfy(isHttp(ServerError, 500, 'Unknown operation: x'));
    expect(await bodyOf(rec.requests[0])).toStrictEqual({
      reference_point: P,
      custom_pois: flat,
      operation: 'x',
    });
  });

  it('U-ACP-9 typed pois[0]: input fields + index, lat, lon, distance_meters', async () => {
    const res = await client.spatial.analyzeCustomPois<CustomPoiInput & { name: string }>({
      ...P,
      customPois: flat,
    });
    const fixture = body('spatial-pois-analyze') as AnalyzeCustomPoisResult;
    expect(res.pois[0]).toStrictEqual(fixture.pois[0]);
    expect(Object.keys(res.pois[0] ?? {})).toEqual(
      expect.arrayContaining(['index', 'lat', 'lon', 'distance_meters'])
    );
    expectTypeOf(res).toEqualTypeOf<AnalyzeCustomPoisResult<CustomPoiInput & { name: string }>>();
    expectTypeOf(res.pois[0]!.name).toEqualTypeOf<string>();
    expectTypeOf(res.pois[0]!.index).toEqualTypeOf<number>();
    expectTypeOf(res.pois[0]!.distance_meters).toEqualTypeOf<number>();
  });

  it('U-ACP-10 lat: 0 → request sent (the SDK does not block 0); the server 400 maps to ValidationError', async () => {
    answer('poisAnalyze', 400, REFERENCE_POINT_REQUIRED);
    const rec = recordRequests();
    await expect(
      client.spatial.analyzeCustomPois({ lat: 0, lon: 2.2, customPois: flat })
    ).rejects.toSatisfy(
      isHttp(ValidationError, 400, 'Reference point with lat and lon is required')
    );
    expect(rec.requests).toHaveLength(1);
    expect(await bodyOf(rec.requests[0])).toStrictEqual({
      reference_point: { lat: 0, lon: 2.2 },
      custom_pois: flat,
      operation: 'nearest',
    });
  });

  it('U-ACP-11 idempotent retry: 503 then 200 → resolves after 2 requests', async () => {
    flaky('poisAnalyze');
    const rec = recordRequests();
    await expect(
      retryClient.spatial.analyzeCustomPois({ ...P, customPois: flat })
    ).resolves.toStrictEqual(body('spatial-pois-analyze'));
    expect(rec.requests).toHaveLength(2);
  });
});
