// Unit tests of client.positions reads and publish (P3 §8.1): the real resource code against MSW, requests
// captured with recordRequests(), results compared with the fixture bodies.
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { delay, http, HttpResponse } from 'msw';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';
import { loadFixture } from '../../contract/fixtures';
import {
  AbortError,
  ContextError,
  createRtlsClient,
  NotFoundError,
  PayloadTooLargeError,
  ServerError,
  ServiceUnavailableError,
  TimeoutError,
  UnsupportedMediaTypeError,
  ValidationError,
  type AssetPosition,
  type CachedAssetPosition,
  type PublishPositionData,
  type RtlsClient,
} from '../../../src';
import type { PositionsResource } from '../../../src/resources/positions';
import {
  BASE_URL,
  bareText,
  CACHE_500,
  HISTORY_VALUE_REQUIRED,
  LAST_POSITION_NOT_FOUND,
  PUBLISHER_413,
  PUBLISHER_415,
  PUBLISHER_503,
  PUBLISHER_INVALID_DATA,
  PUBLISHER_JSON_ERROR,
  PUBLISHER_MISSING_MAC,
  PUBLISHER_RESERVED_FIELD,
} from './support/positions-handlers';

const API_KEY = 'test-key';
const NOW = 1_700_000_000_000;
const DAY = 86_400_000;
const MAC = 'aabbccddeeff';

const client = createRtlsClient({ apiKey: API_KEY, namespace: 'ns-test' });
const noNamespace = createRtlsClient({ apiKey: API_KEY });

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

function slow(method: 'get' | 'post', path: string): void {
  server.use(
    http[method](`${BASE_URL}${path}`, async () => {
      await delay(200);
      return HttpResponse.json([]);
    })
  );
}

afterEach(() => {
  vi.useRealTimers();
});

// ─── listCached ────────────────────────────────────────────────────────────────

describe('positions.listCached', () => {
  it('U-LC-1 GET /cache/{ns}/positions without query; result = fixture body', async () => {
    const rec = recordRequests();
    const res = await client.positions.listCached();
    await expectRequest(rec.requests[0], 'GET', '/cache/ns-test/positions');
    expect(rec.requests).toHaveLength(1);
    expect(res).toStrictEqual(body('cache-positions'));
    expectTypeOf(res).toEqualTypeOf<CachedAssetPosition[]>();
  });

  it('U-LC-2 legacy listCached(ns) → that namespace', async () => {
    const rec = recordRequests();
    await client.positions.listCached('other');
    await expectRequest(rec.requests[0], 'GET', '/cache/other/positions');
  });

  it('U-LC-3 listCached({ namespace }) is honoured (regression)', async () => {
    const rec = recordRequests();
    await client.positions.listCached({ namespace: 'x' });
    await expectRequest(rec.requests[0], 'GET', '/cache/x/positions');
  });

  it('U-LC-4 timeoutMs in the bag → TimeoutError; legacy pre-aborted signal → AbortError, nothing sent', async () => {
    slow('get', '/cache/:namespace/positions');
    await expect(client.positions.listCached({ timeoutMs: 5 })).rejects.toBeInstanceOf(
      TimeoutError
    );
    const rec = recordRequests();
    await expect(
      client.positions.listCached('ns', { signal: AbortSignal.abort() })
    ).rejects.toBeInstanceOf(AbortError);
    expect(rec.requests).toHaveLength(0);
  });

  it('U-LC-5 200 [] → []', async () => {
    server.use(http.get(`${BASE_URL}/cache/:namespace/positions`, () => HttpResponse.json([])));
    await expect(client.positions.listCached()).resolves.toStrictEqual([]);
  });

  it('U-LC-6 500 {error} → ServerError with status and message', async () => {
    server.use(
      http.get(`${BASE_URL}/cache/:namespace/positions`, () =>
        HttpResponse.json(CACHE_500, { status: 500 })
      )
    );
    const p = client.positions.listCached();
    await expect(p).rejects.toBeInstanceOf(ServerError);
    await expect(p).rejects.toMatchObject({ status: 500, message: CACHE_500.error });
  });

  it('no namespace → ContextError, nothing sent', async () => {
    const rec = recordRequests();
    await expect(noNamespace.positions.listCached()).rejects.toBeInstanceOf(ContextError);
    expect(rec.requests).toHaveLength(0);
  });
});

