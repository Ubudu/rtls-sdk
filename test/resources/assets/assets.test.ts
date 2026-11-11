// Unit tests of client.assets (P2 §8.1, error matrix §6.7): the real request builders against the MSW handlers of
// test/mocks/handlers/assets.ts; requests are read with recordRequests().
import { afterEach, describe, expect, it, vi } from 'vitest';
import { delay, http, HttpResponse } from 'msw';
import {
  AbortError,
  AuthenticationError,
  ContextError,
  createRtlsClient,
  NotFoundError,
  PayloadTooLargeError,
  ServerError,
  TimeoutError,
  ValidationError,
  type Asset,
  type AssetHistoryEntry,
  type BatchDeleteResult,
  type BatchSaveItem,
  type RtlsClient,
} from '../../../src';
import { fixtureResponse, loadFixture } from '../../contract/fixtures';
import { assetFixture, SERVER_TEXT, textWithoutType } from '../../mocks/handlers/assets';
import {
  recordRequests,
  server,
  type RecordedRequest,
  type RequestRecorder,
} from '../../mocks/server';

const BASE = 'https://rtls.ubudu.com/api';
const MAC = 'aabbccddeeff';
const LIST_URL = `${BASE}/assets/:ns`;
const ASSET_URL = `${BASE}/assets/:ns/:mac`;
const HISTORY_URL = `${BASE}/asset_history/:ns/:mac`;

function client(namespace = 'ns'): RtlsClient {
  return createRtlsClient({ apiKey: 'test-key', namespace });
}

function clientWithoutNamespace(): RtlsClient {
  return createRtlsClient({ apiKey: 'test-key' });
}

function only(rec: RequestRecorder): RecordedRequest {
  expect(rec.requests).toHaveLength(1);
  return rec.requests[0] as RecordedRequest;
}

function nth(rec: RequestRecorder, index: number): RecordedRequest {
  return rec.requests[index] as RecordedRequest;
}

/** One auth header (the API key), no Authorization. */
function expectAuth(req: RecordedRequest): void {
  expect(req.headers.get('x-api-key')).toBe('test-key');
  expect(req.headers.get('authorization')).toBeNull();
}

async function jsonBody(req: RecordedRequest): Promise<unknown> {
  return JSON.parse(await req.text()) as unknown;
}

function coreFixture(name: string): Response {
  return fixtureResponse(loadFixture('core', name));
}

const listFixture = loadFixture('assets', 'assets-list').body as Asset[];
const assetBody = loadFixture('assets', 'asset').body as Asset;
const patchedBody = loadFixture('assets', 'asset-patched').body as Asset;
const savedBody = loadFixture('assets', 'assets-batch-save').body as Asset[];
const historyBody = loadFixture('assets', 'asset-history').body as AssetHistoryEntry[];

