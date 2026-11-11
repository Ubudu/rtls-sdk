// Unit tests of NavigationResource (P4 §8.3, N-1 … N-32): the real request builders run through the transport
// against MSW; each request case asserts method, path, the full query, X-API-Key, Content-Type and the exact JSON
// body, and every navigation request is checked to carry venueId (D14 gate row).
import { describe, it, expect, vi } from 'vitest';
import { delay, http, HttpResponse } from 'msw';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';
import { fixtureResponse, loadFixture } from '../../contract/fixtures';
import {
  AbortError,
  AuthenticationError,
  ContextError,
  NotFoundError,
  ServerError,
  TimeoutError,
  ValidationError,
  createRtlsClient,
  type CallContext,
  type MultiStopRouteResult,
  type NavigationFailureBody,
  type NearestPoiResult,
  type RouteResult,
  type RtlsClient,
  type ShortestPathRequest,
} from '../../../src';

const BASE = 'https://rtls.ubudu.com/api';
const API_KEY = 'test-key';
const NAV = `${BASE}/spatial/navigate/:namespace`;

const fx = (name: string) => loadFixture('venues-navigation', name);
const bodyOf = (name: string): unknown => fx(name).body;

function makeClient(ctx: CallContext = { namespace: 'ns', venueId: 7 }): RtlsClient {
  return createRtlsClient({ apiKey: API_KEY, ...ctx });
}

/** Parses the query into `{ key: [values…] }` (repeated keys kept). */
function queryOf(req: RecordedRequest): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  req.url.searchParams.forEach((value, key) => {
    (out[key] ??= []).push(value);
  });
  return out;
}

interface ExpectedNavRequest {
  method: 'GET' | 'POST';
  path: string;
  venueId: number;
  query?: Record<string, string>;
  body?: unknown;
}

/** Asserts one navigation request completely, including the venueId it must carry. */
async function expectNavRequest(
  req: RecordedRequest | undefined,
  expected: ExpectedNavRequest
): Promise<void> {
  expect(req, 'a request was sent').toBeDefined();
  const r = req as RecordedRequest;
  expect(r.method).toBe(expected.method);
  expect(r.url.pathname).toBe(`/api${expected.path}`);
  const query = Object.fromEntries(Object.entries(expected.query ?? {}).map(([k, v]) => [k, [v]]));
  expect(queryOf(r)).toEqual(query);
  expect(r.headers.get('x-api-key')).toBe(API_KEY);
  const text = await r.text();
  const sent: unknown = text === '' ? undefined : JSON.parse(text);
  expect(sent).toEqual(expected.body);
  expect(r.headers.get('content-type')).toBe(
    expected.body === undefined ? null : 'application/json'
  );
  const venueId =
    expected.method === 'POST'
      ? (sent as { venueId?: unknown }).venueId
      : Number(r.url.searchParams.get('venueId'));
  expect(venueId, 'navigation request carries venueId').toBe(expected.venueId);
}

/** A client-side ValidationError (status 0) and no request. */
async function expectLocalValidation(run: () => Promise<unknown>, message?: RegExp): Promise<void> {
  const rec = recordRequests();
  await expect(run()).rejects.toSatisfy(
    (e: unknown) =>
      e instanceof ValidationError && e.status === 0 && (message ? message.test(e.message) : true)
  );
  expect(rec.requests).toHaveLength(0);
}

/** A ContextError and no request. */
async function expectContextError(run: () => Promise<unknown>): Promise<void> {
  const rec = recordRequests();
  await expect(run()).rejects.toBeInstanceOf(ContextError);
  expect(rec.requests).toHaveLength(0);
}

const useAnswer = (
  method: 'get' | 'post',
  path: string,
  status: number,
  body: Record<string, unknown>
): void => {
  server.use(http[method](`${NAV}/${path}`, () => HttpResponse.json(body, { status })));
};
const useFixture = (method: 'get' | 'post', path: string, name: string): void => {
  const f = fx(name);
  server.use(http[method](`${NAV}/${path}`, () => fixtureResponse(f)));
};
const useDelay = (method: 'get' | 'post', path: string): void => {
  server.use(
    http[method](`${NAV}/${path}`, async () => {
      await delay(200);
      return HttpResponse.json({});
    })
  );
};
const aborted = (): AbortSignal => {
  const ac = new AbortController();
  ac.abort();
  return ac.signal;
};

