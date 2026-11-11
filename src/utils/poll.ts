/**
 * Waiting helpers.
 *
 * @internal
 * @module utils/poll
 */
import { AbortError, TimeoutError, ValidationError } from '../errors';

/** Options of {@link pollUntil}. */
export interface PollOptions {
  /** Wait after the first unsuccessful attempt, in ms (default 1 000). */
  intervalMs?: number;
  /** Upper bound of every wait, in ms (default 10 000). */
  maxIntervalMs?: number;
  /** Factor applied to the wait after each attempt (default 1.5; 1 = constant). */
  backoff?: number;
  /** Overall deadline in ms from the first attempt (default 60 000; `0` or `Infinity` = none). */
  timeoutMs?: number;
  /** Aborts the polling (before an attempt or during a wait) with `AbortError`. */
  signal?: AbortSignal;
}

function invalidOption(name: string, rule: string, value: unknown): ValidationError {
  return new ValidationError(
    `pollUntil: ${name} must be ${rule}, received ${String(value)}`,
    undefined,
    {
      status: 0,
      details: [name],
    }
  );
}

function option(
  options: PollOptions | undefined,
  name: Exclude<keyof PollOptions, 'signal'>,
  fallback: number,
  min: number
): number {
  const value: unknown = options?.[name];
  if (value === undefined) return fallback;
  const finite =
    typeof value === 'number' &&
    (Number.isFinite(value) || (name === 'timeoutMs' && value === Infinity));
  if (!finite || value < min) {
    const rule =
      name === 'timeoutMs' ? `a number >= ${min} or Infinity` : `a finite number >= ${min}`;
    throw invalidOption(name, rule, value);
  }
  return value;
}

function abortError(signal: AbortSignal): AbortError {
  return new AbortError(undefined, { cause: signal.reason });
}

/**
 * Calls `fn(attempt)` (attempt 1, 2, …) until `isDone(value)` is true and resolves with that value. Between attempts
 * it waits `intervalMs`, then `intervalMs × backoff`, … capped at `maxIntervalMs`; the last wait is shortened to end at
 * the deadline, where one more attempt is made. An error thrown by `fn` or `isDone` propagates at once. The deadline
 * is checked between attempts: an attempt in progress is not interrupted (give the request its own `timeoutMs` or
 * `signal`).
 *
 * @throws {TimeoutError} `'Polling timed out'` with `timeoutMs` and `body: { attempts, lastValue }` at the deadline
 * @throws {AbortError} when `signal` aborts (before an attempt or during a wait); `cause` = the signal's reason
 * @throws {ValidationError} status 0 for an invalid option (nothing is called)
 * @internal
 */
export async function pollUntil<T>(
  fn: (attempt: number) => Promise<T>,
  isDone: (value: T) => boolean,
  options?: PollOptions
): Promise<T> {
  if (typeof fn !== 'function') throw invalidOption('fn', 'a function', fn);
  if (typeof isDone !== 'function') throw invalidOption('isDone', 'a function', isDone);
  let interval = option(options, 'intervalMs', 1000, 0);
  const maxIntervalMs = option(options, 'maxIntervalMs', 10_000, 0);
  const backoff = option(options, 'backoff', 1.5, 1);
  const timeoutMs = option(options, 'timeoutMs', 60_000, 0);
  const signal = options?.signal;
  const deadline = timeoutMs > 0 ? Date.now() + timeoutMs : Infinity;
  let attempt = 0;
  const next = async (): Promise<T> => {
    if (signal?.aborted) throw abortError(signal);
    attempt += 1;
    return await fn(attempt);
  };
  let value = await next();
  while (!isDone(value)) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new TimeoutError('Polling timed out', {
        timeoutMs,
        body: { attempts: attempt, lastValue: value },
      });
    }
    // Every wait is capped at use, so the growing interval needs no cap of its own.
    await sleep(Math.min(interval, maxIntervalMs, remaining), signal);
    interval *= backoff;
    value = await next();
  }
  return value;
}

/**
 * Resolves after `ms` milliseconds. An abort of `signal`, before or during the wait, rejects with `AbortError`
 * (`cause` = the signal's reason) and clears the timer.
 *
 * @throws {ValidationError} status 0 when `ms` is not a finite number `>= 0`
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) {
    return Promise.reject(
      new ValidationError(
        `sleep needs a finite number of ms >= 0, received ${String(ms)}`,
        undefined,
        {
          status: 0,
          details: ['ms'],
        }
      )
    );
  }
  if (signal?.aborted) {
    return Promise.reject(new AbortError(undefined, { cause: signal.reason }));
  }
  return new Promise<void>((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new AbortError(undefined, { cause: signal?.reason }));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
