// declaredLocations.bulkDeclare / bulkClear (P2 §6.4, §8.1): the real request builder against MSW. Every answer
// comes from server.use(); request assertions read recordRequests().
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import {
  AbortError,
  AuthenticationError,
  ContextError,
  createRtlsClient,
  PayloadTooLargeError,
  ServerError,
  ValidationError,
  type RtlsClient,
} from '../../../src';
import type { BulkClearRequest, BulkDeclareRequest } from '../../../src/types/assets';
import { fixtureResponse, loadFixture } from '../../contract/fixtures';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';

const API = 'https://rtls.test/api';
const DECLARE = `${API}/assets/:ns/bulk-declare`;
const CLEAR = `${API}/assets/:ns/bulk-clear-declared`;
const HERE = { lat: 48.8566, lng: 2.3522, level: 0 };

const client = (): RtlsClient =>
  createRtlsClient({ baseUrl: API, apiKey: 'test-api-key', namespace: 'test-ns' });

const fixture = (name: string): Response => fixtureResponse(loadFixture('assets', name));

function only(rec: { requests: readonly RecordedRequest[] }): RecordedRequest {
  expect(rec.requests).toHaveLength(1);
  return rec.requests[0] as RecordedRequest;
}

const range = (n: number, prefix = '025d4b'): string[] =>
  Array.from({ length: n }, (_, i) => `${prefix}${i.toString(16).padStart(6, '0')}`);

