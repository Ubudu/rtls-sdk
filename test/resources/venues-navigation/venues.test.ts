// Unit tests of VenuesResource (P4 §8.1, V-1 … V-23) and the shared error matrix of every venue-scoped method of
// VenuesResource and ZonesResource (V-13). The real request builders run through the transport against MSW; each
// request case asserts method, path, the full query (filters computed with serializeFilters(…, 'venue')), the
// X-API-Key header and the absence of paging, sort and universal filter keys.
import { describe, it, expect } from 'vitest';
import { delay, http, HttpResponse } from 'msw';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';
import { fixtureResponse, loadFixture } from '../../contract/fixtures';
import {
  AbortError,
  AuthenticationError,
  ContextError,
  NotFoundError,
  ResponseParseError,
  ServerError,
  TimeoutError,
  combineFilters,
  createRtlsClient,
  filters,
  serializeFilters,
  type CallContext,
  type FilterOptions,
  type IndoorMap,
  type PathFeatureCollection,
  type PathNodeFeature,
  type PathSegmentFeature,
  type POIFeatureCollection,
  type RequestOptions,
  type RtlsClient,
  type VenueDetails,
  type VenueSummary,
} from '../../../src';

const BASE = 'https://rtls.ubudu.com/api';
const API_KEY = 'test-key';
const FORBIDDEN = ['limit', 'offset', 'page', 'sort', 'order', 'logic', 'level', 'type', 'fields'];

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

/** The filter entries the SDK should send for `expected`, computed with P1's serializer. */
function expectedEntries(expected: FilterOptions): FilterEntry[] {
  const query = serializeFilters(expected, 'venue');
  return sortEntries(JSON.parse(query.filters ?? '[]') as FilterEntry[]);
}

/**
 * Asserts one venue GET completely: method, path, X-API-Key, no body, no forbidden key, and either no query at
 * all or exactly `filters=<JSON>` with the entries of `expectedFilters` (order-independent).
 */
async function expectVenueRequest(
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
  const keys: string[] = [];
  r.url.searchParams.forEach((_v, k) => keys.push(k));
  expect(keys).toEqual(expectedFilters ? ['filters'] : []);
  const sent = r.url.searchParams.get('filters');
  expect(sent === null ? [] : sortEntries(JSON.parse(sent) as FilterEntry[])).toEqual(
    expectedFilters ? expectedEntries(expectedFilters) : []
  );
  expect(await r.text()).toBe('');
}

async function expectContextError(
  run: () => Promise<unknown>,
  problem: 'missing' | 'invalid' = 'missing'
): Promise<void> {
  const rec = recordRequests();
  await expect(run()).rejects.toSatisfy(
    (e: unknown) => e instanceof ContextError && e.status === 0 && e.problem === problem
  );
  expect(rec.requests).toHaveLength(0);
}

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

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

