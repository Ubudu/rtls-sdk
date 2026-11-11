// Unit tests of ZonesResource (P4 §8.2, Z-1 … Z-22): zone lists with filters and shorthands, the deprecated
// map-level lists and the zone-presence timeline. The real request builders run through the transport against MSW;
// each request case asserts method, path, the full query, the X-API-Key header and, on venue routes, the absence of
// paging, sort and universal filter keys. The shared error matrix of the zone lists is in venues.test.ts (V-13).
import { afterEach, describe, it, expect, vi } from 'vitest';
import { delay, http, HttpResponse } from 'msw';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';
import { fixtureResponse, loadFixture } from '../../contract/fixtures';
import {
  AbortError,
  AuthenticationError,
  ContextError,
  ServerError,
  TimeoutError,
  ValidationError,
  combineFilters,
  createRtlsClient,
  filters,
  serializeFilters,
  type CallContext,
  type FilterOptions,
  type RtlsClient,
  type ZoneFeatureCollection,
  type ZonePresenceSlot,
} from '../../../src';

const BASE = 'https://rtls.ubudu.com/api';
const API_KEY = 'test-key';
const FORBIDDEN = ['limit', 'offset', 'page', 'sort', 'order', 'logic', 'level', 'type', 'fields'];
const DAY = 86_400_000;
const T = Date.UTC(2026, 10, 11, 12, 0, 0);

const fx = (name: string) => loadFixture('venues-navigation', name);
const bodyOf = <T = unknown>(name: string): T => fx(name).body as T;

function makeClient(ctx: CallContext = { namespace: 'ns', venueId: 7 }): RtlsClient {
  return createRtlsClient({ apiKey: API_KEY, ...ctx });
}

interface FilterEntry {
  field: string;
  operator: string;
  value: unknown;
}

const sortEntries = (entries: FilterEntry[]): FilterEntry[] =>
  [...entries].sort((a, b) => `${a.field}:${a.operator}`.localeCompare(`${b.field}:${b.operator}`));

function queryOf(req: RecordedRequest): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  req.url.searchParams.forEach((value, key) => {
    (out[key] ??= []).push(value);
  });
  return out;
}

/** One zone GET: method, path, X-API-Key, forbidden keys absent, query = nothing or exactly the given filters. */
async function expectZoneRequest(
  req: RecordedRequest | undefined,
  path: string,
  expectedFilters?: FilterOptions
): Promise<void> {
  expect(req, 'a request was sent').toBeDefined();
  const r = req as RecordedRequest;
  expect(r.method).toBe('GET');
  expect(r.url.pathname).toBe(`/api${path}`);
  expect(r.headers.get('x-api-key')).toBe(API_KEY);
  expect(FORBIDDEN.filter((k) => r.url.searchParams.has(k))).toEqual([]);
  expect(Object.keys(queryOf(r))).toEqual(expectedFilters ? ['filters'] : []);
  const sent = r.url.searchParams.get('filters');
  const expected = expectedFilters
    ? (JSON.parse(serializeFilters(expectedFilters, 'venue').filters ?? '[]') as FilterEntry[])
    : [];
  expect(sent === null ? [] : sortEntries(JSON.parse(sent) as FilterEntry[])).toEqual(
    sortEntries(expected)
  );
  expect(await r.text()).toBe('');
}

/** One zone-presence GET with exactly the given query. */
function expectPresenceRequest(
  req: RecordedRequest | undefined,
  namespace: string,
  query: Record<string, string>
): void {
  expect(req, 'a request was sent').toBeDefined();
  const r = req as RecordedRequest;
  expect(r.method).toBe('GET');
  expect(r.url.pathname).toBe(`/api/es/zone_presence/${namespace}`);
  expect(r.headers.get('x-api-key')).toBe(API_KEY);
  expect(queryOf(r)).toEqual(Object.fromEntries(Object.entries(query).map(([k, v]) => [k, [v]])));
}

async function expectNoRequest(
  run: () => Promise<unknown>,
  check: (e: unknown) => boolean
): Promise<void> {
  const rec = recordRequests();
  await expect(run()).rejects.toSatisfy(check);
  expect(rec.requests).toHaveLength(0);
}

