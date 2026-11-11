/**
 * Query-string rules shared by the transport and `buildQueryParams`.
 *
 * Insertion order is kept; `undefined` and `null` are skipped; booleans become `'true'` / `'false'`; finite numbers
 * `String(n)`; a `Date` its epoch milliseconds; an array its elements joined with `,` (an empty array is skipped). A
 * non-finite number, an invalid `Date` and a plain object (or any other value) throw `ValidationError` with
 * status 0, before any request is sent. A key is never repeated.
 *
 * @module utils/query
 */
import { ValidationError } from '../errors';
import type { QueryOptions } from '../types';

/** A value the query serializer accepts. */
export type QueryValue =
  string | number | boolean | Date | readonly (string | number | boolean)[] | null | undefined;

function invalid(key: string, what: string): ValidationError {
  return new ValidationError(`Query parameter "${key}" ${what}`, undefined, {
    status: 0,
    details: [key],
  });
}

function scalar(key: string, value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw invalid(key, `must be a finite number, not ${value}`);
    return String(value);
  }
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) {
    const ms = value.getTime();
    if (!Number.isFinite(ms)) throw invalid(key, 'is an invalid Date');
    return String(ms);
  }
  const kind = value === null ? 'null' : Array.isArray(value) ? 'a nested array' : typeof value;
  throw invalid(key, `cannot be sent as a query value (${kind})`);
}

/**
 * The query entries as sent, `[key, value]` with unencoded strings, in insertion order. Skipped entries are absent.
 * @internal
 */
export function queryEntries(query: Record<string, unknown> | undefined): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  if (!query) return entries;
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      entries.push([key, value.map((element: unknown) => scalar(key, element)).join(',')]);
      continue;
    }
    entries.push([key, scalar(key, value)]);
  }
  return entries;
}

/** `encodeURIComponent` with `:` kept readable (filter keys such as `data.flag:eq`). */
function encodeKey(key: string): string {
  return encodeURIComponent(key).replace(/%3A/gi, ':');
}

/**
 * The encoded query string (without `?`), `''` when nothing is sent. Keys keep `:`; values are fully encoded.
 * @internal
 */
export function serializeQuery(query: Record<string, unknown> | undefined): string {
  return queryEntries(query)
    .map(([key, value]) => `${encodeKey(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

/**
 * Query parameters as a string map: every defined key is forwarded (`key`, `value`, `level`, filter keys such as
 * `'name:contains'`, `page`, …), arrays such as `sort` and `fields` joined with `,`, dates as epoch milliseconds.
 * An object value throws `ValidationError` (status 0).
 *
 * @example
 * ```typescript
 * import { buildQueryParams } from 'ubudu-rtls-sdk';
 *
 * buildQueryParams({ key: 'user_udid', value: 'aabbccddeeff', sort: ['name:asc', 'date:desc'] });
 * // { key: 'user_udid', value: 'aabbccddeeff', sort: 'name:asc,date:desc' }
 * ```
 */
export function buildQueryParams(
  options?: QueryOptions & Record<string, unknown>
): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of queryEntries(options)) params[key] = value;
  return params;
}
