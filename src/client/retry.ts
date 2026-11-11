/**
 * Opt-in retry of idempotent requests: the `RetryPolicy` options and the retry loop the transport runs.
 *
 * @module client/retry
 */
import {
  AbortError,
  ContextError,
  NetworkError,
  ResponseParseError,
  RtlsError,
  StreamError,
  TimeoutError,
  ValidationError,
} from '../errors';
import { sleep } from '../utils/poll';
import type { HttpMethod } from './paths';

/**
 * When a failed request is tried again. Retries are off unless the client sets `retry: true` (these
 * defaults) or a policy object.
 *
 * @example
 * ```typescript
 * import { createRtlsClient } from 'ubudu-rtls-sdk';
 *
 * const client = createRtlsClient({
 *   apiKey: process.env.RTLS_API_KEY,
 *   retry: { retries: 3, methods: ['GET', 'PUT'] },
 * });
 * ```
 */
export interface RetryPolicy {
  /** Further attempts after the first; integer 0..10; default 2. */
  retries?: number;
  /** HTTP statuses that are retried; integers 400..599; default `[429, 502, 503, 504]`. */
  retryOn?: number[];
  /**
   * Methods that are retried; default `['GET']`. `PUT` and `DELETE` are opt-in. `POST` and `PATCH` are not
   * idempotent and are ignored here: a `POST` is retried only when the SDK marks that call as a read-only one.
   */
  methods?: HttpMethod[];
  /** Base of the exponential backoff in ms; default 300. */
  baseDelayMs?: number;
  /** Upper bound of one backoff delay in ms; default 10 000. */
  maxDelayMs?: number;
  /**
   * Longest `Retry-After` (ms) that is waited for; default 60 000. A longer one is not waited for: the error is
   * thrown at once.
   */
  maxRetryAfterMs?: number;
  /** Also retry `NetworkError` and `TimeoutError` on retryable methods; default `true`. */
  retryNetworkErrors?: boolean;
}

/** A validated policy with every default filled in. @internal */
export interface ResolvedRetryPolicy {
  retries: number;
  retryOn: readonly number[];
  methods: readonly HttpMethod[];
  baseDelayMs: number;
  maxDelayMs: number;
  maxRetryAfterMs: number;
  retryNetworkErrors: boolean;
}

/** The per-call retry option of `TransportOptions`. */
export type CallRetry = false | { idempotent: true };

const HTTP_METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
/** The methods a policy can retry (the idempotent ones). `POST` and `PATCH` in `methods` are accepted and dropped. */
const RETRYABLE_METHODS: readonly HttpMethod[] = ['GET', 'PUT', 'DELETE'];

const DEFAULTS: ResolvedRetryPolicy = {
  retries: 2,
  retryOn: [429, 502, 503, 504],
  methods: ['GET'],
  baseDelayMs: 300,
  maxDelayMs: 10_000,
  maxRetryAfterMs: 60_000,
  retryNetworkErrors: true,
};

function policyError(field: string, message: string): ValidationError {
  return new ValidationError(message, undefined, { status: 0, details: [field] });
}

function delayOption(value: unknown, field: string, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw policyError(field, `${field} must be a finite number >= 0`);
  }
  return value;
}

/**
 * Validates the client's `retry` option (ValidationError with status 0) and fills the defaults. `undefined` and
 * `false` → no retry; `true` → the defaults.
 * @internal
 */