// ─── getCached / getLast ───────────────────────────────────────────────────────

const lookups = [
  {
    name: 'getCached',
    route: '/cache/:namespace/positions/:mac',
    path: (ns: string) => `/cache/${ns}/positions`,
    fixture: 'cache-position',
    pick: (c: RtlsClient): PositionsResource['getCached'] =>
      c.positions.getCached.bind(c.positions),
  },
  {
    name: 'getLast',
    route: '/asset_last_position/:namespace/:mac',
    path: (ns: string) => `/asset_last_position/${ns}`,
    fixture: 'asset-last-position',
    pick: (c: RtlsClient): PositionsResource['getCached'] => c.positions.getLast.bind(c.positions),
  },
] as const;

describe.each(lookups)('positions.$name (U-GC, U-GC-6 for getLast)', (m) => {
  it('U-GC-1 colon, dash and upper-case MACs → 12 lower-case hex in the path; result = fixture body', async () => {
    const rec = recordRequests();
    const results = [
      await m.pick(client)('AA:BB:CC:DD:EE:FF'),
      await m.pick(client)('aa-bb-cc-dd-ee-ff'),
      await m.pick(client)('AABBCCDDEEFF'),
    ];
    expect(rec.requests).toHaveLength(3);
    for (const r of rec.requests) await expectRequest(r, 'GET', `${m.path('ns-test')}/${MAC}`);
    expect(results).toStrictEqual([body(m.fixture), body(m.fixture), body(m.fixture)]);
  });

  it('U-GC-2 an invalid MAC → client-side ValidationError, nothing sent', async () => {
    const rec = recordRequests();
    const p = m.pick(client)('not-a-mac');
    await expect(p).rejects.toBeInstanceOf(ValidationError);
    await expect(p).rejects.toMatchObject({ status: 0 });
    expect(rec.requests).toHaveLength(0);
  });

  it('U-GC-3 legacy (ns, mac, requestOptions) and object form { namespace }', async () => {
    const rec = recordRequests();
    await m.pick(client)('ns2', MAC, { headers: { 'x-trace': 't1' } });
    await m.pick(client)(MAC, { namespace: 'ns3', headers: { 'x-trace': 't2' } });
    await expectRequest(rec.requests[0], 'GET', `${m.path('ns2')}/${MAC}`);
    await expectRequest(rec.requests[1], 'GET', `${m.path('ns3')}/${MAC}`);
    expect(rec.requests.map((r) => r.headers.get('x-trace'))).toStrictEqual(['t1', 't2']);
  });

  it('U-GC-4 404 with an empty body (Content-Length: 0) → NotFoundError, status 404', async () => {
    server.use(
      http.get(`${BASE_URL}${m.route}`, () => bareText(404, '', { 'content-length': '0' }))
    );
    const p = m.pick(client)(MAC);
    await expect(p).rejects.toBeInstanceOf(NotFoundError);
    await expect(p).rejects.toMatchObject({ status: 404 });
  });

  it('U-GC-5 404 text → NotFoundError whose message is the text', async () => {
    server.use(http.get(`${BASE_URL}${m.route}`, () => bareText(404, LAST_POSITION_NOT_FOUND)));
    const p = m.pick(client)(MAC);
    await expect(p).rejects.toBeInstanceOf(NotFoundError);
    await expect(p).rejects.toMatchObject({ status: 404, message: LAST_POSITION_NOT_FOUND });
  });

  it('timeoutMs → TimeoutError; pre-aborted signal → AbortError; no namespace → ContextError', async () => {
    slow('get', m.route);
    await expect(m.pick(client)(MAC, { timeoutMs: 5 })).rejects.toBeInstanceOf(TimeoutError);
    const rec = recordRequests();
    await expect(m.pick(client)(MAC, { signal: AbortSignal.abort() })).rejects.toBeInstanceOf(
      AbortError
    );
    await expect(m.pick(noNamespace)(MAC)).rejects.toBeInstanceOf(ContextError);
    expect(rec.requests).toHaveLength(0);
  });
});

