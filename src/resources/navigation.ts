/**
 * Indoor navigation (`client.navigation`): routes, multi-stop tours, nearest POI and evacuation routes over a
 * venue's path graph.
 *
 * Every call needs a `venueId` (per call or the client default): without one rtls-api routes on a bundled sample
 * graph and still reports `dataSource: 'real'` (USI-P4-7), so the SDK always sends it.
 *
 * @module resources/navigation
 */
import type { RequestOptions } from '../client/base';
import { ResourceBase } from '../client/resource';
import type { CallContext } from '../context';
import { ValidationError } from '../errors';
import type {
  AccessiblePathRequest,
  EvacuationRouteResult,
  MultiStopRequest,
  MultiStopRouteResult,
  NearestPoiOptions,
  NearestPoiResult,
  NodeId,
  RouteResult,
  ShortestPathRequest,
} from '../types/navigation';
import { splitCallOptions } from '../utils/args';

export type {
  ShortestPathRequest,
  AccessiblePathRequest,
  MultiStopRequest,
} from '../types/navigation';

/** A coordinate endpoint as sent on the wire. */
interface WirePoint {
  lat: number;
  lon: number;
  level?: number;
}

/** An endpoint as sent on the wire: a node id as a string, or a point. */
type WireEndpoint = string | WirePoint;

/** Client-side argument error: status 0, nothing sent. */
function invalid(message: string, key: string): ValidationError {
  return new ValidationError(message, undefined, { status: 0, details: [key] });
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A node id: a non-blank string or a finite number, sent as `String(id)` (so `0` is `'0'`). */
function encodeNodeId(value: unknown, key: string): string {
  const ok =
    typeof value === 'number'
      ? Number.isFinite(value)
      : typeof value === 'string' && value.trim() !== '';
  if (!ok) throw invalid(`${key} must be a non-blank string or a finite number`, key);
  return String(value);
}

/**
 * A route endpoint: a node id, or a point `{ lat, lon, level? }` whose missing `level` comes from the resolved
 * context. `start` is true for the start of shortest/accessible path: rtls-api reads a start point whose `lat` or
 * `lon` is exactly 0 as a node id and fails (USI-P4-11), so it is refused here.
 */
function encodeEndpoint(
  value: unknown,
  key: string,
  ctxLevel: number | undefined,
  start: boolean
): WireEndpoint {
  if (typeof value === 'string' || typeof value === 'number') return encodeNodeId(value, key);
  if (!isObject(value) || !('lat' in value) || !('lon' in value)) {
    throw invalid(`${key} must be a node id or a point { lat, lon, level? }`, key);
  }
  const { lat, lon } = value;
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw invalid(`${key}.lat must be a finite number between -90 and 90`, key);
  }
  if (typeof lon !== 'number' || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw invalid(`${key}.lon must be a finite number between -180 and 180`, key);
  }
  const level: unknown = ('level' in value ? value.level : undefined) ?? ctxLevel;
  if (level !== undefined && !(typeof level === 'number' && Number.isInteger(level))) {
    throw invalid(`${key}.level must be an integer`, key);
  }
  if (start && (lat === 0 || lon === 0)) {
    throw invalid(
      `${key}: rtls-api cannot route from a start coordinate whose latitude or longitude is exactly 0; ` +
        'use a node id or a point off the equator and the prime meridian',
      key
    );
  }
  return level === undefined ? { lat, lon } : { lat, lon, level };
}

/** `walkingSpeed`: absent, or a finite number > 0 (the server silently replaces 0 by 1.2). */
function checkWalkingSpeed(value: unknown): number | undefined {
  if (value === undefined || (typeof value === 'number' && Number.isFinite(value) && value > 0)) {
    return value;
  }
  throw invalid('walkingSpeed must be a finite number > 0', 'walkingSpeed');
}

function checkRequest(request: unknown): void {
  if (!isObject(request)) throw invalid('request must be an object', 'request');
}

/**
 * Navigation over a venue's path graph. Routing is always A* on the server, whatever the spec's options say
 * (USI-P4-9). Route node ids come back as numbers for path nodes and `null` for POI nodes.
 */