describe('assets.list', () => {
  it('default namespace → GET /assets/<ns> with an empty query; the typed array of the fixture', async () => {
    const rec = recordRequests();
    const assets: Asset[] = await client().assets.list();
    const req = only(rec);
    expect(req.method).toBe('GET');
    expect(req.url.pathname).toBe('/api/assets/ns');
    expect(req.url.search).toBe('');
    expect(req.headers.get('content-type')).toBeNull();
    expectAuth(req);
    expect(assets).toStrictEqual(listFixture);
  });

  it('key/value → ?key=user_udid&value=<mac>', async () => {
    const rec = recordRequests();
    await client().assets.list({ key: 'user_udid', value: MAC });
    expect(only(rec).url.search).toBe(`?key=user_udid&value=${MAC}`);
  });

  it.each([
    [5, 'value=5'],
    [true, 'value=true'],
  ] as const)('value %s is sent as String(value)', async (value, expected) => {
    const rec = recordRequests();
    await client().assets.list({ key: 'data.level', value });
    expect(only(rec).url.search).toBe(`?key=data.level&${expected}`);
  });

  it('page, limit, sort, fields and filters are absent from the query and applied locally', async () => {
    const rec = recordRequests();
    const page = await client().assets.list({
      'user_name:contains': 'A',
      sort: 'user_name:asc',
      page: 2,
      limit: 2,
    });
    expect(only(rec).url.search).toBe('');
    // contains 'A' (case-insensitive): Pallet 07, Cart 11, Badge 03 → sorted Badge, Cart, Pallet → page 2 of 2
    expect(page.map((a) => a.user_name)).toStrictEqual(['Pallet 07']);
  });

  it('sort without paging returns every asset in order', async () => {
    const assets = await client().assets.list({ sort: 'user_name:asc' });
    expect(assets.map((a) => a.user_name)).toStrictEqual([
      'Badge 03',
      'Cart 11',
      'Forklift 01',
      'Forklift 02',
      'Pallet 07',
    ]);
  });

  it('fields projects the items (dot paths)', async () => {
    const assets = await client().assets.list({ fields: ['user_udid', 'data.zone'], limit: 2 });
    expect(assets).toStrictEqual([
      { user_udid: '025d4b000001', data: { zone: 'A' } },
      { user_udid: '025d4b000002', data: { zone: 'B' } },
    ]);
  });

  it('top-level "field:op" keys merge with filters; filters win on the same key', async () => {
    const rec = recordRequests();
    const assets = await client().assets.list({
      'user_type:eq': 'pallet',
      'data.battery:gte': 50,
      filters: { 'user_type:eq': 'forklift' },
    });
    expect(only(rec).url.search).toBe('');
    expect(assets.map((a) => a.user_udid)).toStrictEqual(['025d4b000001']);
  });

  it.each([
    ['key without value', { key: 'user_udid' }, 'value'],
    ['value without key', { value: 'x' }, 'key'],
    ['empty key', { key: '', value: 'x' }, 'key'],
    ['object value', { key: 'a', value: {} as unknown as string }, 'value'],
    ['page 0', { page: 0 }, 'page'],
    ['limit 1001', { limit: 1001 }, 'limit'],
    ['limit 1.5', { limit: 1.5 }, 'limit'],
    ['filters not an object', { filters: 'x' as unknown as Record<string, never> }, 'filters'],
  ])('%s → ValidationError before any request', async (_label, options, field) => {
    const rec = recordRequests();
    await expect(client().assets.list(options)).rejects.toMatchObject({
      name: 'ValidationError',
      status: 0,
      details: [field],
    });
    expect(rec.requests).toHaveLength(0);
  });

  it('an unknown filter operator → ValidationError before any request', async () => {
    const rec = recordRequests();
    const bad = { 'user_name:like': 'x' } as unknown as Record<string, never>;
    await expect(client().assets.list(bad)).rejects.toBeInstanceOf(ValidationError);
    expect(rec.requests).toHaveLength(0);
  });

  it("legacy list('ns2', { limit: 1 }) → path ns2, limit applied locally", async () => {
    const rec = recordRequests();
    const assets = await client().assets.list('ns2', { limit: 1 });
    const req = only(rec);
    expect(req.url.pathname).toBe('/api/assets/ns2');
    expect(req.url.search).toBe('');
    expect(assets).toHaveLength(1);
  });

  it('{ namespace } overrides the default namespace', async () => {
    const rec = recordRequests();
    await client().assets.list({ namespace: 'other' });
    expect(only(rec).url.pathname).toBe('/api/assets/other');
  });

  it('the deprecated trailing requestOptions win over the inline timeoutMs', async () => {
    server.use(
      http.get(LIST_URL, async () => {
        await delay(60);
        return HttpResponse.json([]);
      })
    );
    await expect(client().assets.list({ timeoutMs: 5 })).rejects.toBeInstanceOf(TimeoutError);
    await expect(
      client().assets.list({ timeoutMs: 5 }, { timeoutMs: 5000 })
    ).resolves.toStrictEqual([]);
  });

  it('legacy form with a trailing requestOptions argument: its headers are sent', async () => {
    const rec = recordRequests();
    await client().assets.list('ns', { limit: 1 }, { headers: { 'x-trace': 't1' } });
    expect(only(rec).headers.get('x-trace')).toBe('t1');
  });

  it('500 → ServerError', async () => {
    server.use(http.get(LIST_URL, () => HttpResponse.json({ error: 'boom' }, { status: 500 })));
    await expect(client().assets.list()).rejects.toBeInstanceOf(ServerError);
  });

  it('401 → AuthenticationError', async () => {
    server.use(http.get(LIST_URL, () => coreFixture('error-401')));
    await expect(client().assets.list()).rejects.toBeInstanceOf(AuthenticationError);
  });
});

