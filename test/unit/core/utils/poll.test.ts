import { afterEach, describe, it, expect, vi } from 'vitest';
import { getEventListeners } from 'node:events';
import { pollUntil, sleep, type PollOptions } from '../../../../src/utils/poll';
import { AbortError, NotFoundError, TimeoutError, ValidationError } from '../../../../src/errors';

describe('poll utilities (P1 §6.7, src/utils/poll.ts)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('sleep', () => {
    it('resolves after exactly ms milliseconds (fake timers) and leaves no timer or listener', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const controller = new AbortController();
      let done = false;
      const wait = sleep(1000, controller.signal).then(() => {
        done = true;
      });
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(999);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await wait;
      expect(done).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    });

    it('sleep(0) resolves', async () => {
      await expect(sleep(0)).resolves.toBeUndefined();
    });

    it('a pre-aborted signal → AbortError with the reason as cause, no timer started', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const reason = new Error('before');
      const wait = sleep(1000, AbortSignal.abort(reason));
      await expect(wait).rejects.toBeInstanceOf(AbortError);
      await expect(wait).rejects.toSatisfy((e: AbortError) => e.cause === reason);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('an abort during the wait → AbortError at once and the timer is cleared', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const controller = new AbortController();
      const reason = new Error('during');
      const wait = sleep(10_000, controller.signal);
      const settled = Promise.allSettled([wait]);
      await vi.advanceTimersByTimeAsync(10);
      controller.abort(reason);
      const [outcome] = await settled;
      expect(outcome).toMatchObject({ status: 'rejected' });
      const error = (outcome as PromiseRejectedResult).reason as unknown;
      expect(error).toBeInstanceOf(AbortError);
      expect((error as AbortError).cause).toBe(reason);
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each([-1, NaN, Infinity, '5'])('ms %j → ValidationError with status 0', async (ms) => {
      const wait = sleep(ms as number);
      await expect(wait).rejects.toBeInstanceOf(ValidationError);
      await expect(wait).rejects.toMatchObject({ status: 0, details: ['ms'] });
    });
  });

  describe('pollUntil', () => {
    /** A poller whose fn records the (fake) time of each attempt and returns the attempt number. */
    function recorder(): {
      fn: (attempt: number) => Promise<number>;
      calls: number[];
      attempts: number[];
    } {
      const calls: number[] = [];
      const attempts: number[] = [];
      const start = Date.now();
      return {
        calls,
        attempts,
        fn: (attempt) => {
          calls.push(Date.now() - start);
          attempts.push(attempt);
          return Promise.resolve(attempt);
        },
      };
    }

    const fake = (): void => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    };

    it('done on attempt 1 → resolves with the value, no sleep, no timer left', async () => {
      fake();
      const r = recorder();
      await expect(pollUntil(r.fn, (n) => n === 1)).resolves.toBe(1);
      expect(r.attempts).toStrictEqual([1]);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('done on attempt 3 → waits 1 000 then 1 500 ms (defaults: interval 1 000, backoff 1.5)', async () => {
      fake();
      const r = recorder();
      const done = pollUntil(r.fn, (n) => n === 3);
      await vi.advanceTimersByTimeAsync(999);
      expect(r.attempts).toStrictEqual([1]);
      await vi.advanceTimersByTimeAsync(1);
      expect(r.attempts).toStrictEqual([1, 2]);
      await vi.advanceTimersByTimeAsync(1499);
      expect(r.attempts).toStrictEqual([1, 2]);
      await vi.advanceTimersByTimeAsync(1);
      await expect(done).resolves.toBe(3);
      expect(r.calls).toStrictEqual([0, 1000, 2500]);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('maxIntervalMs caps every wait', async () => {
      fake();
      const r = recorder();
      const done = pollUntil(r.fn, (n) => n === 5, {
        intervalMs: 1000,
        backoff: 3,
        maxIntervalMs: 2000,
      });
      await vi.advanceTimersByTimeAsync(10_000);
      await expect(done).resolves.toBe(5);
      expect(r.calls).toStrictEqual([0, 1000, 3000, 5000, 7000]);
    });

    it('an interval above maxIntervalMs is capped from the first wait; backoff 1 keeps it constant', async () => {
      fake();
      const r = recorder();
      const done = pollUntil(r.fn, (n) => n === 3, {
        intervalMs: 5000,
        maxIntervalMs: 400,
        backoff: 1,
      });
      await vi.advanceTimersByTimeAsync(1000);
      await expect(done).resolves.toBe(3);
      expect(r.calls).toStrictEqual([0, 400, 800]);
    });

    it('the deadline → TimeoutError with timeoutMs and body { attempts, lastValue }; the last wait ends at the deadline', async () => {
      fake();
      const r = recorder();
      const done = pollUntil(r.fn, () => false, { timeoutMs: 2500 });
      const settled = Promise.allSettled([done]);
      await vi.advanceTimersByTimeAsync(5000);
      const [outcome] = await settled;
      expect(outcome).toMatchObject({ status: 'rejected' });
      const error = (outcome as PromiseRejectedResult).reason as TimeoutError;
      expect(error).toBeInstanceOf(TimeoutError);
      expect(error).toMatchObject({
        message: 'Polling timed out',
        status: 0,
        code: 'TIMEOUT',
        timeoutMs: 2500,
        body: { attempts: 3, lastValue: 3 },
      });
      expect(r.calls).toStrictEqual([0, 1000, 2500]);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('the default deadline is 60 000 ms', async () => {
      fake();
      const r = recorder();
      const done = pollUntil(r.fn, () => false);
      const settled = Promise.allSettled([done]);
      await vi.advanceTimersByTimeAsync(70_000);
      const [outcome] = await settled;
      expect((outcome as PromiseRejectedResult).reason).toMatchObject({ timeoutMs: 60_000 });
      expect(r.calls.at(-1)).toBe(60_000);
    });

    it.each([0, Infinity])('timeoutMs %s → no deadline', async (timeoutMs) => {
      fake();
      const r = recorder();
      const done = pollUntil(r.fn, (n) => n === 6, {
        intervalMs: 30_000,
        maxIntervalMs: 30_000,
        backoff: 1,
        timeoutMs,
      });
      await vi.advanceTimersByTimeAsync(150_000);
      await expect(done).resolves.toBe(6);
      expect(r.calls.at(-1)).toBe(150_000);
    });

    it('an abort during the wait → AbortError at once (cause = reason), no further attempt', async () => {
      fake();
      const r = recorder();
      const controller = new AbortController();
      const reason = new Error('stop polling');
      const done = pollUntil(r.fn, () => false, { signal: controller.signal });
      let isSettled = false;
      const settled = Promise.allSettled([done]).then((outcomes) => {
        isSettled = true;
        return outcomes;
      });
      await vi.advanceTimersByTimeAsync(500);
      controller.abort(reason);
      // Only microtasks run: the 1 000 ms wait must end with the abort, not with its timer.
      await vi.advanceTimersByTimeAsync(0);
      expect(isSettled).toBe(true);
      const [outcome] = await settled;
      const error = (outcome as PromiseRejectedResult).reason as AbortError;
      expect(error).toBeInstanceOf(AbortError);
      expect(error.cause).toBe(reason);
      expect(r.attempts).toStrictEqual([1]);
      expect(vi.getTimerCount()).toBe(0);
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    });

    it('a pre-aborted signal → AbortError before the first attempt', async () => {
      const r = recorder();
      const reason = new Error('before');
      const done = pollUntil(r.fn, () => true, { signal: AbortSignal.abort(reason) });
      await expect(done).rejects.toBeInstanceOf(AbortError);
      await expect(done).rejects.toSatisfy((e: AbortError) => e.cause === reason);
      expect(r.attempts).toStrictEqual([]);
    });

    it('fn throwing NotFoundError → propagates at once, no retry, no timer', async () => {
      fake();
      let attempts = 0;
      const failure = new NotFoundError('gone');
      const done = pollUntil(
        () => {
          attempts += 1;
          return Promise.reject(failure);
        },
        () => true
      );
      await expect(done).rejects.toBe(failure);
      expect(attempts).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('isDone throwing → propagates at once', async () => {
      const failure = new Error('bad value');
      const done = pollUntil(
        () => Promise.resolve(1),
        () => {
          throw failure;
        }
      );
      await expect(done).rejects.toBe(failure);
    });

    it.each<[string, PollOptions, string]>([
      ['intervalMs -1', { intervalMs: -1 }, 'intervalMs'],
      ['intervalMs NaN', { intervalMs: NaN }, 'intervalMs'],
      ['intervalMs Infinity', { intervalMs: Infinity }, 'intervalMs'],
      ['maxIntervalMs a string', { maxIntervalMs: '5' as unknown as number }, 'maxIntervalMs'],
      ['backoff 0.5', { backoff: 0.5 }, 'backoff'],
      ['timeoutMs -1', { timeoutMs: -1 }, 'timeoutMs'],
      ['timeoutMs NaN', { timeoutMs: NaN }, 'timeoutMs'],
    ])('%s → ValidationError with status 0, fn never called', async (_name, options, detail) => {
      const r = recorder();
      const done = pollUntil(r.fn, () => true, options);
      await expect(done).rejects.toBeInstanceOf(ValidationError);
      await expect(done).rejects.toMatchObject({ status: 0, details: [detail] });
      expect(r.attempts).toStrictEqual([]);
    });

    it.each<[string, unknown, unknown, string]>([
      ['fn is not a function', 'fetch', () => true, 'fn'],
      ['isDone is not a function', () => Promise.resolve(1), true, 'isDone'],
    ])('%s → ValidationError', async (_name, fn, isDone, detail) => {
      const done = pollUntil(fn as () => Promise<number>, isDone as () => boolean);
      await expect(done).rejects.toMatchObject({
        status: 0,
        code: 'VALIDATION_ERROR',
        details: [detail],
      });
    });
  });
});
