/**
 * The base class of every resource: the typed transport as `this.transport` and the
 * context resolvers that apply the client's default context.
 *
 * @module client/resource
 */
import { checkLevel, type CallContext } from '../context';
import type { BaseClient } from './base';
import type { Transport } from './transport';

/**
 * Every resource extends it.
 *
 * Each resolver takes the per-call context (`options.namespace`, `options.venueId`, …) and falls back to the
 * client's default context; a per-call value that is `undefined`, `null` or `''` counts as not given. They throw
 * `ContextError` (status 0, before any request): problem `'missing'` when neither gives a value, `'invalid'` for a
 * malformed value (NaN, a float, a negative id, a string id from JavaScript).
 *
 * @example
 * ```typescript
 * class WidgetsResource extends ResourceBase {
 *   list(options?: CallContext & RequestOptions) {
 *     const { ctx, request } = splitCallOptions(options);
 *     return this.transport.request<Widget[]>('GET', '/widgets/{namespace}', {
 *       params: { namespace: this.ns(ctx) },
 *       ...request,
 *     });
 *   }
 * }
 * ```
 */
export abstract class ResourceBase {
  /** The client's transport (shared with its scoped clients). */
  protected readonly transport: Transport;

  /**
   * Public, so `new XResource(client)` keeps working; the client creates every resource, so the constructor is not
   * part of the documented surface.
   * @internal
   */
  constructor(protected readonly client: BaseClient) {
    this.transport = client.transport;
  }

  /**
   * The namespace: per-call, else the client default.
   * @throws {ContextError} problem `'missing'` when neither is set (`''` counts as not set), `'invalid'` for a
   *   non-string
   */
  protected ns(ctx?: CallContext): string {
    return this.client.requireNs(ctx);
  }

  /**
   * The venue id: per-call, else the client default; an integer `>= 0`.
   * @throws {ContextError} problem `'missing'` when neither is set, `'invalid'` otherwise
   */
  protected venueId(ctx?: CallContext): number {
    return this.client.requireVenue(ctx);
  }

  /**
   * The map id: per-call, else the client default; an integer `>= 0`.
   * @throws {ContextError} problem `'missing'` when neither is set, `'invalid'` otherwise
   */
  protected mapId(ctx?: CallContext): number {
    return this.client.requireMap(ctx);
  }

  /**
   * The floor level: per-call, else the client default, else `undefined`; an integer (negative levels are allowed).
   * @throws {ContextError} problem `'invalid'` for a value that is not an integer
   */
  protected level(ctx?: CallContext): number | undefined {
    const { level } = this.client.resolveCtx(ctx);
    return level === undefined ? undefined : checkLevel(level);
  }
}
