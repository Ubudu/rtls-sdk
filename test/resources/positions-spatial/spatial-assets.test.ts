// Unit tests of client.spatial.nearestAssets / nearestAssetsRealtime (P3 §8.3, U-NA): the real resource code
// against MSW on the real routes (ExtraPaths), requests captured with recordRequests(), results compared with the
// fixture bodies.
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
  type RtlsClient,
  type SpatialAssetItem,
  type SpatialAssetsResponse,
} from '../../../src';
import {
  ASSETS_FAILED,
  ASSETS_LIMIT_RANGE,
  jsonError,
  spatialFixture,
  spatialRoute,
  SPATIAL_ROUTES,
  type SpatialRoute,
} from './support/spatial-handlers';

const API_KEY = 'test-key';
const P = { lat: 48.1, lon: 2.2 };
const PQ = { lat: '48.1', lon: '2.2' };
const NEAREST = '/spatial/assets/ns-test/nearest-to-point';
const REALTIME = '/spatial/assets/ns-test/nearest-realtime';

const client = createRtlsClient({ apiKey: API_KEY, namespace: 'ns-test' });
const levelClient = createRtlsClient({ apiKey: API_KEY, namespace: 'ns-test', level: 2 });
const noNamespace = createRtlsClient({ apiKey: API_KEY });

const body = (name: string): unknown => loadFixture('positions-spatial', name).body;

