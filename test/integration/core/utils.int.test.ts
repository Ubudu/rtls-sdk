// Core live tests L-G1 and L-U1 (P1 §9), tier R, GET only. L-G1 runs the four GeoJSON extractors on the live
// venue collections (per property only: P4 owns src/utils/geojson.ts). L-U1 runs every filter builder on the live
// asset list through serializeFilters and applyFilters and compares each result with the same selection computed
// here with Array.filter and the universal semantics of P1 §5.11; then the utilities on literal inputs (P1-T23).
// Response parsing (createError, the body readers, parseSse) and paginateOffset are not fed fabricated inputs here:
// their branches that no live response reaches are allowlisted (test/integration/allowlist/P1.json).
// Results are compared as MAC sets and counts; nothing live is printed.
import { beforeAll } from 'vitest';
import {
  AbortError,
  applyFilters,
  buildQueryParams,
  collectAll,
  combineFilters,
  ContextError,
  extractPathNodesFromGeoJSON,
  extractPathSegmentsFromGeoJSON,
  extractPoisFromGeoJSON,
  extractZonesFromGeoJSON,
  filter,
  filters,
  normalizeMac,
  normalizePage,
  paginateOffset,
  paginatePages,
  requireMapId,
  requireVenueId,
  RtlsError,
  serializeFilters,
  toEpochMs,
  ValidationError,
  type FilterOptions,
  type FilterValue,
} from '../../../src';
import { raceSignal } from '../../../src/client/http';
import { isVenueIdArg } from '../../../src/context';
import { resolveMapArgs, resolveVenueArgs, splitCallOptions } from '../../../src/utils/args';
import { parseContentDisposition, toFormFile } from '../../../src/utils/files';
import { readTotalCount } from '../../../src/utils/pagination';
import { pollUntil, sleep } from '../../../src/utils/poll';
import { resolveTimeRange } from '../../../src/utils/time';
import {
  createLiveClient,
  describeLive,
  discover,
  getHarness,
  recordFact,
  requestLog,
} from '../harness';
import { sameSet } from './support/recording-fetch';
import { rejectionOf, thrownBy } from './support/rejection';
import { auditReadOnlyRequests } from './support/request-audit';

type Item = Record<string, unknown> & { user_udid: string };

interface GeoFeature {
  type: string;
  geometry: { type: string } | null;
  properties: Record<string, unknown>;
}
interface GeoCollection {
  type: string;
  features: GeoFeature[];
}