export function resolveRetryPolicy(option: unknown): ResolvedRetryPolicy | undefined {
  if (option === undefined || option === false) return undefined;
  if (option === true) return DEFAULTS;
  if (typeof option !== 'object' || option === null || Array.isArray(option)) {
    throw policyError('retry', 'retry must be true, false or a RetryPolicy object');
  }
  const policy = option as RetryPolicy;

  const retries = policy.retries ?? DEFAULTS.retries;
  if (typeof retries !== 'number' || !Number.isInteger(retries) || retries < 0 || retries > 10) {
    throw policyError('retry.retries', 'retry.retries must be an integer from 0 to 10');
  }

  const retryOn = policy.retryOn ?? DEFAULTS.retryOn;
  if (
    !Array.isArray(retryOn) ||
    !retryOn.every(
      (s: unknown) => typeof s === 'number' && Number.isInteger(s) && s >= 400 && s <= 599
    )
  ) {
    throw policyError(
      'retry.retryOn',
      'retry.retryOn must be an array of integer statuses 400..599'
    );
  }

  const methods = policy.methods ?? DEFAULTS.methods;
  if (
    !Array.isArray(methods) ||
    !methods.every((m: unknown) => HTTP_METHODS.includes(m as HttpMethod))
  ) {
    throw policyError(
      'retry.methods',
      `retry.methods must be a subset of ${HTTP_METHODS.join(', ')}`
    );
  }

  const baseDelayMs = delayOption(policy.baseDelayMs, 'retry.baseDelayMs', DEFAULTS.baseDelayMs);
  const maxDelayMs = delayOption(policy.maxDelayMs, 'retry.maxDelayMs', DEFAULTS.maxDelayMs);
  const maxRetryAfterMs = delayOption(
    policy.maxRetryAfterMs,
    'retry.maxRetryAfterMs',
    DEFAULTS.maxRetryAfterMs
  );
  if (baseDelayMs > maxDelayMs) {
    throw policyError('retry.baseDelayMs', 'retry.baseDelayMs must not exceed retry.maxDelayMs');
  }

  const retryNetworkErrors = policy.retryNetworkErrors ?? DEFAULTS.retryNetworkErrors;
  if (typeof retryNetworkErrors !== 'boolean') {
    throw policyError('retry.retryNetworkErrors', 'retry.retryNetworkErrors must be a boolean');
  }

  return {
    retries,
    retryOn: [...retryOn],
    methods: methods.filter((m) => RETRYABLE_METHODS.includes(m)),
    baseDelayMs,
    maxDelayMs,
    maxRetryAfterMs,
    retryNetworkErrors,
  };
}

/**
 * Validates the per-call `retry` option: absent, `false` or `{ idempotent: true }`.
 * @internal
 */
export function checkCallRetry(value: unknown): CallRetry | undefined {
  if (value === undefined || value === false) return value;
  if (
    typeof value === 'object' &&
    value !== null &&
    (value as { idempotent?: unknown }).idempotent === true
  ) {
    return { idempotent: true };
  }
  throw policyError('retry', 'the per-call retry option must be false or { idempotent: true }');
}

/** Errors that are never retried, whatever the policy. */
function neverRetried(error: RtlsError): boolean {
  return (
    error instanceof AbortError ||
    error instanceof ResponseParseError ||
    error instanceof StreamError ||
    error instanceof ContextError ||
    (error instanceof ValidationError && error.status === 0)
  );
}

/** `true` when the policy retries this error (attempts left are checked by the caller). @internal */
export function isRetryableError(error: unknown, policy: ResolvedRetryPolicy): boolean {
  if (!RtlsError.is(error) || neverRetried(error)) return false;
  if (error instanceof NetworkError || error instanceof TimeoutError) {
    return policy.retryNetworkErrors;
  }
  return policy.retryOn.includes(error.status);
}

/**
 * Delay before attempt `attempt + 1`: the error's `retryAfter` when set (`undefined` when it exceeds
 * `maxRetryAfterMs`: the error is thrown instead), else full jitter
 * `Math.random() * min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1))`.
 * @internal
 */
export function retryDelay(
  error: unknown,
  attempt: number,
  policy: ResolvedRetryPolicy
): number | undefined {
  const retryAfter = RtlsError.is(error) ? error.retryAfter : undefined;
  if (retryAfter !== undefined) {
    return retryAfter > policy.maxRetryAfterMs ? undefined : retryAfter;
  }
  return Math.random() * Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1));
}

/**
 * Runs `attempt` and retries it under `policy`: only when the policy is enabled, the call did not pass
 * `retry: false`, the method is in `methods` (or the call passed `retry: { idempotent: true }`), the error is
 * retryable and attempts are left. The delay is waited with `sleep(ms, signal)`, so an abort during the wait throws
 * `AbortError` and no further attempt is made.
 * @internal
 */
export async function withRetry<T>(
  policy: ResolvedRetryPolicy | undefined,
  call: { method: HttpMethod; retry?: CallRetry; signal?: AbortSignal },
  attempt: () => Promise<T>
): Promise<T> {
  if (policy === undefined || call.retry === false) return await attempt();
  const idempotent = call.retry?.idempotent === true;
  if (!idempotent && !policy.methods.includes(call.method)) return await attempt();
  const run = async (n: number): Promise<T> => {
    try {
      return await attempt();
    } catch (error) {
      if (n > policy.retries || !isRetryableError(error, policy)) throw error;
      const delay = retryDelay(error, n, policy);
      if (delay === undefined) throw error;
      await sleep(delay, call.signal);
    }
    return await run(n + 1);
  };
  return await run(1);
}