describe('positions lookups: types', () => {
  it('U-GC-7 getCached and getLast resolve to CachedAssetPosition', async () => {
    const cached = await client.positions.getCached(MAC);
    const last = await client.positions.getLast('ns-test', MAC);
    expectTypeOf(cached).toEqualTypeOf<CachedAssetPosition>();
    expectTypeOf(last).toEqualTypeOf<CachedAssetPosition>();
    expect(cached.user_udid).toBe((body('cache-position') as CachedAssetPosition).user_udid);
  });
});

// ─── listLast ──────────────────────────────────────────────────────────────────

describe('positions.listLast', () => {
  const PATH = '/es/last_positions/ns-test';
  const fakeNow = (): void => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  };

  it('U-LL-1 no options → the last 24 h, both bounds as epoch strings, nothing else; result = fixture', async () => {
    fakeNow();
    const rec = recordRequests();
    const res = await client.positions.listLast();
    await expectRequest(rec.requests[0], 'GET', PATH, {
      timestampFrom: '1699913600000',
      timestampTo: '1700000000000',
    });
    expect(res).toStrictEqual(body('es-last-positions'));
    expectTypeOf(res).toEqualTypeOf<AssetPosition[]>();
  });

  it('U-LL-2 only timestampFrom (Date) → to = now', async () => {
    fakeNow();
    const rec = recordRequests();
    await client.positions.listLast({ timestampFrom: new Date(1_699_990_000_000) });
    await expectRequest(rec.requests[0], 'GET', PATH, {
      timestampFrom: '1699990000000',
      timestampTo: String(NOW),
    });
  });

  it('U-LL-3 only timestampTo → from = to − 24 h', async () => {
    const rec = recordRequests();
    await client.positions.listLast({ timestampTo: 1_699_990_000_000 });
    await expectRequest(rec.requests[0], 'GET', PATH, {
      timestampFrom: String(1_699_990_000_000 - DAY),
      timestampTo: '1699990000000',
    });
  });

  it('U-LL-4 timestampFrom: 0 → "0" is sent (no default substituted)', async () => {
    fakeNow();
    const rec = recordRequests();
    await client.positions.listLast({ timestampFrom: 0 });
    await expectRequest(rec.requests[0], 'GET', PATH, {
      timestampFrom: '0',
      timestampTo: String(NOW),
    });
  });

  it('U-LL-5 mapUuids → CSV; an empty array → absent', async () => {
    fakeNow();
    const rec = recordRequests();
    await client.positions.listLast({ mapUuids: ['a', 'b'] });
    await client.positions.listLast({ mapUuids: [] });
    const range = { timestampFrom: String(NOW - DAY), timestampTo: String(NOW) };
    await expectRequest(rec.requests[0], 'GET', PATH, { mapUuids: 'a,b', ...range });
    await expectRequest(rec.requests[1], 'GET', PATH, range);
  });

  it('U-LL-6 current: true → current=true; false or absent → no current key', async () => {
    fakeNow();
    const rec = recordRequests();
    await client.positions.listLast({ current: true });
    await client.positions.listLast({ current: false });
    await client.positions.listLast({});
    const range = { timestampFrom: String(NOW - DAY), timestampTo: String(NOW) };
    await expectRequest(rec.requests[0], 'GET', PATH, { ...range, current: 'true' });
    await expectRequest(rec.requests[1], 'GET', PATH, range);
    await expectRequest(rec.requests[2], 'GET', PATH, range);
  });

  it('U-LL-7 key and queryString are sent verbatim', async () => {
    fakeNow();
    const rec = recordRequests();
    await client.positions.listLast({ key: 'data.type', queryString: 'user.name:A*' });
    await expectRequest(rec.requests[0], 'GET', PATH, {
      key: 'data.type',
      queryString: 'user.name:A*',
      timestampFrom: String(NOW - DAY),
      timestampTo: String(NOW),
    });
  });

  it('U-LL-8 the 0.2.0 paging, sort, fields and filter keys are no longer sent', async () => {
    fakeNow();
    const rec = recordRequests();
    const legacyKeys = { page: 2, limit: 5, sort: 'x', fields: 'a', 'user_name:contains': 'x' };
    await client.positions.listLast(
      legacyKeys as unknown as Parameters<PositionsResource['listLast']>[0]
    );
    await expectRequest(rec.requests[0], 'GET', PATH, {
      timestampFrom: String(NOW - DAY),
      timestampTo: String(NOW),
    });
  });

  it('U-LL-9 legacy (ns, options, requestOptions); the deprecated trailing requestOptions wins over the bag', async () => {
    fakeNow();
    const rec = recordRequests();
    await client.positions.listLast('ns2', { key: 'user.udid' }, { headers: { 'x-trace': 'l' } });
    await client.positions.listLast('ns2');
    await expectRequest(rec.requests[0], 'GET', '/es/last_positions/ns2', {
      key: 'user.udid',
      timestampFrom: String(NOW - DAY),
      timestampTo: String(NOW),
    });
    expect(rec.requests[0]?.headers.get('x-trace')).toBe('l');
    await expectRequest(rec.requests[1], 'GET', '/es/last_positions/ns2', {
      timestampFrom: String(NOW - DAY),
      timestampTo: String(NOW),
    });
    vi.useRealTimers();
    slow('get', '/es/last_positions/:namespace');
    await expect(client.positions.listLast('ns2', {}, { timeoutMs: 5 })).rejects.toBeInstanceOf(
      TimeoutError
    );
    await expect(
      client.positions.listLast({ timeoutMs: 10_000 }, { timeoutMs: 5 })
    ).rejects.toBeInstanceOf(TimeoutError);
    await expect(
      client.positions.listLast({ timeoutMs: 5 }, { timeoutMs: 10_000 })
    ).resolves.toStrictEqual([]);
  });

  it('U-LL-10 from > to or an unparsable bound → ValidationError status 0, nothing sent', async () => {
    const rec = recordRequests();
    for (const options of [
      { timestampFrom: 2_000, timestampTo: 1_000 },
      { timestampFrom: 'not-a-date' },
    ]) {
      const p = client.positions.listLast(options);
      await expect(p).rejects.toBeInstanceOf(ValidationError);
      await expect(p).rejects.toMatchObject({ status: 0 });
    }
    expect(rec.requests).toHaveLength(0);
  });

  it('pre-aborted signal → AbortError; no namespace → ContextError; nothing sent', async () => {
    const rec = recordRequests();
    await expect(client.positions.listLast({ signal: AbortSignal.abort() })).rejects.toBeInstanceOf(
      AbortError
    );
    await expect(noNamespace.positions.listLast()).rejects.toBeInstanceOf(ContextError);
    expect(rec.requests).toHaveLength(0);
  });
});