/** getNestedValue of P1 §5.11 (dot path). */
function get(item: unknown, path: string): unknown {
  let value: unknown = item;
  for (const part of path.split('.')) {
    if (value === null || value === undefined || typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

// The universal semantics of P1 §5.11, written independently of src/utils/filter-eval.ts.
const universal = {
  eq: (field: unknown, value: string): boolean => {
    if (typeof field === 'boolean') return String(field) === value.trim().toLowerCase();
    if (field === null || field === undefined) return false;
    // The server compares with JavaScript `==`.
    return (field as string) == value;
  },
  rel: (field: unknown, op: 'gt' | 'gte' | 'lt' | 'lte', value: string): boolean => {
    if (field === undefined) return false;
    const n = parseFloat(value);
    const f = Number(field);
    return op === 'gt' ? f > n : op === 'gte' ? f >= n : op === 'lt' ? f < n : f <= n;
  },
  text: (field: unknown, op: 'contains' | 'starts' | 'ends', value: string): boolean => {
    if (!field) return false;
    const s = String(field).toLowerCase();
    const v = value.toLowerCase();
    return op === 'contains' ? s.includes(v) : op === 'starts' ? s.startsWith(v) : s.endsWith(v);
  },
  regex: (field: unknown, pattern: string): boolean => {
    if (!field) return false;
    let re: RegExp;
    try {
      re = new RegExp(pattern, 'i');
    } catch (error) {
      if (error instanceof SyntaxError) return false;
      throw error;
    }
    return re.test(String(field));
  },
  in: (field: unknown, value: string): boolean =>
    value
      .split(',')
      .map((v) => v.trim())
      .includes(String(field)),
  between: (field: unknown, value: string): boolean => {
    const [min, max] = value.split(',').map((v) => parseFloat(v));
    const f = Number(field);
    return field !== undefined && f >= (min as number) && f <= (max as number);
  },
  size: (field: unknown, value: string): boolean =>
    (Array.isArray(field) || typeof field === 'string') && field.length === parseInt(value, 10),
  all: (field: unknown, value: string): boolean =>
    Array.isArray(field) && value.split(',').every((v) => field.includes(v)),
  elem: (field: unknown, value: string): boolean =>
    Array.isArray(field) && value.split(',').some((v) => field.includes(v)),
};

/** The first top-level or `data.` path whose value is a finite number on at least two assets. */
function numericPath(assets: readonly Item[]): string | undefined {
  const counts = new Map<string, number>();
  for (const asset of assets) {
    for (const [key, value] of Object.entries(asset)) {
      if (typeof value === 'number' && Number.isFinite(value))
        counts.set(key, (counts.get(key) ?? 0) + 1);
      if (key === 'data' && value !== null && typeof value === 'object' && !Array.isArray(value)) {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          if (typeof v === 'number' && Number.isFinite(v))
            counts.set(`data.${k}`, (counts.get(`data.${k}`) ?? 0) + 1);
        }
      }
    }
  }
  return [...counts.entries()].find(([path, n]) => n >= 2 && /^[a-z0-9_.]+$/i.test(path))?.[0];
}

/** A dot path with `name[i]` index steps (the index syntax the evaluator accepts in `sort` and `fields`). */
function getIndexed(item: unknown, path: string): unknown {
  let value: unknown = item;
  for (const part of path.split('.')) {
    if (value === null || value === undefined || typeof value !== 'object') return undefined;
    const indexed = /^(.+)\[(\d+)\]$/.exec(part);
    if (indexed) {
      const list = (value as Record<string, unknown>)[indexed[1] as string];
      if (!Array.isArray(list)) return undefined;
      value = list[Number(indexed[2])];
    } else {
      value = (value as Record<string, unknown>)[part];
    }
  }
  return value;
}

/** The universal sort comparator of P1 §5.11 for one key, ascending. */
function compareAsc(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b);
  return (a as number) < (b as number) ? -1 : 1;
}

/** Status 0 and the class: a client-side rejection, nothing sent. */
function clientSide(error: unknown, kind: typeof ValidationError | typeof ContextError): boolean {
  return error instanceof kind && (error as RtlsError).status === 0;
}

describeLive('R', 'core utilities', () => {
  auditReadOnlyRequests();

  let assets: Item[];

  beforeAll(async () => {
    assets = await createLiveClient().transport.request<Item[]>('GET', '/assets/{app_namespace}', {
      params: { app_namespace: getHarness().env.namespace },
    });
  });

  it('L-G1 the GeoJSON extractors on the live venue collections', async () => {
    const { venueId } = await discover();
    const client = createLiveClient();
    const params = { namespace: getHarness().env.namespace, venueId };
    const zones = await client.transport.request<GeoCollection>(
      'GET',
      '/venues/{namespace}/{venueId}/zones',
      { params }
    );
    const pois = await client.transport.request<GeoCollection>(
      'GET',
      '/venues/{namespace}/{venueId}/pois',
      { params }
    );
    const paths = await client.transport.request<GeoCollection>(
      'GET',
      '/venues/{namespace}/{venueId}/paths',
      { params }
    );
    const kind = (c: GeoCollection, t: string) =>
      c.features.filter((f) => f.geometry?.type === t).length;

    const flatZones = extractZonesFromGeoJSON(zones as never);
    expect(flatZones.length).toBe(kind(zones, 'Polygon'));
    expect(flatZones.every((z) => typeof z.color === 'string')).toBe(true);
    expect(extractPoisFromGeoJSON(pois as never).length).toBe(pois.features.length);
    expect(extractPathNodesFromGeoJSON(paths as never).length).toBe(kind(paths, 'Point'));
    expect(extractPathSegmentsFromGeoJSON(paths as never).length).toBe(kind(paths, 'LineString'));
    recordFact('L-G1.zones', flatZones.length);
    recordFact('L-G1.pois', pois.features.length);
    recordFact('L-G1.pathNodes', kind(paths, 'Point'));
    recordFact('L-G1.pathSegments', kind(paths, 'LineString'));
  });

  it('L-U1 every filter builder on the live assets equals the §5.11 universal selection', () => {
    expect(assets.length).toBeGreaterThan(1);
    const macs = assets.map((a) => a.user_udid);
    const [mac1, mac2] = macs as [string, string];
    const named = assets.find(
      (a) => typeof a.user_name === 'string' && (a.user_name as string).length >= 4
    );
    const name = (named?.user_name as string | undefined) ?? 'none';
    const type =
      (assets.find((a) => typeof a.user_type === 'string')?.user_type as string | undefined) ??
      'none';
    const tagged = assets.find(
      (a) =>
        Array.isArray(a.tags) &&
        (a.tags as unknown[]).length > 0 &&
        (a.tags as unknown[]).every((t) => typeof t === 'string')
    );
    const tags = (tagged?.tags as string[] | undefined) ?? [];
    const tag = tags[0] ?? 'sdk-test-no-tag';
    const numeric = numericPath(assets);
    const nums =
      numeric === undefined
        ? []
        : assets.map((a) => get(a, numeric)).filter((v): v is number => typeof v === 'number');
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const lo = sorted[0] ?? 0;
    const numField = numeric ?? 'sdk_test_missing';
    recordFact('L-U1.hasNumericField', numeric !== undefined);
    recordFact('L-U1.hasTaggedAsset', tagged !== undefined);
    recordFact('L-U1.assets', assets.length);

    const cases: Array<[string, FilterOptions, (a: Item) => boolean]> = [
      ['equals', filters.equals('user_type', type), (a) => universal.eq(a.user_type, type)],
      ['notEquals', filters.notEquals('user_type', type), (a) => !universal.eq(a.user_type, type)],
      [
        'greaterThan',
        filters.greaterThan(numField, mid),
        (a) => universal.rel(get(a, numField), 'gt', String(mid)),
      ],
      [
        'greaterThanOrEqual',
        filters.greaterThanOrEqual(numField, mid),
        (a) => universal.rel(get(a, numField), 'gte', String(mid)),
      ],
      [
        'lessThan',
        filters.lessThan(numField, mid),
        (a) => universal.rel(get(a, numField), 'lt', String(mid)),
      ],
      [
        'lessThanOrEqual',
        filters.lessThanOrEqual(numField, mid),
        (a) => universal.rel(get(a, numField), 'lte', String(mid)),
      ],
      [
        'contains',
        filters.contains('user_name', name.slice(1, 4).toUpperCase()),
        (a) => universal.text(a.user_name, 'contains', name.slice(1, 4)),
      ],
      [
        'startsWith',
        filters.startsWith('user_udid', mac1.slice(0, 6)),
        (a) => universal.text(a.user_udid, 'starts', mac1.slice(0, 6)),
      ],
      [
        'endsWith',
        filters.endsWith('user_udid', mac1.slice(-4).toUpperCase()),
        (a) => universal.text(a.user_udid, 'ends', mac1.slice(-4)),
      ],
      [
        'matches',
        filters.matches(
          'user_name',
          new RegExp(`^${name.slice(0, 2).replace(/[^a-z0-9]/gi, '.')}`, 'g')
        ),
        (a) => universal.regex(a.user_name, `^${name.slice(0, 2).replace(/[^a-z0-9]/gi, '.')}`),
      ],
      [
        'matches (invalid pattern)',
        filters.matches('user_name', '('),
        (a) => universal.regex(a.user_name, '('),
      ],
      [
        'in',
        filters.in('user_udid', [mac1, mac2]),
        (a) => universal.in(a.user_udid, `${mac1},${mac2}`),
      ],
      [
        'notIn',
        filters.notIn('user_udid', [mac1, mac2]),
        (a) => !universal.in(a.user_udid, `${mac1},${mac2}`),
      ],
      ['exists', filters.exists('user_name'), (a) => a.user_name !== undefined],
      [
        'exists false',
        filters.exists('sdk_test_missing', false),
        (a) => get(a, 'sdk_test_missing') === undefined,
      ],
      [
        'between',
        filters.between(numField, lo, mid),
        (a) => universal.between(get(a, numField), `${lo},${mid}`),
      ],
      [
        'size',
        filters.size('tags', tags.length),
        (a) => universal.size(a.tags, String(tags.length)),
      ],
      [
        'all',
        filters.all('tags', tags.slice(0, 2)),
        (a) => universal.all(a.tags, tags.slice(0, 2).join(',')),
      ],
      [
        'elemMatch',
        filters.elemMatch('tags', [tag, 'sdk-test-other']),
        (a) => universal.elem(a.tags, `${tag},sdk-test-other`),
      ],
      ['elemMatch one value', filters.elemMatch('tags', tag), (a) => universal.elem(a.tags, tag)],
      ['filter()', filter('user_udid', 'eq', mac2), (a) => universal.eq(a.user_udid, mac2)],
      [
        'combineFilters (AND)',
        combineFilters(
          filters.startsWith('user_udid', mac1.slice(0, 2)),
          filters.notEquals('user_udid', mac1)
        ),
        (a) =>
          universal.text(a.user_udid, 'starts', mac1.slice(0, 2)) &&
          !universal.eq(a.user_udid, mac1),
      ],
    ];
    const mismatches: string[] = [];
    for (const [label, f, predicate] of cases) {
      const wire = serializeFilters(f, 'universal');
      expect(Object.keys(wire)).toHaveLength(Object.keys(f).length);
      const local = applyFilters(assets, { filters: f }).data.map((a) => a.user_udid);
      const expected = assets.filter(predicate).map((a) => a.user_udid);
      if (!(local.length === expected.length && sameSet(local, expected))) mismatches.push(label);
    }
    expect(mismatches).toEqual([]);
  });

  it('L-U1 parseContentDisposition, resolveTimeRange and readTotalCount on literal inputs', () => {
    expect(
      parseContentDisposition(
        'attachment; filename*=UTF-8\'\'r%C3%A9sum%C3%A9.pdf; filename="x.pdf"'
      )
    ).toBe('résumé.pdf');
    expect(parseContentDisposition('attachment; filename="a b.pdf"')).toBe('a b.pdf');
    expect(parseContentDisposition('attachment; filename=report.csv')).toBe('report.csv');
    expect(parseContentDisposition(null)).toBeUndefined();

    const now = Date.now();
    expect(resolveTimeRange({}, { now })).toEqual({ from: now - 86_400_000, to: now });
    expect(resolveTimeRange({ to: now }, { defaultWindowMs: 3_600_000 })).toEqual({
      from: now - 3_600_000,
      to: now,
    });
    expect(resolveTimeRange({ from: now - 10, to: new Date(now) })).toEqual({
      from: now - 10,
      to: now,
    });
    const error = thrownBy(() => resolveTimeRange({ from: now, to: now - 1 }));
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).status).toBe(0);

    expect(readTotalCount(new Headers({ 'X-Total-Count': '3' }))).toBe(3);
    expect(readTotalCount(new Headers({ 'X-Total-Count': '12abc' }))).toBeUndefined();
    expect(readTotalCount(new Headers())).toBeUndefined();
  });

  it('L-U1 the evaluator paths on the live assets: index syntax, projections, equal sort keys, size', () => {
    const byTag = applyFilters(assets, { sort: ['tags[0]:asc', 'user_name[0]:desc'] }).data;
    const expectedByTag = [...assets].sort((a, b) =>
      compareAsc(getIndexed(a, 'tags[0]'), getIndexed(b, 'tags[0]'))
    );
    expect(
      JSON.stringify(byTag.map((a) => a.user_udid)) ===
        JSON.stringify(expectedByTag.map((a) => a.user_udid))
    ).toBe(true);
    const type = assets.find((a) => typeof a.user_type === 'string')?.user_type;
    const sameType = assets.filter((a) => a.user_type === type);
    const constant = applyFilters(sameType, { sort: 'user_type:desc' }).data;
    expect(
      JSON.stringify(constant.map((a) => a.user_udid)) ===
        JSON.stringify(sameType.map((a) => a.user_udid))
    ).toBe(true);

    const withData = assets.find(
      (a) =>
        a.data !== null &&
        typeof a.data === 'object' &&
        !Array.isArray(a.data) &&
        Object.keys(a.data as object).filter((k) => /^[a-z0-9_]+$/i.test(k)).length >= 2
    );
    recordFact('L-U1.hasAssetWithTwoDataKeys', withData !== undefined);
    const [k1, k2] = Object.keys((withData?.data as object | undefined) ?? {}).filter((k) =>
      /^[a-z0-9_]+$/i.test(k)
    ) as [string, string];
    const projected = applyFilters(assets, {
      fields: ['user_udid', 'tags[0]', 'user_name[0]', `data.${k1}`, `data.${k2}`],
    }).data;
    const expectedProjection = assets.map((a) => {
      const out: Record<string, unknown> = { user_udid: a.user_udid };
      const tag0 = getIndexed(a, 'tags[0]');
      if (tag0 !== undefined) out['tags[0]'] = tag0;
      const data: Record<string, unknown> = {};
      for (const k of [k1, k2]) {
        const v = getIndexed(a, `data.${k}`);
        if (v !== undefined) data[k] = v;
      }
      if (Object.keys(data).length > 0) out.data = data;
      return out;
    });
    expect(JSON.stringify(projected) === JSON.stringify(expectedProjection)).toBe(true);
    const overlapping = applyFilters(assets, { fields: ['data', `data.${k1}`] }).data;
    expect(
      JSON.stringify(overlapping) ===
        JSON.stringify(assets.map((a) => (a.data === undefined ? {} : { data: a.data })))
    ).toBe(true);

    const numeric = numericPath(assets) ?? 'dateCreated';
    expect(applyFilters(assets, { filters: filters.size(numeric, 1) }).data).toEqual([]);
    const nameLength = String(assets[0]?.user_name ?? '').length;
    const bySize = applyFilters(assets, { filters: filters.size('user_name', nameLength) }).data;
    expect(
      sameSet(
        bySize.map((a) => a.user_udid),
        assets
          .filter((a) => typeof a.user_name === 'string' && a.user_name.length === nameLength)
          .map((a) => a.user_udid)
      )
    ).toBe(true);
  });

  it('L-U1 client-side guards reject invalid arguments with status 0 before any request', async () => {
    const client = createLiveClient();
    const ns = getHarness().env.namespace;
    const sync: Array<[string, () => unknown]> = [
      ['baseUrl not a string', () => createLiveClient({ baseUrl: 42 as never })],
      ['baseUrl not a URL', () => createLiveClient({ baseUrl: 'not a url' })],
      ['baseUrl not http(s)', () => createLiveClient({ baseUrl: 'ftp://example.invalid/api' })],
      ['baseUrl protocol-relative', () => createLiveClient({ baseUrl: '//example.invalid/api' })],
      [
        'createWebSocket with a relative baseUrl outside a browser',
        () => createLiveClient({ baseUrl: '/sdk-test-proxy' }).createWebSocket(),
      ],
      ['auth unknown', () => createLiveClient({ auth: 'token' as never })],
      ['auth apiKey without key', () => createLiveClient({ auth: 'apiKey', apiKey: undefined })],
      ['auth bearer without token', () => createLiveClient({ auth: 'bearer' })],
      ['fetch not a function', () => createLiveClient({ fetch: 42 as never })],
      ['retry not a policy', () => createLiveClient({ retry: 'always' as never })],
      ['retry.retries', () => createLiveClient({ retry: { retries: 11 } })],
      ['retry.retryOn', () => createLiveClient({ retry: { retryOn: [200] } })],
      ['retry.methods', () => createLiveClient({ retry: { methods: ['FETCH' as never] } })],
      ['retry.baseDelayMs', () => createLiveClient({ retry: { baseDelayMs: -1 } })],
      [
        'retry.baseDelayMs > maxDelayMs',
        () => createLiveClient({ retry: { baseDelayMs: 10, maxDelayMs: 1 } }),
      ],
      [
        'retry.retryNetworkErrors',
        () => createLiveClient({ retry: { retryNetworkErrors: 'yes' as never } }),
      ],
      ['normalizeMac', () => normalizeMac('zz')],
      ['normalizeMac non-string', () => normalizeMac(42 as never)],
      ['paginatePages limit', () => paginatePages(async () => [], { limit: 0 })],
      ['normalizePage', () => normalizePage({} as never)],
      ['toEpochMs string', () => toEpochMs('sdk-test-not-a-date')],
      ['toEpochMs invalid Date', () => toEpochMs(new Date(NaN))],
      ['toEpochMs NaN', () => toEpochMs(NaN)],
      ['resolveTimeRange window', () => resolveTimeRange({}, { defaultWindowMs: -1 })],
      ['resolveTimeRange now', () => resolveTimeRange({}, { now: NaN })],
      ['resolveTimeRange range', () => resolveTimeRange(null as never)],
      ['unknown operator', () => serializeFilters({ 'user_udid:like': 'x' } as never, 'universal')],
      ['empty field', () => serializeFilters({ ':eq': 'x' }, 'universal')],
      ['NaN bound', () => serializeFilters(filters.greaterThan('n', NaN), 'universal')],
      [
        'null between bound',
        () =>
          serializeFilters(
            filter('n', 'between', [null, 1] as unknown as FilterValue),
            'universal'
          ),
      ],
      ['array on eq', () => serializeFilters(filter('n', 'eq', ['x']), 'universal')],
      ['invalid Date', () => serializeFilters(filter('n', 'gt', new Date(NaN)), 'universal')],
      [
        'boolean list element',
        () => serializeFilters(filters.in('n', [true as never]), 'universal'),
      ],
      ['comma in list element', () => serializeFilters(filters.in('n', ['x,y']), 'universal')],
      ['exists not boolean', () => serializeFilters(filter('n', 'exists', 'yes'), 'universal')],
      ['between one bound', () => serializeFilters(filter('n', 'between', [1]), 'universal')],
      ['filters not an object', () => serializeFilters('x' as never, 'universal')],
      ['size on venue', () => serializeFilters(filters.size('tags', 1), 'venue')],
      ['unknown grammar', () => serializeFilters({}, 'sql' as never)],
      ['applyFilters page 0', () => applyFilters(assets, { page: 0 })],
      ['applyFilters sort', () => applyFilters(assets, { sort: 5 as never })],
      ['applyFilters query', () => applyFilters(assets, [] as never)],
      ['query invalid Date', () => buildQueryParams({ at: new Date(NaN) })],
      ['query nested array', () => buildQueryParams({ at: [[1]] as never })],
      ['query object', () => buildQueryParams({ at: {} as never })],
    ];
    const syncMisses = sync.filter(([, fn]) => !clientSide(thrownBy(fn), ValidationError));
    expect(syncMisses.map(([label]) => label)).toEqual([]);

    const ctx: Array<[string, () => unknown]> = [
      ['setVenue(null)', () => client.setVenue(null as never)],
      ['setLevel({})', () => client.setLevel({} as never)],
      ['setMap(-1)', () => client.setMap(-1)],
      ['setLevel(1.5)', () => client.setLevel(1.5)],
      ['setNamespace(42)', () => client.setNamespace(42 as never)],
      ['requireVenueId({})', () => requireVenueId({})],
      ['requireMapId({})', () => requireMapId({})],
      ['resolveVenueArgs x', () => resolveVenueArgs(client, ns, 'x')],
    ];
    const ctxMisses = ctx.filter(([, fn]) => !clientSide(thrownBy(fn), ContextError));
    expect(ctxMisses.map(([label]) => label)).toEqual([]);

    const t = client.transport;
    const asyncCases: Array<[string, () => Promise<unknown>]> = [
      [
        'empty path parameter',
        () =>
          t.request<unknown>('GET', '/settings/{app_namespace}', { params: { app_namespace: '' } }),
      ],
      [
        'object path parameter',
        () =>
          t.request<unknown>('GET', '/settings/{app_namespace}', {
            params: { app_namespace: {} as never },
          }),
      ],
      [
        'invalid MAC path parameter',
        () =>
          t.request<unknown>('GET', '/assets/{app_namespace}/{mac_address}', {
            params: { app_namespace: ns, mac_address: 'zz' },
          }),
      ],
      ['timeoutMs string', () => t.request<unknown>('GET', '/health', { timeoutMs: '5' as never })],
      ['timeoutMs negative', () => t.request<unknown>('GET', '/health', { timeoutMs: -1 })],
      ['timeoutMs null', () => t.request<unknown>('GET', '/health', { timeoutMs: null as never })],
      ['GET with a body', () => t.request<unknown>('GET', '/health', { body: {} })],
      ['per-call retry', () => t.request<unknown>('GET', '/health', { retry: 'never' as never })],
      ['upload without FormData', () => t.upload('/etl/parse-excel-headers', {} as never)],
      [
        'pollUntil intervalMs',
        () =>
          pollUntil(
            async () => 1,
            () => true,
            { intervalMs: -1 }
          ),
      ],
      [
        'pollUntil timeoutMs',
        () =>
          pollUntil(
            async () => 1,
            () => true,
            { timeoutMs: -1 }
          ),
      ],
      ['sleep(-1)', () => sleep(-1)],
      ['collectAll(42)', () => collectAll(42 as never)],
      ['paginateOffset page', () => collectAll(paginateOffset(async () => ({}) as never))],
    ];
    const asyncMisses: string[] = [];
    for (const [label, fn] of asyncCases) {
      if (!clientSide(await rejectionOf(fn()), ValidationError)) asyncMisses.push(label);
    }
    expect(asyncMisses).toEqual([]);
    expect(await rejectionOf(sleep(10, AbortSignal.abort()))).toBeInstanceOf(AbortError);
    expect(requestLog()).toHaveLength(0);
  });

  it('L-U1 the remaining utilities on live ids and literal values', async () => {
    const { venueId, mapId } = await discover();
    const ns = getHarness().env.namespace;
    const client = createLiveClient();

    const fromDigits = resolveVenueArgs(client, ns, String(venueId));
    expect(fromDigits.venueId).toBe(venueId);
    expect(fromDigits.namespace === ns && fromDigits.options === undefined).toBe(true);
    const fromBag = resolveVenueArgs(client, ns, { venueId, limit: 1 });
    expect(fromBag.venueId).toBe(venueId);
    expect(fromBag.options).toEqual({ venueId, limit: 1 });
    expect(resolveVenueArgs(client.forVenue(venueId), ns).venueId).toBe(venueId);
    const fromCtx = resolveVenueArgs(client, { venueId });
    expect(fromCtx.namespace === ns && fromCtx.venueId === venueId).toBe(true);
    const mapDigits = resolveMapArgs(client, ns, venueId, String(mapId));
    expect([mapDigits.venueId, mapDigits.mapId]).toEqual([venueId, mapId]);
    const mapCtx = resolveMapArgs(client.forVenue(venueId, { mapId }), {});
    expect([mapCtx.venueId, mapCtx.mapId]).toEqual([venueId, mapId]);
    const mapBag = resolveMapArgs(client, ns, { venueId, mapId });
    expect([mapBag.venueId, mapBag.mapId]).toEqual([venueId, mapId]);

    const split = splitCallOptions(
      { namespace: ns, limit: 1, extra: undefined, headers: { A: '1', b: '1' } },
      { headers: { B: '2' }, timeoutMs: 5 }
    );
    expect(split.ctx.namespace === ns).toBe(true);
    expect(split.request).toEqual({ headers: { A: '1', B: '2' }, timeoutMs: 5 });
    expect(Object.keys(split.rest)).toEqual(['limit', 'extra']);

    client.setMap(mapId);
    expect(client.context.mapId).toBe(mapId);
    expect(client.context.namespace === ns).toBe(true);
    expect(isVenueIdArg(venueId)).toBe(true);
    expect(isVenueIdArg(String(venueId))).toBe(false);

    expect(serializeFilters(filters.exists('name'), 'venue')).toEqual({
      filters: '[{"field":"name","operator":"exists"}]',
    });
    expect(serializeFilters(filters.exists('name', false), 'venue')).toEqual({
      filters: '[{"field":"name","operator":"not_exists"}]',
    });
    const sortedProjection = applyFilters(assets, {
      sort: ['user_udid:asc'],
      fields: ['user_udid'],
    });
    const expectedSorted = [...assets]
      .map((a) => ({ user_udid: a.user_udid }))
      .sort((a, b) => a.user_udid.localeCompare(b.user_udid));
    expect(JSON.stringify(sortedProjection.data) === JSON.stringify(expectedSorted)).toBe(true);
    expect(toEpochMs('1718983010000')).toBe(1718983010000);
    expect(toEpochMs('2024-06-21T15:16:50Z')).toBe(1718983010000);
    expect(
      buildQueryParams({
        sort: ['user_name:asc', 'user_udid:desc'],
        fields: [],
        n: 10n as never,
        at: new Date(1718983010000),
      })
    ).toEqual({ sort: 'user_name:asc,user_udid:desc', n: '10', at: '1718983010000' });

    expect(parseContentDisposition("attachment; filename*=iso-8859-1'fr'%E9t%E9.txt")).toBe(
      'été.txt'
    );
    expect(
      parseContentDisposition('attachment; filename*=UTF-8\'\'%E0%A4%A; filename="b.txt"')
    ).toBe('b.txt');
    expect(parseContentDisposition("attachment; filename*=koi8-r''x; filename=c.txt")).toBe(
      'c.txt'
    );

    const reason = new Error('sdk-test-stop');
    expect(await rejectionOf(raceSignal(Promise.resolve(1), AbortSignal.abort(reason)))).toBe(
      reason
    );
  });

  it('L-U1 toFormFile on literal inputs (the forms later live uploads do not send)', async () => {
    const bytes = new TextEncoder().encode('sdk-test');
    const file = new File([bytes], 'a.txt', { type: 'text/plain' });
    expect(toFormFile(file).filename).toBe('a.txt');
    expect(toFormFile(file, 'fallback.txt').filename).toBe('a.txt');
    const bare = new Blob([bytes]);
    const named = toFormFile(bare, 'b.bin');
    expect(named.blob).toBe(bare);
    expect(named.filename).toBe('b.bin');
    const typed = toFormFile({
      data: bytes.subarray(4),
      filename: 'c.txt',
      contentType: 'text/plain',
    });
    expect([typed.filename, typed.blob.type, await typed.blob.text()]).toEqual([
      'c.txt',
      'text/plain',
      'test',
    ]);
    const buffer = toFormFile({ data: bytes.buffer, filename: 'd.bin' });
    expect([buffer.blob.size, buffer.blob.type]).toEqual([bytes.length, '']);
    const renamed = toFormFile({ data: file, filename: 'e.txt' });
    expect([renamed.filename, renamed.blob]).toEqual(['e.txt', file]);
    const retyped = toFormFile({ data: bare, filename: 'f.csv', contentType: 'text/csv' });
    expect([retyped.filename, retyped.blob.type]).toEqual(['f.csv', 'text/csv']);
    const invalid: Array<() => unknown> = [
      () => toFormFile(bare),
      () => toFormFile(42 as never),
      () => toFormFile({ data: bytes, filename: '' }),
      () => toFormFile({ data: bytes, filename: 'g.txt', contentType: 1 as never }),
      () => toFormFile({ data: 'text' as never, filename: 'h.txt' }),
    ];
    expect(invalid.map((fn) => thrownBy(fn)).every((e) => e instanceof ValidationError)).toBe(true);
  });
});