function queryOf(request: RecordedRequest): Record<string, string> {
  const out: Record<string, string> = {};
  request.url.searchParams.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

/** Method, full path, exact query, auth header, and no body. */
async function expectGet(
  request: RecordedRequest | undefined,
  path: string,
  query: Record<string, string>
): Promise<void> {
  expect(request).toBeDefined();
  const r = request as RecordedRequest;
  expect({
    method: r.method,
    path: r.url.pathname,
    query: queryOf(r),
    auth: r.headers.get('x-api-key'),
    contentType: r.headers.get('content-type'),
    body: await r.text(),
  }).toStrictEqual({
    method: 'GET',
    path: `/api${path}`,
    query,
    auth: API_KEY,
    contentType: null,
    body: '',
  });
}

const isLocalValidation = (e: unknown): boolean => e instanceof ValidationError && e.status === 0;

type Call = (c: RtlsClient, extra?: Record<string, unknown>) => Promise<unknown>;

const METHODS: Array<[string, SpatialRoute, Call]> = [
  ['nearestAssets', 'assetsNearest', (c, x) => c.spatial.nearestAssets({ ...P, ...x })],
  [
    'nearestAssetsRealtime',
    'assetsRealtime',
    (c, x) => c.spatial.nearestAssetsRealtime({ ...P, ...x }),
  ],
];

describe('nearestAssets / nearestAssetsRealtime', () => {
  it('U-NA-1 nearestAssets({ lat, lon }) → GET /api/spatial/assets/ns-test/nearest-to-point, query { lat, lon }', async () => {
    const rec = recordRequests();
    await client.spatial.nearestAssets(P);
    expect(rec.requests).toHaveLength(1);
    const pathname = rec.requests[0]?.url.pathname;
    expect(pathname).toBe('/api/spatial/assets/ns-test/nearest-to-point');
    expect(pathname).not.toContain('/api/api');
    expect(pathname).not.toContain(':namespace');
    await expectGet(rec.requests[0], NEAREST, PQ);
  });

  it('U-NA-2 limit / maxDistanceMeters → limit, max_distance', async () => {
    const rec = recordRequests();
    await client.spatial.nearestAssets({ ...P, limit: 5, maxDistanceMeters: 250 });
    await client.spatial.nearestAssetsRealtime({ ...P, limit: 7, maxDistanceMeters: 30 });
    await expectGet(rec.requests[0], NEAREST, { ...PQ, limit: '5', max_distance: '250' });
    await expectGet(rec.requests[1], REALTIME, { ...PQ, limit: '7', max_distance: '30' });
  });

  it('U-NA-3 search → search_field, search_value (no search_mode); mode exclude → search_mode=exclude', async () => {
    const rec = recordRequests();
    await client.spatial.nearestAssets({ ...P, search: { field: 'data.type', pattern: '^fork' } });
    await client.spatial.nearestAssetsRealtime({
      ...P,
      search: { field: 'user_name', pattern: 'A.*', mode: 'exclude' },
    });
    await expectGet(rec.requests[0], NEAREST, {
      ...PQ,
      search_field: 'data.type',
      search_value: '^fork',
    });
    await expectGet(rec.requests[1], REALTIME, {
      ...PQ,
      search_field: 'user_name',
      search_value: 'A.*',
      search_mode: 'exclude',
    });
  });

  it('U-NA-4 maxAge string verbatim, number in ms (truncated); 0, 0.5, -1, NaN, Infinity → ValidationError, zero requests', async () => {
    const rec = recordRequests();
    await client.spatial.nearestAssets({ ...P, maxAge: '15m' });
    await client.spatial.nearestAssets({ ...P, maxAge: 900000 });
    await client.spatial.nearestAssets({ ...P, maxAge: 1500.9 });
    await client.spatial.nearestAssets({ ...P, maxAge: 1 });
    await expectGet(rec.requests[0], NEAREST, { ...PQ, max_age: '15m' });
    await expectGet(rec.requests[1], NEAREST, { ...PQ, max_age: '900000' });
    await expectGet(rec.requests[2], NEAREST, { ...PQ, max_age: '1500' });
    await expectGet(rec.requests[3], NEAREST, { ...PQ, max_age: '1' });
    // 0.5 would truncate to max_age=0, the unbounded value that 0 itself is rejected for.
    for (const maxAge of [0, 0.5, 0.999, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(client.spatial.nearestAssets({ ...P, maxAge })).rejects.toSatisfy(
        (e) => isLocalValidation(e) && (e as ValidationError).details?.[0] === 'maxAge'
      );
    }
    expect(rec.requests).toHaveLength(4);
  });

  it.each(METHODS)('U-NA-5 %s: client default level not sent', async (_n, _route, call) => {
    const rec = recordRequests();
    await call(levelClient);
    expect(queryOf(rec.requests[0] as RecordedRequest)).toStrictEqual(PQ);
  });

  it('U-NA-6 nearestAssetsRealtime → /nearest-realtime, never max_age', async () => {
    const rec = recordRequests();
    await client.spatial.nearestAssetsRealtime({ ...P, maxAge: '1m' } as never);
    await expectGet(rec.requests[0], REALTIME, PQ);
  });

  it.each(METHODS)(
    'U-NA-7 %s: 400 {"error":"Limit must be between 1 and 100"} → ValidationError',
    async (_n, route, call) => {
      server.use(spatialRoute(route, () => jsonError(400, ASSETS_LIMIT_RANGE)));
      await expect(call(client, { limit: 101 })).rejects.toSatisfy(
        (e) =>
          e instanceof ValidationError &&
          e.status === 400 &&
          e.message === 'Limit must be between 1 and 100'
      );
    }
  );

  it.each(METHODS)(
    'U-NA-8 %s: 500 {error, details} → ServerError with details [details]',
    async (_n, route, call) => {
      server.use(spatialRoute(route, () => jsonError(500, ASSETS_FAILED)));
      await expect(call(client)).rejects.toSatisfy(
        (e) =>
          e instanceof ServerError &&
          e.status === 500 &&
          e.message === 'Failed to retrieve nearest assets' &&
          JSON.stringify(e.details) === JSON.stringify(['boom'])
      );
    }
  );

  it('U-NA-9 typed SpatialAssetsResponse = fixture bodies', async () => {
    const nearest = await client.spatial.nearestAssets(P);
    const realtime = await client.spatial.nearestAssetsRealtime(P);
    expect(nearest).toStrictEqual(body('spatial-assets-nearest'));
    expect(realtime).toStrictEqual(body('spatial-assets-realtime'));
    expectTypeOf(nearest).toEqualTypeOf<SpatialAssetsResponse>();
    expectTypeOf(realtime.assets).toEqualTypeOf<SpatialAssetItem[]>();
    expectTypeOf(nearest.assets[0]!.distance_meters).toEqualTypeOf<number>();
    // spec gap USI-P3-10: both live fixtures carry zone.tags on every item.
    expectTypeOf(nearest.assets[0]!.zone?.tags).toEqualTypeOf<string[] | undefined>();
    expect([...nearest.assets, ...realtime.assets].every((a) => Array.isArray(a.zone?.tags))).toBe(
      true
    );
  });

  it.each(METHODS)('U-NA-10 %s: { namespace } override', async (_n, _route, call) => {
    const rec = recordRequests();
    await call(client, { namespace: 'ns9' });
    expect(rec.requests[0]?.url.pathname).toMatch(/^\/api\/spatial\/assets\/ns9\/nearest-/);
  });

  it.each(METHODS)(
    '%s: out-of-range point → ValidationError, zero requests',
    async (_n, _r, call) => {
      const rec = recordRequests();
      await expect(call(client, { lat: -91 })).rejects.toSatisfy(isLocalValidation);
      await expect(call(client, { lon: 181 })).rejects.toSatisfy(isLocalValidation);
      expect(rec.requests).toHaveLength(0);
    }
  );

  it.each(METHODS)('%s: no namespace → ContextError, zero requests', async (_n, _route, call) => {
    const rec = recordRequests();
    await expect(call(noNamespace)).rejects.toBeInstanceOf(ContextError);
    expect(rec.requests).toHaveLength(0);
  });

  it.each(METHODS)(
    '%s: timeoutMs: 5 against a delayed handler → TimeoutError',
    async (_n, route, call) => {
      server.use(
        spatialRoute(route, async () => {
          await delay(200);
          return spatialFixture(SPATIAL_ROUTES[route][2]);
        })
      );
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
});
