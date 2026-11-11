/**
 * Utilities for resolving method arguments to support both
 * legacy (explicit namespace) and new (context-based) calling patterns.
 * @module utils/args
 */

import type { CallContext } from '../context';
import { checkMapId, checkVenueId, isNamespaceArg } from '../context';
import type { BaseClient, RequestOptions } from '../client/base';

/**
 * Result of resolving namespace-based method arguments.
 */
export interface ResolvedNamespaceArgs<T> {
  namespace: string;
  options: T | undefined;
}

/**
 * Result of resolving namespace + venueId method arguments.
 */
export interface ResolvedVenueArgs<T> {
  namespace: string;
  venueId: number;
  options: T | undefined;
}

/**
 * Result of resolving namespace + venueId + mapId method arguments.
 */
export interface ResolvedMapArgs<T> {
  namespace: string;
  venueId: number;
  mapId: number;
  options: T | undefined;
}

const CONTEXT_KEYS: readonly string[] = ['namespace', 'venueId', 'mapId', 'level'];
const REQUEST_KEYS: readonly string[] = ['signal', 'timeoutMs', 'headers'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A positional id of the legacy form: a number is validated (integer `>= 0`), a string of digits becomes a number
 * (0.2.0 resources did `Number(arg)`); anything else is `ContextError` problem `'invalid'`.
 */
function legacyId(value: unknown, field: 'Venue ID' | 'Map ID'): number {
  const id = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return field === 'Venue ID' ? checkVenueId(id) : checkMapId(id);
}

/**
 * Reads the positional ids of the legacy form `(client, 'ns', id1?, id2?, …, options?)`. Each position holds an
 * id (number or digit string), `undefined` (the id then comes from the options bag or the client context), or a
 * plain object, which is the options bag (every later id then comes from it or the client context).
 */
function legacyPositions(
  positions: readonly unknown[],
  fields: readonly ('Venue ID' | 'Map ID')[],
  trailing: unknown
): { ids: (number | undefined)[]; bag: unknown } {
  const ids: (number | undefined)[] = [];
  for (let i = 0; i < fields.length; i++) {
    const value = positions[i];
    if (isPlainObject(value)) return { ids, bag: value };
    ids.push(value === undefined ? undefined : legacyId(value, fields[i] as 'Venue ID' | 'Map ID'));
  }
  return { ids, bag: trailing };
}

/**
 * Resolve arguments for methods that require namespace.
 *
 * Supports:
 * - `method()` - uses client default namespace
 * - `method({ limit: 10 })` - uses client default namespace + options
 * - `method('ns')` - explicit namespace (legacy)
 * - `method('ns', { limit: 10 })` - explicit namespace + options (legacy)
 * - `method({ namespace: 'ns', limit: 10 })` - override namespace in options
 *
 * @param client - The client instance (for context resolution)
 * @param arg1 - Either namespace string or options object
 * @param arg2 - Options object (when arg1 is namespace)
 * @throws {ContextError} When no namespace is available
 */
export function resolveNamespaceArgs<T extends object>(
  client: BaseClient,
  arg1?: string | (T & CallContext),
  arg2?: T
): ResolvedNamespaceArgs<T> {
  if (isNamespaceArg(arg1)) {
    // Legacy pattern: method('namespace', options?)
    return {
      namespace: arg1,
      options: arg2,
    };
  }

  // New pattern: method(options?) where namespace comes from context
  const ctx = arg1 as (T & CallContext) | undefined;
  return {
    namespace: client.requireNs(ctx),
    options: ctx as T | undefined,
  };
}

/**
 * Resolve arguments for methods that require namespace and venueId.
 *
 * Supports:
 * - `method()` - uses client defaults
 * - `method({ limit: 10 })` - uses client defaults + options
 * - `method('ns', 123)` - explicit namespace and venueId (legacy); `'123'` (digits) is read as 123
 * - `method('ns', 123, { limit: 10 })` - explicit + options (legacy)
 * - `method('ns')`, `method('ns', { venueId: 9, limit: 10 })` - legacy namespace, venueId from the options or the
 *   client context
 * - `method({ namespace: 'ns', venueId: 123 })` - override in options
 *
 * @param client - The client instance (for context resolution)
 * @param arg1 - Either namespace string or options object
 * @param arg2 - Either venueId (number or digit string) or options object
 * @param arg3 - Options object (when arg1 is namespace and arg2 is venueId)
 * @throws {ContextError} problem `'missing'` when no venueId is available, `'invalid'` for a malformed one
 *   (`NaN`, `'4.5'`, `'x'`, `-1`, `null`); never a request with a bad id
 */
export function resolveVenueArgs<T extends object>(
  client: BaseClient,
  arg1?: string | (T & CallContext),
  arg2?: number | string | T,
  arg3?: T
): ResolvedVenueArgs<T> {
  if (isNamespaceArg(arg1)) {
    const { ids, bag } = legacyPositions([arg2], ['Venue ID'], arg3);
    const options = bag as (T & CallContext) | undefined;
    return {
      namespace: arg1,
      venueId: ids[0] ?? client.requireVenue(options),
      options,
    };
  }

  // New pattern: method(options?) where namespace/venueId come from context
  const ctx = arg1 as (T & CallContext) | undefined;
  return {
    namespace: client.requireNs(ctx),
    venueId: client.requireVenue(ctx),
    options: ctx as T | undefined,
  };
}

/**
 * Resolve arguments for methods that require namespace, venueId, and mapId.
 *
 * The legacy form `method('ns', venueId, mapId, options?)` accepts numbers or digit strings for both ids; an id
 * that is `undefined`, or an options object in its place, comes from the options or the client context.
 *
 * @param client - The client instance (for context resolution)
 * @param arg1 - Either namespace string or options object
 * @param arg2 - Either venueId or options object
 * @param arg3 - Either mapId or options object
 * @param arg4 - Options object (when all IDs are explicit)
 * @throws {ContextError} problem `'missing'` or `'invalid'`, as for {@link resolveVenueArgs}
 */
export function resolveMapArgs<T extends object>(
  client: BaseClient,
  arg1?: string | (T & CallContext),
  arg2?: number | string | T,
  arg3?: number | string | T,
  arg4?: T
): ResolvedMapArgs<T> {
  if (isNamespaceArg(arg1)) {
    const { ids, bag } = legacyPositions([arg2, arg3], ['Venue ID', 'Map ID'], arg4);
    const options = bag as (T & CallContext) | undefined;
    return {
      namespace: arg1,
      venueId: ids[0] ?? client.requireVenue(options),
      mapId: ids[1] ?? client.requireMap(options),
      options,
    };
  }

  // New pattern: method(options?) where all IDs come from context
  const ctx = arg1 as (T & CallContext) | undefined;
  return {
    namespace: client.requireNs(ctx),
    venueId: client.requireVenue(ctx),
    mapId: client.requireMap(ctx),
    options: ctx as T | undefined,
  };
}

/** Merges two header maps; `override` wins per header name, compared without case. */
function mergeHeaders(
  base: Record<string, string> | undefined,
  override: Record<string, string>
): Record<string, string> {
  const merged: Record<string, string> = { ...base };
  for (const [name, value] of Object.entries(override)) {
    for (const existing of Object.keys(merged)) {
      if (existing.toLowerCase() === name.toLowerCase()) delete merged[existing];
    }
    merged[name] = value;
  }
  return merged;
}

/**
 * Splits a method's options bag (its last parameter) into the call context (`namespace`, `venueId`, `mapId`,
 * `level`), the request options (`signal`, `timeoutMs`, `headers`) and the rest, which keeps every other key with
 * its value (`undefined` included). The input is not mutated.
 *
 * `trailing` is the 0.2.0 trailing `requestOptions` argument of the two-object form `(options?, requestOptions?)`:
 * its keys win over the request keys of `options`, and the `headers` of both are merged with the trailing value
 * winning per header (names compared without case).
 *
 * @example
 * ```typescript
 * const { ctx, request, rest } = splitCallOptions({ namespace: 'ns', timeoutMs: 5, limit: 10 });
 * // ctx { namespace: 'ns' }, request { timeoutMs: 5 }, rest { limit: 10 }
 * ```
 */
export function splitCallOptions<T extends object>(
  options?: T & CallContext & RequestOptions,
  trailing?: RequestOptions
): {
  ctx: CallContext;
  request: RequestOptions;
  rest: Omit<T, keyof CallContext | keyof RequestOptions>;
} {
  const ctx: Record<string, unknown> = {};
  const request: RequestOptions = {};
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(options ?? {})) {
    if (CONTEXT_KEYS.includes(key)) {
      if (value !== undefined) ctx[key] = value;
    } else if (REQUEST_KEYS.includes(key)) {
      if (value !== undefined) Object.assign(request, { [key]: value });
    } else {
      rest[key] = value;
    }
  }
  if (trailing) {
    if (trailing.signal !== undefined) request.signal = trailing.signal;
    if (trailing.timeoutMs !== undefined) request.timeoutMs = trailing.timeoutMs;
    if (trailing.headers !== undefined) {
      request.headers = mergeHeaders(request.headers, trailing.headers);
    }
  }
  return {
    ctx: ctx as CallContext,
    request,
    rest: rest as Omit<T, keyof CallContext | keyof RequestOptions>,
  };
}

/**
 * Extract non-context properties from options object.
 * Removes namespace, venueId, mapId, level from options before passing to API.
 *
 * @deprecated since 0.3.0 — use {@link splitCallOptions}, which also separates the request options.
 */
export function stripContextFromOptions<T extends object>(
  options: (T & CallContext) | undefined
): Omit<T, keyof CallContext> | undefined {
  if (!options) return undefined;
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(options)) {
    if (!CONTEXT_KEYS.includes(key)) rest[key] = value;
  }
  return Object.keys(rest).length > 0 ? (rest as Omit<T, keyof CallContext>) : undefined;
}
