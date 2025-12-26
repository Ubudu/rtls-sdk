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

/**
 * Merge call-time context overrides with client defaults.
 * Override values take precedence; undefined overrides fall back to defaults.
 *
 * @param defaults - Default context from client configuration
 * @param overrides - Per-call context overrides
 * @returns Merged context
 */
export function resolveContext(defaults: RtlsContext, overrides?: CallContext): RtlsContext {
  if (!overrides) {
    return { ...defaults };
  }
  return {
    namespace: overrides.namespace ?? defaults.namespace,
    venueId: overrides.venueId ?? defaults.venueId,
    mapId: overrides.mapId ?? defaults.mapId,
    level: overrides.level ?? defaults.level,
  };
}

/**
 * Error thrown when a required context value is missing.
 */
export class ContextError extends Error {
  constructor(
    public readonly field: string,
    public readonly suggestion: string
  ) {
    super(`${field} is required. ${suggestion}`);
    this.name = 'ContextError';
  }
}

/**
 * Assert that namespace is present in context.
 * @throws {ContextError} If namespace is not set
 */
export function requireNamespace(context: RtlsContext): ResolvedNamespaceContext {
  if (!context.namespace) {
    throw new ContextError(
      'Namespace',
      'Pass it to the method, set via createRtlsClient({ namespace: "..." }), or call client.setNamespace("...")'
    );
  }
  return context as ResolvedNamespaceContext;
}

/**
 * Assert that venueId is present in context.
 * @throws {ContextError} If venueId is not set
 */
export function requireVenueId(context: RtlsContext): ResolvedVenueContext {
  if (context.venueId === undefined) {
    throw new ContextError(
      'Venue ID',
      'Pass it to the method, set via createRtlsClient({ venueId: ... }), or call client.setVenue(...)'
    );
  }
  return context as ResolvedVenueContext;
}

/**
 * Assert that mapId is present in context.
 * @throws {ContextError} If mapId is not set
 */
export function requireMapId(context: RtlsContext): ResolvedMapContext {
  if (context.mapId === undefined) {
    throw new ContextError(
      'Map ID',
      'Pass it to the method, set via createRtlsClient({ mapId: ... }), or call client.setMap(...)'
    );
  }
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