export class NavigationResource extends ResourceBase {
  /**
   * The shortest route between two endpoints (`POST /spatial/navigate/{ns}/shortest-path`).
   *
   * An endpoint is a node id (sent as a string) or a point `{ lat, lon, level? }` (`lon`, not `lng`); a point
   * snaps to the nearest active node within 100 m on its level (missing `level`: the call's, else the client's).
   * The call is a read-only computation and is retried under the client's retry policy.
   *
   * Errors: 400 `{ error: 'Missing required parameters: …' }` → `ValidationError`; 404 `{ success: false,
   * message: 'No path found between nodes' | 'No node found near start position (…)' }` → `NotFoundError` (its
   * `body` is a `NavigationFailureBody`); 500 `{ error: 'Start node <id> not found' | 'End node <id> not found' }`
   * → `ServerError` (the spec says 400, USI-P4-10); 401 → `AuthenticationError`.
   *
   * Limitations: a start point with a latitude or longitude of exactly 0 cannot be routed by rtls-api (USI-P4-11),
   * so it is refused locally; snapping can intermittently fail for valid input: retry such a call once (USI-P4-17).
   *
   * @param request `start`, `end`, optional `walkingSpeed` (m/s, > 0) and `returnToStart`
   * @param options per-call `namespace`, `venueId` (mandatory: per call or client default), `level`, request options
   * @throws {ContextError} no namespace or venue (nothing is sent)
   * @throws {ValidationError} status 0 for an invalid endpoint or `walkingSpeed` (nothing is sent)
   * @example
   * ```typescript
   * import { createRtlsClient } from 'ubudu-rtls-sdk';
   *
   * const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace', venueId: 42 });
   * const route = await client.navigation.shortestPath({ start: 101, end: { lat: 48.85, lon: 2.35, level: 0 } });
   * console.log(route.distance, route.estimatedTime, route.path.length);
   * ```
   */
  async shortestPath(
    request: ShortestPathRequest,
    options?: CallContext & RequestOptions
  ): Promise<RouteResult> {
    return await this.postRoute('shortest-path', request, options);
  }

  /**
   * A route with the wheelchair profile (`POST /spatial/navigate/{ns}/accessible-path`). Same request and result
   * as {@link NavigationResource.shortestPath}.
   *
   * **No accessibility guarantee.** The server gives no reliable accessibility guarantee (USI-P4-12): do not rely on
   * this route alone for wheelchair routing. Cross-level segments without `connection_type` count as stairs. The SDK
   * never retries this call, whatever the client's retry policy.
   *
   * Errors: as `shortestPath` (400 → `ValidationError`, 404 → `NotFoundError`, 500 → `ServerError`, 401 →
   * `AuthenticationError`).
   *
   * @param request `start`, `end`, optional `walkingSpeed` (m/s, > 0) and `returnToStart`
   * @param options per-call `namespace`, `venueId` (mandatory: per call or client default), `level`, request options
   * @throws {ContextError} no namespace or venue (nothing is sent)
   * @throws {ValidationError} status 0 for an invalid endpoint or `walkingSpeed` (nothing is sent)
   * @example
   * ```typescript
   * import { createRtlsClient } from 'ubudu-rtls-sdk';
   *
   * const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace', venueId: 42 });
   * const route = await client.navigation.accessiblePath({ start: 101, end: 205 });
   * ```
   */
  async accessiblePath(
    request: AccessiblePathRequest,
    options?: CallContext & RequestOptions
  ): Promise<RouteResult> {
    return await this.postRoute('accessible-path', request, options);
  }