// ─── getHistory ────────────────────────────────────────────────────────────────

describe('positions.getHistory', () => {
  const PATH = '/es/position_history/ns-test';

  it('U-GH-1 key defaults to user.udid; value and both bounds as epoch strings', async () => {
    const rec = recordRequests();
    await client.positions.getHistory({ value: MAC, timestampFrom: 1_000, timestampTo: 2_000 });
    await expectRequest(rec.requests[0], 'GET', PATH, {
      key: 'user.udid',
      value: MAC,
      timestampFrom: '1000',
      timestampTo: '2000',
    });
  });

  it('U-GH-2 a MAC value with the default key is normalised; other keys and non-MAC values are verbatim', async () => {
    const rec = recordRequests();
    const range = { timestampFrom: 1_000, timestampTo: 2_000 };
    await client.positions.getHistory({ value: 'AA:BB:CC:DD:EE:FF', ...range });
    await client.positions.getHistory({ value: 'AA:BB:CC:DD:EE:FF', key: 'user.udid', ...range });
    await client.positions.getHistory({
      value: 'AA:BB:CC:DD:EE:FF',
      key: 'user.external_id',
      ...range,
    });
    await client.positions.getHistory({ value: 'virtual-01', ...range });
    expect(
      rec.requests.map((r) => [r.url.searchParams.get('key'), r.url.searchParams.get('value')])
    ).toStrictEqual([
      ['user.udid', MAC],
      ['user.udid', MAC],
      ['user.external_id', 'AA:BB:CC:DD:EE:FF'],
      ['user.udid', 'virtual-01'],
    ]);
  });

  it('U-GH-3 no bounds → the last 24 h', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const rec = recordRequests();
    await client.positions.getHistory({ value: MAC });
    await expectRequest(rec.requests[0], 'GET', PATH, {
      key: 'user.udid',
      value: MAC,
      timestampFrom: String(NOW - DAY),
      timestampTo: String(NOW),
    });
  });

  it('U-GH-4 Date and ISO-string bounds → epoch strings', async () => {
    const rec = recordRequests();
    await client.positions.getHistory({
      value: MAC,
      timestampFrom: new Date('2023-11-14T22:13:20Z'),
      timestampTo: '2023-11-14T23:13:20Z',
    });
    expect(queryOf(rec.requests[0] as RecordedRequest)).toMatchObject({
      timestampFrom: '1700000000000',
      timestampTo: '1700003600000',
    });
  });

  it('U-GH-5 400 {error} → ValidationError status 400 with the message', async () => {
    server.use(
      http.get(`${BASE_URL}/es/position_history/:namespace`, () =>
        HttpResponse.json(HISTORY_VALUE_REQUIRED, { status: 400 })
      )
    );
    const p = client.positions.getHistory({ value: '' });
    await expect(p).rejects.toBeInstanceOf(ValidationError);
    await expect(p).rejects.toMatchObject({ status: 400, message: HISTORY_VALUE_REQUIRED.error });
  });

  it('U-GH-6 legacy (ns, options, requestOptions); deprecated trailing requestOptions on the object form', async () => {
    const rec = recordRequests();
    const opts = { value: MAC, timestampFrom: 1_000, timestampTo: 2_000 };
    await client.positions.getHistory('ns2', opts, { headers: { 'x-trace': 'h' } });
    await client.positions.getHistory(opts, { headers: { 'x-trace': 'o' } });
    await expectRequest(rec.requests[0], 'GET', '/es/position_history/ns2', {
      key: 'user.udid',
      value: MAC,
      timestampFrom: '1000',
      timestampTo: '2000',
    });
    expect(rec.requests.map((r) => r.headers.get('x-trace'))).toStrictEqual(['h', 'o']);
    slow('get', '/es/position_history/:namespace');
    await expect(
      client.positions.getHistory({ ...opts, timeoutMs: 10_000 }, { timeoutMs: 5 })
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it('U-GH-7 result typed AssetPosition[] = fixture body', async () => {
    const res = await client.positions.getHistory({ value: MAC });
    expectTypeOf(res).toEqualTypeOf<AssetPosition[]>();
    expect(res).toStrictEqual(body('es-position-history'));
  });

  it('U-GH-8 from > to → ValidationError status 0, nothing sent', async () => {
    const rec = recordRequests();
    const p = client.positions.getHistory({ value: MAC, timestampFrom: 2_000, timestampTo: 1_000 });
    await expect(p).rejects.toBeInstanceOf(ValidationError);
    await expect(p).rejects.toMatchObject({ status: 0 });
    expect(rec.requests).toHaveLength(0);
  });

  it('timeoutMs → TimeoutError; pre-aborted signal → AbortError; no namespace → ContextError', async () => {
    slow('get', '/es/position_history/:namespace');
    await expect(client.positions.getHistory({ value: MAC, timeoutMs: 5 })).rejects.toBeInstanceOf(
      TimeoutError
    );
    const rec = recordRequests();
    await expect(
      client.positions.getHistory({ value: MAC, signal: AbortSignal.abort() })
    ).rejects.toBeInstanceOf(AbortError);
    await expect(noNamespace.positions.getHistory({ value: MAC })).rejects.toBeInstanceOf(
      ContextError
    );
    expect(rec.requests).toHaveLength(0);
  });
});

// ─── publish ───────────────────────────────────────────────────────────────────

describe('positions.publish', () => {
  const ROUTE = `${BASE_URL}/publisher/:namespace`;

  it('U-PUB-1 POST /publisher/{ns}, no query, body = the input; resolves undefined', async () => {
    const rec = recordRequests();
    const position = {
      user_udid: MAC,
      lat: 1.5,
      lon: 2.5,
      map_uuid: 'm',
      data: { a: 1 },
      extra: true,
    };
    await expect(client.positions.publish(position)).resolves.toBeUndefined();
    await expectRequest(rec.requests[0], 'POST', '/publisher/ns-test', {}, position);
    expect(rec.requests).toHaveLength(1);
  });

  it('U-PUB-2 MAC-shaped user_udid / user_uuid normalised, other values verbatim, user_uuid only when given', async () => {
    const rec = recordRequests();
    await client.positions.publish({ user_udid: 'AA:BB:CC:DD:EE:FF' });
    await client.positions.publish({ user_udid: 'virtual-01' });
    await client.positions.publish({
      user_udid: 'AA:BB:CC:DD:EE:FF',
      user_uuid: 'AA-BB-CC-DD-EE-FF',
    });
    await client.positions.publish({ user_udid: 'virtual-01', user_uuid: 'virtual-02' });
    const sent = await Promise.all(
      rec.requests.map(async (r) => JSON.parse(await r.text()) as unknown)
    );
    expect(sent).toStrictEqual([
      { user_udid: MAC },
      { user_udid: 'virtual-01' },
      { user_udid: MAC, user_uuid: MAC },
      { user_udid: 'virtual-01', user_uuid: 'virtual-02' },
    ]);
  });

  it('U-PUB-3 patchAssetData: true → patch_asset_data=true; false or absent → no query', async () => {
    const rec = recordRequests();
    await client.positions.publish({ user_udid: MAC }, { patchAssetData: true });
    await client.positions.publish({ user_udid: MAC }, { patchAssetData: false });
    await client.positions.publish({ user_udid: MAC });
    expect(rec.requests.map(queryOf)).toStrictEqual([{ patch_asset_data: 'true' }, {}, {}]);
  });

  it('U-PUB-4 201 with an empty body, no Content-Length and no Content-Type → undefined (fixture publisher-201)', async () => {
    const fixture = loadFixture('positions-spatial', 'publisher-201');
    expect({
      status: fixture.status,
      body: fixture.body,
      contentType: fixture.contentType,
    }).toStrictEqual({
      status: 201,
      body: null,
      contentType: undefined,
    });
    await expect(client.positions.publish({ user_udid: MAC })).resolves.toBeUndefined();
  });

  it('U-PUB-5 201 with Content-Length: 0, and 200 "OK" text → undefined', async () => {
    server.use(http.post(ROUTE, () => bareText(201, '', { 'content-length': '0' })));
    await expect(client.positions.publish({ user_udid: MAC })).resolves.toBeUndefined();
    server.use(http.post(ROUTE, () => HttpResponse.text('OK')));
    await expect(client.positions.publish({ user_udid: MAC })).resolves.toBeUndefined();
  });

  it.each([PUBLISHER_MISSING_MAC, PUBLISHER_INVALID_DATA, PUBLISHER_JSON_ERROR])(
    'U-PUB-6/7 400 text without Content-Type %j → ValidationError status 400 with the text',
    async (text) => {
      server.use(http.post(ROUTE, () => bareText(400, text)));
      const p = client.positions.publish({ user_udid: MAC });
      await expect(p).rejects.toBeInstanceOf(ValidationError);
      await expect(p).rejects.toMatchObject({ status: 400, message: text });
    }
  );

  it('U-PUB-8 400 reserved_field_namespace → apiCode, message from the body, fields in err.body', async () => {
    server.use(
      http.post(ROUTE, () => HttpResponse.json(PUBLISHER_RESERVED_FIELD, { status: 400 }))
    );
    const p = client.positions.publish(
      { user_udid: MAC, data: { sensor_ils_foo: 1 } },
      { patchAssetData: true }
    );
    await expect(p).rejects.toBeInstanceOf(ValidationError);
    await expect(p).rejects.toSatisfy(
      (e: ValidationError) =>
        e.apiCode === 'reserved_field_namespace' &&
        e.message === PUBLISHER_RESERVED_FIELD.message &&
        JSON.stringify((e.body as { fields: string[] }).fields) ===
          JSON.stringify(PUBLISHER_RESERVED_FIELD.fields)
    );
  });

  it.each([
    [413, PUBLISHER_413, PayloadTooLargeError],
    [415, PUBLISHER_415, UnsupportedMediaTypeError],
    [503, PUBLISHER_503, ServiceUnavailableError],
  ] as const)(
    'U-PUB-9 %i text → its error class, real status, text message',
    async (status, text, cls) => {
      server.use(http.post(ROUTE, () => bareText(status, text)));
      const p = client.positions.publish({ user_udid: MAC });
      await expect(p).rejects.toBeInstanceOf(cls);
      await expect(p).rejects.toMatchObject({ status, message: text });
    }
  );

  it('U-PUB-10 never retried, even with POST in the retry policy: 503 → exactly 1 request', async () => {
    const retrying = createRtlsClient({
      apiKey: API_KEY,
      namespace: 'ns-test',
      retry: { retries: 2, methods: ['GET', 'POST'], baseDelayMs: 1 },
    });
    server.use(http.post(ROUTE, () => bareText(503, PUBLISHER_503)));
    const rec = recordRequests();
    await expect(retrying.positions.publish({ user_udid: MAC })).rejects.toBeInstanceOf(
      ServiceUnavailableError
    );
    expect(rec.requests).toHaveLength(1);
  });

  it('U-PUB-11 legacy (ns, position, { patchAssetData }, requestOptions)', async () => {
    const rec = recordRequests();
    await client.positions.publish(
      'ns2',
      { user_udid: MAC },
      { patchAssetData: true },
      { timeoutMs: 1000 }
    );
    await client.positions.publish('ns2', { user_udid: MAC });
    await expectRequest(
      rec.requests[0],
      'POST',
      '/publisher/ns2',
      { patch_asset_data: 'true' },
      { user_udid: MAC }
    );
    await expectRequest(rec.requests[1], 'POST', '/publisher/ns2', {}, { user_udid: MAC });
  });

  it('U-PUB-12 publish(position, { namespace }) → that namespace; deprecated trailing requestOptions', async () => {
    const rec = recordRequests();
    await client.positions.publish(
      { user_udid: MAC },
      { namespace: 'ns3' },
      { headers: { 'x-trace': 'p' } }
    );
    await expectRequest(rec.requests[0], 'POST', '/publisher/ns3', {}, { user_udid: MAC });
    expect(rec.requests[0]?.headers.get('x-trace')).toBe('p');
  });

  it('a JavaScript call without a position sends an empty object (the server answers 400)', async () => {
    server.use(http.post(ROUTE, () => bareText(400, PUBLISHER_MISSING_MAC)));
    const rec = recordRequests();
    await expect(
      client.positions.publish('ns2', undefined as unknown as PublishPositionData)
    ).rejects.toBeInstanceOf(ValidationError);
    await expectRequest(rec.requests[0], 'POST', '/publisher/ns2', {}, {});
  });

  it('timeoutMs → TimeoutError; pre-aborted signal → AbortError; no namespace → ContextError', async () => {
    slow('post', '/publisher/:namespace');
    await expect(
      client.positions.publish({ user_udid: MAC }, { timeoutMs: 5 })
    ).rejects.toBeInstanceOf(TimeoutError);
    const rec = recordRequests();
    await expect(
      client.positions.publish({ user_udid: MAC }, { signal: AbortSignal.abort() })
    ).rejects.toBeInstanceOf(AbortError);
    await expect(noNamespace.positions.publish({ user_udid: MAC })).rejects.toBeInstanceOf(
      ContextError
    );
    expect(rec.requests).toHaveLength(0);
  });
});
