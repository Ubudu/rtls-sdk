import { afterEach, describe, it, expect, vi } from 'vitest';
import { getEventListeners } from 'node:events';
import { delay, http, HttpResponse } from 'msw';
import { recordRequests, server } from '../../mocks/server';
import {
  checkTimeoutMs,
  openSignalScope,
  raceSignal,
  resolveTimeoutMs,
  runWithSignals,
} from '../../../src/client/http';
import {
  AbortError,
  createRtlsClient,
  NetworkError,
  NotFoundError,
  RtlsClient,
  RtlsError,
  TimeoutError,
  ValidationError,
} from '../../../src';

const URL_SLOW = 'https://signals.test/api/slow';
const URL_FAST = 'https://signals.test/api/fast';
const URL_SLOW_BODY = 'https://signals.test/api/slow-body';

/** A GET through the composed signal that reads the whole body inside the scope (headers and body). */
function getText(url: string, options: { signal?: AbortSignal; timeoutMs: number }) {
  return runWithSignals(options, async (signal) => {
    const response = await fetch(url, { signal });
    return await raceSignal(response.text(), signal);
  });
}

function useSlowHandlers(): void {
  server.use(
    http.get(URL_SLOW, async () => {
      await delay(200);
      return HttpResponse.text('slow');
    }),
    http.get(URL_FAST, async () => {
      await delay(50);
      return HttpResponse.text('fast');
    }),
    http.get(URL_SLOW_BODY, () => {
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode('{"part":'));
          await new Promise((r) => setTimeout(r, 200));
          controller.enqueue(encoder.encode('1}'));
          controller.close();
        },
      });
      return new HttpResponse(body, { headers: { 'content-type': 'application/json' } });
    })
  );
}