  /**
   * A tour from `start` through every stop (`POST /spatial/navigate/{ns}/multi-stop`).
   *
   * Stops are node ids or points (a coordinate with a 0 latitude or longitude is accepted here). Stop nodes of the
   * result carry `isStop`, `stopIndex` (1-based index into the input `stops`, also after reordering) and `stopName`
   * (from `stopNames`, default `'Stop <n>'`). `algorithm`: `'twoOpt'` (server default), `'nearestNeighbor'` or
   * `'simulatedAnnealing'` (random); the spec's `'genetic'` always fails (404 `TSPSolver.genetic is not a function`)
   * and is not offered. The cost grows with the square of the stop count: pass a larger `timeoutMs` above about 10
   * stops. Read-only computation, retried under the client's retry policy.
   *
   * Limitations (USI-P4-13): failed legs are skipped, so `success: true` can carry a gapped path; `dataSource` is
   * always `'real'`; with `optimizeOrder` and `returnToStart`, `multiStopInfo.roundTripInfo.returnDistance` is 0
   * while `distance` includes the return.
   *
   * Errors: 400 `{ error: 'Missing required parameters: …' }` → `ValidationError`; 404 `{ success: false, message:
   * 'Node <id> not found' | 'No node found near stop <n> position …' }` → `NotFoundError`; 500 → `ServerError`;
   * 401 → `AuthenticationError`.
   *
   * @param request `start`, `stops` (at least one), optional `optimizeOrder`, `algorithm`, `returnToStart`,
   *   `walkingSpeed` (> 0), `stopNames` (length ≤ `stops.length`)
   * @param options per-call `namespace`, `venueId` (mandatory: per call or client default), `level`, request options
   * @throws {ContextError} no namespace or venue (nothing is sent)
   * @throws {ValidationError} status 0 for an invalid endpoint, empty `stops`, too many `stopNames` or an invalid
   *   `walkingSpeed` (nothing is sent)
   * @example
   * ```typescript
   * import { createRtlsClient } from 'ubudu-rtls-sdk';
   *
   * const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace', venueId: 42 });
   * const tour = await client.navigation.multiStop({ start: 101, stops: [205, 310], stopNames: ['Dock', 'Office'] });
   * console.log(tour.multiStopInfo.optimized, tour.path.filter((n) => n.isStop).map((n) => n.stopName));
   * ```
   */
  async multiStop(
    request: MultiStopRequest,
    options?: CallContext & RequestOptions
  ): Promise<MultiStopRouteResult> {
    const { ctx, request: requestOptions } = splitCallOptions(options);
    const namespace = this.ns(ctx);
    const venueId = this.venueId(ctx);
    const level = this.level(ctx);
    checkRequest(request);
    const start = encodeEndpoint(request.start, 'start', level, false);
    if (!Array.isArray(request.stops) || request.stops.length === 0) {
      throw invalid('stops must be a non-empty array', 'stops');
    }
    const stops = request.stops.map((stop, i) => encodeEndpoint(stop, `stops[${i}]`, level, false));
    const { stopNames } = request;
    if (
      stopNames !== undefined &&
      !(Array.isArray(stopNames) && stopNames.length <= stops.length)
    ) {
      throw invalid('stopNames must be an array no longer than stops', 'stopNames');
    }
    return await this.transport.request<MultiStopRouteResult>(
      'POST',
      '/spatial/navigate/{namespace}/multi-stop',
      {
        params: { namespace },
        body: {
          start,
          stops,
          venueId,
          optimizeOrder: request.optimizeOrder,
          algorithm: request.algorithm,
          returnToStart: request.returnToStart,
          walkingSpeed: checkWalkingSpeed(request.walkingSpeed),
          stopNames,
        },
        ...requestOptions,
        retry: { idempotent: true },
      }
    );
  }

  /**
   * The nearest POI of a type from a node, with the route to it
   * (`GET /spatial/navigate/{ns}/nearest-poi/{nodeId}?poiType=…&venueId=…`).
   *
   * `poiType` is matched against a POI's **first tag** (or a path node's `poi_type`), plus `'all'` / `'any'`; it is
   * not a node type. `distance` is the straight-line distance in metres; `path` may be `null`.
   *
   * Limitations: the POI nodes are intermittently missing, and the call then answers 404 `No POIs of type … found`
   * (USI-P4-14). Level-0 POIs are placed on level −1 in the graph (USI-P4-16). Valid input can intermittently answer
   * 404 `End node … not found`: retry such a call once (USI-P4-17).
   *
   * Errors: 400 `{ error: 'Missing required query parameter: poiType' }` → `ValidationError`; 404 `{ success:
   * false, message: 'Node <id> not found' | 'No POIs of type <t> found' | 'End node <id> not found' }` →
   * `NotFoundError`; 500 → `ServerError`; 401 → `AuthenticationError`.
   *
   * @param nodeId start node id (non-blank string or finite number)
   * @param options `poiType` (non-blank), per-call `namespace`, `venueId` (mandatory: per call or client default),
   *   request options
   * @throws {ContextError} no namespace or venue (nothing is sent)
   * @throws {ValidationError} status 0 for a blank `nodeId` or `poiType` (nothing is sent)
   * @example
   * ```typescript
   * import { createRtlsClient } from 'ubudu-rtls-sdk';
   *
   * const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace', venueId: 42 });
   * const nearest = await client.navigation.nearestPoi(101, { poiType: 'all' });
   * console.log(nearest.poi.name, nearest.distance);
   * ```
   */
  async nearestPoi(
    nodeId: NodeId,
    options: NearestPoiOptions & CallContext & RequestOptions
  ): Promise<NearestPoiResult> {
    const { ctx, request, rest } = splitCallOptions(options);
    const namespace = this.ns(ctx);
    const venueId = this.venueId(ctx);
    const node = encodeNodeId(nodeId, 'nodeId');
    const { poiType } = rest;
    if (typeof poiType !== 'string' || poiType.trim() === '') {
      throw invalid('poiType must be a non-blank string', 'poiType');
    }
    return await this.transport.request<NearestPoiResult>(
      'GET',
      '/spatial/navigate/{namespace}/nearest-poi/{nodeId}',
      { params: { namespace, nodeId: node }, query: { poiType, venueId }, ...request }
    );
  }

