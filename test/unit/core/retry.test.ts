import { afterEach, describe, it, expect, vi } from 'vitest';
import { delay, http, HttpResponse } from 'msw';
import { recordRequests, server } from '../../mocks/server';
import {
  AbortError,
  createRtlsClient,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ResponseParseError,
  ServiceUnavailableError,
  TimeoutError,
  ValidationError,
  type RtlsClientOptions,
} from '../../../src';
import {
  isRetryableError,
  resolveRetryPolicy,
  retryDelay,
  type ResolvedRetryPolicy,
} from '../../../src/client/retry';
import { ContextError, StreamError } from '../../../src/errors';

const BASE = 'https://retry.test/api';
const HEALTH = `${BASE}/health`;
const ES = `${BASE}/es/query/ns/alerts`;
const esParams = { appNamespace: 'ns', dataType: 'alerts' } as const;

function client(options: RtlsClientOptions = {}) {
  return createRtlsClient({ baseUrl: BASE, apiKey: 'k', ...options });
}

/** Answers `url` with the given statuses in order; the last one repeats. */
function sequence(method: 'get' | 'post', url: string, statuses: number[]): void {
  let n = 0;
  server.use(
    http[method](url, () => {
      const status = statuses[Math.min(n, statuses.length - 1)] as number;
      n += 1;
      return status < 300
        ? HttpResponse.json({ status: 'OK' }, { status })
        : HttpResponse.json({ error: `failure ${status}` }, { status });
    })
  );
}

/** A fake fetch answering with the given responses in order (for fake-timer tests). */
function fakeFetch(responses: Array<() => Response>) {
  let n = 0;
  return vi.fn(async () => {
    const make = responses[Math.min(n, responses.length - 1)] as () => Response;
    n += 1;
    return make();
  });
}

const json503 = () => Response.json({ error: 'busy' }, { status: 503 });
const json200 = () => Response.json({ status: 'OK' });

