/**
 * Context module for managing default parameters across SDK calls.
 * @module context
 */

/**
 * Default context values configurable at client creation.
 * These values are used as defaults for all API calls.
 */
export interface RtlsContext {
  /** Default application namespace for all requests */
  namespace?: string;
  /** Default venue ID for venue-scoped requests */
  venueId?: number;
  /** Default map ID for map-scoped requests */
  mapId?: number;
  /** Default floor level for spatial queries */
  level?: number;
}

/**
 * Context that can be passed to individual API calls to override defaults.
 * Same shape as RtlsContext but semantically used for per-call overrides.
 */
export type CallContext = RtlsContext;

/**
 * Resolved context with namespace guaranteed (required for most API calls).
 */
export interface ResolvedNamespaceContext extends RtlsContext {
  namespace: string;
}

/**
 * Resolved context with venueId guaranteed.
 */
export interface ResolvedVenueContext extends RtlsContext {
  venueId: number;
}

/**
 * Resolved context with mapId guaranteed.
 */
export interface ResolvedMapContext extends RtlsContext {
  mapId: number;
}

import { ContextError } from './errors';

/** Error thrown when a required context value is missing or invalid (declared in `errors.ts`). */
export { ContextError };

const NAMESPACE_HINT =
  'Pass it to the method, set via createRtlsClient({ namespace: "..." }), or call client.setNamespace("...")';
const VENUE_HINT =
  'Pass it to the method, set via createRtlsClient({ venueId: ... }), or call client.setVenue(...)';
const MAP_HINT =
  'Pass it to the method, set via createRtlsClient({ mapId: ... }), or call client.setMap(...)';

const CONTEXT_KEYS = ['namespace', 'venueId', 'mapId', 'level'] as const;

/** `undefined`, `null` or `''`: the override is absent and the default applies. */
function isUnset(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function received(value: unknown): string {
  if (typeof value === 'string') return `the string ${JSON.stringify(value.slice(0, 40))}`;
  if (typeof value === 'number') return String(value);
  if (value === null) return 'null';
  return typeof value;
}

/**
 * Merge call-time context overrides with client defaults. An override that is `undefined`, `null` or `''` falls
 * back to the default; any other value wins (it is validated where it is used).
 *
 * @param defaults - Default context from client configuration
 * @param overrides - Per-call context overrides
 * @returns Merged context
 */
export function resolveContext(defaults: RtlsContext, overrides?: CallContext): RtlsContext {
  if (!overrides) {
    return { ...defaults };
  }
  const merged: RtlsContext = {};
  for (const key of CONTEXT_KEYS) {
    const value = isUnset(overrides[key]) ? defaults[key] : overrides[key];
    Object.assign(merged, { [key]: value });
  }
  return merged;
}

/**
 * Validates a venue id: an integer `>= 0`.
 * @throws {ContextError} problem `'invalid'` otherwise (NaN, a float, a negative number, `null`, a string)
 * @internal
 */
export function checkVenueId(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  throw new ContextError(
    'Venue ID',
    `Pass a non-negative integer (received ${received(value)})`,
    'invalid'
  );
}

/**
 * Validates a map id: an integer `>= 0`.
 * @throws {ContextError} problem `'invalid'` otherwise
 * @internal
 */
export function checkMapId(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  throw new ContextError(
    'Map ID',
    `Pass a non-negative integer (received ${received(value)})`,
    'invalid'
  );
}

/**
 * Validates a floor level: an integer (negative levels are allowed).
 * @throws {ContextError} problem `'invalid'` otherwise
 * @internal
 */
export function checkLevel(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  throw new ContextError(
    'Level',
    `Pass an integer floor level (received ${received(value)})`,
    'invalid'
  );
}

/**
 * Validates a namespace: a string (an empty string counts as "not set" where it is required).
 * @throws {ContextError} problem `'invalid'` for a non-string
 * @internal
 */
export function checkNamespace(value: unknown): string {
  if (typeof value === 'string') return value;
  throw new ContextError('Namespace', `Pass a string (received ${received(value)})`, 'invalid');
}

/**
 * Applies a context patch (`setContext`, `withContext`, the constructor): a key **present** with `undefined` or
 * `null` clears the value, an absent key keeps it, any other value is validated (`ContextError` problem
 * `'invalid'`). Returns a new object; `base` is not changed.
 * @internal
 */
export function patchContext(
  base: RtlsContext,
  patch: { [K in keyof RtlsContext]?: RtlsContext[K] | null } | null | undefined
): RtlsContext {
  const next: RtlsContext = { ...base };
  if (!patch) return next;
  for (const key of CONTEXT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    const value: unknown = patch[key];
    if (value === undefined || value === null) {
      delete next[key];
    } else if (key === 'namespace') {
      next.namespace = checkNamespace(value);
    } else if (key === 'venueId') {
      next.venueId = checkVenueId(value);
    } else if (key === 'mapId') {
      next.mapId = checkMapId(value);
    } else {
      next.level = checkLevel(value);
    }
  }
  return next;
}

/**
 * Assert that namespace is present in context.
 * @throws {ContextError} If namespace is not set (`undefined`, `null`, `''`), or problem `'invalid'` for a
 *   non-string
 */
export function requireNamespace(context: RtlsContext): ResolvedNamespaceContext {
  if (isUnset(context.namespace)) {
    throw new ContextError('Namespace', NAMESPACE_HINT);
  }
  checkNamespace(context.namespace);
  return context as ResolvedNamespaceContext;
}

/**
 * Assert that venueId is present in context and is an integer `>= 0`.
 * @throws {ContextError} If venueId is not set, or problem `'invalid'` for NaN, a float, a negative number, `null`
 *   or a string
 */
export function requireVenueId(context: RtlsContext): ResolvedVenueContext {
  if (context.venueId === undefined) {
    throw new ContextError('Venue ID', VENUE_HINT);
  }
  checkVenueId(context.venueId);
  return context as ResolvedVenueContext;
}

/**
 * Assert that mapId is present in context and is an integer `>= 0`.
 * @throws {ContextError} If mapId is not set, or problem `'invalid'` for NaN, a float, a negative number, `null` or
 *   a string
 */
export function requireMapId(context: RtlsContext): ResolvedMapContext {
  if (context.mapId === undefined) {
    throw new ContextError('Map ID', MAP_HINT);
  }
  checkMapId(context.mapId);
  return context as ResolvedMapContext;
}

/**
 * Type guard to check if first argument is a string (namespace) or options object.
 */
export function isNamespaceArg(arg: unknown): arg is string {
  return typeof arg === 'string';
}

/**
 * Type guard to check if first argument is a number (venueId).
 */
export function isVenueIdArg(arg: unknown): arg is number {
  return typeof arg === 'number';
}