  /**
   * The evacuation route from a node to the nearest exit
   * (`GET /spatial/navigate/{ns}/evacuation/{nodeId}?venueId=…`).
   *
   * `estimatedEvacuationTime` is `distance / 2` seconds; `path` may be `null`.
   *
   * Limitations: the server looks exits up in its POI-type index, so the call usually answers 404 with
   * `critical: true` (USI-P4-15).
   *
   * Errors: 404 `{ success: false, message: 'Cannot find evacuation route' | 'No evacuation routes available' | …,
   * critical: true }` → `NotFoundError` (its `body` is a `NavigationFailureBody`); 500 → `ServerError`; 401 →
   * `AuthenticationError`.
   *
   * @param nodeId start node id (non-blank string or finite number)
   * @param options per-call `namespace`, `venueId` (mandatory: per call or client default), request options
   * @throws {ContextError} no namespace or venue (nothing is sent)
   * @throws {ValidationError} status 0 for a blank `nodeId` (nothing is sent)
   * @example
   * ```typescript
   * import { createRtlsClient, NotFoundError } from 'ubudu-rtls-sdk';
   *
   * const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace', venueId: 42 });
   * try {
   *   const route = await client.navigation.evacuationRoute(101);
   *   console.log(route.exit.name, route.estimatedEvacuationTime);
   * } catch (error) {
   *   if (!(error instanceof NotFoundError)) throw error;
   * }
   * ```
   */
  async evacuationRoute(
    nodeId: NodeId,
    options?: CallContext & RequestOptions
  ): Promise<EvacuationRouteResult> {
    const { ctx, request } = splitCallOptions(options);
    const namespace = this.ns(ctx);
    const venueId = this.venueId(ctx);
    const node = encodeNodeId(nodeId, 'nodeId');
    return await this.transport.request<EvacuationRouteResult>(
      'GET',
      '/spatial/navigate/{namespace}/evacuation/{nodeId}',
      { params: { namespace, nodeId: node }, query: { venueId }, ...request }
    );
  }

  /**
   * Shared body of shortest-path and accessible-path: `{ start, end, venueId, walkingSpeed?, returnToStart? }`.
   * One transport call for both: shortest-path is marked idempotent; accessible-path passes `retry: false`, so no
   * client retry policy (not even one listing POST) repeats it (USI-P4-12).
   */
  private async postRoute(
    op: 'shortest-path' | 'accessible-path',
    request: ShortestPathRequest,
    options: (CallContext & RequestOptions) | undefined
  ): Promise<RouteResult> {
    const { ctx, request: requestOptions } = splitCallOptions(options);
    const namespace = this.ns(ctx);
    const venueId = this.venueId(ctx);
    const level = this.level(ctx);
    checkRequest(request);
    const body = {
      start: encodeEndpoint(request.start, 'start', level, true),
      end: encodeEndpoint(request.end, 'end', level, false),
      venueId,
      walkingSpeed: checkWalkingSpeed(request.walkingSpeed),
      returnToStart: request.returnToStart,
    };
    const shortest = op === 'shortest-path';
    return await this.transport.request<RouteResult>(
      'POST',
      shortest
        ? '/spatial/navigate/{namespace}/shortest-path'
        : '/spatial/navigate/{namespace}/accessible-path',
      {
        params: { namespace },
        body,
        ...requestOptions,
        retry: shortest ? { idempotent: true } : false,
      }
    );
  }
}