describe('signal composition and fetch-error mapping (P1 §6.3 step 4, src/client/http.ts)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a pre-aborted signal → AbortError with the reason as cause, and no request is sent', async () => {
    useSlowHandlers();
    const rec = recordRequests();
    const reason = new Error('already cancelled');
    const work = vi.fn((signal: AbortSignal) => fetch(URL_FAST, { signal }));
    const promise = runWithSignals({ signal: AbortSignal.abort(reason), timeoutMs: 1000 }, work);
    await expect(promise).rejects.toBeInstanceOf(AbortError);
    await expect(promise).rejects.toMatchObject({ code: 'ABORTED', status: 0, cause: reason });
    expect(work).not.toHaveBeenCalled();
    expect(rec.requests).toHaveLength(0);
  });

  it('an abort during the MSW delay → AbortError with cause = the abort reason', async () => {
    useSlowHandlers();
    const rec = recordRequests();
    const controller = new AbortController();
    const reason = new Error('sdk-test-cancel');
    setTimeout(() => controller.abort(reason), 20);
    const promise = getText(URL_SLOW, { signal: controller.signal, timeoutMs: 5000 });
    await expect(promise).rejects.toBeInstanceOf(AbortError);
    await expect(promise).rejects.not.toBeInstanceOf(TimeoutError);
    await expect(promise).rejects.toSatisfy((e: AbortError) => e.cause === reason);
    expect(rec.requests).toHaveLength(1);
  });

  it('an abort without a reason keeps the signal default reason as cause', async () => {
    useSlowHandlers();
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);
    const promise = getText(URL_SLOW, { signal: controller.signal, timeoutMs: 5000 });
    await expect(promise).rejects.toBeInstanceOf(AbortError);
    await expect(promise).rejects.toSatisfy(
      (e: AbortError) => e.cause !== undefined && e.cause === controller.signal.reason
    );
  });

  it('timeoutMs 20 against delay(200) → TimeoutError with timeoutMs 20, not AbortError', async () => {
    useSlowHandlers();
    const promise = getText(URL_SLOW, { timeoutMs: 20 });
    await expect(promise).rejects.toBeInstanceOf(TimeoutError);
    await expect(promise).rejects.not.toBeInstanceOf(AbortError);
    await expect(promise).rejects.toMatchObject({ timeoutMs: 20, status: 0, code: 'TIMEOUT' });
  });

  it('a timeout during the body read (headers sent, body delayed) → TimeoutError', async () => {
    useSlowHandlers();
    let headersSeen = false;
    const promise = runWithSignals({ timeoutMs: 60 }, async (signal) => {
      const response = await fetch(URL_SLOW_BODY, { signal });
      headersSeen = response.ok;
      return await raceSignal(response.text(), signal);
    });
    await expect(promise).rejects.toBeInstanceOf(TimeoutError);
    expect(headersSeen).toBe(true);
  });

  it.each([0, Infinity])(
    'timeoutMs %s disables the timeout: delay(50) succeeds',
    async (timeoutMs) => {
      useSlowHandlers();
      await expect(getText(URL_FAST, { timeoutMs })).resolves.toBe('fast');
    }
  );

  it.each([-1, NaN, '5', null, {}])(
    'per-call timeoutMs %j → ValidationError with status 0',
    (value) => {
      let thrown: unknown;
      try {
        resolveTimeoutMs(value, 30_000);
      } catch (error) {
        thrown = error;
        if (!(error instanceof ValidationError)) throw error;
      }
      expect(thrown).toBeInstanceOf(ValidationError);
      expect((thrown as ValidationError).status).toBe(0);
      expect((thrown as ValidationError).code).toBe('VALIDATION_ERROR');
      expect((thrown as ValidationError).details).toEqual(['timeoutMs']);
    }
  );

  it.each([-1, NaN, '5'])(
    'constructor timeoutMs %j throws ValidationError with status 0',
    (value) => {
      expect(() => createRtlsClient({ timeoutMs: value as number })).toThrow(
        expect.objectContaining({ status: 0, code: 'VALIDATION_ERROR', details: ['timeoutMs'] })
      );
    }
  );

  it.each([0, Infinity, 1])('constructor timeoutMs %s is accepted', (value) => {
    expect(createRtlsClient({ timeoutMs: value })).toBeInstanceOf(RtlsClient);
  });

  it('resolveTimeoutMs keeps a valid per-call value and falls back to the client default', () => {
    expect(resolveTimeoutMs(undefined, 30_000)).toBe(30_000);
    expect(resolveTimeoutMs(5, 30_000)).toBe(5);
    expect(resolveTimeoutMs(0, 30_000)).toBe(0);
    expect(resolveTimeoutMs(Infinity, 30_000)).toBe(Infinity);
    expect(checkTimeoutMs(1.5)).toBe(1.5);
  });

  describe('without AbortSignal.any and AbortSignal.timeout', () => {
    const saved = {
      any: Object.getOwnPropertyDescriptor(AbortSignal, 'any'),
      timeout: Object.getOwnPropertyDescriptor(AbortSignal, 'timeout'),
    };
    afterEach(() => {
      if (saved.any) Object.defineProperty(AbortSignal, 'any', saved.any);
      if (saved.timeout) Object.defineProperty(AbortSignal, 'timeout', saved.timeout);
    });

    function removeHelpers(): void {
      Reflect.deleteProperty(AbortSignal, 'any');
      Reflect.deleteProperty(AbortSignal, 'timeout');
      expect('any' in AbortSignal).toBe(false);
      expect('timeout' in AbortSignal).toBe(false);
    }

    it('a user abort is still honoured', async () => {
      removeHelpers();
      useSlowHandlers();
      const controller = new AbortController();
      setTimeout(() => controller.abort(new Error('stop')), 20);
      await expect(
        getText(URL_SLOW, { signal: controller.signal, timeoutMs: 5000 })
      ).rejects.toBeInstanceOf(AbortError);
    });

    it('timeoutMs is still honoured', async () => {
      removeHelpers();
      useSlowHandlers();
      await expect(getText(URL_SLOW, { timeoutMs: 20 })).rejects.toBeInstanceOf(TimeoutError);
    });
  });

  it('after success no timer is pending (fake timers) and the user signal has no listener left', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const controller = new AbortController();
    const fakeFetch = vi.fn(async () => new Response('ok', { status: 200 }));
    const result = await runWithSignals(
      { signal: controller.signal, timeoutMs: 30_000 },
      async (signal) => {
        expect(vi.getTimerCount()).toBe(1);
        expect(getEventListeners(controller.signal, 'abort')).toHaveLength(1);
        const response = await fakeFetch();
        return await raceSignal(response.text(), signal);
      }
    );
    expect(result).toBe('ok');
    expect(vi.getTimerCount()).toBe(0);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });

  it('after a failure the timer and the listener are released too', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const controller = new AbortController();
    const promise = runWithSignals({ signal: controller.signal, timeoutMs: 30_000 }, async () => {
      throw new TypeError('fetch failed');
    });
    await expect(promise).rejects.toBeInstanceOf(NetworkError);
    expect(vi.getTimerCount()).toBe(0);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });

  it("fetch throwing TypeError('Load failed') → NetworkError with that message and the cause", async () => {
    const cause = new TypeError('Load failed');
    const promise = runWithSignals({ timeoutMs: 1000 }, async () => {
      throw cause;
    });
    await expect(promise).rejects.toBeInstanceOf(NetworkError);
    await expect(promise).rejects.toMatchObject({ message: 'Load failed', status: 0 });
    await expect(promise).rejects.toSatisfy((e: NetworkError) => e.cause === cause);
  });

  it('fetch throwing a non-Error → NetworkError with the default message and the value as cause', async () => {
    const promise = runWithSignals({ timeoutMs: 1000 }, async () => {
      throw 'socket hang up';
    });
    await expect(promise).rejects.toBeInstanceOf(NetworkError);
    await expect(promise).rejects.toMatchObject({
      message: 'Network error',
      cause: 'socket hang up',
    });
  });

  it('an RtlsError thrown inside the scope is rethrown unchanged', async () => {
    const original = new NotFoundError('nope');
    await expect(
      runWithSignals({ timeoutMs: 1000 }, async () => {
        throw original;
      })
    ).rejects.toBe(original);
  });

  it('a user abort wins over a timer that fired as well', async () => {
    useSlowHandlers();
    const controller = new AbortController();
    const scope = openSignalScope(controller.signal, 10);
    await new Promise((r) => setTimeout(r, 30));
    expect(scope.signal.aborted).toBe(true);
    controller.abort(new Error('late'));
    const classified = scope.classify(scope.signal.reason);
    scope.release();
    expect(classified).toBeInstanceOf(AbortError);
  });

  it('openSignalScope: clearTimer stops the timer while the caller signal stays attached', async () => {
    const controller = new AbortController();
    const scope = openSignalScope(controller.signal, 20);
    scope.clearTimer();
    await new Promise((r) => setTimeout(r, 40));
    expect(scope.signal.aborted).toBe(false);
    controller.abort(new Error('after headers'));
    expect(scope.signal.aborted).toBe(true);
    expect(scope.classify(scope.signal.reason)).toBeInstanceOf(AbortError);
    scope.release();
    scope.release();
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });

  it('raceSignal: an already aborted signal rejects at once with its reason', async () => {
    const reason = new Error('gone');
    await expect(raceSignal(Promise.resolve(1), AbortSignal.abort(reason))).rejects.toBe(reason);
    await expect(
      raceSignal(Promise.reject(new Error('x')), AbortSignal.abort(reason))
    ).rejects.toBe(reason);
  });

  it('raceSignal: passes value and error through and removes its listener', async () => {
    const controller = new AbortController();
    await expect(raceSignal(Promise.resolve(7), controller.signal)).resolves.toBe(7);
    await expect(raceSignal(Promise.reject(new Error('boom')), controller.signal)).rejects.toThrow(
      'boom'
    );
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });

  describe('through Transport.request', () => {
    const BASE = 'https://signals.test/api';
    const HEALTH = `${BASE}/health`;

    function slowHealth(ms: number): void {
      server.use(
        http.get(HEALTH, async () => {
          await delay(ms);
          return HttpResponse.json({ status: 'OK' });
        })
      );
    }

    function slowBodyHealth(): void {
      server.use(
        http.get(HEALTH, () => {
          const encoder = new TextEncoder();
          const body = new ReadableStream<Uint8Array>({
            async start(controller) {
              controller.enqueue(encoder.encode('{"status":'));
              await new Promise((r) => setTimeout(r, 200));
              controller.enqueue(encoder.encode('"OK"}'));
              controller.close();
            },
          });
          return new HttpResponse(body, { headers: { 'content-type': 'application/json' } });
        })
      );
    }

    const transport = (options: Parameters<typeof createRtlsClient>[0] = {}) =>
      createRtlsClient({ baseUrl: BASE, apiKey: 'k', ...options }).transport;

    it('a pre-aborted signal → AbortError, no request', async () => {
      slowHealth(0);
      const rec = recordRequests();
      const reason = new Error('before');
      const call = transport().request('GET', '/health', { signal: AbortSignal.abort(reason) });
      await expect(call).rejects.toBeInstanceOf(AbortError);
      await expect(call).rejects.toSatisfy((e: AbortError) => e.cause === reason);
      expect(rec.requests).toHaveLength(0);
    });

    it('an abort during the MSW delay → AbortError with cause = reason, one request', async () => {
      slowHealth(200);
      const rec = recordRequests();
      const controller = new AbortController();
      const reason = new Error('sdk-test-cancel');
      setTimeout(() => controller.abort(reason), 20);
      const call = transport().request('GET', '/health', { signal: controller.signal });
      await expect(call).rejects.toBeInstanceOf(AbortError);
      await expect(call).rejects.toSatisfy((e: AbortError) => e.cause === reason);
      expect(rec.requests).toHaveLength(1);
    });

    it('per-call timeoutMs 20 against delay(200) → TimeoutError with timeoutMs 20', async () => {
      slowHealth(200);
      const call = transport().request('GET', '/health', { timeoutMs: 20 });
      await expect(call).rejects.toBeInstanceOf(TimeoutError);
      await expect(call).rejects.toMatchObject({ timeoutMs: 20, status: 0, code: 'TIMEOUT' });
    });

    it('the client default timeoutMs applies when the call passes none', async () => {
      slowHealth(200);
      await expect(transport({ timeoutMs: 20 }).request('GET', '/health')).rejects.toMatchObject({
        code: 'TIMEOUT',
        timeoutMs: 20,
      });
    });

    it('a timeout during the body read (headers sent, body delayed) → TimeoutError', async () => {
      slowBodyHealth();
      await expect(transport().request('GET', '/health', { timeoutMs: 60 })).rejects.toBeInstanceOf(
        TimeoutError
      );
    });

    it.each([0, Infinity])('timeoutMs %s disables the timeout: delay(50) succeeds', async (ms) => {
      slowHealth(50);
      await expect(
        transport({ timeoutMs: 10 }).request('GET', '/health', { timeoutMs: ms })
      ).resolves.toEqual({ status: 'OK' });
    });

    it.each([-1, NaN, '5'])(
      'per-call timeoutMs %j → ValidationError with status 0 and no request',
      async (value) => {
        slowHealth(0);
        const rec = recordRequests();
        const call = transport().request('GET', '/health', { timeoutMs: value as number });
        await expect(call).rejects.toBeInstanceOf(ValidationError);
        await expect(call).rejects.toMatchObject({ status: 0, details: ['timeoutMs'] });
        expect(rec.requests).toHaveLength(0);
      }
    );

    describe('without AbortSignal.any and AbortSignal.timeout', () => {
      const saved = {
        any: Object.getOwnPropertyDescriptor(AbortSignal, 'any'),
        timeout: Object.getOwnPropertyDescriptor(AbortSignal, 'timeout'),
      };
      afterEach(() => {
        if (saved.any) Object.defineProperty(AbortSignal, 'any', saved.any);
        if (saved.timeout) Object.defineProperty(AbortSignal, 'timeout', saved.timeout);
      });

      it('a user abort and timeoutMs are still honoured', async () => {
        Reflect.deleteProperty(AbortSignal, 'any');
        Reflect.deleteProperty(AbortSignal, 'timeout');
        expect('any' in AbortSignal).toBe(false);
        expect('timeout' in AbortSignal).toBe(false);
        slowHealth(200);
        const controller = new AbortController();
        setTimeout(() => controller.abort(new Error('stop')), 20);
        await expect(
          transport().request('GET', '/health', { signal: controller.signal })
        ).rejects.toBeInstanceOf(AbortError);
        await expect(
          transport().request('GET', '/health', { timeoutMs: 20 })
        ).rejects.toBeInstanceOf(TimeoutError);
      });
    });

    it('after success no timer is pending (fake timers) and the user signal has no listener left', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const controller = new AbortController();
      const fakeFetch = vi.fn(async () => {
        expect(vi.getTimerCount()).toBe(1);
        expect(getEventListeners(controller.signal, 'abort')).toHaveLength(1);
        return Response.json({ status: 'OK' });
      });
      const result = await transport({ fetch: fakeFetch, timeoutMs: 30_000 }).request(
        'GET',
        '/health',
        { signal: controller.signal }
      );
      expect(result).toEqual({ status: 'OK' });
      expect(fakeFetch).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    });

    it("fetch throwing TypeError('Load failed') → NetworkError with that message", async () => {
      const cause = new TypeError('Load failed');
      const call = transport({
        fetch: async () => {
          throw cause;
        },
      }).request('GET', '/health');
      await expect(call).rejects.toBeInstanceOf(NetworkError);
      await expect(call).rejects.toMatchObject({ message: 'Load failed', status: 0 });
      await expect(call).rejects.toSatisfy((e: NetworkError) => e.cause === cause);
    });

    it('fetch throwing a non-Error → NetworkError with cause set', async () => {
      const call = transport({
        fetch: async () => {
          throw 'socket hang up';
        },
      }).request('GET', '/health');
      await expect(call).rejects.toBeInstanceOf(NetworkError);
      await expect(call).rejects.toMatchObject({ cause: 'socket hang up' });
    });

    it('a fetch that ignores the signal still ends with AbortError when the caller aborts', async () => {
      const controller = new AbortController();
      const never = vi.fn(() => new Promise<Response>(() => undefined));
      setTimeout(() => controller.abort(new Error('give up')), 10);
      await expect(
        transport({ fetch: never }).request('GET', '/health', { signal: controller.signal })
      ).rejects.toBeInstanceOf(AbortError);
      expect(never).toHaveBeenCalledTimes(1);
    });
  });

  it('RtlsError.is holds for every classified error', async () => {
    const branded = (e: unknown) => RtlsError.is(e);
    await expect(
      runWithSignals({ timeoutMs: 1000 }, async () => {
        throw new Error('x');
      })
    ).rejects.toSatisfy(branded);
    await expect(
      runWithSignals({ signal: AbortSignal.abort(), timeoutMs: 1000 }, async () => 1)
    ).rejects.toSatisfy(branded);
  });
});