describe('venues.list / iterate (V-1 … V-7)', () => {
  it('V-1: list() → GET /venues/ns, no query; returns venues-list.json', async () => {
    const rec = recordRequests();
    const venues: VenueSummary[] = await makeClient({ namespace: 'ns' }).venues.list();
    expect(venues).toEqual(bodyOf('venues-list'));
    expect(rec.requests).toHaveLength(1);
    await expectVenueRequest(rec.requests[0], '/venues/ns');
  });

  it('V-2: list({ namespace: "other" }) → GET /venues/other (0.2 regression)', async () => {
    const rec = recordRequests();
    await makeClient({ namespace: 'ns' }).venues.list({ namespace: 'other' });
    await expectVenueRequest(rec.requests[0], '/venues/other');
  });

  it("V-3: list('legacy') → /venues/legacy; timeoutMs per call and in the legacy form → TimeoutError", async () => {
    const rec = recordRequests();
    await makeClient({ namespace: 'ns' }).venues.list('legacy');
    await expectVenueRequest(rec.requests[0], '/venues/legacy');
    delayed('/venues/:namespace');
    await expect(makeClient().venues.list({ timeoutMs: 5 })).rejects.toBeInstanceOf(TimeoutError);
    await expect(makeClient().venues.list('ns', { timeoutMs: 5 })).rejects.toBeInstanceOf(
      TimeoutError
    );
  });

  it('V-4: list({ filters }) → filters=<JSON>; no paging or sort key', async () => {
    const rec = recordRequests();
    await makeClient().venues.list({ filters: filters.equals('name', 'A') });
    await expectVenueRequest(rec.requests[0], '/venues/ns', filters.equals('name', 'A'));
    expect(rec.requests[0]?.url.searchParams.get('filters')).toBe(
      serializeFilters(filters.equals('name', 'A'), 'venue').filters
    );
  });

  it('V-5: the {data,pagination} envelope gives data; {} / {data:"x"} / null → ResponseParseError', async () => {
    const envelope = fx('venues-list-envelope');
    server.use(http.get(`${BASE}/venues/:namespace`, () => fixtureResponse(envelope)));
    expect(await makeClient().venues.list()).toEqual(
      (envelope.body as { data: VenueSummary[] }).data
    );
    for (const body of [{}, { data: 'x' }]) {
      answer('/venues/:namespace', 200, body);
      await expect(makeClient().venues.list()).rejects.toSatisfy(
        (e: unknown) => e instanceof ResponseParseError && e.status === 200
      );
    }
    server.use(http.get(`${BASE}/venues/:namespace`, () => HttpResponse.json(null)));
    await expect(makeClient().venues.list()).rejects.toBeInstanceOf(ResponseParseError);
  });

  it('V-6: iterate() → 1 request, 5 items in order; legacy; 500 and no namespace reject the first next()', async () => {
    const [first] = bodyOf<VenueSummary[]>('venues-list');
    const five = [1, 2, 3, 4, 5].map((i) => ({ ...first, id: i, name: `Venue ${i}` }));
    answer('/venues/:namespace', 200, five);
    const rec = recordRequests();
    expect(await collect(makeClient().venues.iterate())).toEqual(five);
    expect(rec.requests).toHaveLength(1);
    expect(await collect(makeClient().venues.iterate('legacy'))).toEqual(five);
    await expectVenueRequest(rec.requests[1], '/venues/legacy');
    answer('/venues/:namespace', 500, { error: 'Failed to retrieve venues' });
    await expect(makeClient().venues.iterate().next()).rejects.toBeInstanceOf(ServerError);
    await expectContextError(() => makeClient({}).venues.iterate().next());
  });

  it('V-7: no namespace → ContextError; 401, 500 and pre-aborted signal mapped', async () => {
    await expectContextError(() => makeClient({}).venues.list());
    answer('/venues/:namespace', 401, { error: 'Failed to authenticate user' });
    await expect(makeClient().venues.list()).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof AuthenticationError && e.message === 'Failed to authenticate user'
    );
    answer('/venues/:namespace', 500, { error: 'Failed to retrieve venues' });
    await expect(makeClient().venues.list()).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof ServerError && e.status === 500 && e.message === 'Failed to retrieve venues'
    );
    await expect(makeClient().venues.list({ signal: aborted() })).rejects.toBeInstanceOf(
      AbortError
    );
  });
});