const badEndpoints: [string, unknown, unknown][] = [
  ['start ""', '', 'n2'],
  ['start "  "', '  ', 'n2'],
  ['start NaN', Number.NaN, 'n2'],
  ['start Infinity', Number.POSITIVE_INFINITY, 'n2'],
  ['start lat 91', { lat: 91, lon: 1 }, 'n2'],
  ['start lat -91', { lat: -91, lon: 1 }, 'n2'],
  ["start lon 'x'", { lat: 1, lon: 'x' }, 'n2'],
  ['start lon 181', { lat: 1, lon: 181 }, 'n2'],
  ['start lon -181', { lat: 1, lon: -181 }, 'n2'],
  ['start level 0.5', { lat: 1, lon: 2, level: 0.5 }, 'n2'],
  ["start level '1'", { lat: 1, lon: 2, level: '1' }, 'n2'],
  ['start { x: 1 }', { x: 1 }, 'n2'],
  ['start { lat: 1 }', { lat: 1 }, 'n2'],
  ['start null', null, 'n2'],
  ['start array', [1, 2], 'n2'],
  ['start boolean', true, 'n2'],
  ['end missing', 'n1', undefined],
];

describe('navigation.shortestPath (N-1 … N-14)', () => {
  it('N-1: node ids → POST /spatial/navigate/ns/shortest-path, body exactly {start,end,venueId}', async () => {
    const rec = recordRequests();
    const result = await makeClient().navigation.shortestPath({ start: 'n1', end: 'n2' });
    expect(result).toEqual(bodyOf('shortest-path'));
    expect(rec.requests).toHaveLength(1);
    await expectNavRequest(rec.requests[0], {
      method: 'POST',
      path: '/spatial/navigate/ns/shortest-path',
      venueId: 7,
      body: { start: 'n1', end: 'n2', venueId: 7 },
    });
  });

  it('N-2: numeric ids are sent as strings (0 → "0")', async () => {
    const rec = recordRequests();
    await makeClient().navigation.shortestPath({ start: 0, end: 12 });
    await expectNavRequest(rec.requests[0], {
      method: 'POST',
      path: '/spatial/navigate/ns/shortest-path',
      venueId: 7,
      body: { start: '0', end: '12', venueId: 7 },
    });
  });

  it('N-3: a point takes the context level; an explicit level 0 is kept; no level anywhere → none sent', async () => {
    const client = makeClient({ namespace: 'ns', venueId: 7, level: -1 });
    const rec = recordRequests();
    await client.navigation.shortestPath({ start: { lat: 48.1, lon: 2.3 }, end: 'n2' });
    await client.navigation.shortestPath({ start: { lat: 48.1, lon: 2.3, level: 0 }, end: 'n2' });
    await client.navigation.shortestPath(
      { start: { lat: 48.1, lon: 2.3 }, end: { lat: 48.2, lon: 2.4 } },
      { level: 3 }
    );
    await makeClient().navigation.shortestPath({ start: { lat: 48.1, lon: 2.3 }, end: 'n2' });
    const path = '/spatial/navigate/ns/shortest-path';
    await expectNavRequest(rec.requests[0], {
      method: 'POST',
      path,
      venueId: 7,
      body: { start: { lat: 48.1, lon: 2.3, level: -1 }, end: 'n2', venueId: 7 },
    });
    await expectNavRequest(rec.requests[1], {
      method: 'POST',
      path,
      venueId: 7,
      body: { start: { lat: 48.1, lon: 2.3, level: 0 }, end: 'n2', venueId: 7 },
    });
    await expectNavRequest(rec.requests[2], {
      method: 'POST',
      path,
      venueId: 7,
      body: {
        start: { lat: 48.1, lon: 2.3, level: 3 },
        end: { lat: 48.2, lon: 2.4, level: 3 },
        venueId: 7,
      },
    });
    await expectNavRequest(rec.requests[3], {
      method: 'POST',
      path,
      venueId: 7,
      body: { start: { lat: 48.1, lon: 2.3 }, end: 'n2', venueId: 7 },
    });
  });

  it('N-4: walkingSpeed and returnToStart are sent; roundTripInfo is typed', async () => {
    useFixture('post', 'shortest-path', 'shortest-path-roundtrip');
    const rec = recordRequests();
    const result: RouteResult = await makeClient().navigation.shortestPath({
      start: 'n1',
      end: 'n2',
      walkingSpeed: 2,
      returnToStart: true,
    });
    await expectNavRequest(rec.requests[0], {
      method: 'POST',
      path: '/spatial/navigate/ns/shortest-path',
      venueId: 7,
      body: { start: 'n1', end: 'n2', venueId: 7, walkingSpeed: 2, returnToStart: true },
    });
    expect(result).toEqual(bodyOf('shortest-path-roundtrip'));
    const returnDistance: number | undefined = result.roundTripInfo?.returnDistance;
    expect(returnDistance).toBe(32.4);
    expect(result.path.at(-1)?.id).toBe(result.path[0]?.id);
  });

  it('N-5: per-call namespace and venueId; no namespace key in the body', async () => {
    const rec = recordRequests();
    await makeClient().navigation.shortestPath(
      { start: 'n1', end: 'n2' },
      { venueId: 9, namespace: 'o' }
    );
    await expectNavRequest(rec.requests[0], {
      method: 'POST',
      path: '/spatial/navigate/o/shortest-path',
      venueId: 9,
      body: { start: 'n1', end: 'n2', venueId: 9 },
    });
  });

  it('N-6: no venue (or no namespace) → ContextError, 0 requests', async () => {
    await expectContextError(() =>
      makeClient({ namespace: 'ns' }).navigation.shortestPath({ start: 'n1', end: 'n2' })
    );
    await expectContextError(() =>
      makeClient({ venueId: 7 }).navigation.shortestPath({ start: 'n1', end: 'n2' })
    );
    await expectContextError(() =>
      makeClient().navigation.shortestPath({ start: 'n1', end: 'n2' }, { venueId: Number.NaN })
    );
  });

  it.each(badEndpoints)(
    'N-7: %s → ValidationError (status 0), 0 requests',
    async (_l, start, end) => {
      const request = { start, end } as unknown as ShortestPathRequest;
      await expectLocalValidation(() => makeClient().navigation.shortestPath(request));
    }
  );

  it('N-7: a request that is not an object → ValidationError, 0 requests', async () => {
    await expectLocalValidation(() =>
      makeClient().navigation.shortestPath(null as unknown as ShortestPathRequest)
    );
  });

  it('N-8: a start lat or lon of exactly 0 → ValidationError naming "exactly 0"; an end at 0 is accepted', async () => {
    await expectLocalValidation(
      () => makeClient().navigation.shortestPath({ start: { lat: 0, lon: 2 }, end: 'n2' }),
      /exactly 0/
    );
    await expectLocalValidation(
      () => makeClient().navigation.shortestPath({ start: { lat: 2, lon: 0 }, end: 'n2' }),
      /exactly 0/
    );
    await expect(
      makeClient().navigation.shortestPath({ start: { lat: 0, lon: 2 }, end: 'n2' })
    ).rejects.toSatisfy((e: unknown) => e instanceof Error && !/USI-/.test(e.message));
    const rec = recordRequests();
    await makeClient({ namespace: 'ns', venueId: 7, level: 1 }).navigation.shortestPath({
      start: 'n1',
      end: { lat: 0, lon: 2 },
    });
    await expectNavRequest(rec.requests[0], {
      method: 'POST',
      path: '/spatial/navigate/ns/shortest-path',
      venueId: 7,
      body: { start: 'n1', end: { lat: 0, lon: 2, level: 1 }, venueId: 7 },
    });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, '2'])(
    'N-9: walkingSpeed %s → ValidationError, 0 requests',
    async (walkingSpeed) => {
      await expectLocalValidation(() =>
        makeClient().navigation.shortestPath({
          start: 'n1',
          end: 'n2',
          walkingSpeed: walkingSpeed as number,
        })
      );
    }
  );

  it('N-10: 400 {error} → ValidationError with the message of error', async () => {
    useFixture('post', 'shortest-path', 'nav-400-missing');
    await expect(
      makeClient().navigation.shortestPath({ start: 'n1', end: 'n2' })
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof ValidationError &&
        e.status === 400 &&
        e.message === 'Missing required parameters: start, end'
    );
  });

  it('N-11: 404 no path → NotFoundError with message and the NavigationFailureBody', async () => {
    useFixture('post', 'shortest-path', 'nav-404-no-path');
    const call = () => makeClient().navigation.shortestPath({ start: 'n1', end: 'n2' });
    await expect(call()).rejects.toBeInstanceOf(NotFoundError);
    await expect(call()).rejects.toMatchObject({
      message: 'No path found between nodes',
      status: 404,
      body: bodyOf('nav-404-no-path'),
    });
    await expect(call()).rejects.toSatisfy((e: unknown) => {
      const failure = (e as NotFoundError).body as NavigationFailureBody;
      return failure.success === false && failure.startNodeId === '101';
    });
  });

  it('N-12: 404 snap failure → NotFoundError, message starts "No node found near start position"', async () => {
    useFixture('post', 'shortest-path', 'nav-404-snap');
    await expect(
      makeClient().navigation.shortestPath({ start: { lat: 20.5, lon: 10.5 }, end: 'n2' })
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof NotFoundError && e.message.startsWith('No node found near start position')
    );
  });

  it('N-13: 500 unknown node → ServerError, status 500, message from error', async () => {
    useFixture('post', 'shortest-path', 'nav-500-unknown-node');
    await expect(makeClient().navigation.shortestPath({ start: 'n1', end: 'x' })).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof ServerError && e.status === 500 && e.message === 'End node x not found'
    );
  });

  it('N-14: 401, timeout, pre-aborted signal, 500 boom', async () => {
    const request = { start: 'n1', end: 'n2' };
    useAnswer('post', 'shortest-path', 401, { error: 'Failed to authenticate user' });
    await expect(makeClient().navigation.shortestPath(request)).rejects.toBeInstanceOf(
      AuthenticationError
    );
    useAnswer('post', 'shortest-path', 500, { error: 'boom' });
    await expect(makeClient().navigation.shortestPath(request)).rejects.toSatisfy(
      (e: unknown) => e instanceof ServerError && e.message === 'boom'
    );
    useDelay('post', 'shortest-path');
    await expect(
      makeClient().navigation.shortestPath(request, { timeoutMs: 5 })
    ).rejects.toBeInstanceOf(TimeoutError);
    await expect(
      makeClient().navigation.shortestPath(request, { signal: aborted() })
    ).rejects.toBeInstanceOf(AbortError);
  });
});

