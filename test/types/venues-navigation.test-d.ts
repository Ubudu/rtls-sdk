// Type-level tests of venues, zones, GeoJSON and navigation (P4 §8.5, T-1 … T-11). Not collected by vitest (the
// unit config excludes test/types/**); `npm run typecheck` compiles this file, so every `expectTypeOf` and every
// `@ts-expect-error` below is checked by the compiler. Types are taken from the package entry point.
import { expectTypeOf } from 'vitest';
import {
  createRtlsClient,
  type AccessiblePathRequest,
  type CrossLevelConnection,
  type IndoorMap,
  type MapPoisResponse,
  type MultiStopRequest,
  type MultiStopRouteResult,
  type NavigationResource,
  type NavigationResponse,
  type PathNode,
  type PathNodeType,
  type PathSegment,
  type POI,
  type RouteResult,
  type ShortestPathRequest,
  type TspAlgorithm,
  type VenueDetails,
  type VenuesResource,
  type VenueSummary,
  type ZoneFeatureCollection,
  type ZonePresenceSlot,
} from '../../src';

const client = createRtlsClient({ apiKey: 'k', namespace: 'ns', venueId: 1 });

// T-1: venues.list() is Promise<VenueSummary[]>.
expectTypeOf(client.venues.list()).toEqualTypeOf<Promise<VenueSummary[]>>();
expectTypeOf(client.venues.listMaps()).toEqualTypeOf<Promise<IndoorMap[]>>();

// T-2: venues.get() is Promise<VenueDetails>.
expectTypeOf(client.venues.get()).toEqualTypeOf<Promise<VenueDetails>>();
expectTypeOf<VenueDetails['name']>().toEqualTypeOf<string | undefined>();

// T-3: listMapPois() is Promise<MapPoisResponse>.
expectTypeOf(client.venues.listMapPois()).toEqualTypeOf<Promise<MapPoisResponse>>();

// T-4: the legacy overloads compile.
expectTypeOf(client.venues.list('ns')).toEqualTypeOf<Promise<VenueSummary[]>>();
expectTypeOf(client.venues.get('ns', '42')).toEqualTypeOf<Promise<VenueDetails>>();
expectTypeOf(client.zones.list('ns', 1)).toEqualTypeOf<Promise<ZoneFeatureCollection>>();
expectTypeOf(client.zones.getPresence('ns', { timestampFrom: 1, timestampTo: 2 })).toEqualTypeOf<
  Promise<ZonePresenceSlot[]>
>();
expectTypeOf(client.zones.list({ venueId: 1 }, { timeoutMs: 5 })).toEqualTypeOf<
  Promise<ZoneFeatureCollection>
>();
expectTypeOf(client.venues.listPoisAsArray({ level: 0, tag: 'exit' })).toEqualTypeOf<
  Promise<POI[]>
>();
expectTypeOf(client.venues.listPathNodes({ nodeType: 'elevator' })).toEqualTypeOf<
  Promise<PathNode[]>
>();
// @ts-expect-error listPathSegments takes no nodeType
void client.venues.listPathSegments({ nodeType: 'elevator' });

// T-5: PathSegment has sourceNodeId: number and none of the 0.2 names.
expectTypeOf<PathSegment['sourceNodeId']>().toEqualTypeOf<number>();
expectTypeOf<PathSegment>().not.toHaveProperty('startNodeId');
expectTypeOf<PathSegment>().not.toHaveProperty('weight');
expectTypeOf<PathNode['crossLevelConnections']>().toEqualTypeOf<CrossLevelConnection[]>();

// T-6: PathNodeType accepts the stored node types.
expectTypeOf<'staircase'>().toMatchTypeOf<PathNodeType>();
expectTypeOf<'emergency_exit'>().toMatchTypeOf<PathNodeType>();
expectTypeOf<'entrance'>().toMatchTypeOf<PathNodeType>();

// T-7: shortestPath returns Promise<RouteResult>; route coordinates are [lon, lat].
expectTypeOf(client.navigation.shortestPath({ start: 1, end: '2' })).toEqualTypeOf<
  Promise<RouteResult>
>();
expectTypeOf<RouteResult['path'][number]['coordinates']>().toEqualTypeOf<[number, number]>();
expectTypeOf(client.navigation.multiStop({ start: 1, stops: [2] })).toEqualTypeOf<
  Promise<MultiStopRouteResult>
>();
expectTypeOf<AccessiblePathRequest>().toEqualTypeOf<ShortestPathRequest>();
// @ts-expect-error a point uses lon, not lng
void client.navigation.shortestPath({ start: { lat: 1, lng: 2 }, end: 1 });
// @ts-expect-error nearestPoi needs its poiType
void client.navigation.nearestPoi(1, {});

// T-8: 'genetic' is not a TspAlgorithm; ShortestPathRequest has no algorithm / avoidStairs.
expectTypeOf<'genetic'>().not.toMatchTypeOf<TspAlgorithm>();
expectTypeOf<ShortestPathRequest>().not.toHaveProperty('algorithm');
expectTypeOf<ShortestPathRequest>().not.toHaveProperty('avoidStairs');
expectTypeOf<MultiStopRequest>().not.toHaveProperty('nodeIds');

// T-9: NavigationResponse equals RouteResult.
expectTypeOf<NavigationResponse>().toEqualTypeOf<RouteResult>();

// T-10: zones.getPresence() is Promise<ZonePresenceSlot[]>.
expectTypeOf(client.zones.getPresence()).toEqualTypeOf<Promise<ZonePresenceSlot[]>>();
expectTypeOf<ZonePresenceSlot['timestamp']>().toEqualTypeOf<number>();

// T-11: removed methods are gone.
expectTypeOf<VenuesResource>().not.toHaveProperty('listMapPoisAsArray');
expectTypeOf<NavigationResource>().not.toHaveProperty('evacuation');