describe('assets.iterate and getAll', () => {
  it('iterate yields the fixture items in order', async () => {
    const seen: string[] = [];
    for await (const asset of client().assets.iterate()) seen.push(asset.user_udid);
    expect(seen).toStrictEqual(listFixture.map((a) => a.user_udid));
  });

  it("legacy iterate('ns2', options) → path ns2, options applied", async () => {
    const rec = recordRequests();
    const seen: Asset[] = [];
    for await (const asset of client().assets.iterate('ns2', { 'user_type:eq': 'forklift' }))
      seen.push(asset);
    expect(only(rec).url.pathname).toBe('/api/assets/ns2');
    expect(seen.map((a) => a.user_udid)).toStrictEqual(['025d4b000001', '025d4b000003']);
  });

  it('getAll equals list (object, two-object and legacy forms)', async () => {
    const assets = client().assets;
    await expect(assets.getAll()).resolves.toStrictEqual(await assets.list());
    await expect(assets.getAll({ limit: 2 }, { timeoutMs: 5000 })).resolves.toHaveLength(2);
    const rec = recordRequests();
    await expect(assets.getAll('ns3', { limit: 1 })).resolves.toHaveLength(1);
    expect(only(rec).url.pathname).toBe('/api/assets/ns3');
  });
});

describe('assets.get', () => {
  it("'AA:BB:CC:DD:EE:FF' → GET /assets/<ns>/aabbccddeeff; the typed asset", async () => {
    const rec = recordRequests();
    const asset: Asset = await client().assets.get('AA:BB:CC:DD:EE:FF');
    const req = only(rec);
    expect(req.method).toBe('GET');
    expect(req.url.pathname).toBe(`/api/assets/ns/${MAC}`);
    expect(req.url.search).toBe('');
    expect(req.headers.get('content-type')).toBeNull();
    expectAuth(req);
    expect(asset).toStrictEqual(assetBody);
  });

  it("'zz' → ValidationError before any request", async () => {
    const rec = recordRequests();
    await expect(client().assets.get('zz')).rejects.toMatchObject({
      name: 'ValidationError',
      status: 0,
      details: ['macAddress'],
    });
    expect(rec.requests).toHaveLength(0);
  });

  it('404 with an empty body → NotFoundError (status 404)', async () => {
    server.use(http.get(ASSET_URL, () => new HttpResponse(null, { status: 404 })));
    await expect(client().assets.get(MAC)).rejects.toMatchObject({
      name: 'NotFoundError',
      status: 404,
    });
  });

  it('500 → ServerError', async () => {
    server.use(http.get(ASSET_URL, () => textWithoutType('Internal error', 500)));
    await expect(client().assets.get(MAC)).rejects.toBeInstanceOf(ServerError);
  });

  it("legacy get('ns2', mac) and the { namespace } override", async () => {
    const rec = recordRequests();
    await client().assets.get('ns2', 'AA-BB-CC-DD-EE-FF', { headers: { 'x-trace': 'l' } });
    await client().assets.get(MAC, { namespace: 'ns3' });
    expect(rec.requests.map((r) => r.url.pathname)).toStrictEqual([
      `/api/assets/ns2/${MAC}`,
      `/api/assets/ns3/${MAC}`,
    ]);
    expect(nth(rec, 0).headers.get('x-trace')).toBe('l');
  });
});