describe('navigation.accessiblePath (N-15, N-16)', () => {
  it('N-15: POST /accessible-path with the exact body; fixture result; 404, 500, no venue', async () => {
    const rec = recordRequests();
    const result = await makeClient().navigation.accessiblePath({
      start: 'n1',
      end: 'n2',
      returnToStart: true,
    });
    expect(result).toEqual(bodyOf('accessible-path'));
    await expectNavRequest(rec.requests[0], {
      method: 'POST',
      path: '/spatial/navigate/ns/accessible-path',
      venueId: 7,
      body: { start: 'n1', end: 'n2', venueId: 7, returnToStart: true },
    });
    useFixture('post', 'accessible-path', 'nav-404-no-path');
    await expect(
      makeClient().navigation.accessiblePath({ start: 'n1', end: 'n2' })
    ).rejects.toBeInstanceOf(NotFoundError);
    useAnswer('post', 'accessible-path', 500, { error: 'boom' });
    await expect(
      makeClient().navigation.accessiblePath({ start: 'n1', end: 'n2' })
    ).rejects.toBeInstanceOf(ServerError);
    await expectContextError(() =>
      makeClient({ namespace: 'ns' }).navigation.accessiblePath({ start: 'n1', end: 'n2' })
    );
  });

  it.each(badEndpoints)(
    'N-16: accessiblePath %s → ValidationError, 0 requests',
    async (_l, start, end) => {
      const request = { start, end } as unknown as ShortestPathRequest;
      await expectLocalValidation(() => makeClient().navigation.accessiblePath(request));
    }
  );

  it('N-16: accessiblePath refuses a start at exactly 0 too', async () => {
    await expectLocalValidation(
      () => makeClient().navigation.accessiblePath({ start: { lat: 0, lon: 1 }, end: 'n2' }),
      /exactly 0/
    );
  });

  it('N-16: shortestPath and multiStop are marked idempotent; accessiblePath passes retry: false', async () => {
    const client = makeClient();
    const spy = vi.spyOn(client.transport, 'request');
    await client.navigation.shortestPath({ start: 'n1', end: 'n2' });
    await client.navigation.accessiblePath({ start: 'n1', end: 'n2' });
    await client.navigation.multiStop({ start: 'a', stops: ['b'] });
    await client.navigation.nearestPoi(1, { poiType: 'all' });
    expect(spy).toHaveBeenCalledTimes(4);
    const optionsOf = (i: number): unknown => spy.mock.calls[i]?.[2];
    expect(optionsOf(0)).toMatchObject({ retry: { idempotent: true } });
    expect(optionsOf(1)).toMatchObject({ retry: false });
    expect(optionsOf(2)).toMatchObject({ retry: { idempotent: true } });
    expect(optionsOf(3)).toSatisfy((o: object) => !('retry' in o));
  });

  it('N-16: a retry policy listing POST never repeats accessiblePath (1 request on 503); shortestPath is retried', async () => {
    const client = createRtlsClient({
      apiKey: API_KEY,
      namespace: 'ns',
      venueId: 7,
      retry: { retries: 2, methods: ['GET', 'POST'], baseDelayMs: 0, maxDelayMs: 0 },
    });
    useAnswer('post', 'accessible-path', 503, { error: 'unavailable' });
    useAnswer('post', 'shortest-path', 503, { error: 'unavailable' });
    const rec = recordRequests();
    await expect(
      client.navigation.accessiblePath({ start: 'n1', end: 'n2' })
    ).rejects.toBeInstanceOf(ServerError);
    expect(rec.requests).toHaveLength(1);
    const rec2 = recordRequests();
    await expect(client.navigation.shortestPath({ start: 'n1', end: 'n2' })).rejects.toBeInstanceOf(
      ServerError
    );
    expect(rec2.requests).toHaveLength(3);
  });
});

