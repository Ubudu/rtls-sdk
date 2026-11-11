/**
 * Navigation request and result types (`client.navigation`). Every type here is hand-written: the spec's navigation
 * components are stale (USI-P4-8).
 *
 * @module types/navigation
 */
import type { PathNodeType } from './geojson';

// Hand-written: spec navigation components are stale (USI-P4-8).
/** A path-node id (or a POI node id such as `'poi_<id>'`); sent as a string. */
export type NodeId = string | number;

// Hand-written: spec navigation components are stale (USI-P4-8).
/** A coordinate start or end point. Navigation uses `lon` (venues use `lng`). */
export interface NavigationPoint {
  lat: number;
  lon: number;
  /** Floor; default the call's or the client's `level`. */
  level?: number;
}

// Hand-written: spec navigation components are stale (USI-P4-8).
/** A node id or a coordinate point. */
export type NavigationEndpoint = NodeId | NavigationPoint;

// Hand-written: spec navigation components are stale (USI-P4-8).
/** Body of `navigation.shortestPath`. */
export interface ShortestPathRequest {
  start: NavigationEndpoint;
  end: NavigationEndpoint;
  /** m/s, server default 1.2; must be > 0. */
  walkingSpeed?: number;
  /** The path and the distance include the way back. */
  returnToStart?: boolean;
}

// Hand-written: spec navigation components are stale (USI-P4-8).
/** Body of `navigation.accessiblePath` (same shape as {@link ShortestPathRequest}). */
export type AccessiblePathRequest = ShortestPathRequest;

// Hand-written: spec navigation components are stale (USI-P4-8).
/** `'genetic'` is in the spec but always fails on the server (USI-P4-13), so it is not offered. */
export type TspAlgorithm = 'twoOpt' | 'nearestNeighbor' | 'simulatedAnnealing';

// Hand-written: spec navigation components are stale (USI-P4-8).
/** Body of `navigation.multiStop`. */
export interface MultiStopRequest {
  start: NavigationEndpoint;
  /** At least one stop. */
  stops: NavigationEndpoint[];
  /** Default `true` (server). */
  optimizeOrder?: boolean;
  /** Default `'twoOpt'` (server). */
  algorithm?: TspAlgorithm;
  returnToStart?: boolean;
  /** m/s, server default 1.2; must be > 0. */
  walkingSpeed?: number;
  /** Names of the stops, by input position; length ≤ `stops.length`. */
  stopNames?: string[];
}

// Hand-written: spec navigation components are stale (USI-P4-8).
/** Options of `navigation.nearestPoi`. */
export interface NearestPoiOptions {
  /** A POI's first tag, a path node's `poi_type`, or `'all'` / `'any'`; not a node type. */
  poiType: string;
}

// Hand-written: spec navigation components are stale (USI-P4-8).
/** One node of a route. */
export interface RouteNode {
  /** `null` for POI nodes (the server `parseInt`s node ids). */
  id: number | null;
  /** Path node: its name, or `'Node <id>'` when unnamed; POI node: the POI name. */
  name: string;
  /** The node's `node_type` (`'waypoint'` when absent), or `'poi'`. */
  type: PathNodeType | 'poi';
  level: number;
  /** `[lon, lat]` */
  coordinates: [number, number];
  /** lon */
  x: number;
  /** lat */
  y: number;
}

// Hand-written: spec navigation components are stale (USI-P4-8).
/** Set when `returnToStart` was requested. */
export interface RoundTripInfo {
  isRoundTrip: true;
  returnDistance: number;
}

// Hand-written: spec navigation components are stale (USI-P4-8).
/** 200 body of `shortestPath` / `accessiblePath`. */
export interface RouteResult {
  success: true;
  path: RouteNode[];
  /** metres (haversine) */
  distance: number;
  /** seconds (`distance / walkingSpeed`) */
  estimatedTime: number;
  algorithm: 'astar' | (string & {});
  dataSource: 'real' | 'mock';
  roundTripInfo?: RoundTripInfo;
}

// Hand-written: spec navigation components are stale (USI-P4-8).
/** One node of a multi-stop route; stop nodes carry the stop markers. */
export interface MultiStopRouteNode extends RouteNode {
  isStop?: true;
  /** 1-based index into the input `stops`. */
  stopIndex?: number;
  /** From `stopNames`, default `'Stop <n>'`. */
  stopName?: string;
}

// Hand-written: spec navigation components are stale (USI-P4-8).
/** Summary of a multi-stop optimisation. */
export interface MultiStopInfo {
  optimized: boolean;
  stopCount: number;
  /** Only when optimised. */
  algorithm?: TspAlgorithm | (string & {});
  /** Only when optimised. */
  optimizationDistance?: number;
  /** `returnDistance` is 0 when `optimizeOrder` and `returnToStart` are combined (USI-P4-13). */
  roundTripInfo?: RoundTripInfo;
}

// Hand-written: spec navigation components are stale (USI-P4-8).
/** 200 body of `multiStop`. */
export interface MultiStopRouteResult extends Omit<RouteResult, 'path' | 'roundTripInfo'> {
  path: MultiStopRouteNode[];
  multiStopInfo: MultiStopInfo;
}

// Hand-written: spec navigation components are stale (USI-P4-8).
/** A POI or exit found by `nearestPoi` / `evacuationRoute`. */
export interface NavigationPoi {
  id: string;
  name?: string;
  /** The requested `poiType`. */
  type: string;
  level: number;
  /** `[lon, lat]` */
  coordinates: [number, number];
}

// Hand-written: spec navigation components are stale (USI-P4-8).
/** 200 body of `nearestPoi`. */
export interface NearestPoiResult {
  success: true;
  poi: NavigationPoi;
  /** Straight-line metres. */
  distance: number;
  path: RouteNode[] | null;
}

// Hand-written: spec navigation components are stale (USI-P4-8).
/** 200 body of `evacuationRoute`. */
export interface EvacuationRouteResult {
  success: true;
  emergency: true;
  path: RouteNode[] | null;
  exit: NavigationPoi;
  distance: number;
  /** seconds (`distance / 2`) */
  estimatedEvacuationTime: number;
}

// Hand-written: spec navigation components are stale (USI-P4-8).
/** `error.body` of a navigation `NotFoundError` (404). */
export interface NavigationFailureBody {
  success: false;
  message: string;
  error?: string;
  critical?: boolean;
  startNodeId?: string;
  endNodeId?: string;
}

/** @deprecated since 0.3.0, use {@link RouteResult}. */
export type NavigationResponse = RouteResult;
