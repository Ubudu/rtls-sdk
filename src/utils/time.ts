/**
 * Time helpers: timestamps accept `Date | number | string` and are sent as epoch
 * milliseconds; a time range that is not given defaults to the last 24 hours.
 *
 * @module utils/time
 */
import { ValidationError } from '../errors';

/** A point in time: a `Date`, epoch milliseconds, or a string (digits = epoch ms, otherwise a date string). */
export type TimeInput = Date | number | string;

/** The default window of {@link resolveTimeRange}: 24 hours. */
const DAY_MS = 86_400_000;
const DIGITS = /^-?\d+$/;

function invalid(message: string, detail: string): ValidationError {
  return new ValidationError(message, undefined, { status: 0, details: [detail] });
}

function shown(input: unknown): string {
  if (typeof input === 'string') return JSON.stringify(input.slice(0, 40));
  if (input instanceof Date) return 'an invalid Date';
  return String(input);
}

function epochMs(input: unknown, name: string): number {
  let ms = NaN;
  if (input instanceof Date) ms = input.getTime();
  else if (typeof input === 'number') ms = input;
  else if (typeof input === 'string') ms = DIGITS.test(input) ? Number(input) : Date.parse(input);
  if (!Number.isFinite(ms)) {
    throw invalid(
      `${name} must be a valid Date, a finite number of epoch milliseconds or a date string, not ${shown(input)}`,
      name
    );
  }
  return ms;
}

/**
 * Epoch milliseconds of a point in time: a `Date` → `getTime()`; a finite number → as it is (milliseconds); a string
 * of digits (optionally negative) → that number; any other string → `Date.parse` (ISO 8601 recommended).
 *
 * @throws {ValidationError} status 0 for an invalid `Date`, a non-finite number or an unparsable string
 * @example
 * ```typescript
 * import { toEpochMs } from 'ubudu-rtls-sdk';
 *
 * toEpochMs(new Date('2024-06-21T15:16:50Z')); // 1718983010000
 * toEpochMs('1718983010000');                   // 1718983010000
 * toEpochMs('2024-06-21T15:16:50Z');            // 1718983010000
 * ```
 */
export function toEpochMs(input: TimeInput): number {
  return epochMs(input, 'time');
}

function optionalNumber(value: unknown, name: string, fallback: number, min?: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || (min !== undefined && value < min)) {
    const rule = min === undefined ? 'a finite number' : `a finite number >= ${min}`;
    throw invalid(`resolveTimeRange: ${name} must be ${rule}, not ${String(value)}`, name);
  }
  return value;
}

/**
 * A closed time range in epoch milliseconds, with these defaults: both bounds given → as given; only
 * `from` → `to` = now; only `to` → `from` = `to` − the window; neither → the last window up to now. A bound that is
 * `undefined` or `null` counts as not given. `from === to` is allowed.
 *
 * Callers that need epoch-ms strings use `String(from)` / `String(to)`.
 *
 * @param options.defaultWindowMs the window when a bound is missing, default 86 400 000 (24 h)
 * @param options.now the current time in epoch ms, default `Date.now()`
 * @throws {ValidationError} status 0 for an invalid bound or option, or when `from` is after `to`
 * @internal
 */
export function resolveTimeRange(
  range: { from?: TimeInput; to?: TimeInput },
  options?: { defaultWindowMs?: number; now?: number }
): { from: number; to: number } {
  if (range === null || typeof range !== 'object') {
    throw invalid('resolveTimeRange needs an object { from?, to }', 'range');
  }
  const windowMs = optionalNumber(options?.defaultWindowMs, 'defaultWindowMs', DAY_MS, 0);
  const now = optionalNumber(options?.now, 'now', Date.now());
  const hasFrom = range.from !== undefined && range.from !== null;
  const hasTo = range.to !== undefined && range.to !== null;
  const to = hasTo ? epochMs(range.to, 'to') : now;
  const from = hasFrom ? epochMs(range.from, 'from') : to - windowMs;
  if (from > to) {
    throw invalid(`resolveTimeRange: from (${from}) is after to (${to})`, 'from');
  }
  return { from, to };
}