describe('navigation.multiStop (N-17 … N-24)', () => {
  const path = '/spatial/navigate/ns/multi-stop';

  it('N-17: POST /multi-stop with the exact body; returns multi-stop.json', async () => {
    const rec = recordRequests();
    const result = await makeClient().navigation.multiStop({
      start: 'a',
      stops: ['b', 'c'],
      optimizeOrder: false,
      stopNames: ['B'],
    });
    expect(result).toEqual(bodyOf('multi-stop'));
    await expectNavRequest(rec.requests[0], {
      method: 'POST',
      path,
      venueId: 7,
      body: { start: 'a', stops: ['b', 'c'], venueId: 7, optimizeOrder: false, stopNames: ['B'] },
    });
  });

  it('N-18: algorithm, returnToStart and walkingSpeed are sent verbatim', async () => {
    const rec = recordRequests();
    await makeClient().navigation.multiStop({
      start: 1,
      stops: [2],
      algorithm: 'twoOpt',
      returnToStart: true,
      walkingSpeed: 1.5,
    });
    await expectNavRequest(rec.requests[0], {
      method: 'POST',
      path,
      venueId: 7,
      body: {
        start: '1',
        stops: ['2'],
        venueId: 7,
        algorithm: 'twoOpt',
        returnToStart: true,
        walkingSpeed: 1.5,
      },
    });
  });

  it('N-19: coordinate stops become {lat,lon,level} with the context level; a start lat 0 is accepted', async () => {
    const rec = recordRequests();
    await makeClient({ namespace: 'ns', venueId: 7, level: 2 }).navigation.multiStop({
      start: { lat: 0, lon: 2 },
      stops: [{ lat: 1, lon: 2 }, { lat: 1.5, lon: 2.5, level: -1 }, 'n9'],
    });
    await expectNavRequest(rec.requests[0], {
      method: 'POST',
      path,
      venueId: 7,
      body: {
        start: { lat: 0, lon: 2, level: 2 },
        stops: [{ lat: 1, lon: 2, level: 2 }, { lat: 1.5, lon: 2.5, level: -1 }, 'n9'],
        venueId: 7,
      },
    });
  });

  it.each<[string, unknown]>([
    ['stops []', { start: 'a', stops: [] }],
    ['stops not an array', { start: 'a', stops: 'b' }],
    ['stops missing', { start: 'a' }],
    ["a stop ''", { start: 'a', stops: ['b', ''] }],
    ['a stop { x: 1 }', { start: 'a', stops: [{ x: 1 }] }],
    ['stopNames longer than stops', { start: 'a', stops: ['b'], stopNames: ['B', 'C'] }],
    ['stopNames not an array', { start: 'a', stops: ['b'], stopNames: 'B' }],
    ['start missing', { stops: ['b'] }],
    ['walkingSpeed 0', { start: 'a', stops: ['b'], walkingSpeed: 0 }],
    ['request not an object', 'a'],
  ])('N-20: %s → ValidationError, 0 requests', async (_l, request) => {
    await expectLocalValidation(() =>
      makeClient().navigation.multiStop(
        request as Parameters<RtlsClient['navigation']['multiStop']>[0]
      )
    );
  });

  it('N-21: 404 Node x not found → NotFoundError with that message', async () => {
    useAnswer('post', 'multi-stop', 404, { success: false, message: 'Node x not found' });
    await expect(makeClient().navigation.multiStop({ start: 'x', stops: ['b'] })).rejects.toSatisfy(
      (e: unknown) => e instanceof NotFoundError && e.message === 'Node x not found'
    );
  });

  it("N-22: algorithm 'genetic' (not offered) → 404 NotFoundError whose message contains 'TSPSolver.genetic is not a function'", async () => {
    useFixture('post', 'multi-stop', 'multi-stop-404-genetic');
    const rec = recordRequests();
    await expect(
      makeClient().navigation.multiStop({
        start: 'a',
        stops: ['b'],
        algorithm: 'genetic' as never,
      })
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof NotFoundError && /TSPSolver\.genetic is not a function/.test(e.message)
    );
    await expectNavRequest(rec.requests[0], {
      method: 'POST',
      path,
      venueId: 7,
      body: { start: 'a', stops: ['b'], venueId: 7, algorithm: 'genetic' },
    });
  });

  it('N-23: 400 → ValidationError; 500 → ServerError; 401 → AuthenticationError; no venue → ContextError', async () => {
    const request = { start: 'a', stops: ['b'] };
    useFixture('post', 'multi-stop', 'nav-400-missing');
    await expect(makeClient().navigation.multiStop(request)).rejects.toSatisfy(
      (e: unknown) => e instanceof ValidationError && e.status === 400
    );
    useAnswer('post', 'multi-stop', 500, { error: 'boom' });
    await expect(makeClient().navigation.multiStop(request)).rejects.toBeInstanceOf(ServerError);
    useAnswer('post', 'multi-stop', 401, { error: 'Failed to authenticate user' });
    await expect(makeClient().navigation.multiStop(request)).rejects.toBeInstanceOf(
      AuthenticationError
    );
    await expectContextError(() => makeClient({ namespace: 'ns' }).navigation.multiStop(request));
  });

  it('N-24: multiStopInfo and stop markers are typed (no casts)', async () => {
    const result: MultiStopRouteResult = await makeClient().navigation.multiStop({
      start: 'a',
      stops: ['b', 'c'],
    });
    const optimized: boolean = result.multiStopInfo.optimized;
    const stopIndexes: (number | undefined)[] = result.path.map((n) => n.stopIndex);
    expect(optimized).toBe(true);
    expect(result.multiStopInfo.stopCount).toBe(2);
    expect(stopIndexes).toEqual([undefined, 2, undefined, 1]);
    expect(result.path.filter((n) => n.isStop).map((n) => n.stopName)).toEqual(['Stop 2', 'B']);
  });
});

