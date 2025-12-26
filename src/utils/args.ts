/**
 * Utilities for resolving method arguments to support both
 * legacy (explicit namespace) and new (context-based) calling patterns.
 * @module utils/args
 */

import type { CallContext } from '../context';
import { isNamespaceArg, isVenueIdArg } from '../context';
import type { BaseClient } from '../client/base';

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
 * - `method('ns', 123)` - explicit namespace and venueId (legacy)
 * - `method('ns', 123, { limit: 10 })` - explicit + options (legacy)
 * - `method({ namespace: 'ns', venueId: 123 })` - override in options
 *
 * @param client - The client instance (for context resolution)
 * @param arg1 - Either namespace string or options object
 * @param arg2 - Either venueId number or options object
 * @param arg3 - Options object (when arg1 is namespace and arg2 is venueId)
 */
export function resolveVenueArgs<T extends object>(
  client: BaseClient,
  arg1?: string | (T & CallContext),
  arg2?: number | T,
  arg3?: T
): ResolvedVenueArgs<T> {
  if (isNamespaceArg(arg1)) {
    // Legacy pattern: method('namespace', venueId, options?)
    if (!isVenueIdArg(arg2)) {
      throw new Error('venueId must be a number when namespace is provided as string');
    }
    return {
      namespace: arg1,
      venueId: arg2,
      options: arg3,
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
 * @param client - The client instance (for context resolution)
 * @param arg1 - Either namespace string or options object
 * @param arg2 - Either venueId number or options object
 * @param arg3 - Either mapId number or options object
 * @param arg4 - Options object (when all IDs are explicit)
 */
export function resolveMapArgs<T extends object>(
  client: BaseClient,
  arg1?: string | (T & CallContext),
  arg2?: number | T,
  arg3?: number | T,
  arg4?: T
): ResolvedMapArgs<T> {
  if (isNamespaceArg(arg1)) {
    // Legacy pattern: method('namespace', venueId, mapId, options?)
    if (!isVenueIdArg(arg2)) {
      throw new Error('venueId must be a number when namespace is provided as string');
    }
    if (!isVenueIdArg(arg3)) {
      throw new Error('mapId must be a number when namespace and venueId are provided');
    }
    return {
      namespace: arg1,
      venueId: arg2,
      mapId: arg3,
      options: arg4,
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

/**
 * Extract non-context properties from options object.
 * Removes namespace, venueId, mapId, level from options before passing to API.
 */
export function stripContextFromOptions<T extends object>(
  options: T & CallContext | undefined
): Omit<T, keyof CallContext> | undefined {
  if (!options) return undefined;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { namespace: _ns, venueId: _vid, mapId: _mid, level: _lvl, ...rest } = options as T & CallContext;
  return Object.keys(rest).length > 0 ? (rest as Omit<T, keyof CallContext>) : undefined;
}
