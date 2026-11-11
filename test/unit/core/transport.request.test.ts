import { describe, it, expect } from 'vitest';
import { getEventListeners } from 'node:events';
import { http, HttpResponse } from 'msw';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';
import {
  AbortError,
  createRtlsClient,
  NotFoundError,
  RateLimitError,
  ResponseParseError,
  ValidationError,
  type RtlsClientOptions,
} from '../../../src';
import type { Transport } from '../../../src/client/transport';

const BASE = 'https://transport.test/api';
const KEY = 'test-api-key';

function transport(options: RtlsClientOptions = {}): Transport {
  return createRtlsClient({ baseUrl: BASE, apiKey: KEY, ...options }).transport;
}

/** The single request a call sent. */
function only(rec: { requests: readonly RecordedRequest[] }): RecordedRequest {
  expect(rec.requests).toHaveLength(1);
  return rec.requests[0] as RecordedRequest;
}

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

/** `/health` answers with `response()` for every method. */
function answerHealth(response: () => Response): void {
  server.use(http.all(`${BASE}/health`, () => response()));
}

function answerAny(): void {
  server.use(http.all(`${BASE}/*`, () => HttpResponse.json({ ok: true })));
}

describe('Transport.request (P1 §6.3, src/client/transport.ts)', () => {
  describe('URL: path parameters (step 1)', () => {
    it('path params are encoded with encodeURIComponent (a b → a%20b, / → %2F)', async () => {
      answerAny();
      const rec = recordRequests();
      await transport().request<unknown>('GET', '/dashboards/{id}', { params: { id: 'a b/c' } });
      expect(only(rec).url.href).toBe(`${BASE}/dashboards/a%20b%2Fc`);
    });

    it('a number param is stringified', async () => {
      answerAny();
      const rec = recordRequests();
      await transport().request('GET', '/venues/{namespace}/{venueId}', {
        params: { namespace: 'ns', venueId: 42 },
      });
      expect(only(rec).url.pathname).toBe('/api/venues/ns/42');
    });

    it('mac_address AA:BB:CC:DD:EE:FF → /…/aabbccddeeff (D9)', async () => {
      answerAny();
      const rec = recordRequests();
      await transport().request('GET', '/assets/{app_namespace}/{mac_address}', {
        params: { app_namespace: 'ns', mac_address: 'AA:BB:CC:DD:EE:FF' },
      });
      expect(only(rec).url.pathname).toBe('/api/assets/ns/aabbccddeeff');
    });

    it('an invalid MAC → ValidationError with status 0 and no request', async () => {
      answerAny();
      const rec = recordRequests();
      const call = transport().request('GET', '/assets/{app_namespace}/{mac_address}', {
        params: { app_namespace: 'ns', mac_address: 'AA:BB:CC:DD:EE' },
      });
      await expect(call).rejects.toBeInstanceOf(ValidationError);
      await expect(call).rejects.toMatchObject({ status: 0, code: 'VALIDATION_ERROR' });
      expect(rec.requests).toHaveLength(0);
    });

    it.each<[string, Record<string, unknown>]>([
      ['missing', { app_namespace: 'ns' }],
      ['undefined', { app_namespace: 'ns', mac_address: undefined }],
      ['null', { app_namespace: 'ns', mac_address: null }],
      ["''", { app_namespace: 'ns', mac_address: '' }],
    ])('a %s path param → ValidationError naming it, no request', async (_name, params) => {
      answerAny();
      const rec = recordRequests();
      const call = transport().request<unknown>('GET', '/assets/{app_namespace}/{mac_address}', {
        params: params as Record<string, string>,
      });
      await expect(call).rejects.toBeInstanceOf(ValidationError);
      await expect(call).rejects.toMatchObject({
        status: 0,
        message: 'Missing path parameter "mac_address" for /assets/{app_namespace}/{mac_address}',
        details: ['mac_address'],
      });
      expect(rec.requests).toHaveLength(0);
    });

    it.each([NaN, Infinity])(
      'a non-finite number param (%s) → ValidationError, no request',
      async (venueId) => {
        answerAny();
        const rec = recordRequests();
        const call = transport().request('GET', '/venues/{namespace}/{venueId}', {
          params: { namespace: 'ns', venueId },
        });
        await expect(call).rejects.toMatchObject({
          status: 0,
          code: 'VALIDATION_ERROR',
          message: 'Missing path parameter "venueId" for /venues/{namespace}/{venueId}',
        });
        expect(rec.requests).toHaveLength(0);
      }
    );

    it('a param that is neither string nor number → ValidationError, no request', async () => {
      answerAny();
      const rec = recordRequests();
      const call = transport().request<unknown>('GET', '/dashboards/{id}', {
        params: { id: { nested: 1 } as never },
      });
      await expect(call).rejects.toMatchObject({ status: 0, details: ['id'] });
      expect(rec.requests).toHaveLength(0);
    });

    it('an ExtraPaths route builds the real URL (/spatial/assets/{namespace}/nearest-to-point)', async () => {
      answerAny();
      const rec = recordRequests();
      await transport().request('GET', '/spatial/assets/{namespace}/nearest-to-point', {
        params: { namespace: 'ns' },
        query: { lat: 48.85, lon: 2.35, limit: 3 },
      });
      expect(only(rec).url.href).toBe(
        `${BASE}/spatial/assets/ns/nearest-to-point?lat=48.85&lon=2.35&limit=3`
      );
    });
  });

  describe('URL: query (step 2)', () => {
    it('order kept, undefined/null skipped, boolean, number, Date → ms, array joined, empty array skipped, filter key raw', async () => {
      answerAny();
      const rec = recordRequests();
      const at = new Date(1_718_983_010_000);
      await transport().request<unknown>('GET', '/health', {
        query: {
          z: 'last-declared-first',
          u: undefined,
          n: null,
          t: true,
          f: false,
          num: 2.5,
          d: at,
          arr: ['a', 'b', 3],
          empty: [],
          'data.flag:eq': 'yes',
        },
      });
      const req = only(rec);
      expect(req.url.search).toBe(
        '?z=last-declared-first&t=true&f=false&num=2.5&d=1718983010000&arr=a%2Cb%2C3&data.flag:eq=yes'
      );
      expect([...req.url.searchParams.keys()]).toEqual([
        'z',
        't',
        'f',
        'num',
        'd',
        'arr',
        'data.flag:eq',
      ]);
      expect(req.url.searchParams.get('arr')).toBe('a,b,3');
    });

    it('a key with space, &, #, + and é is encoded and decoded by MSW to the original', async () => {
      answerAny();
      const rec = recordRequests();
      await transport().request<unknown>('GET', '/health', {
        query: { 'a b&#+é': 'v&=x+y é' },
      });
      const req = only(rec);
      expect(req.url.search).toBe('?a%20b%26%23%2B%C3%A9=v%26%3Dx%2By%20%C3%A9');
      expect(req.url.searchParams.get('a b&#+é')).toBe('v&=x+y é');
    });

    it.each<[string, Record<string, unknown>]>([
      ['a plain object', { q: { a: 1 } }],
      ['a non-finite number', { limit: NaN }],
      ['an object inside an array', { ids: ['a', { b: 1 }] }],
    ])('%s → ValidationError with status 0, no request', async (_name, query) => {
      answerAny();
      const rec = recordRequests();
      const call = transport().request<unknown>('GET', '/health', { query: query as never });
      await expect(call).rejects.toBeInstanceOf(ValidationError);
      await expect(call).rejects.toMatchObject({ status: 0 });
      expect(rec.requests).toHaveLength(0);
    });
  });

  describe('headers and body (step 3)', () => {
    it('a GET carries no content-type and the configured credential', async () => {
      answerAny();
      const rec = recordRequests();
      await transport().request('GET', '/health');
      const req = only(rec);
      expect(req.method).toBe('GET');
      expect(req.headers.has('content-type')).toBe(false);
      expect(req.headers.get('x-api-key')).toBe(KEY);
      expect(req.headers.has('authorization')).toBe(false);
    });

    it('a JSON POST has content-type application/json and the serialized body', async () => {
      answerAny();
      const rec = recordRequests();
      const body = { size: 1, query: { range: { timestamp: { gte: 1 } } } };
      await transport().request('POST', '/es/query/{appNamespace}/{dataType}', {
        params: { appNamespace: 'ns', dataType: 'alerts' },
        body,
      });
      const req = only(rec);
      expect(req.method).toBe('POST');
      expect(req.url.pathname).toBe('/api/es/query/ns/alerts');
      expect(req.headers.get('content-type')).toBe('application/json');
      expect(await req.text()).toBe(JSON.stringify(body));
    });

    it('client headers are sent; a client Content-Type is dropped', async () => {
      answerAny();
      const rec = recordRequests();
      await transport({
        headers: { 'X-Trace': 'abc', 'Content-Type': 'application/json' },
      }).request('GET', '/health');
      const req = only(rec);
      expect(req.headers.get('x-trace')).toBe('abc');
      expect(req.headers.has('content-type')).toBe(false);
    });

    it('a per-call header wins over the client header of the same name (any case)', async () => {
      answerAny();
      const rec = recordRequests();
      await transport({ headers: { 'X-Trace': 'client' } }).request('GET', '/health', {
        headers: { 'x-trace': 'per-call' },
      });
      expect(only(rec).headers.get('x-trace')).toBe('per-call');
    });

    it('a per-call Content-Type wins over the JSON default', async () => {
      answerAny();
      const rec = recordRequests();
      await transport().request<unknown>('PATCH', '/assets/{app_namespace}/{mac_address}', {
        params: { app_namespace: 'ns', mac_address: '025d4b000001' },
        body: { a: 1 },
        headers: { 'Content-Type': 'application/merge-patch+json' },
      });
      expect(only(rec).headers.get('content-type')).toBe('application/merge-patch+json');
    });

    it('per-call X-API-Key on a Bearer client → only that x-api-key, no authorization', async () => {
      answerAny();
      const rec = recordRequests();
      await transport({ apiKey: undefined, accessToken: 'tok' }).request('GET', '/health', {
        headers: { 'X-API-Key': 'per-call' },
      });
      const req = only(rec);
      expect(req.headers.get('x-api-key')).toBe('per-call');
      expect(req.headers.has('authorization')).toBe(false);
    });

    it('a Bearer client sends authorization only', async () => {
      answerAny();
      const rec = recordRequests();
      await transport({ apiKey: KEY, accessToken: 'tok' }).request('GET', '/health');
      const req = only(rec);
      expect(req.headers.get('authorization')).toBe('Bearer tok');
      expect(req.headers.has('x-api-key')).toBe(false);
    });

    it('a body on a GET → ValidationError with status 0, no request', async () => {
      answerAny();
      const rec = recordRequests();
      const call = transport().request<unknown>('GET', '/health', { body: { a: 1 } });
      await expect(call).rejects.toMatchObject({ status: 0, code: 'VALIDATION_ERROR' });
      expect(rec.requests).toHaveLength(0);
    });
  });

  describe('body parsing (step 5), one case per rule', () => {
    it('JSON → the parsed value', async () => {
      answerHealth(() => HttpResponse.json({ status: 'OK' }));
      await expect(transport().request('GET', '/health')).resolves.toEqual({ status: 'OK' });
    });

    it('application/problem+json → the parsed value', async () => {
      answerHealth(
        () =>
          new HttpResponse(bytes('{"title":"x"}'), {
            headers: { 'content-type': 'application/problem+json' },
          })
      );
      await expect(transport().request<unknown>('GET', '/health')).resolves.toEqual({
        title: 'x',
      });
    });

    it("text 'Created' without Content-Type (201) → 'Created'", async () => {
      answerHealth(() => new HttpResponse(bytes('Created'), { status: 201 }));
      await expect(transport().request<unknown>('GET', '/health')).resolves.toBe('Created');
    });

    it('text/plain {"a":1} → the object', async () => {
      answerHealth(() => HttpResponse.text('{"a":1}'));
      await expect(transport().request<unknown>('GET', '/health')).resolves.toEqual({ a: 1 });
    });

    it('text/plain {bad → the string', async () => {
      answerHealth(() => HttpResponse.text('{bad'));
      await expect(transport().request<unknown>('GET', '/health')).resolves.toBe('{bad');
    });

    it('an empty 200 with content-length: 0 → undefined', async () => {
      answerHealth(
        () => new HttpResponse(null, { status: 200, headers: { 'content-length': '0' } })
      );
      await expect(transport().request<unknown>('GET', '/health')).resolves.toBeUndefined();
    });

    it('204 → undefined', async () => {
      server.use(
        http.delete(`${BASE}/dashboards/:id`, () => new HttpResponse(null, { status: 204 }))
      );
      const rec = recordRequests();
      await expect(
        transport().request<unknown>('DELETE', '/dashboards/{id}', { params: { id: 'x' } })
      ).resolves.toBeUndefined();
      expect(only(rec).method).toBe('DELETE');
    });

    it('application/pdf → a Blob with the bytes and the type', async () => {
      answerHealth(
        () =>
          new HttpResponse(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
            headers: { 'content-type': 'application/pdf' },
          })
      );
      const data = await transport().request<Blob>('GET', '/health');
      expect(data).toBeInstanceOf(Blob);
      expect(data.type).toBe('application/pdf');
      expect(new Uint8Array(await data.arrayBuffer())).toEqual(
        new Uint8Array([0x25, 0x50, 0x44, 0x46])
      );
    });

    it("parseAs 'json' on a text body → ResponseParseError with status, contentType and body", async () => {
      answerHealth(() => HttpResponse.text('not json'));
      const call = transport().request<unknown>('GET', '/health', { parseAs: 'json' });
      await expect(call).rejects.toBeInstanceOf(ResponseParseError);
      await expect(call).rejects.toMatchObject({
        status: 200,
        code: 'RESPONSE_PARSE_ERROR',
        contentType: expect.stringMatching(/^text\/plain/),
        body: 'not json',
      });
    });

    it('a JSON content type with a malformed body → ResponseParseError (auto)', async () => {
      answerHealth(
        () => new HttpResponse(bytes('{"a":'), { headers: { 'content-type': 'application/json' } })
      );
      await expect(transport().request<unknown>('GET', '/health')).rejects.toBeInstanceOf(
        ResponseParseError
      );
    });

    it("parseAs 'text' on JSON → the raw string", async () => {
      answerHealth(() => HttpResponse.json({ a: 1 }));
      await expect(
        transport().request<string>('GET', '/health', { parseAs: 'text' })
      ).resolves.toBe('{"a":1}');
    });

    it("parseAs 'text' on an empty chunked 200 (no content-length) → undefined", async () => {
      answerHealth(
        () =>
          new HttpResponse(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.close();
              },
            }),
            { status: 200 }
          )
      );
      const rec = recordRequests();
      await expect(
        transport().request<string>('GET', '/health', { parseAs: 'text' })
      ).resolves.toBeUndefined();
      expect(rec.requests).toHaveLength(1);
    });

    it('text/csv 200 → the string', async () => {
      answerHealth(
        () => new HttpResponse(bytes('a,b\n1,2\n'), { headers: { 'content-type': 'text/csv' } })
      );
      await expect(transport().request<unknown>('GET', '/health')).resolves.toBe('a,b\n1,2\n');
    });

    it("parseAs 'blob' on JSON → a Blob", async () => {
      answerHealth(() => HttpResponse.json({ a: 1 }));
      const data = await transport().request<Blob>('GET', '/health', { parseAs: 'blob' });
      expect(data).toBeInstanceOf(Blob);
      expect(await data.text()).toBe('{"a":1}');
    });

    it("parseAs 'stream' → a ReadableStream with the body unread", async () => {
      answerHealth(() => HttpResponse.text('chunked body'));
      const data = await transport().request<ReadableStream<Uint8Array>>('GET', '/health', {
        parseAs: 'stream',
      });
      expect(data).toBeInstanceOf(ReadableStream);
      expect(await new Response(data).text()).toBe('chunked body');
    });

    it("parseAs 'stream' on a 204 → null", async () => {
      answerHealth(() => new HttpResponse(null, { status: 204 }));
      await expect(
        transport().request<ReadableStream<Uint8Array> | null>('GET', '/health', {
          parseAs: 'stream',
        })
      ).resolves.toBeNull();
    });

    it("a user abort after request(…, { parseAs: 'stream' }) resolved still errors the body read", async () => {
      answerHealth(
        () =>
          new HttpResponse(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(bytes('first'));
                // never closes: only the caller's abort ends the read
              },
            }),
            { headers: { 'content-type': 'application/octet-stream' } }
          )
      );
      const controller = new AbortController();
      const reason = new Error('sdk-test-stop');
      const data = await transport().request<ReadableStream<Uint8Array>>('GET', '/health', {
        parseAs: 'stream',
        signal: controller.signal,
        timeoutMs: 20,
      });
      const reader = data.getReader();
      const first = await reader.read();
      expect(new TextDecoder().decode(first.value)).toBe('first');
      // The 20 ms timer covered the headers only: waiting past it does not end the body.
      await new Promise((r) => setTimeout(r, 40));
      controller.abort(reason);
      const next = reader.read();
      await expect(next).rejects.toBeInstanceOf(AbortError);
      await expect(next).rejects.toSatisfy((e: AbortError) => e.cause === reason);
    });

    it("cancelling a parseAs 'stream' body aborts the request and releases the caller's signal", async () => {
      let requestAborted = false;
      server.use(
        http.get(`${BASE}/health`, ({ request }) => {
          request.signal.addEventListener('abort', () => {
            requestAborted = true;
          });
          return new HttpResponse(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(bytes('first'));
              },
            }),
            { headers: { 'content-type': 'application/octet-stream' } }
          );
        })
      );
      const controller = new AbortController();
      const data = await transport().request<ReadableStream<Uint8Array>>('GET', '/health', {
        parseAs: 'stream',
        signal: controller.signal,
      });
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(1);
      await expect(data.cancel('done reading')).resolves.toBeUndefined();
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
      await new Promise((r) => setTimeout(r, 10));
      expect(requestAborted).toBe(true);
    });

    it("parseAs 'stream' read to the end releases the caller's signal", async () => {
      answerHealth(() => HttpResponse.text('whole body'));
      const controller = new AbortController();
      const data = await transport().request<ReadableStream<Uint8Array>>('GET', '/health', {
        parseAs: 'stream',
        signal: controller.signal,
      });
      expect(await new Response(data).text()).toBe('whole body');
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    });

    it("parseAs 'json' on a body without Content-Type → ResponseParseError naming no content type", async () => {
      answerHealth(() => new HttpResponse(bytes('Created'), { status: 201 }));
      const call = transport().request<unknown>('GET', '/health', { parseAs: 'json' });
      await expect(call).rejects.toBeInstanceOf(ResponseParseError);
      await expect(call).rejects.toSatisfy(
        (e: ResponseParseError) =>
          e.status === 201 &&
          e.contentType === undefined &&
          e.message === 'Response body is not valid JSON (status 201)' &&
          e.body === 'Created'
      );
    });

    it("parseAs 'stream' with a non-2xx status → the mapped error, not a stream", async () => {
      answerHealth(() => HttpResponse.json({ error: 'Dashboard not found' }, { status: 404 }));
      const call = transport().request<unknown>('GET', '/health', { parseAs: 'stream' });
      await expect(call).rejects.toBeInstanceOf(NotFoundError);
      await expect(call).rejects.toMatchObject({ message: 'Dashboard not found' });
    });
  });

  describe('requestWithResponse (step 8) and errors (step 6)', () => {
    it('returns { data, status, headers } with the same parsing', async () => {
      answerHealth(() =>
        HttpResponse.json([{ id: 1 }], { status: 201, headers: { 'X-Total-Count': '7' } })
      );
      const res = await transport().requestWithResponse<Array<{ id: number }>>('GET', '/health');
      expect(res.status).toBe(201);
      expect(res.data).toEqual([{ id: 1 }]);
      expect(res.headers).toBeInstanceOf(Headers);
      expect(res.headers.get('x-total-count')).toBe('7');
    });

    it('a typed requestWithResponse returns the parsed spec body', async () => {
      answerHealth(() => HttpResponse.json({ status: 'OK' }));
      const res = await transport().requestWithResponse('GET', '/health');
      expect(res).toMatchObject({ status: 200, data: { status: 'OK' } });
    });

    it('a non-2xx status → the mapped class with retryAfter (ms) from the header', async () => {
      answerHealth(() =>
        HttpResponse.json(
          { error: 'rate_limited', message: 'Too many requests' },
          { status: 429, headers: { 'Retry-After': '3' } }
        )
      );
      const call = transport().request('GET', '/health');
      await expect(call).rejects.toBeInstanceOf(RateLimitError);
      await expect(call).rejects.toMatchObject({
        status: 429,
        code: 'RATE_LIMIT',
        apiCode: 'rate_limited',
        message: 'Too many requests',
        retryAfter: 3000,
      });
    });

    it('a 404 with an empty body → NotFoundError with the fallback message and no body (E12)', async () => {
      server.use(
        http.get(`${BASE}/assets/:ns/:mac`, () => new HttpResponse(null, { status: 404 }))
      );
      const call = transport().request('GET', '/assets/{app_namespace}/{mac_address}', {
        params: { app_namespace: 'ns', mac_address: '025d4b0000f0' },
      });
      await expect(call).rejects.toBeInstanceOf(NotFoundError);
      await expect(call).rejects.toMatchObject({ status: 404, body: undefined });
      await expect(call).rejects.toSatisfy((e: NotFoundError) => e.message.startsWith('HTTP 404'));
    });

    it('a text error without Content-Type (E8) keeps the first line as message', async () => {
      answerHealth(() => new HttpResponse(bytes('404 Not Found\r\n'), { status: 404 }));
      await expect(transport().request('GET', '/health')).rejects.toMatchObject({
        status: 404,
        message: '404 Not Found',
      });
    });
  });
});