const isLocalValidation = (e: unknown): boolean => e instanceof ValidationError && e.status === 0;

const answer = (route: string, status: number, body: Record<string, unknown> | unknown[]): void => {
  server.use(http.get(`${BASE}${route}`, () => HttpResponse.json(body, { status })));
};
const delayed = (route: string): void => {
  server.use(
    http.get(`${BASE}${route}`, async () => {
      await delay(200);
      return HttpResponse.json([]);
    })
  );
};
const aborted = (): AbortSignal => {
  const ac = new AbortController();
  ac.abort();
  return ac.signal;
};

afterEach(() => {
  vi.useRealTimers();
});

describe('zones.list and its flat forms (Z-1 … Z-9)', () => {
  it('Z-1: list() → GET /venues/ns/7/zones, no query; returns zones.json', async () => {
    const rec = recordRequests();
    const zones: ZoneFeatureCollection = await makeClient().zones.list();
    expect(zones).toEqual(bodyOf('zones'));
    expect(rec.requests).toHaveLength(1);
    await expectZoneRequest(rec.requests[0], '/venues/ns/7/zones');
  });

  it('Z-2: list({ level: 1, tag: "dock" }) → properties.level eq 1 and properties.tags contains; total kept', async () => {
    const filtered = fx('zones-filtered');
    server.use(
      http.get(`${BASE}/venues/:namespace/:venueId/zones`, () => fixtureResponse(filtered))
    );
    const rec = recordRequests();
    const result = await makeClient().zones.list({ level: 1, tag: 'dock' });
    expect(result).toEqual(filtered.body);
    expect(result.total).toBe((filtered.body as ZoneFeatureCollection).total);
    expect(result.total, 'a filtered collection has total === features.length').toBe(
      result.features.length
    );
    await expectZoneRequest(
      rec.requests[0],
      '/venues/ns/7/zones',
      combineFilters(
        filters.equals('properties.level', 1),
        filters.contains('properties.tags', 'dock')
      )
    );
    await makeClient().zones.list({
      level: 1,
      filters: combineFilters(
        filters.equals('properties.level', 4),
        filters.startsWith('properties.name', 'Zone')
      ),
    });
    await expectZoneRequest(
      rec.requests[1],
      '/venues/ns/7/zones',
      combineFilters(
        filters.equals('properties.level', 1),
        filters.startsWith('properties.name', 'Zone')
      )
    );
  });

  it('Z-3: legacy (ns, 7) and (ns, "7"); the deprecated trailing argument is honoured and wins', async () => {
    const rec = recordRequests();
    await makeClient({}).zones.list('ns', 7);
    await makeClient({}).zones.list('ns', '7');
    await expectZoneRequest(rec.requests[0], '/venues/ns/7/zones');
    await expectZoneRequest(rec.requests[1], '/venues/ns/7/zones');
    await expect(makeClient({}).zones.list('ns', 'x')).rejects.toSatisfy(
      (e: unknown) => e instanceof ContextError && e.problem === 'invalid'
    );
    delayed('/venues/:namespace/:venueId/zones');
    await expect(makeClient().zones.list({ venueId: 8 }, { timeoutMs: 5 })).rejects.toBeInstanceOf(
      TimeoutError
    );
    await expect(
      makeClient().zones.list({ venueId: 8, timeoutMs: 10_000 }, { timeoutMs: 5 })
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it('Z-3: legacy form with an options bag sends its level, tag and filters', async () => {
    const rec = recordRequests();
    const legacyBag = (bag: object): never => bag as never;
    await makeClient({}).zones.list('ns', legacyBag({ venueId: 9, tag: 'dock', level: 0 }));
    await makeClient({}).zones.listAsArray(
      'ns',
      9,
      legacyBag({ filters: filters.startsWith('properties.name', 'Zone') })
    );
    await expectZoneRequest(
      rec.requests[0],
      '/venues/ns/9/zones',
      combineFilters(
        filters.equals('properties.level', 0),
        filters.contains('properties.tags', 'dock')
      )
    );
    await expectZoneRequest(
      rec.requests[1],
      '/venues/ns/9/zones',
      filters.startsWith('properties.name', 'Zone')
    );
    await expect(makeClient({}).zones.list('ns', 9, legacyBag({ level: 'x' }))).rejects.toSatisfy(
      (e: unknown) => e instanceof ContextError && e.problem === 'invalid'
    );
  });

  it('Z-4: listAsArray() → color from rgb_color, geometry kept', async () => {
    const zones = await makeClient().zones.listAsArray();
    const features = bodyOf<ZoneFeatureCollection>('zones').features;
    expect(zones).toEqual(
      features.map(({ properties: p, geometry }) => ({
        id: p.id,
        name: p.name,
        level: p.level,
        color: p.rgb_color,
        tags: p.tags,
        type: p.type,
        geometry,
      }))
    );
    expect(zones[0]?.color).toBe('#2E79FF');
  });

  it('Z-5: iterate() → 1 request, yields every zone; legacy iterate("ns", 7)', async () => {
    const rec = recordRequests();
    const names: string[] = [];
    for await (const zone of makeClient().zones.iterate()) names.push(zone.name);
    expect(names).toEqual(['Zone 1', 'Zone 2']);
    expect(rec.requests).toHaveLength(1);
    const legacy: string[] = [];
    for await (const zone of makeClient({}).zones.iterate('ns', 7)) legacy.push(zone.name);
    expect(legacy).toEqual(names);
    await expectZoneRequest(rec.requests[1], '/venues/ns/7/zones');
  });

  it('Z-6: getAll() (deprecated) gives the same result as listAsArray()', async () => {
    expect(await makeClient().zones.getAll()).toEqual(await makeClient().zones.listAsArray());
    expect(await makeClient({}).zones.getAll('ns', 7)).toHaveLength(2);
  });

  it('Z-7: list({ tag: "sdk-none" }) → filter sent; an empty filtered collection is returned as is', async () => {
    const empty = { type: 'FeatureCollection', features: [], total: 0 };
    answer('/venues/:namespace/:venueId/zones', 200, empty);
    const rec = recordRequests();
    expect(await makeClient().zones.list({ tag: 'sdk-none' })).toEqual(empty);
    await expectZoneRequest(
      rec.requests[0],
      '/venues/ns/7/zones',
      filters.contains('properties.tags', 'sdk-none')
    );
  });

  it('Z-8: pre-aborted signal → AbortError', async () => {
    await expect(makeClient().zones.list({ signal: aborted() })).rejects.toBeInstanceOf(AbortError);
  });

  it('Z-9: the client default level is not applied; a malformed per-call level → ContextError', async () => {
    const rec = recordRequests();
    await makeClient({ namespace: 'ns', venueId: 7, level: 3 }).zones.list();
    await expectZoneRequest(rec.requests[0], '/venues/ns/7/zones');
    await expectNoRequest(
      () => makeClient().zones.listAsArray({ level: 0.5 }),
      (e) => e instanceof ContextError && e.problem === 'invalid'
    );
  });
});

describe('zones.listByMap / listByMapAsArray (Z-10 … Z-12)', () => {
  it('Z-10: listByMap() with mapId 3 → GET /venues/ns/7/maps/3/zones; map-zones.json (no metadata) accepted', async () => {
    const rec = recordRequests();
    const result = await makeClient({ namespace: 'ns', venueId: 7, mapId: 3 }).zones.listByMap();
    expect(result).toEqual(bodyOf('map-zones'));
    await expectZoneRequest(rec.requests[0], '/venues/ns/7/maps/3/zones');
    await makeClient().zones.listByMap({ mapId: 4, timeoutMs: 1000 });
    await expectZoneRequest(rec.requests[1], '/venues/ns/7/maps/4/zones');
  });

  it('Z-11: listByMapAsArray() on empty features → []', async () => {
    expect(
      await makeClient({ namespace: 'ns', venueId: 7, mapId: 3 }).zones.listByMapAsArray()
    ).toEqual([]);
  });

  it('Z-12: legacy listByMap("ns", 7, 3); missing mapId → ContextError, 0 requests', async () => {
    const rec = recordRequests();
    await makeClient({}).zones.listByMap('ns', 7, 3);
    await makeClient({}).zones.listByMapAsArray('ns', '7', '3', { timeoutMs: 1000 });
    await expectZoneRequest(rec.requests[0], '/venues/ns/7/maps/3/zones');
    await expectZoneRequest(rec.requests[1], '/venues/ns/7/maps/3/zones');
    rec.stop();
    await expectNoRequest(
      () => makeClient().zones.listByMap(),
      (e) => e instanceof ContextError && e.problem === 'missing'
    );
    await expectNoRequest(
      () => makeClient({}).zones.listByMap('ns', 7, 'x'),
      (e) => e instanceof ContextError && e.problem === 'invalid'
    );
  });
});

describe('zones.getPresence (Z-13 … Z-22)', () => {
  const presence = (ctx: CallContext = { namespace: 'ns' }) => makeClient(ctx).zones;

  it('Z-13: no bounds → [T − 24 h, T], no other keys', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T);
    const rec = recordRequests();
    await presence().getPresence();
    expectPresenceRequest(rec.requests[0], 'ns', {
      timestampFrom: String(T - DAY),
      timestampTo: String(T),
    });
  });

  it('Z-14: a Date and an ISO string are sent as epoch-ms decimal strings', async () => {
    const a = Date.UTC(2025, 11, 31, 0, 0, 0);
    const rec = recordRequests();
    await presence().getPresence({
      timestampFrom: new Date(a),
      timestampTo: '2026-01-01T00:00:00Z',
    });
    expectPresenceRequest(rec.requests[0], 'ns', {
      timestampFrom: String(a),
      timestampTo: String(Date.UTC(2026, 0, 1)),
    });
  });

  it('Z-15: a MAC value is normalised for the udid key only; other values verbatim', async () => {
    const range = { timestampFrom: 1, timestampTo: 2 };
    const rec = recordRequests();
    await presence().getPresence({ ...range, value: 'AA:BB:CC:DD:EE:FF' });
    await presence().getPresence({ ...range, value: 'AA:BB:CC:DD:EE:FF', key: 'user.udid' });
    await presence().getPresence({ ...range, value: 'asset-7' });
    await presence().getPresence({ ...range, value: 'AA:BB:CC:DD:EE:FF', key: 'zone.name' });
    const base = { timestampFrom: '1', timestampTo: '2' };
    expectPresenceRequest(rec.requests[0], 'ns', { ...base, value: 'aabbccddeeff' });
    expectPresenceRequest(rec.requests[1], 'ns', {
      ...base,
      value: 'aabbccddeeff',
      key: 'user.udid',
    });
    expectPresenceRequest(rec.requests[2], 'ns', { ...base, value: 'asset-7' });
    expectPresenceRequest(rec.requests[3], 'ns', {
      ...base,
      value: 'AA:BB:CC:DD:EE:FF',
      key: 'zone.name',
    });
  });

  it("Z-16: interval '15m' and '500ms' are sent; calendar units and malformed values → VE, 0 requests", async () => {
    const range = { timestampFrom: 1, timestampTo: 2 };
    const rec = recordRequests();
    await presence().getPresence({ ...range, interval: '15m' });
    await presence().getPresence({ ...range, interval: '500ms' });
    expectPresenceRequest(rec.requests[0], 'ns', {
      timestampFrom: '1',
      timestampTo: '2',
      interval: '15m',
    });
    expectPresenceRequest(rec.requests[1], 'ns', {
      timestampFrom: '1',
      timestampTo: '2',
      interval: '500ms',
    });
    rec.stop();
    for (const interval of ['1M', '1w', '1y', '0m', '5', '', 15]) {
      await expectNoRequest(
        () => presence().getPresence({ ...range, interval: interval as string }),
        isLocalValidation
      );
    }
  });

  it('Z-17: only timestampFrom → to = now; only timestampTo → from = to − 24 h', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T);
    const a = T - 3_600_000;
    const b = T - 7_200_000;
    const rec = recordRequests();
    await presence().getPresence({ timestampFrom: a });
    await presence().getPresence({ timestampTo: b });
    expectPresenceRequest(rec.requests[0], 'ns', {
      timestampFrom: String(a),
      timestampTo: String(T),
    });
    expectPresenceRequest(rec.requests[1], 'ns', {
      timestampFrom: String(b - DAY),
      timestampTo: String(b),
    });
  });

  it("Z-18: key 'user.udid' is forwarded", async () => {
    const rec = recordRequests();
    await presence().getPresence({ timestampFrom: 1, timestampTo: 2, key: 'user.udid' });
    expectPresenceRequest(rec.requests[0], 'ns', {
      timestampFrom: '1',
      timestampTo: '2',
      key: 'user.udid',
    });
  });

  it('Z-19: legacy getPresence("ns", options); the deprecated trailing argument is honoured', async () => {
    const rec = recordRequests();
    await makeClient({}).zones.getPresence('legacy', { timestampFrom: 1, timestampTo: 2 });
    expectPresenceRequest(rec.requests[0], 'legacy', { timestampFrom: '1', timestampTo: '2' });
    delayed('/es/zone_presence/:appNamespace');
    await expect(
      presence().getPresence({ timestampFrom: 1, timestampTo: 2 }, { timeoutMs: 5 })
    ).rejects.toBeInstanceOf(TimeoutError);
    await expect(
      makeClient({}).zones.getPresence('ns', { timestampFrom: 1, timestampTo: 2 }, { timeoutMs: 5 })
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it('Z-20: occupied, OUTSIDE_ALL_ZONES and UNKNOWN_ZONE slots are returned unchanged', async () => {
    const slots: ZonePresenceSlot[] = await presence().getPresence({
      timestampFrom: 1,
      timestampTo: 2,
    });
    expect(slots).toEqual(bodyOf('zone-presence'));
    const sentinels = fx('zone-presence-sentinels');
    server.use(
      http.get(`${BASE}/es/zone_presence/:appNamespace`, () => fixtureResponse(sentinels))
    );
    const both = await presence().getPresence({ timestampFrom: 1, timestampTo: 2 });
    expect(both).toEqual(sentinels.body);
    expect(both.map((s) => s.name)).toEqual(['OUTSIDE_ALL_ZONES', 'UNKNOWN_ZONE']);
  });

  it('Z-21: 400, 500, 401 mapped; no namespace → ContextError; pre-aborted → AbortError', async () => {
    const route = '/es/zone_presence/:appNamespace';
    const range = { timestampFrom: 1, timestampTo: 2 };
    answer(route, 400, { error: 'timestampFrom and timestampTo are required parameters' });
    await expect(presence().getPresence(range)).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof ValidationError &&
        e.status === 400 &&
        e.message === 'timestampFrom and timestampTo are required parameters'
    );
    answer(route, 500, { error: 'search_phase_execution_exception' });
    await expect(presence().getPresence(range)).rejects.toSatisfy(
      (e: unknown) => e instanceof ServerError && e.message === 'search_phase_execution_exception'
    );
    answer(route, 401, { error: 'Failed to authenticate user' });
    await expect(presence().getPresence(range)).rejects.toBeInstanceOf(AuthenticationError);
    await expectNoRequest(
      () => makeClient({}).zones.getPresence(range),
      (e) => e instanceof ContextError
    );
    await expect(presence().getPresence({ ...range, signal: aborted() })).rejects.toBeInstanceOf(
      AbortError
    );
  });

  it('Z-22: from > to and an unparseable time → VE, 0 requests; from === to is sent', async () => {
    const a = 1_000;
    const b = 2_000;
    await expectNoRequest(
      () => presence().getPresence({ timestampFrom: b, timestampTo: a }),
      isLocalValidation
    );
    await expectNoRequest(
      () => presence().getPresence({ timestampFrom: 'not a date', timestampTo: a }),
      isLocalValidation
    );
    const rec = recordRequests();
    await presence().getPresence({ timestampFrom: a, timestampTo: a });
    expectPresenceRequest(rec.requests[0], 'ns', { timestampFrom: '1000', timestampTo: '1000' });
  });
});