describe('retry policy and loop (D10, P1 §6.3 step 7, src/client/retry.ts)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('which calls are retried', () => {
    it('default client: GET 503 → exactly one attempt', async () => {
      sequence('get', HEALTH, [503, 200]);
      const rec = recordRequests();
      await expect(client().transport.request('GET', '/health')).rejects.toBeInstanceOf(
        ServiceUnavailableError
      );
      expect(rec.requests).toHaveLength(1);
    });

    it('retry: true: GET 503 then 200 → 2 attempts, resolves', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      sequence('get', HEALTH, [503, 200]);
      const rec = recordRequests();
      await expect(client({ retry: true }).transport.request('GET', '/health')).resolves.toEqual({
        status: 'OK',
      });
      expect(rec.requests).toHaveLength(2);
    });

    it('retry: true: GET 503 ×3 → 3 attempts (2 retries) then ServiceUnavailableError', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      sequence('get', HEALTH, [503]);
      const rec = recordRequests();
      const call = client({ retry: true }).transport.request('GET', '/health');
      await expect(call).rejects.toBeInstanceOf(ServiceUnavailableError);
      await expect(call).rejects.toMatchObject({ status: 503 });
      expect(rec.requests).toHaveLength(3);
    });

    it.each([429, 502, 504])('retry: true retries status %s by default', async (status) => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      sequence('get', HEALTH, [status, 200]);
      const rec = recordRequests();
      await client({ retry: true }).transport.request('GET', '/health');
      expect(rec.requests).toHaveLength(2);
    });

    it('a status outside retryOn (404) → one attempt', async () => {
      sequence('get', HEALTH, [404, 200]);
      const rec = recordRequests();
      await expect(
        client({ retry: true }).transport.request('GET', '/health')
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(rec.requests).toHaveLength(1);
    });

    it('POST 503 → one attempt (POST is not in the default methods)', async () => {
      sequence('post', ES, [503, 200]);
      const rec = recordRequests();
      await expect(
        client({ retry: true }).transport.request('POST', '/es/query/{appNamespace}/{dataType}', {
          params: esParams,
          body: { size: 1 },
        })
      ).rejects.toBeInstanceOf(ServiceUnavailableError);
      expect(rec.requests).toHaveLength(1);
    });

    it('POST with retry: { idempotent: true } → retried, same body each attempt', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      sequence('post', ES, [503, 200]);
      const rec = recordRequests();
      await client({ retry: true }).transport.request(
        'POST',
        '/es/query/{appNamespace}/{dataType}',
        {
          params: esParams,
          body: { size: 1 },
          retry: { idempotent: true },
        }
      );
      expect(rec.requests).toHaveLength(2);
      expect(await rec.requests[1]?.text()).toBe('{"size":1}');
    });

    it('retry: { idempotent: true } on a client without a policy → one attempt', async () => {
      sequence('post', ES, [503, 200]);
      const rec = recordRequests();
      await expect(
        client().transport.request('POST', '/es/query/{appNamespace}/{dataType}', {
          params: esParams,
          body: { size: 1 },
          retry: { idempotent: true },
        })
      ).rejects.toBeInstanceOf(ServiceUnavailableError);
      expect(rec.requests).toHaveLength(1);
    });

    it('retry: false on a GET → one attempt', async () => {
      sequence('get', HEALTH, [503, 200]);
      const rec = recordRequests();
      await expect(
        client({ retry: true }).transport.request('GET', '/health', { retry: false })
      ).rejects.toBeInstanceOf(ServiceUnavailableError);
      expect(rec.requests).toHaveLength(1);
    });

    it('PUT and DELETE are opt-in through methods', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      let puts = 0;
      server.use(
        http.put(`${BASE}/dashboards/:id`, () => {
          puts += 1;
          return puts === 1
            ? HttpResponse.json({ error: 'busy' }, { status: 503 })
            : HttpResponse.json({});
        })
      );
      const rec = recordRequests();
      await expect(
        client({ retry: true }).transport.request<unknown>('PUT', '/dashboards/{id}', {
          params: { id: 'd1' },
          body: { name: 'x' },
        })
      ).rejects.toBeInstanceOf(ServiceUnavailableError);
      expect(rec.requests).toHaveLength(1);
      puts = 0;
      await client({ retry: { methods: ['GET', 'PUT'] } }).transport.request<unknown>(
        'PUT',
        '/dashboards/{id}',
        { params: { id: 'd1' }, body: { name: 'x' } }
      );
      expect(rec.requests).toHaveLength(3);
    });

    it.each(['POST', 'PATCH'] as const)(
      '%s listed in methods is dropped (D10: not idempotent): 503 → one attempt',
      async (method) => {
        let calls = 0;
        server.use(
          http.all(`${BASE}/dashboards/:id`, () => {
            calls += 1;
            return calls === 1
              ? HttpResponse.json({ error: 'busy' }, { status: 503 })
              : HttpResponse.json({});
          })
        );
        const rec = recordRequests();
        await expect(
          client({
            retry: { methods: ['GET', method], baseDelayMs: 0, maxDelayMs: 0 },
          }).transport.request<unknown>(method, '/dashboards/{id}', {
            params: { id: 'd1' },
            body: { name: 'x' },
          })
        ).rejects.toBeInstanceOf(ServiceUnavailableError);
        expect(rec.requests).toHaveLength(1);
      }
    );

    it('retries: 0 → one attempt even under a policy', async () => {
      sequence('get', HEALTH, [503, 200]);
      const rec = recordRequests();
      await expect(
        client({ retry: { retries: 0 } }).transport.request('GET', '/health')
      ).rejects.toBeInstanceOf(ServiceUnavailableError);
      expect(rec.requests).toHaveLength(1);
    });

    it('a custom retryOn (500) is honoured and replaces the default list', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      sequence('get', HEALTH, [500, 200]);
      const rec = recordRequests();
      await client({ retry: { retryOn: [500] } }).transport.request('GET', '/health');
      expect(rec.requests).toHaveLength(2);
      sequence('get', HEALTH, [503, 200]);
      await expect(
        client({ retry: { retryOn: [500] } }).transport.request('GET', '/health')
      ).rejects.toBeInstanceOf(ServiceUnavailableError);
      expect(rec.requests).toHaveLength(3);
    });

    it('an upload is never retried, even when the policy lists POST', async () => {
      server.use(
        http.post(`${BASE}/assets/:ns/:mac/documents`, () =>
          HttpResponse.json({ error: 'busy' }, { status: 503 })
        )
      );
      const rec = recordRequests();
      const data = new FormData();
      data.append('file', new Blob(['x']), 'x.txt');
      await expect(
        client({ retry: { methods: ['GET', 'POST'] } }).transport.upload(
          '/assets/{namespace}/{mac_address}/documents',
          data,
          { params: { namespace: 'ns', mac_address: '025d4b000001' } }
        )
      ).rejects.toBeInstanceOf(ServiceUnavailableError);
      expect(rec.requests).toHaveLength(1);
    });

    it('a stream is never retried', async () => {
      server.use(
        http.get(`${BASE}/notifications/:ns/stream`, () =>
          HttpResponse.json({ error: 'busy' }, { status: 503 })
        )
      );
      const rec = recordRequests();
      const it = client({ retry: true }).transport.stream('/notifications/{namespace}/stream', {
        params: { namespace: 'ns' },
      });
      await expect(it.next()).rejects.toBeInstanceOf(ServiceUnavailableError);
      expect(rec.requests).toHaveLength(1);
    });

    it('a ResponseParseError is never retried', async () => {
      server.use(
        http.get(
          HEALTH,
          () =>
            new HttpResponse(new TextEncoder().encode('{"a":'), {
              headers: { 'content-type': 'application/json' },
            })
        )
      );
      const rec = recordRequests();
      await expect(
        client({ retry: true }).transport.request('GET', '/health')
      ).rejects.toBeInstanceOf(ResponseParseError);
      expect(rec.requests).toHaveLength(1);
    });

    it('a client-side ValidationError (status 0) sends nothing and is not retried', async () => {
      sequence('get', HEALTH, [200]);
      const rec = recordRequests();
      await expect(
        client({ retry: true }).transport.request('GET', '/health', { timeoutMs: -1 })
      ).rejects.toMatchObject({ status: 0, code: 'VALIDATION_ERROR' });
      expect(rec.requests).toHaveLength(0);
    });
  });

  describe('network errors, timeouts and aborts', () => {
    it('NetworkError on a GET is retried', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce(json200());
      await expect(
        client({ retry: true, fetch }).transport.request('GET', '/health')
      ).resolves.toEqual({
        status: 'OK',
      });
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('NetworkError on a POST is not retried', async () => {
      const fetch = vi.fn(async () => {
        throw new TypeError('fetch failed');
      });
      await expect(
        client({ retry: true, fetch }).transport.request(
          'POST',
          '/es/query/{appNamespace}/{dataType}',
          {
            params: esParams,
            body: {},
          }
        )
      ).rejects.toBeInstanceOf(NetworkError);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('retryNetworkErrors: false → a NetworkError is not retried', async () => {
      const fetch = vi.fn(async () => {
        throw new TypeError('fetch failed');
      });
      await expect(
        client({ retry: { retryNetworkErrors: false }, fetch }).transport.request('GET', '/health')
      ).rejects.toBeInstanceOf(NetworkError);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('a TimeoutError is retried (each attempt has its own timer)', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      let n = 0;
      server.use(
        http.get(HEALTH, async () => {
          n += 1;
          if (n === 1) await delay(200);
          return HttpResponse.json({ status: 'OK' });
        })
      );
      const rec = recordRequests();
      await expect(
        client({ retry: true }).transport.request('GET', '/health', { timeoutMs: 30 })
      ).resolves.toEqual({ status: 'OK' });
      expect(rec.requests).toHaveLength(2);
    });

    it('retryNetworkErrors: false → a TimeoutError is not retried', async () => {
      server.use(
        http.get(HEALTH, async () => {
          await delay(200);
          return HttpResponse.json({ status: 'OK' });
        })
      );
      const rec = recordRequests();
      await expect(
        client({ retry: { retryNetworkErrors: false } }).transport.request('GET', '/health', {
          timeoutMs: 20,
        })
      ).rejects.toBeInstanceOf(TimeoutError);
      expect(rec.requests).toHaveLength(1);
    });

    it('an AbortError is never retried', async () => {
      server.use(
        http.get(HEALTH, async () => {
          await delay(200);
          return HttpResponse.json({ status: 'OK' });
        })
      );
      const rec = recordRequests();
      const controller = new AbortController();
      setTimeout(() => controller.abort(new Error('stop')), 20);
      await expect(
        client({ retry: true }).transport.request('GET', '/health', { signal: controller.signal })
      ).rejects.toBeInstanceOf(AbortError);
      expect(rec.requests).toHaveLength(1);
    });

    it('an abort during the backoff → AbortError, no further attempt', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const fetch = fakeFetch([json503, json200]);
      const controller = new AbortController();
      const reason = new Error('sdk-test-cancel');
      const call = client({
        retry: { baseDelayMs: 1000, maxDelayMs: 1000 },
        fetch,
      }).transport.request('GET', '/health', { signal: controller.signal });
      const settled = Promise.allSettled([call]);
      await vi.advanceTimersByTimeAsync(100);
      expect(fetch).toHaveBeenCalledTimes(1);
      controller.abort(reason);
      const [outcome] = await settled;
      expect(outcome).toMatchObject({ status: 'rejected' });
      const error = (outcome as PromiseRejectedResult).reason as unknown;
      expect(error).toBeInstanceOf(AbortError);
      expect((error as AbortError).cause).toBe(reason);
      await vi.advanceTimersByTimeAsync(5000);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('delays', () => {
    it('429 with Retry-After: 2 → waits exactly 2 000 ms before attempt 2', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const fetch = fakeFetch([
        () =>
          Response.json(
            { error: 'rate_limited', message: 'slow down' },
            { status: 429, headers: { 'Retry-After': '2' } }
          ),
        json200,
      ]);
      const call = client({ retry: true, fetch }).transport.request('GET', '/health');
      await vi.advanceTimersByTimeAsync(1999);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(2);
      await expect(call).resolves.toEqual({ status: 'OK' });
    });

    it('Retry-After: 120 with the default maxRetryAfterMs → the error is thrown at once', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const fetch = fakeFetch([
        () =>
          Response.json(
            { error: 'rate_limited', message: 'slow down' },
            { status: 429, headers: { 'Retry-After': '120' } }
          ),
        json200,
      ]);
      const call = client({ retry: true, fetch }).transport.request('GET', '/health');
      await expect(call).rejects.toBeInstanceOf(RateLimitError);
      await expect(call).rejects.toMatchObject({ retryAfter: 120_000 });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('a Retry-After within a raised maxRetryAfterMs is waited for', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const fetch = fakeFetch([
        () => Response.json({ error: 'busy' }, { status: 503, headers: { 'Retry-After': '120' } }),
        json200,
      ]);
      const call = client({ retry: { maxRetryAfterMs: 120_000 }, fetch }).transport.request(
        'GET',
        '/health'
      );
      await vi.advanceTimersByTimeAsync(119_999);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(call).resolves.toEqual({ status: 'OK' });
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('Math.random 0.5 → delay 0.5 × min(maxDelayMs, baseDelayMs × 2^(n−1)) per attempt', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const fetch = fakeFetch([json503, json503, json503, json200]);
      // base 400, max 1000 → 0.5 × 400 = 200, 0.5 × 800 = 400, 0.5 × min(1000, 1600) = 500
      const call = client({
        retry: { retries: 3, baseDelayMs: 400, maxDelayMs: 1000 },
        fetch,
      }).transport.request('GET', '/health');
      const at = async (ms: number, calls: number) => {
        await vi.advanceTimersByTimeAsync(ms);
        expect(fetch).toHaveBeenCalledTimes(calls);
      };
      await at(0, 1);
      await at(199, 1);
      await at(1, 2);
      await at(399, 2);
      await at(1, 3);
      await at(499, 3);
      await at(1, 4);
      await expect(call).resolves.toEqual({ status: 'OK' });
    });

    it('retryDelay: full jitter bounds and Retry-After precedence', () => {
      const policy = resolveRetryPolicy({
        baseDelayMs: 100,
        maxDelayMs: 250,
      }) as ResolvedRetryPolicy;
      vi.spyOn(Math, 'random').mockReturnValue(1);
      const plain = new ServiceUnavailableError('x');
      expect(retryDelay(plain, 1, policy)).toBe(100);
      expect(retryDelay(plain, 2, policy)).toBe(200);
      expect(retryDelay(plain, 3, policy)).toBe(250);
      const withRetryAfter = new ServiceUnavailableError('x', undefined, { retryAfter: 0 });
      expect(retryDelay(withRetryAfter, 3, policy)).toBe(0);
      const tooLong = new ServiceUnavailableError('x', undefined, { retryAfter: 60_001 });
      expect(retryDelay(tooLong, 1, policy)).toBeUndefined();
      // A value that is not an SDK error carries no Retry-After: full jitter.
      expect(retryDelay('boom', 2, policy)).toBe(200);
    });
  });

  describe('isRetryableError', () => {
    const policy = resolveRetryPolicy(true) as ResolvedRetryPolicy;

    it.each([
      ['AbortError', new AbortError()],
      ['ResponseParseError', new ResponseParseError('x', { status: 200 })],
      ['StreamError', new StreamError('x', { reason: 'network' })],
      ['ContextError', new ContextError('Namespace', 'set one')],
      ['client-side ValidationError', new ValidationError('x', undefined, { status: 0 })],
      ['a plain Error', new Error('x')],
      ['a non-error value', 'boom'],
      ['NotFoundError', new NotFoundError('x')],
    ])('%s → false', (_name, error) => {
      expect(isRetryableError(error, policy)).toBe(false);
    });

    it.each([
      ['NetworkError', new NetworkError('x')],
      ['TimeoutError', new TimeoutError()],
      ['ServiceUnavailableError', new ServiceUnavailableError('x')],
      ['RateLimitError', new RateLimitError('x')],
    ])('%s → true under the defaults', (_name, error) => {
      expect(isRetryableError(error, policy)).toBe(true);
    });

    it('a 400 ValidationError is retried only when 400 is in retryOn', () => {
      const error = new ValidationError('bad', undefined, { status: 400 });
      expect(isRetryableError(error, policy)).toBe(false);
      expect(
        isRetryableError(error, resolveRetryPolicy({ retryOn: [400] }) as ResolvedRetryPolicy)
      ).toBe(true);
    });
  });

  describe('policy validation at construction (ValidationError, status 0)', () => {
    it('retry: true fills the defaults; false and undefined disable retries', () => {
      expect(resolveRetryPolicy(true)).toEqual({
        retries: 2,
        retryOn: [429, 502, 503, 504],
        methods: ['GET'],
        baseDelayMs: 300,
        maxDelayMs: 10_000,
        maxRetryAfterMs: 60_000,
        retryNetworkErrors: true,
      });
      expect(resolveRetryPolicy(false)).toBeUndefined();
      expect(resolveRetryPolicy(undefined)).toBeUndefined();
      expect(
        resolveRetryPolicy({ methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] })?.methods
      ).toStrictEqual(['GET', 'PUT', 'DELETE']);
      expect(
        resolveRetryPolicy({ retries: 10, retryOn: [400, 599], baseDelayMs: 0, maxDelayMs: 0 })
      ).toMatchObject({
        retries: 10,
        retryOn: [400, 599],
        baseDelayMs: 0,
        maxDelayMs: 0,
      });
    });

    it.each<[string, unknown, string]>([
      ['retries -1', { retries: -1 }, 'retry.retries'],
      ['retries 11', { retries: 11 }, 'retry.retries'],
      ['retries 1.5', { retries: 1.5 }, 'retry.retries'],
      ['retryOn 399', { retryOn: [399] }, 'retry.retryOn'],
      ['retryOn 600', { retryOn: [600] }, 'retry.retryOn'],
      ['retryOn 503.5', { retryOn: [503.5] }, 'retry.retryOn'],
      ['retryOn not an array', { retryOn: 503 }, 'retry.retryOn'],
      ['methods with HEAD', { methods: ['GET', 'HEAD'] }, 'retry.methods'],
      ['methods lower case', { methods: ['get'] }, 'retry.methods'],
      ['baseDelayMs NaN', { baseDelayMs: NaN }, 'retry.baseDelayMs'],
      ['maxDelayMs Infinity', { maxDelayMs: Infinity }, 'retry.maxDelayMs'],
      ['maxRetryAfterMs -1', { maxRetryAfterMs: -1 }, 'retry.maxRetryAfterMs'],
      ['baseDelayMs > maxDelayMs', { baseDelayMs: 500, maxDelayMs: 100 }, 'retry.baseDelayMs'],
      [
        'retryNetworkErrors not a boolean',
        { retryNetworkErrors: 'yes' },
        'retry.retryNetworkErrors',
      ],
      ['a string', 'always', 'retry'],
      ['a number', 3, 'retry'],
      ['an array', [503], 'retry'],
    ])('%s → createRtlsClient throws', (_name, retry, field) => {
      expect(() => client({ retry: retry as never })).toThrow(ValidationError);
      expect(() => client({ retry: retry as never })).toThrow(
        expect.objectContaining({ status: 0, code: 'VALIDATION_ERROR', details: [field] })
      );
    });

    it.each([true, 'yes', { idempotent: false }, {}])(
      'a per-call retry option other than false / { idempotent: true } (%j) → ValidationError, no request',
      async (retry) => {
        sequence('get', HEALTH, [200]);
        const rec = recordRequests();
        await expect(
          client({ retry: true }).transport.request('GET', '/health', { retry: retry as never })
        ).rejects.toMatchObject({ status: 0, details: ['retry'] });
        expect(rec.requests).toHaveLength(0);
      }
    );
  });
});
