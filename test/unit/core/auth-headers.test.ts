import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';
import { createRtlsClient, ValidationError, type RtlsClientOptions } from '../../../src';
import { buildRequestHeaders } from '../../../src/client/http';

const BASE = 'https://rtls.ubudu.com/api';
const KEY = 'test-api-key';
const TOKEN = 'test-access-token';

/** Header pairs in iteration order (lower-case names, sorted, as `Headers` iterates them). */
function entriesOf(headers: Headers): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  headers.forEach((value, name) => out.push([name, value]));
  return out;
}

/** Headers of the single request a call sends. */
async function sent(call: () => Promise<unknown>): Promise<RecordedRequest> {
  const rec = recordRequests();
  await call();
  expect(rec.requests).toHaveLength(1);
  return rec.requests[0] as RecordedRequest;
}

function useHealth(): void {
  server.use(http.get(`${BASE}/health`, () => HttpResponse.json({ status: 'OK' })));
}

const matrix: Array<{
  name: string;
  options: RtlsClientOptions;
  apiKey: string | null;
  authorization: string | null;
}> = [
  { name: 'apiKey only', options: { apiKey: KEY }, apiKey: KEY, authorization: null },
  {
    name: 'accessToken only',
    options: { accessToken: TOKEN },
    apiKey: null,
    authorization: `Bearer ${TOKEN}`,
  },
  {
    name: 'both (auto: Bearer wins)',
    options: { apiKey: KEY, accessToken: TOKEN },
    apiKey: null,
    authorization: `Bearer ${TOKEN}`,
  },
  {
    name: "both + auth: 'apiKey'",
    options: { apiKey: KEY, accessToken: TOKEN, auth: 'apiKey' },
    apiKey: KEY,
    authorization: null,
  },
  {
    name: "both + auth: 'bearer'",
    options: { apiKey: KEY, accessToken: TOKEN, auth: 'bearer' },
    apiKey: null,
    authorization: `Bearer ${TOKEN}`,
  },
  { name: 'no credentials', options: {}, apiKey: null, authorization: null },
  {
    name: 'empty-string apiKey counts as none',
    options: { apiKey: '' },
    apiKey: null,
    authorization: null,
  },
];