describe('declaredLocations.bulkDeclare', () => {
  it('POST /assets/<ns>/bulk-declare: body verbatim (wire names) except mac_address normalised', async () => {
    server.use(http.post(DECLARE, () => fixture('bulk-declare-200')));
    const rec = recordRequests();
    const request: BulkDeclareRequest = {
      assets: [
        { mac_address: 'AA:BB:CC:DD:EE:FF' },
        {
          external_id: 'PALLET-42',
          declared_location: { lat: 1.5, lng: -2, level: -1, source: 'api', poi_name: 'Dock' },
        },
        { mac_address: '11-22-33-44-55-66', external_id: 'ignored id with spaces' },
      ],
      shared_location: { ...HERE, source: 'manual', declared_via: 'rtls-api' },
      auto_create_virtual_assets: true,
      default_asset_model: 'SDK_TEST',
    };
    await expect(client().declaredLocations.bulkDeclare(request)).resolves.toStrictEqual({
      success: 2,
      failed: 0,
      created: 0,
      errors: [],
    });
    const sent = only(rec);
    expect(sent.method).toBe('POST');
    expect(sent.url.href).toBe(`${API}/assets/test-ns/bulk-declare`);
    expect(sent.headers.get('content-type')).toBe('application/json');
    expect(sent.headers.get('x-api-key')).toBe('test-api-key');
    expect(JSON.parse(await sent.text())).toStrictEqual({
      assets: [
        { mac_address: 'aabbccddeeff' },
        request.assets[1],
        { mac_address: '112233445566', external_id: 'ignored id with spaces' },
      ],
      shared_location: { ...HERE, source: 'manual', declared_via: 'rtls-api' },
      auto_create_virtual_assets: true,
      default_asset_model: 'SDK_TEST',
    });
  });

  it('the caller request is not mutated', async () => {
    server.use(http.post(DECLARE, () => fixture('bulk-declare-200')));
    const request: BulkDeclareRequest = {
      assets: [{ mac_address: 'AA:BB:CC:DD:EE:FF', declared_location: HERE }],
    };
    await client().declaredLocations.bulkDeclare(request);
    expect(request.assets[0]?.mac_address).toBe('AA:BB:CC:DD:EE:FF');
  });

  it('500 items are accepted', async () => {
    server.use(http.post(DECLARE, () => fixture('bulk-declare-200')));
    const rec = recordRequests();
    await client().declaredLocations.bulkDeclare({
      assets: range(500).map((mac_address) => ({ mac_address })),
      shared_location: HERE,
    });
    expect(rec.requests).toHaveLength(1);
  });

  const item = { mac_address: 'aabbccddeeff' };
  it.each<[string, unknown]>([
    ['no request object', null],
    ['empty assets', { assets: [], shared_location: HERE }],
    ['assets not an array', { assets: item, shared_location: HERE }],
    [
      '501 items',
      { assets: range(501).map((mac_address) => ({ mac_address })), shared_location: HERE },
    ],
    ['a null item', { assets: [item, null], shared_location: HERE }],
    ['a number mac_address', { assets: [{ mac_address: 42 }], shared_location: HERE }],
    ['neither identifier', { assets: [{ declared_location: HERE }] }],
    ['an invalid MAC', { assets: [{ mac_address: 'zz:zz' }], shared_location: HERE }],
    ["external_id 'bad id!'", { assets: [{ external_id: 'bad id!' }], shared_location: HERE }],
    [
      'external_id of 129 chars',
      { assets: [{ external_id: 'a'.repeat(129) }], shared_location: HERE },
    ],
    ['a number external_id', { assets: [{ external_id: 7 }], shared_location: HERE }],
    [
      'duplicate MACs after normalisation',
      { assets: [{ mac_address: 'AA:BB:CC:DD:EE:FF' }, item], shared_location: HERE },
    ],
    [
      'duplicate external ids differing in case',
      { assets: [{ external_id: 'Pallet-1' }, { external_id: 'PALLET-1' }], shared_location: HERE },
    ],
    ['no location', { assets: [item] }],
    ['lat 91', { assets: [{ ...item, declared_location: { lat: 91, lng: 0 } }] }],
    ['lng -181', { assets: [{ ...item, declared_location: { lat: 0, lng: -181 } }] }],
    ['level 201', { assets: [{ ...item, declared_location: { lat: 0, lng: 0, level: 201 } }] }],
    ['level 1.5', { assets: [{ ...item, declared_location: { lat: 0, lng: 0, level: 1.5 } }] }],
    ['lat NaN', { assets: [{ ...item, declared_location: { lat: Number.NaN, lng: 0 } }] }],
    ['a string lat', { assets: [{ ...item, declared_location: { lat: '1', lng: 0 } }] }],
    ['an invalid shared_location', { assets: [item], shared_location: { lat: 0, lng: 200 } }],
    [
      "auto_create_virtual_assets: 'yes'",
      { assets: [item], shared_location: HERE, auto_create_virtual_assets: 'yes' },
    ],
    ['default_asset_model: 5', { assets: [item], shared_location: HERE, default_asset_model: 5 }],
  ])('%s → ValidationError status 0, nothing sent', async (_label, request) => {
    const rec = recordRequests();
    const call = client().declaredLocations.bulkDeclare(request as BulkDeclareRequest);
    await expect(call).rejects.toBeInstanceOf(ValidationError);
    await expect(call).rejects.toMatchObject({ status: 0 });
    expect(rec.requests).toHaveLength(0);
  });

  it('200 partial → errors typed with the DL code', async () => {
    server.use(http.post(DECLARE, () => fixture('bulk-declare-200-partial')));
    const result = await client().declaredLocations.bulkDeclare({
      assets: [{ mac_address: '025d4b000001' }, { external_id: 'sdk-test-unknown' }],
      shared_location: HERE,
    });
    expect(result).toMatchObject({ success: 1, failed: 1, created: 0 });
    expect(result.errors).toStrictEqual([
      {
        identifier: 'sdk-test-unknown',
        error: 'DL_011',
        message: 'External ID not found: sdk-test-unknown',
      },
    ]);
  });

  it("400 { error: 'DL_013', message } → ValidationError apiCode DL_013 with the server message", async () => {
    server.use(http.post(DECLARE, () => fixture('bulk-declare-400-dl013')));
    const call = client().declaredLocations.bulkDeclare({
      assets: [{ mac_address: '025d4b000001' }],
      shared_location: HERE,
    });
    await expect(call).rejects.toBeInstanceOf(ValidationError);
    await expect(call).rejects.toMatchObject({
      status: 400,
      apiCode: 'DL_013',
      message: 'Duplicate identifier in request: 025d4b000001',
    });
  });

  it("500 { error: 'DL_004' } → ServerError apiCode DL_004", async () => {
    server.use(
      http.post(DECLARE, () =>
        HttpResponse.json({ error: 'DL_004', message: 'Publish/update failed' }, { status: 500 })
      )
    );
    const call = client().declaredLocations.bulkDeclare({
      assets: [{ mac_address: '025d4b000001' }],
      shared_location: HERE,
    });
    await expect(call).rejects.toBeInstanceOf(ServerError);
    await expect(call).rejects.toMatchObject({ status: 500, apiCode: 'DL_004' });
  });

  it('413 → PayloadTooLargeError', async () => {
    server.use(
      http.post(
        DECLARE,
        () =>
          new HttpResponse('<pre>PayloadTooLargeError: request entity too large</pre>', {
            status: 413,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          })
      )
    );
    await expect(
      client().declaredLocations.bulkDeclare({ assets: [item], shared_location: HERE })
    ).rejects.toBeInstanceOf(PayloadTooLargeError);
  });

  it('401 → AuthenticationError', async () => {
    server.use(
      http.post(DECLARE, () => HttpResponse.json({ error: 'Invalid API key' }, { status: 401 }))
    );
    await expect(
      client().declaredLocations.bulkDeclare({ assets: [item], shared_location: HERE })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('{ namespace } override; no namespace → ContextError; pre-aborted signal → AbortError', async () => {
    server.use(http.post(DECLARE, () => fixture('bulk-declare-200')));
    const rec = recordRequests();
    await client().declaredLocations.bulkDeclare(
      { assets: [item], shared_location: HERE },
      { namespace: 'other-ns' }
    );
    expect(only(rec).url.pathname).toBe('/api/assets/other-ns/bulk-declare');
    await expect(
      createRtlsClient({ baseUrl: API, apiKey: 'k' }).declaredLocations.bulkDeclare({
        assets: [item],
        shared_location: HERE,
      })
    ).rejects.toBeInstanceOf(ContextError);
    await expect(
      client().declaredLocations.bulkDeclare(
        { assets: [item], shared_location: HERE },
        { signal: AbortSignal.abort() }
      )
    ).rejects.toBeInstanceOf(AbortError);
    expect(rec.requests).toHaveLength(1);
  });
});

describe('declaredLocations.bulkClear', () => {
  it('{ mac_addresses } → normalised in the body; external_ids not sent as a key', async () => {
    server.use(http.post(CLEAR, () => fixture('bulk-clear-200')));
    const rec = recordRequests();
    const result = await client().declaredLocations.bulkClear({
      mac_addresses: ['02:5D:4B:00:00:01', '025d4b000002'],
    });
    expect(result.success).toBe(1);
    expect(result.results[1]).toStrictEqual({
      mac_address: '025d4b000002',
      status: 'error',
      error: 'DL_017',
      message: 'Failed to clear declared location for 025d4b000002',
    });
    const sent = only(rec);
    expect(sent.method).toBe('POST');
    expect(sent.url.href).toBe(`${API}/assets/test-ns/bulk-clear-declared`);
    expect(sent.headers.get('content-type')).toBe('application/json');
    await expect(sent.text()).resolves.toBe(
      JSON.stringify({ mac_addresses: ['025d4b000001', '025d4b000002'] })
    );
  });

  it('{ external_ids } alone and both lists', async () => {
    server.use(http.post(CLEAR, () => fixture('bulk-clear-200')));
    const rec = recordRequests();
    await client().declaredLocations.bulkClear({ external_ids: ['PALLET-42'] });
    await client().declaredLocations.bulkClear({
      mac_addresses: ['AABBCCDDEEFF'],
      external_ids: ['PALLET-42'],
    });
    expect(rec.requests).toHaveLength(2);
    await expect(rec.requests[0]?.text()).resolves.toBe(
      JSON.stringify({ external_ids: ['PALLET-42'] })
    );
    await expect(rec.requests[1]?.text()).resolves.toBe(
      JSON.stringify({ mac_addresses: ['aabbccddeeff'], external_ids: ['PALLET-42'] })
    );
  });

  it.each<[string, unknown]>([
    ['no request object', undefined],
    ['neither list', {}],
    ['both lists empty', { mac_addresses: [], external_ids: [] }],
    ['501 identifiers in total', { mac_addresses: range(300), external_ids: range(201, 'id') }],
    ['an invalid MAC', { mac_addresses: ['aabbccddeeff', 'nope'] }],
    ['an empty external id', { external_ids: [''] }],
    ['a number external id', { external_ids: [3] }],
    ['mac_addresses not an array', { mac_addresses: 'aabbccddeeff' }],
    ['external_ids not an array', { external_ids: 'PALLET-42' }],
  ])('%s → ValidationError status 0, nothing sent', async (_label, request) => {
    const rec = recordRequests();
    const call = client().declaredLocations.bulkClear(request as BulkClearRequest);
    await expect(call).rejects.toBeInstanceOf(ValidationError);
    await expect(call).rejects.toMatchObject({ status: 0 });
    expect(rec.requests).toHaveLength(0);
  });

  it("400 { error: 'DL_012', message } → ValidationError apiCode DL_012", async () => {
    server.use(
      http.post(CLEAR, () =>
        HttpResponse.json(
          { error: 'DL_012', message: 'mac_addresses or external_ids is required' },
          { status: 400 }
        )
      )
    );
    const call = client().declaredLocations.bulkClear({ external_ids: ['x'] });
    await expect(call).rejects.toBeInstanceOf(ValidationError);
    await expect(call).rejects.toMatchObject({
      status: 400,
      apiCode: 'DL_012',
      message: 'mac_addresses or external_ids is required',
    });
  });

  it("400 { error: 'DL_010' } → ValidationError apiCode DL_010", async () => {
    server.use(
      http.post(CLEAR, () =>
        HttpResponse.json(
          { error: 'DL_010', message: 'Maximum 500 assets per request' },
          { status: 400 }
        )
      )
    );
    await expect(
      client().declaredLocations.bulkClear({ external_ids: ['x'] })
    ).rejects.toMatchObject({ status: 400, apiCode: 'DL_010' });
  });

  it("500 { error: 'DL_017', message } → ServerError apiCode DL_017", async () => {
    server.use(
      http.post(CLEAR, () =>
        HttpResponse.json({ error: 'DL_017', message: 'Clear operation failed' }, { status: 500 })
      )
    );
    const call = client().declaredLocations.bulkClear({ mac_addresses: ['025d4b000001'] });
    await expect(call).rejects.toBeInstanceOf(ServerError);
    await expect(call).rejects.toMatchObject({
      status: 500,
      apiCode: 'DL_017',
      message: 'Clear operation failed',
    });
  });

  it('{ namespace } override; no namespace → ContextError; pre-aborted signal → AbortError', async () => {
    server.use(http.post(CLEAR, () => fixture('bulk-clear-200')));
    const rec = recordRequests();
    await client().declaredLocations.bulkClear(
      { mac_addresses: ['025d4b000001'] },
      { namespace: 'other-ns' }
    );
    expect(only(rec).url.pathname).toBe('/api/assets/other-ns/bulk-clear-declared');
    await expect(
      createRtlsClient({ baseUrl: API, apiKey: 'k' }).declaredLocations.bulkClear({
        mac_addresses: ['025d4b000001'],
      })
    ).rejects.toBeInstanceOf(ContextError);
    await expect(
      client().declaredLocations.bulkClear(
        { mac_addresses: ['025d4b000001'] },
        { signal: AbortSignal.abort() }
      )
    ).rejects.toBeInstanceOf(AbortError);
    expect(rec.requests).toHaveLength(1);
  });
});