describe('navigation.nearestPoi and evacuationRoute (N-25 … N-32)', () => {
  it('N-25: GET /nearest-poi/123?poiType=all&venueId=7', async () => {
    const rec = recordRequests();
    await makeClient().navigation.nearestPoi(123, { poiType: 'all' });
    await expectNavRequest(rec.requests[0], {
      method: 'GET',
      path: '/spatial/navigate/ns/nearest-poi/123',
      venueId: 7,
      query: { poiType: 'all', venueId: '7' },
    });
  });

  it('N-26: the node id is percent-encoded in the path', async () => {
    const rec = recordRequests();
    await makeClient().navigation.nearestPoi('poi_x y', { poiType: 'exit' });
    await expectNavRequest(rec.requests[0], {
      method: 'GET',
      path: '/spatial/navigate/ns/nearest-poi/poi_x%20y',
      venueId: 7,
      query: { poiType: 'exit', venueId: '7' },
    });
  });

  it.each<[string, unknown, unknown]>([
    ["poiType ''", 1, { poiType: '' }],
    ["poiType '  '", 1, { poiType: '  ' }],
    ['poiType missing', 1, {}],
    ['poiType a number', 1, { poiType: 3 }],
    ['options missing', 1, undefined],
    ["nodeId ''", '', { poiType: 'all' }],
    ['nodeId NaN', Number.NaN, { poiType: 'all' }],
    ['nodeId an object', { id: 1 }, { poiType: 'all' }],
  ])('N-27: %s → ValidationError, 0 requests', async (_l, nodeId, options) => {
    await expectLocalValidation(() =>
      makeClient().navigation.nearestPoi(
        nodeId as number,
        options as Parameters<RtlsClient['navigation']['nearestPoi']>[1]
      )
    );
  });

  it('N-28: result typed NearestPoiResult; 404, 400, 500, 401 mapped', async () => {
    const result: NearestPoiResult = await makeClient().navigation.nearestPoi(101, {
      poiType: 'all',
    });
    expect(result).toEqual(bodyOf('nearest-poi'));
    expect(result.poi.type).toBe('all');
    expect(result.path?.at(-1)?.id).toBeNull();
    useAnswer('get', 'nearest-poi/:nodeId', 404, {
      success: false,
      message: 'No POIs of type all found',
    });
    await expect(makeClient().navigation.nearestPoi(101, { poiType: 'all' })).rejects.toSatisfy(
      (e: unknown) => e instanceof NotFoundError && e.message === 'No POIs of type all found'
    );
    useAnswer('get', 'nearest-poi/:nodeId', 400, {
      error: 'Missing required query parameter: poiType',
    });
    await expect(makeClient().navigation.nearestPoi(101, { poiType: 'all' })).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof ValidationError &&
        e.status === 400 &&
        e.message === 'Missing required query parameter: poiType'
    );
    useAnswer('get', 'nearest-poi/:nodeId', 500, { error: 'boom' });
    await expect(
      makeClient().navigation.nearestPoi(101, { poiType: 'all' })
    ).rejects.toBeInstanceOf(ServerError);
    useAnswer('get', 'nearest-poi/:nodeId', 401, { error: 'Failed to authenticate user' });
    await expect(
      makeClient().navigation.nearestPoi(101, { poiType: 'all' })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('N-29: GET /evacuation/n1?venueId=7, no other keys; returns evacuation.json', async () => {
    const rec = recordRequests();
    const result = await makeClient().navigation.evacuationRoute('n1');
    expect(result).toEqual(bodyOf('evacuation'));
    expect(result.emergency).toBe(true);
    await expectNavRequest(rec.requests[0], {
      method: 'GET',
      path: '/spatial/navigate/ns/evacuation/n1',
      venueId: 7,
      query: { venueId: '7' },
    });
  });

  it('N-30: 404 critical → NotFoundError with body.critical; 500; 401; blank node id', async () => {
    useFixture('get', 'evacuation/:nodeId', 'evacuation-404-critical');
    await expect(makeClient().navigation.evacuationRoute('n1')).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof NotFoundError &&
        e.message === 'Cannot find evacuation route' &&
        (e.body as NavigationFailureBody).critical === true
    );
    useAnswer('get', 'evacuation/:nodeId', 500, { error: 'boom' });
    await expect(makeClient().navigation.evacuationRoute('n1')).rejects.toBeInstanceOf(ServerError);
    useAnswer('get', 'evacuation/:nodeId', 401, { error: 'Failed to authenticate user' });
    await expect(makeClient().navigation.evacuationRoute('n1')).rejects.toBeInstanceOf(
      AuthenticationError
    );
    await expectLocalValidation(() => makeClient().navigation.evacuationRoute(''));
    useDelay('get', 'evacuation/:nodeId');
    await expect(
      makeClient().navigation.evacuationRoute('n1', { timeoutMs: 5 })
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it('N-31: nearestPoi / evacuationRoute without venue → ContextError, 0 requests', async () => {
    const client = makeClient({ namespace: 'ns' });
    await expectContextError(() => client.navigation.nearestPoi(1, { poiType: 'all' }));
    await expectContextError(() => client.navigation.evacuationRoute(1));
  });

  it('N-32: per-call namespace o and venueId 9 → path namespace o, query venueId=9', async () => {
    const rec = recordRequests();
    await makeClient().navigation.nearestPoi(5, { poiType: 'all', namespace: 'o', venueId: 9 });
    await makeClient().navigation.evacuationRoute(5, { namespace: 'o', venueId: 9 });
    await expectNavRequest(rec.requests[0], {
      method: 'GET',
      path: '/spatial/navigate/o/nearest-poi/5',
      venueId: 9,
      query: { poiType: 'all', venueId: '9' },
    });
    await expectNavRequest(rec.requests[1], {
      method: 'GET',
      path: '/spatial/navigate/o/evacuation/5',
      venueId: 9,
      query: { venueId: '9' },
    });
  });
});