describe('assets.create', () => {
  it('POST {...input, user_udid: <normalised>} then GET; 201 Created without Content-Type → the stored asset', async () => {
    const rec = recordRequests();
    const asset = await client().assets.create('AA:BB:CC:DD:EE:FF', {
      user_name: 'Forklift 01',
      data: { zone: 'A' },
    });
    expect(rec.requests).toHaveLength(2);
    const post = nth(rec, 0);
    expect(post.method).toBe('POST');
    expect(post.url.pathname).toBe(`/api/assets/ns/${MAC}`);
    expect(post.url.search).toBe('');
    expect(post.headers.get('content-type')).toBe('application/json');
    expectAuth(post);
    await expect(jsonBody(post)).resolves.toStrictEqual({
      user_name: 'Forklift 01',
      data: { zone: 'A' },
      user_udid: MAC,
    });
    const get = nth(rec, 1);
    expect(get.method).toBe('GET');
    expect(get.url.pathname).toBe(`/api/assets/ns/${MAC}`);
    expect(get.headers.get('content-type')).toBeNull();
    expect(asset).toStrictEqual(assetBody);
  });

  it('200 Updated (existing asset) → same', async () => {
    server.use(http.post(ASSET_URL, () => assetFixture('asset-create-200')));
    await expect(client().assets.create(MAC, { user_name: 'x' })).resolves.toStrictEqual(assetBody);
  });

  it('user_udid equal to the MAC in another form is accepted and replaced by the normalised MAC', async () => {
    const rec = recordRequests();
    await client().assets.create(MAC, { user_name: 'x', user_udid: 'AA:BB:CC:DD:EE:FF' });
    await expect(jsonBody(nth(rec, 0))).resolves.toStrictEqual({ user_name: 'x', user_udid: MAC });
  });

  it.each([
    ['user_udid mismatch', { user_name: 'x', user_udid: '112233445566' }, 'user_udid'],
    ['user_udid not a MAC', { user_name: 'x', user_udid: 'nope' }, 'user_udid'],
    ['missing user_name', {}, 'user_name'],
    ['empty user_name', { user_name: '' }, 'user_name'],
    ['data: []', { user_name: 'x', data: [] }, 'data'],
    ['data: "x"', { user_name: 'x', data: 'x' }, 'data'],
  ])('%s → ValidationError before any request', async (_label, input, field) => {
    const rec = recordRequests();
    await expect(
      client().assets.create(MAC, input as unknown as { user_name: string })
    ).rejects.toMatchObject({ name: 'ValidationError', status: 0, details: [field] });
    expect(rec.requests).toHaveLength(0);
  });

  it('a non-object input or an invalid MAC → ValidationError before any request', async () => {
    const rec = recordRequests();
    await expect(
      client().assets.create(MAC, null as unknown as { user_name: string })
    ).rejects.toMatchObject({ details: ['asset'] });
    await expect(client().assets.create('zz', { user_name: 'x' })).rejects.toMatchObject({
      details: ['macAddress'],
    });
    expect(rec.requests).toHaveLength(0);
  });

  it('400 reserved_field_namespace → ValidationError with apiCode and body.fields', async () => {
    server.use(http.post(ASSET_URL, () => coreFixture('error-e2-fields')));
    await expect(
      client().assets.create(MAC, { user_name: 'x', data: { sensor_x: 1 } })
    ).rejects.toMatchObject({
      name: 'ValidationError',
      status: 400,
      apiCode: 'reserved_field_namespace',
      body: { fields: ['data.sensor_x'] },
    });
  });

  it('500 text → ServerError whose message is the server text', async () => {
    server.use(http.post(ASSET_URL, () => textWithoutType(SERVER_TEXT.udidRequired, 500)));
    await expect(client().assets.create(MAC, { user_name: 'x' })).rejects.toMatchObject({
      name: 'ServerError',
      status: 500,
      message: SERVER_TEXT.udidRequired,
    });
  });

  it('413 HTML → PayloadTooLargeError', async () => {
    server.use(http.post(ASSET_URL, () => coreFixture('error-e10-413')));
    await expect(client().assets.create(MAC, { user_name: 'x' })).rejects.toBeInstanceOf(
      PayloadTooLargeError
    );
  });

  it('404 from the follow-up GET → NotFoundError', async () => {
    server.use(http.get(ASSET_URL, () => new HttpResponse(null, { status: 404 })));
    await expect(client().assets.create(MAC, { user_name: 'x' })).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it('legacy create(ns, mac, asset, requestOptions): both requests go to ns2', async () => {
    const rec = recordRequests();
    await client().assets.create(
      'ns2',
      'AA:BB:CC:DD:EE:FF',
      { user_name: 'x' },
      { timeoutMs: 5000 }
    );
    expect(rec.requests.map((r) => `${r.method} ${r.url.pathname}`)).toStrictEqual([
      `POST /api/assets/ns2/${MAC}`,
      `GET /api/assets/ns2/${MAC}`,
    ]);
  });
});

describe('assets.update', () => {
  it('PATCH with Content-Type application/json and the body verbatim (null kept); 200 → Asset', async () => {
    const rec = recordRequests();
    const patch = { color: '#000000', external_id: null, data: null };
    const asset = await client().assets.update('AA:BB:CC:DD:EE:FF', patch);
    const req = only(rec);
    expect(req.method).toBe('PATCH');
    expect(req.url.pathname).toBe(`/api/assets/ns/${MAC}`);
    expect(req.headers.get('content-type')).toBe('application/json');
    expectAuth(req);
    await expect(jsonBody(req)).resolves.toStrictEqual(patch);
    expect(asset).toStrictEqual(patchedBody);
  });

  it('404 "404 Not Found\\r\\n" without Content-Type → NotFoundError', async () => {
    server.use(http.patch(ASSET_URL, () => textWithoutType(SERVER_TEXT.notFound, 404)));
    await expect(client().assets.update(MAC, { color: '#000000' })).rejects.toMatchObject({
      name: 'NotFoundError',
      status: 404,
      message: '404 Not Found',
    });
  });

  it.each([
    ['user_name: null', { user_name: null }, 'user_name'],
    ["user_name: ''", { user_name: '' }, 'user_name'],
    ['user_udid mismatch', { user_udid: '112233445566' }, 'user_udid'],
    ['user_udid: null', { user_udid: null }, 'user_udid'],
    ['data: 1', { data: 1 }, 'data'],
    ['not an object', [] as unknown, 'patch'],
  ])('%s → ValidationError before any request', async (_label, patch, field) => {
    const rec = recordRequests();
    await expect(
      client().assets.update(MAC, patch as Record<string, unknown>)
    ).rejects.toMatchObject({ name: 'ValidationError', status: 0, details: [field] });
    expect(rec.requests).toHaveLength(0);
  });

  it('data may be an object without prototype', async () => {
    const rec = recordRequests();
    const data = Object.assign(Object.create(null) as Record<string, unknown>, { zone: 'A' });
    await client().assets.update(MAC, { data });
    await expect(jsonBody(only(rec))).resolves.toStrictEqual({ data: { zone: 'A' } });
  });

  it('an invalid MAC → ValidationError before any request', async () => {
    const rec = recordRequests();
    await expect(client().assets.update('zz', {})).rejects.toBeInstanceOf(ValidationError);
    expect(rec.requests).toHaveLength(0);
  });

  it('400 reserved_field_namespace → ValidationError', async () => {
    server.use(http.patch(ASSET_URL, () => coreFixture('error-e2-fields')));
    await expect(client().assets.update(MAC, { data: { sensor_x: 1 } })).rejects.toMatchObject({
      status: 400,
      apiCode: 'reserved_field_namespace',
    });
  });

  it('413 → PayloadTooLargeError; 500 text → ServerError with the text', async () => {
    server.use(http.patch(ASSET_URL, () => coreFixture('error-e10-413')));
    await expect(client().assets.update(MAC, { color: 'x' })).rejects.toBeInstanceOf(
      PayloadTooLargeError
    );
    server.use(http.patch(ASSET_URL, () => textWithoutType(SERVER_TEXT.invalidData, 500)));
    await expect(client().assets.update(MAC, { color: 'x' })).rejects.toMatchObject({
      name: 'ServerError',
      message: SERVER_TEXT.invalidData,
    });
  });

  it('legacy update(ns, mac, patch)', async () => {
    const rec = recordRequests();
    await client().assets.update('ns2', MAC, { user_udid: MAC, user_name: 'y' });
    expect(only(rec).url.pathname).toBe(`/api/assets/ns2/${MAC}`);
  });

  it('a user_udid in another MAC form is sent normalised (D9); the caller’s patch is not mutated', async () => {
    const rec = recordRequests();
    const patch = { user_udid: 'AA:BB:CC:DD:EE:FF', color: 'x' };
    await client().assets.update('AA-BB-CC-DD-EE-FF', patch);
    const req = only(rec);
    expect(req.url.pathname).toBe(`/api/assets/ns/${MAC}`);
    await expect(jsonBody(req)).resolves.toStrictEqual({ user_udid: MAC, color: 'x' });
    expect(patch.user_udid).toBe('AA:BB:CC:DD:EE:FF');
  });
});

describe('assets.delete', () => {
  it('DELETE without body; 200 empty without Content-Type → undefined', async () => {
    const rec = recordRequests();
    await expect(client().assets.delete('AA:BB:CC:DD:EE:FF')).resolves.toBeUndefined();
    const req = only(rec);
    expect(req.method).toBe('DELETE');
    expect(req.url.pathname).toBe(`/api/assets/ns/${MAC}`);
    expect(req.headers.get('content-type')).toBeNull();
    expectAuth(req);
    await expect(req.text()).resolves.toBe('');
  });

  it('404 text → NotFoundError', async () => {
    server.use(http.delete(ASSET_URL, () => textWithoutType(SERVER_TEXT.notFound, 404)));
    await expect(client().assets.delete(MAC)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('an invalid MAC → ValidationError before any request', async () => {
    const rec = recordRequests();
    await expect(client().assets.delete('aa:bb')).rejects.toBeInstanceOf(ValidationError);
    expect(rec.requests).toHaveLength(0);
  });

  it('500 → ServerError', async () => {
    server.use(http.delete(ASSET_URL, () => textWithoutType('Internal error', 500)));
    await expect(client().assets.delete(MAC)).rejects.toBeInstanceOf(ServerError);
  });

  it('legacy delete(ns, mac)', async () => {
    const rec = recordRequests();
    await client().assets.delete('ns2', MAC);
    expect(only(rec).url.pathname).toBe(`/api/assets/ns2/${MAC}`);
  });
});

describe('assets.batchSave', () => {
  it('POST a JSON array with normalised user_udid; the typed array of saved assets', async () => {
    const rec = recordRequests();
    const saved: Asset[] = await client().assets.batchSave([
      { user_udid: 'AA:BB:CC:DD:EE:01', user_name: 'Batch 01' },
      { user_udid: '025d4b000012', user_name: 'Batch 02', data: { zone: 'B' } },
    ]);
    const req = only(rec);
    expect(req.method).toBe('POST');
    expect(req.url.pathname).toBe('/api/assets/ns');
    expect(req.headers.get('content-type')).toBe('application/json');
    expectAuth(req);
    await expect(jsonBody(req)).resolves.toStrictEqual([
      { user_udid: 'aabbccddee01', user_name: 'Batch 01' },
      { user_udid: '025d4b000012', user_name: 'Batch 02', data: { zone: 'B' } },
    ]);
    expect(saved).toStrictEqual(savedBody);
  });

  it.each([
    ['without user_udid', { user_name: 'x' }, 'assets[1].user_udid'],
    ['with an invalid MAC', { user_udid: 'zz', user_name: 'x' }, 'assets[1].user_udid'],
    ['without user_name', { user_udid: '025d4b000013' }, 'assets[1].user_name'],
    ['not an object', 'x', 'assets[1]'],
    ['with data: []', { user_udid: '025d4b000013', user_name: 'x', data: [] }, 'assets[1].data'],
  ])('item 1 %s → ValidationError naming index 1, before any request', async (_l, item, field) => {
    const rec = recordRequests();
    const items = [{ user_udid: MAC, user_name: 'ok' }, item] as unknown as BatchSaveItem[];
    await expect(client().assets.batchSave(items)).rejects.toMatchObject({
      name: 'ValidationError',
      status: 0,
      details: [field],
      message: expect.stringContaining('assets[1]') as unknown,
    });
    expect(rec.requests).toHaveLength(0);
  });

  it('a non-array → ValidationError before any request', async () => {
    const rec = recordRequests();
    await expect(client().assets.batchSave({} as unknown as [])).rejects.toMatchObject({
      details: ['assets'],
    });
    expect(rec.requests).toHaveLength(0);
  });

  it('400 reserved field → ValidationError; 413 → PayloadTooLargeError', async () => {
    const items = [{ user_udid: MAC, user_name: 'x' }];
    server.use(http.post(LIST_URL, () => coreFixture('error-e2-fields')));
    await expect(client().assets.batchSave(items)).rejects.toMatchObject({
      name: 'ValidationError',
      apiCode: 'reserved_field_namespace',
    });
    server.use(http.post(LIST_URL, () => coreFixture('error-e10-413')));
    await expect(client().assets.batchSave(items)).rejects.toBeInstanceOf(PayloadTooLargeError);
  });

  it.each([SERVER_TEXT.notAnArray, SERVER_TEXT.jsonError])(
    '500 text %j → ServerError with that message',
    async (text) => {
      server.use(http.post(LIST_URL, () => textWithoutType(text, 500)));
      await expect(
        client().assets.batchSave([{ user_udid: MAC, user_name: 'x' }])
      ).rejects.toMatchObject({ name: 'ServerError', message: text });
    }
  );

  it("legacy batchSave('ns2', items)", async () => {
    const rec = recordRequests();
    await client().assets.batchSave('ns2', [{ user_udid: MAC, user_name: 'x' }]);
    expect(only(rec).url.pathname).toBe('/api/assets/ns2');
  });
});

describe('assets.batchDelete (sequential single deletes, P2-T6 fallback)', () => {
  it('one DELETE /assets/<ns>/<mac> per MAC in order, never the batch route DELETE /assets/<ns>; 404 → not_found', async () => {
    server.use(
      http.delete(ASSET_URL, ({ params }) =>
        params.mac === '025d4b000002'
          ? textWithoutType(SERVER_TEXT.notFound, 404)
          : new HttpResponse(null, { status: 200 })
      )
    );
    const rec = recordRequests();
    const result: BatchDeleteResult = await client().assets.batchDelete([
      'AA:BB:CC:DD:EE:01',
      '025d4b000002',
      '025D4B000003',
    ]);
    expect(result).toStrictEqual({
      deleted: ['aabbccddee01', '025d4b000003'],
      not_found: ['025d4b000002'],
    });
    expect(rec.requests.map((r) => `${r.method} ${r.url.pathname}`)).toStrictEqual([
      'DELETE /api/assets/ns/aabbccddee01',
      'DELETE /api/assets/ns/025d4b000002',
      'DELETE /api/assets/ns/025d4b000003',
    ]);
    expect(nth(rec, 0).headers.get('content-type')).toBeNull();
    expectAuth(nth(rec, 0));
    await expect(nth(rec, 0).text()).resolves.toBe('');
  });

  it('500 on item 2 → ServerError thrown, item 3 not sent', async () => {
    server.use(
      http.delete(ASSET_URL, ({ params }) =>
        params.mac === '025d4b000002'
          ? textWithoutType('Internal error', 500)
          : new HttpResponse(null, { status: 200 })
      )
    );
    const rec = recordRequests();
    await expect(
      client().assets.batchDelete(['025d4b000001', '025d4b000002', '025d4b000003'])
    ).rejects.toBeInstanceOf(ServerError);
    expect(rec.requests.map((r) => r.url.pathname)).toStrictEqual([
      '/api/assets/ns/025d4b000001',
      '/api/assets/ns/025d4b000002',
    ]);
  });

  it('an invalid MAC → ValidationError naming the index, before any request', async () => {
    const rec = recordRequests();
    await expect(client().assets.batchDelete([MAC, 'zz'])).rejects.toMatchObject({
      name: 'ValidationError',
      status: 0,
      details: ['macAddresses[1]'],
    });
    await expect(client().assets.batchDelete([MAC, 5 as unknown as string])).rejects.toMatchObject({
      details: ['macAddresses[1]'],
    });
    await expect(
      client().assets.batchDelete('x' as unknown as string[], { namespace: 'ns' })
    ).rejects.toMatchObject({ details: ['macAddresses'] });
    expect(rec.requests).toHaveLength(0);
  });

  it('[] → empty result, no request', async () => {
    const rec = recordRequests();
    await expect(client().assets.batchDelete([])).resolves.toStrictEqual({
      deleted: [],
      not_found: [],
    });
    expect(rec.requests).toHaveLength(0);
  });

  it("legacy batchDelete('ns2', macs)", async () => {
    const rec = recordRequests();
    await expect(client().assets.batchDelete('ns2', [MAC])).resolves.toStrictEqual({
      deleted: [MAC],
      not_found: [],
    });
    expect(only(rec).url.pathname).toBe(`/api/assets/ns2/${MAC}`);
  });
});

describe('assets.getHistory', () => {
  const NOW = 1_750_000_000_000;
  const DAY = 86_400_000;

  afterEach(() => {
    vi.useRealTimers();
  });

  function freeze(): void {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  }

  it('default range: start_time=now-24h, end_time=now; only entries inside, server order kept', async () => {
    freeze();
    const rec = recordRequests();
    const entries = await client().assets.getHistory('AA:BB:CC:DD:EE:FF');
    const req = only(rec);
    expect(req.method).toBe('GET');
    expect(req.url.pathname).toBe(`/api/asset_history/ns/${MAC}`);
    expect(req.url.search).toBe(`?start_time=${NOW - DAY}&end_time=${NOW}`);
    expect(req.headers.get('content-type')).toBeNull();
    expectAuth(req);
    expect(entries.map((e) => e.id)).toStrictEqual(['hist-0004', 'hist-0003']);
    // the delete entry carries no data
    expect(entries[0]?.data).toBeUndefined();
    expect(entries[1]).toStrictEqual(historyBody[1]);
  });

  it('only endTime → start_time = endTime - 24h', async () => {
    freeze();
    const rec = recordRequests();
    const end = NOW - 1000;
    await client().assets.getHistory(MAC, { endTime: end });
    expect(only(rec).url.search).toBe(`?start_time=${end - DAY}&end_time=${end}`);
  });

  it('only startTime → end_time = now', async () => {
    freeze();
    const rec = recordRequests();
    await client().assets.getHistory(MAC, { startTime: 0 });
    expect(only(rec).url.search).toBe(`?start_time=0&end_time=${NOW}`);
  });

  it('Date, number and ISO inputs are sent as epoch ms; the window is inclusive in seconds', async () => {
    const rec = recordRequests();
    const entries = await client().assets.getHistory(MAC, {
      startTime: new Date(1_749_900_000_000),
      endTime: '2025-06-15T04:00:00.999Z',
    });
    expect(only(rec).url.search).toBe('?start_time=1749900000000&end_time=1749960000999');
    expect(entries.map((e) => e.id)).toStrictEqual(['hist-0003', 'hist-0002']);
  });

  it('an entry on the second of endTime or of startTime is kept (both bounds inclusive)', async () => {
    const entries = await client().assets.getHistory(MAC, {
      startTime: 1_749_900_000_000,
      endTime: 1_749_950_000_999,
    });
    expect(entries.map((e) => e.id)).toStrictEqual(['hist-0003', 'hist-0002']);
  });

  it("startTime 0 keeps the timestamp '0' entry", async () => {
    const entries = await client().assets.getHistory(MAC, { startTime: 0, endTime: NOW });
    expect(entries.map((e) => e.id)).toStrictEqual([
      'hist-0004',
      'hist-0003',
      'hist-0002',
      'hist-0001',
    ]);
  });

  it('startTime after endTime → ValidationError before any request', async () => {
    const rec = recordRequests();
    await expect(
      client().assets.getHistory(MAC, { startTime: 2000, endTime: 1000 })
    ).rejects.toMatchObject({ name: 'ValidationError', status: 0 });
    await expect(client().assets.getHistory('zz')).rejects.toBeInstanceOf(ValidationError);
    expect(rec.requests).toHaveLength(0);
  });

  it('[] → []', async () => {
    server.use(http.get(HISTORY_URL, () => HttpResponse.json([])));
    await expect(client().assets.getHistory(MAC)).resolves.toStrictEqual([]);
  });

  it('500 → ServerError; { namespace } override', async () => {
    const rec = recordRequests();
    await client().assets.getHistory(MAC, { namespace: 'ns2' });
    expect(only(rec).url.pathname).toBe(`/api/asset_history/ns2/${MAC}`);
    server.use(http.get(HISTORY_URL, () => HttpResponse.json({ error: 'x' }, { status: 500 })));
    await expect(client().assets.getHistory(MAC)).rejects.toBeInstanceOf(ServerError);
  });
});

describe('every asset method: no namespace → ContextError, pre-aborted signal → AbortError', () => {
  const calls: [string, (c: RtlsClient, o: { signal?: AbortSignal }) => Promise<unknown>][] = [
    ['list', (c, o) => c.assets.list(o)],
    ['iterate', (c, o) => c.assets.iterate(o).next()],
    ['getAll', (c, o) => c.assets.getAll(o)],
    ['get', (c, o) => c.assets.get(MAC, o)],
    ['create', (c, o) => c.assets.create(MAC, { user_name: 'x' }, o)],
    ['update', (c, o) => c.assets.update(MAC, { color: 'x' }, o)],
    ['delete', (c, o) => c.assets.delete(MAC, o)],
    ['batchSave', (c, o) => c.assets.batchSave([{ user_udid: MAC, user_name: 'x' }], o)],
    ['batchDelete', (c, o) => c.assets.batchDelete([MAC], o)],
    ['getHistory', (c, o) => c.assets.getHistory(MAC, o)],
  ];

  it.each(calls)('%s without a namespace → ContextError, no request', async (_name, call) => {
    const rec = recordRequests();
    await expect(call(clientWithoutNamespace(), {})).rejects.toBeInstanceOf(ContextError);
    expect(rec.requests).toHaveLength(0);
  });

  it.each(calls)('%s with a pre-aborted signal → AbortError', async (_name, call) => {
    const controller = new AbortController();
    controller.abort();
    await expect(call(client(), { signal: controller.signal })).rejects.toBeInstanceOf(AbortError);
  });
});