describe('auth selection and headers (P1 §6.1 "Headers", D11)', () => {
  describe.each(matrix)('$name', ({ options, apiKey, authorization }) => {
    it('raw.GET sends exactly the selected credential', async () => {
      useHealth();
      const client = createRtlsClient(options);
      const req = await sent(() => client.raw.GET('/health'));
      expect(req.headers.get('x-api-key')).toBe(apiKey);
      expect(req.headers.get('authorization')).toBe(authorization);
    });

    it('client.health() applies the same rule', async () => {
      useHealth();
      const client = createRtlsClient(options);
      const req = await sent(() => client.health());
      expect(req.headers.get('x-api-key')).toBe(apiKey);
      expect(req.headers.get('authorization')).toBe(authorization);
    });

    it('transport.request applies the same rule', async () => {
      useHealth();
      const client = createRtlsClient(options);
      const req = await sent(() => client.transport.request('GET', '/health'));
      expect(req.headers.get('x-api-key')).toBe(apiKey);
      expect(req.headers.get('authorization')).toBe(authorization);
    });

    it('transport.upload applies the same rule (and sends the multipart type)', async () => {
      server.use(
        http.post(`${BASE}/assets/:ns/:mac/documents`, () => HttpResponse.json({}, { status: 201 }))
      );
      const client = createRtlsClient(options);
      const data = new FormData();
      data.append('file', new Blob(['x'], { type: 'text/plain' }), 'x.txt');
      const req = await sent(() =>
        client.transport.upload('/assets/{namespace}/{mac_address}/documents', data, {
          params: { namespace: 'ns', mac_address: '025d4b000001' },
        })
      );
      expect(req.headers.get('x-api-key')).toBe(apiKey);
      expect(req.headers.get('authorization')).toBe(authorization);
      expect(req.headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=/);
    });

    it('transport.stream applies the same rule (and asks for text/event-stream)', async () => {
      server.use(
        http.get(
          `${BASE}/notifications/:ns/stream`,
          () =>
            new HttpResponse(new TextEncoder().encode('data: x\n\n'), {
              headers: { 'content-type': 'text/event-stream' },
            })
        )
      );
      const client = createRtlsClient(options);
      const req = await sent(async () => {
        const events = [];
        for await (const event of client.transport.stream('/notifications/{namespace}/stream', {
          params: { namespace: 'ns' },
        }))
          events.push(event);
        expect(events).toEqual([{ event: 'message', data: 'x' }]);
      });
      expect(req.headers.get('x-api-key')).toBe(apiKey);
      expect(req.headers.get('authorization')).toBe(authorization);
      expect(req.headers.get('accept')).toBe('text/event-stream');
    });

    it('transport.download applies the same rule', async () => {
      server.use(
        http.get(
          `${BASE}/assets/:ns/:mac/documents/:doc/download`,
          () => new HttpResponse(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } })
        )
      );
      const client = createRtlsClient(options);
      const req = await sent(() =>
        client.transport.download(
          '/assets/{namespace}/{mac_address}/documents/{documentId}/download',
          { params: { namespace: 'ns', mac_address: '025d4b000001', documentId: 'd' } }
        )
      );
      expect(req.headers.get('x-api-key')).toBe(apiKey);
      expect(req.headers.get('authorization')).toBe(authorization);
    });
  });

  describe('constructor validation (ValidationError, status 0)', () => {
    it.each<[string, RtlsClientOptions, string]>([
      ["auth: 'bearer' without a token", { apiKey: KEY, auth: 'bearer' }, 'auth'],
      ["auth: 'apiKey' without a key", { accessToken: TOKEN, auth: 'apiKey' }, 'auth'],
      ["auth: 'apiKey' with an empty key", { apiKey: '', auth: 'apiKey' }, 'auth'],
      ['an unknown auth mode', { auth: 'basic' as never }, 'auth'],
      ['a non-string apiKey', { apiKey: 42 as never }, 'apiKey'],
      ['a non-string accessToken', { accessToken: {} as never }, 'accessToken'],
      ['a fetch that is not a function', { fetch: 'fetch' as never }, 'fetch'],
    ])('%s', (_name, options, option) => {
      expect(() => createRtlsClient(options)).toThrow(ValidationError);
      expect(() => createRtlsClient(options)).toThrow(
        expect.objectContaining({ status: 0, code: 'VALIDATION_ERROR', details: [option] })
      );
    });
  });

  describe('Content-Type is never forced (B6)', () => {
    it('a GET carries no content-type; a client-level Content-Type is dropped, other client headers sent', async () => {
      useHealth();
      const client = createRtlsClient({
        apiKey: KEY,
        headers: { 'Content-Type': 'application/json', 'X-Trace': 'abc' },
      });
      const viaRaw = await sent(() => client.raw.GET('/health'));
      expect(viaRaw.headers.has('content-type')).toBe(false);
      expect(viaRaw.headers.get('x-trace')).toBe('abc');
      const viaHealth = await sent(() => client.health());
      expect(viaHealth.headers.has('content-type')).toBe(false);
      expect(viaHealth.headers.get('x-trace')).toBe('abc');
    });

    it('a JSON body through raw gets application/json', async () => {
      server.use(
        http.post(`${BASE}/es/query/:ns/:type`, () => HttpResponse.json({ hits: { hits: [] } }))
      );
      const client = createRtlsClient({ apiKey: KEY });
      const req = await sent(() =>
        client.raw.POST('/es/query/{appNamespace}/{dataType}', {
          params: { path: { appNamespace: 'ns', dataType: 'alerts' } },
          body: { size: 1 },
        })
      );
      expect(req.headers.get('content-type')).toBe('application/json');
      expect(await req.text()).toBe('{"size":1}');
    });
  });

  describe('explicit credential headers win over the configured credential (never two)', () => {
    it('per-call X-API-Key on a Bearer client → only that x-api-key (raw)', async () => {
      useHealth();
      const client = createRtlsClient({ accessToken: TOKEN });
      const viaRaw = await sent(() =>
        client.raw.GET('/health', { headers: { 'X-API-Key': 'per-call' } })
      );
      expect(viaRaw.headers.get('x-api-key')).toBe('per-call');
      expect(viaRaw.headers.has('authorization')).toBe(false);
    });

    it('a client-level Authorization header wins over the configured apiKey', async () => {
      useHealth();
      const client = createRtlsClient({
        apiKey: KEY,
        headers: { Authorization: 'Bearer from-headers' },
      });
      const req = await sent(() => client.raw.GET('/health'));
      expect(req.headers.get('authorization')).toBe('Bearer from-headers');
      expect(req.headers.has('x-api-key')).toBe(false);
    });

    it('a per-call credential replaces a client-level one of the other kind', async () => {
      useHealth();
      const client = createRtlsClient({ headers: { 'x-api-key': 'client-level' } });
      const req = await sent(() =>
        client.raw.GET('/health', { headers: { Authorization: 'Bearer per-call' } })
      );
      expect(req.headers.get('authorization')).toBe('Bearer per-call');
      expect(req.headers.has('x-api-key')).toBe(false);
    });
  });

  describe('buildRequestHeaders (the rule the transport applies)', () => {
    it('client headers minus Content-Type, credential, Accept, per-call headers, JSON content type', () => {
      const h = buildRequestHeaders({
        client: { 'content-type': 'text/plain', 'X-Trace': 'c' },
        credential: ['X-API-Key', KEY],
        accept: 'text/event-stream',
        perCall: { 'X-Trace': 'p' },
        jsonBody: true,
      });
      expect(entriesOf(h)).toEqual([
        ['accept', 'text/event-stream'],
        ['content-type', 'application/json'],
        ['x-api-key', KEY],
        ['x-trace', 'p'],
      ]);
    });

    it('a per-call Content-Type wins over the JSON default; multipart removes every Content-Type', () => {
      expect(
        buildRequestHeaders({
          perCall: { 'Content-Type': 'application/merge-patch+json' },
          jsonBody: true,
        }).get('content-type')
      ).toBe('application/merge-patch+json');
      expect(
        buildRequestHeaders({
          client: { 'Content-Type': 'application/json' },
          perCall: { 'content-type': 'application/json' },
          multipart: true,
        }).has('content-type')
      ).toBe(false);
    });

    it('a per-call credential suppresses the configured and the client-level one', () => {
      const h = buildRequestHeaders({
        client: { Authorization: 'Bearer client' },
        credential: ['Authorization', `Bearer ${TOKEN}`],
        perCall: { 'X-API-Key': 'per-call' },
      });
      expect(h.get('x-api-key')).toBe('per-call');
      expect(h.has('authorization')).toBe(false);
    });

    it('a client-level credential suppresses the configured one; no credential when none is set', () => {
      expect(
        buildRequestHeaders({
          client: { 'X-API-Key': 'client' },
          credential: ['Authorization', 'Bearer t'],
        }).get('x-api-key')
      ).toBe('client');
      const none = buildRequestHeaders({});
      expect(none.has('x-api-key')).toBe(false);
      expect(none.has('authorization')).toBe(false);
    });
  });
});