describe('venues.get / listMaps (V-8 … V-12, V-14)', () => {
  it('V-8: get() → GET /venues/ns/7; typed details with openingHours; the live details too', async () => {
    const rec = recordRequests();
    const venue: VenueDetails = await makeClient().venues.get();
    expect(venue).toEqual(bodyOf('venue-details-opening-hours'));
    expect(venue.metadata?.openingHours?.week.saturday).toBe('Closed');
    await expectVenueRequest(rec.requests[0], '/venues/ns/7');
    const live = fx('venue-details');
    server.use(http.get(`${BASE}/venues/:namespace/:venueId`, () => fixtureResponse(live)));
    expect(await makeClient().venues.get()).toEqual(live.body);
  });

  it("V-9: get({ venueId: 9 }), get('ns', '42'); malformed legacy ids → ContextError 'invalid'", async () => {
    const rec = recordRequests();
    await makeClient().venues.get({ venueId: 9 });
    await makeClient().venues.get('ns', '42');
    await makeClient({}).venues.get('ns', 5, { timeoutMs: 1000 });
    await expectVenueRequest(rec.requests[0], '/venues/ns/9');
    await expectVenueRequest(rec.requests[1], '/venues/ns/42');
    await expectVenueRequest(rec.requests[2], '/venues/ns/5');
    for (const id of ['x', '1.5', '-1']) {
      await expectContextError(() => makeClient().venues.get('ns', id), 'invalid');
    }
    await expectContextError(() => makeClient().venues.get({ venueId: Number.NaN }), 'invalid');
  });

  it('V-10: an unknown id returns the 200 stub as is (USI-P4-2)', async () => {
    const stub = fx('venue-unknown');
    server.use(http.get(`${BASE}/venues/:namespace/:venueId`, () => fixtureResponse(stub)));
    expect(await makeClient().venues.get({ venueId: 999999999 })).toEqual(stub.body);
  });

  it('V-11: 404 Venue not found → NotFoundError; 500 → ServerError; 401 → AuthenticationError', async () => {
    answer('/venues/:namespace/:venueId', 404, { error: 'Venue not found' });
    await expect(makeClient().venues.get()).rejects.toSatisfy(
      (e: unknown) => e instanceof NotFoundError && e.message === 'Venue not found'
    );
    answer('/venues/:namespace/:venueId', 500, { error: 'Failed to retrieve venue' });
    await expect(makeClient().venues.get()).rejects.toBeInstanceOf(ServerError);
    answer('/venues/:namespace/:venueId', 401, { error: 'Failed to authenticate user' });
    await expect(makeClient().venues.get()).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('V-12: listMaps() → GET /venues/ns/7/maps, IndoorMap[]; [] → []; envelope → array; other → ResponseParseError', async () => {
    const rec = recordRequests();
    const maps: IndoorMap[] = await makeClient().venues.listMaps();
    expect(maps).toEqual(bodyOf('maps'));
    expect(maps[0]?.tiles_url_base).toContain('{z}/{x}/{y}');
    await expectVenueRequest(rec.requests[0], '/venues/ns/7/maps');
    answer('/venues/:namespace/:venueId/maps', 200, []);
    expect(await makeClient().venues.listMaps()).toEqual([]);
    answer('/venues/:namespace/:venueId/maps', 200, {
      data: bodyOf<IndoorMap[]>('maps'),
      pagination: { page: 1, limit: 1, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
    });
    expect(await makeClient().venues.listMaps()).toEqual(bodyOf('maps'));
    answer('/venues/:namespace/:venueId/maps', 200, { maps: [] });
    await expect(makeClient().venues.listMaps()).rejects.toBeInstanceOf(ResponseParseError);
  });

  it('V-14: listMaps({ level: 1 }) → level:eq 1; the client default level is not applied; bad level → ContextError', async () => {
    const rec = recordRequests();
    await makeClient().venues.listMaps({ level: 1 });
    await makeClient({ namespace: 'ns', venueId: 7, level: 2 }).venues.listMaps();
    await makeClient().venues.listMaps({
      level: 1,
      filters: combineFilters(filters.equals('level', 5), filters.equals('name', 'Map 1')),
    });
    await expectVenueRequest(rec.requests[0], '/venues/ns/7/maps', { 'level:eq': 1 });
    await expectVenueRequest(rec.requests[1], '/venues/ns/7/maps');
    await expectVenueRequest(rec.requests[2], '/venues/ns/7/maps', {
      'level:eq': 1,
      'name:eq': 'Map 1',
    });
    await expectContextError(() => makeClient().venues.listMaps({ level: 1.5 }), 'invalid');
  });
});

type Call = (client: RtlsClient, options?: object, trailing?: RequestOptions) => Promise<unknown>;

interface MethodRow {
  name: string;
  call: Call;
  route: string;
  message: string;
  trailing: boolean;
  map?: boolean;
}

const V13: MethodRow[] = [
  {
    name: 'venues.get',
    call: (c, o, t) => c.venues.get(o, t),
    route: '',
    message: 'Failed to retrieve venue',
    trailing: true,
  },
  {
    name: 'venues.listMaps',
    call: (c, o, t) => c.venues.listMaps(o, t),
    route: '/maps',
    message: 'Failed to retrieve venue maps',
    trailing: true,
  },
  {
    name: 'venues.listPois',
    call: (c, o, t) => c.venues.listPois(o, t),
    route: '/pois',
    message: 'Failed to retrieve venue POIs',
    trailing: true,
  },
  {
    name: 'venues.listPoisAsArray',
    call: (c, o, t) => c.venues.listPoisAsArray(o, t),
    route: '/pois',
    message: 'Failed to retrieve venue POIs',
    trailing: true,
  },
  {
    name: 'venues.listPaths',
    call: (c, o, t) => c.venues.listPaths(o, t),
    route: '/paths',
    message: 'Failed to retrieve venue paths',
    trailing: true,
  },
  {
    name: 'venues.listPathNodes',
    call: (c, o, t) => c.venues.listPathNodes(o, t),
    route: '/paths',
    message: 'Failed to retrieve venue paths',
    trailing: true,
  },
  {
    name: 'venues.listPathSegments',
    call: (c, o, t) => c.venues.listPathSegments(o, t),
    route: '/paths',
    message: 'Failed to retrieve venue paths',
    trailing: true,
  },
  {
    name: 'venues.listMapPois',
    call: (c, o, t) => c.venues.listMapPois(o, t),
    route: '/maps/:mapId/pois',
    message: 'Failed to retrieve map POIs',
    trailing: true,
    map: true,
  },
  {
    name: 'zones.list',
    call: (c, o, t) => c.zones.list(o, t),
    route: '/zones',
    message: 'Failed to retrieve venue zones',
    trailing: true,
  },
  {
    name: 'zones.listAsArray',
    call: (c, o, t) => c.zones.listAsArray(o, t),
    route: '/zones',
    message: 'Failed to retrieve venue zones',
    trailing: true,
  },
  {
    name: 'zones.iterate',
    call: (c, o) => collect(c.zones.iterate(o)),
    route: '/zones',
    message: 'Failed to retrieve venue zones',
    trailing: false,
  },
  {
    name: 'zones.getAll',
    call: (c, o, t) => c.zones.getAll(o, t),
    route: '/zones',
    message: 'Failed to retrieve venue zones',
    trailing: true,
  },
  {
    name: 'zones.listByMap',
    call: (c, o, t) => c.zones.listByMap(o, t),
    route: '/maps/:mapId/zones',
    message: 'Failed to retrieve map zones',
    trailing: true,
    map: true,
  },
  {
    name: 'zones.listByMapAsArray',
    call: (c, o, t) => c.zones.listByMapAsArray(o, t),
    route: '/maps/:mapId/zones',
    message: 'Failed to retrieve map zones',
    trailing: true,
    map: true,
  },
];

describe('V-13: error matrix of every venue-scoped method', () => {
  const full = (): RtlsClient => makeClient({ namespace: 'ns', venueId: 7, mapId: 3 });

  it.each(V13)('$name: no venue → ContextError, 0 requests', async ({ call }) => {
    await expectContextError(() => call(makeClient({ namespace: 'ns', mapId: 3 })));
  });

  it.each(V13)('$name: 401 → AuthenticationError', async ({ call, route }) => {
    answer(`/venues/:namespace/:venueId${route}`, 401, { error: 'Failed to authenticate user' });
    await expect(call(full())).rejects.toBeInstanceOf(AuthenticationError);
  });

  it.each(V13)(
    '$name: 500 → ServerError with the route message',
    async ({ call, route, message }) => {
      answer(`/venues/:namespace/:venueId${route}`, 500, { error: message });
      await expect(call(full())).rejects.toSatisfy(
        (e: unknown) => e instanceof ServerError && e.status === 500 && e.message === message
      );
    }
  );

  it.each(V13)('$name: delayed beyond timeoutMs 5 → TimeoutError', async ({ call, route }) => {
    delayed(`/venues/:namespace/:venueId${route}`);
    await expect(call(full(), { timeoutMs: 5 })).rejects.toBeInstanceOf(TimeoutError);
  });

  it.each(V13.filter((row) => row.trailing))(
    '$name: deprecated trailing ({}, { timeoutMs: 5 }) is honoured → TimeoutError',
    async ({ call, route }) => {
      delayed(`/venues/:namespace/:venueId${route}`);
      await expect(call(full(), {}, { timeoutMs: 5 })).rejects.toBeInstanceOf(TimeoutError);
    }
  );
});

describe('venues POIs and paths (V-15 … V-19, V-22)', () => {
  it('V-15: listPois() → GET /venues/ns/7/pois, no query; a collection without metadata is accepted', async () => {
    const rec = recordRequests();
    expect(await makeClient().venues.listPois()).toEqual(bodyOf('pois'));
    await expectVenueRequest(rec.requests[0], '/venues/ns/7/pois');
    const bare = {
      type: 'FeatureCollection',
      features: bodyOf<POIFeatureCollection>('pois').features,
    };
    answer('/venues/:namespace/:venueId/pois', 200, bare);
    const result: POIFeatureCollection = await makeClient().venues.listPois();
    expect(result).toEqual(bare);
    expect(result).toSatisfy((r: object) => !('metadata' in r));
  });

  it('V-16: tag, level and user filters are merged; the shorthand wins; no type= / level=', async () => {
    const rec = recordRequests();
    await makeClient().venues.listPois({
      tag: 'exit',
      level: 0,
      filters: filters.contains('properties.name', 'Gate'),
    });
    await makeClient().venues.listPois({
      level: 0,
      filters: filters.equals('properties.level', 5),
    });
    await expectVenueRequest(
      rec.requests[0],
      '/venues/ns/7/pois',
      combineFilters(
        filters.contains('properties.tags', 'exit'),
        filters.equals('properties.level', 0),
        filters.contains('properties.name', 'Gate')
      )
    );
    await expectVenueRequest(
      rec.requests[1],
      '/venues/ns/7/pois',
      filters.equals('properties.level', 0)
    );
  });

  it('V-17: listPoisAsArray() skips a null geometry and keeps a string id', async () => {
    const pois = bodyOf<POIFeatureCollection>('pois');
    const nullGeometry = { ...pois.features[0], geometry: null };
    answer('/venues/:namespace/:venueId/pois', 200, {
      ...pois,
      features: [nullGeometry, ...pois.features],
    });
    const flat = await makeClient().venues.listPoisAsArray();
    expect(flat.map((p) => p.id)).toEqual(pois.features.map((f) => f.properties.id));
    expect(flat[1]?.id).toBe('65f0c0ffee0000000000a002');
    expect(flat[1]?.tags).toEqual([]);
  });

  it("V-18: listPaths({ level: -1, nodeType: 'elevator' }) → properties.level eq -1 and properties.node_type eq", async () => {
    const rec = recordRequests();
    await makeClient().venues.listPaths({ level: -1, nodeType: 'elevator' });
    await expectVenueRequest(
      rec.requests[0],
      '/venues/ns/7/paths',
      combineFilters(
        filters.equals('properties.level', -1),
        filters.equals('properties.node_type', 'elevator')
      )
    );
  });

  it('V-19: listPathNodes() / listPathSegments() on paths.json → flat objects with the stored names', async () => {
    const paths = bodyOf<PathFeatureCollection>('paths');
    const nodeFeatures = paths.features.filter(
      (f): f is PathNodeFeature => f.properties.type === 'path_node'
    );
    const segmentFeatures = paths.features.filter(
      (f): f is PathSegmentFeature => f.properties.type === 'path_segment'
    );
    const nodes = await makeClient().venues.listPathNodes();
    const segments = await makeClient().venues.listPathSegments();
    expect(nodes).toEqual(
      nodeFeatures.map(({ properties: p, geometry: g }) => ({
        id: p.id,
        externalId: p.external_id,
        nodeType: p.node_type,
        name: p.name,
        level: p.level,
        isActive: p.is_active,
        crossLevelConnections: p.cross_level_connections,
        tags: p.tags,
        lat: g.coordinates[1],
        lng: g.coordinates[0],
      }))
    );
    expect(segments).toEqual(
      segmentFeatures.map(({ properties: p, geometry: g }) => ({
        id: p.id,
        externalId: p.external_id,
        sourceNodeId: p.source_node_id,
        targetNodeId: p.target_node_id,
        level: p.level,
        bidirectional: p.bidirectional,
        distance: p.distance,
        estimatedTime: p.estimated_time,
        accessibility: p.accessibility,
        penaltyFactor: p.penalty_factor,
        isActive: p.is_active,
        tags: p.tags,
        coordinates: g.coordinates,
      }))
    );
    expect(nodes).toHaveLength(3);
    expect(segments).toHaveLength(2);
    expect(segments[0]?.sourceNodeId).toBe(nodes[0]?.id);
    const objects = fx('paths-object-connections');
    server.use(
      http.get(`${BASE}/venues/:namespace/:venueId/paths`, () => fixtureResponse(objects))
    );
    const [node] = await makeClient().venues.listPathNodes('ns', 7);
    expect(node?.crossLevelConnections).toEqual([
      { target_node_id: 9101, connection_type: 'elevator' },
      9102,
    ]);
    const [segment] = await makeClient().venues.listPathSegments('ns', '7');
    expect(segment).toMatchObject({
      bidirectional: false,
      connectionType: 'stairs',
      isActive: false,
    });
  });

  it('V-22: listPois({ level: 2 }) (the replacement of listMapPois) → properties.level eq 2 only', async () => {
    const rec = recordRequests();
    await makeClient().venues.listPoisAsArray({ level: 2 });
    await expectVenueRequest(
      rec.requests[0],
      '/venues/ns/7/pois',
      filters.equals('properties.level', 2)
    );
  });

  it('legacy positional forms of the POI and path lists hit the same routes without a query', async () => {
    const rec = recordRequests();
    await makeClient({}).venues.listPois('ns', 7);
    await makeClient({}).venues.listPoisAsArray('ns', '7', { timeoutMs: 1000 });
    await makeClient({}).venues.listPaths('ns', 7);
    await makeClient({}).venues.listMaps('ns', '8');
    await expectVenueRequest(rec.requests[0], '/venues/ns/7/pois');
    await expectVenueRequest(rec.requests[1], '/venues/ns/7/pois');
    await expectVenueRequest(rec.requests[2], '/venues/ns/7/paths');
    await expectVenueRequest(rec.requests[3], '/venues/ns/8/maps');
  });

  it('legacy form with an options bag sends its level, tag, nodeType and filters; a bad level → ContextError', async () => {
    const rec = recordRequests();
    const legacyBag = (bag: object): never => bag as never;
    await makeClient({}).venues.listPois('ns', legacyBag({ venueId: 9, level: 0, tag: 'dock' }));
    await makeClient({}).venues.listPaths('ns', 9, legacyBag({ nodeType: 'waypoint' }));
    await makeClient({}).venues.listMaps(
      'ns',
      9,
      legacyBag({ filters: filters.equals('name', 'A') })
    );
    await expectVenueRequest(
      rec.requests[0],
      '/venues/ns/9/pois',
      combineFilters(
        filters.equals('properties.level', 0),
        filters.contains('properties.tags', 'dock')
      )
    );
    await expectVenueRequest(
      rec.requests[1],
      '/venues/ns/9/paths',
      filters.equals('properties.node_type', 'waypoint')
    );
    await expectVenueRequest(rec.requests[2], '/venues/ns/9/maps', filters.equals('name', 'A'));
    await expectContextError(
      () => makeClient({}).venues.listPois('ns', 9, legacyBag({ level: 0.5 })),
      'invalid'
    );
  });
});

describe('venues.listMapPois (V-20, V-21, V-23)', () => {
  it('V-20: listMapPois() with client mapId 3 → GET /venues/ns/7/maps/3/pois; {items:[],total:0}', async () => {
    const rec = recordRequests();
    const result = await makeClient({ namespace: 'ns', venueId: 7, mapId: 3 }).venues.listMapPois();
    expect(result).toEqual(bodyOf('map-pois'));
    expect(result.items).toEqual([]);
    await expectVenueRequest(rec.requests[0], '/venues/ns/7/maps/3/pois');
  });

  it("V-21: listMapPois({ mapId: 4 }); legacy ('ns','7','3'); malformed map id → ContextError 'invalid'", async () => {
    const rec = recordRequests();
    await makeClient({ namespace: 'ns', venueId: 7, mapId: 3 }).venues.listMapPois({ mapId: 4 });
    await makeClient({}).venues.listMapPois('ns', '7', '3');
    await expectVenueRequest(rec.requests[0], '/venues/ns/7/maps/4/pois');
    await expectVenueRequest(rec.requests[1], '/venues/ns/7/maps/3/pois');
    await expectContextError(() => makeClient().venues.listMapPois('ns', 7, 'x'), 'invalid');
  });

  it('V-23: no mapId → ContextError, 0 requests', async () => {
    await expectContextError(() => makeClient().venues.listMapPois());
  });
});
