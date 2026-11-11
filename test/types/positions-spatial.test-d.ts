// Type-level tests of client.positions and client.spatial (P3 §8.4, T-1…T-9). Not collected by vitest (the unit
// config excludes test/types/**); `npm run typecheck` compiles this file, so every `expectTypeOf` and every
// `@ts-expect-error` below is checked by the compiler.
import { expectTypeOf } from 'vitest';
import type {
  AnalyzeCustomZonesResult,
  AnalyzeCustomPoisResult,
  AssetPosition,
  CachedAssetPosition,
  CustomPoiInput,
  EsSearchResponse,
  GeoJSONFeatureCollection,
  ListLastPositionsOptions,
  ListPositionsOptions,
  ListPositionsParams,
  NearestPoisResult,
  NearestQueryOptions,
  NearestZonesResult,
  POIFeature,
  POIWithDistance,
  PoisWithinRadiusResult,
  PublishPositionData,
  RtlsClient,
  SpatialAssetsResponse,
  SpatialPoiMatch,
  SpatialPolygonFeature,
  SpatialQueryOptions,
  SpatialZoneMatch,
  ZonesContainingPointResult,
  ZonesWithinRadiusResult,
  ZoneWithDistance,
} from '../../src';
import type { TimeInput } from '../../src/utils/time';

declare const client: RtlsClient;
const mac = 'aabbccddeeff';
const point = { lat: 48.8, lon: 2.3 };
const dsl = { size: 1, query: { range: { timestamp: { gte: 0, lte: 1 } } } };

// ─── T-1 PublishPositionData requires user_udid ──────────────────────────────

const published: PublishPositionData = {
  user_udid: mac,
  lat: 1,
  lon: 2,
  data: { a: 1 },
  extra: true,
};
void published;
// @ts-expect-error user_udid is required
const missingMac: PublishPositionData = { lat: 1, lon: 2 };
void missingMac;

// ─── T-2 legacy and object forms of every existing method ────────────────────

expectTypeOf(client.positions.listCached()).toEqualTypeOf<Promise<CachedAssetPosition[]>>();
expectTypeOf(client.positions.listCached({ namespace: 'ns', timeoutMs: 1 })).toEqualTypeOf<
  Promise<CachedAssetPosition[]>
>();
expectTypeOf(client.positions.listCached('ns', { timeoutMs: 1 })).toEqualTypeOf<
  Promise<CachedAssetPosition[]>
>();
expectTypeOf(client.positions.getCached(mac, { namespace: 'ns' })).toEqualTypeOf<
  Promise<CachedAssetPosition>
>();
expectTypeOf(client.positions.getCached('ns', mac, { timeoutMs: 1 })).toEqualTypeOf<
  Promise<CachedAssetPosition>
>();
expectTypeOf(client.positions.getLast(mac)).toEqualTypeOf<Promise<CachedAssetPosition>>();
expectTypeOf(client.positions.getLast('ns', mac)).toEqualTypeOf<Promise<CachedAssetPosition>>();
// @ts-expect-error the legacy trailing requestOptions carry no context
void client.positions.getCached('ns', mac, { namespace: 'other' });
expectTypeOf(client.positions.listLast({ current: true, timeoutMs: 1 })).toEqualTypeOf<
  Promise<AssetPosition[]>
>();
expectTypeOf(client.positions.listLast({ mapUuids: ['m'] }, { timeoutMs: 1 })).toEqualTypeOf<
  Promise<AssetPosition[]>
>();
expectTypeOf(client.positions.listLast('ns', { key: 'user.udid' }, { timeoutMs: 1 })).toEqualTypeOf<
  Promise<AssetPosition[]>
>();
// @ts-expect-error the legacy options carry no context
void client.positions.listLast('ns', { namespace: 'other' });
expectTypeOf(
  client.positions.getHistory({ value: mac, timestampFrom: new Date(), namespace: 'ns' })
).toEqualTypeOf<Promise<AssetPosition[]>>();
expectTypeOf(
  client.positions.getHistory('ns', { value: mac, timestampFrom: 0, timestampTo: '2024-01-01' })
).toEqualTypeOf<Promise<AssetPosition[]>>();
// @ts-expect-error value is required
void client.positions.getHistory({ timestampFrom: 0 });
expectTypeOf(client.positions.publish({ user_udid: mac }, { patchAssetData: true })).toEqualTypeOf<
  Promise<void>
>();
expectTypeOf(
  client.positions.publish('ns', { user_udid: mac }, { patchAssetData: true }, { timeoutMs: 1 })
).toEqualTypeOf<Promise<void>>();

expectTypeOf(client.spatial.zonesContainingPoint(point)).toEqualTypeOf<
  Promise<ZonesContainingPointResult>
>();
expectTypeOf(client.spatial.zonesContainingPoint('ns', point, { timeoutMs: 1 })).toEqualTypeOf<
  Promise<ZonesContainingPointResult>
>();
expectTypeOf(client.spatial.nearestZones({ ...point, limit: 5 }, { timeoutMs: 1 })).toEqualTypeOf<
  Promise<NearestZonesResult>
>();
expectTypeOf(client.spatial.nearestZones('ns', { ...point, maxDistanceMeters: 5 })).toEqualTypeOf<
  Promise<NearestZonesResult>
>();
expectTypeOf(client.spatial.zonesWithinRadius({ ...point, radiusMeters: 5 })).toEqualTypeOf<
  Promise<ZonesWithinRadiusResult>
>();
expectTypeOf(client.spatial.zonesWithinRadius('ns', { ...point, radiusMeters: 5 })).toEqualTypeOf<
  Promise<ZonesWithinRadiusResult>
>();
expectTypeOf(client.spatial.nearestPois({ ...point, tags: ['exit'] })).toEqualTypeOf<
  Promise<NearestPoisResult>
>();
expectTypeOf(client.spatial.nearestPois('ns', point)).toEqualTypeOf<Promise<NearestPoisResult>>();
expectTypeOf(client.spatial.poisWithinRadius({ ...point, radiusMeters: 5 })).toEqualTypeOf<
  Promise<PoisWithinRadiusResult>
>();
expectTypeOf(client.spatial.poisWithinRadius('ns', { ...point, radiusMeters: 5 })).toEqualTypeOf<
  Promise<PoisWithinRadiusResult>
>();
expectTypeOf(
  client.spatial.analyzeCustomPois<CustomPoiInput>({
    ...point,
    customPois: [{ lat: 1, lon: 2, name: 'p' }],
  })
).toEqualTypeOf<Promise<AnalyzeCustomPoisResult<CustomPoiInput>>>();
expectTypeOf(
  client.spatial.analyzeCustomPois<CustomPoiInput>('ns', {
    reference_point: point,
    custom_pois: [{ lat: 1, lon: 2 }],
    operation: 'nearest',
  })
).toEqualTypeOf<Promise<AnalyzeCustomPoisResult<CustomPoiInput>>>();
declare const venuePois: POIFeature[];
expectTypeOf(
  client.spatial.analyzeCustomPois({ ...point, customPois: venuePois, operation: 'nearest' })
).toEqualTypeOf<Promise<AnalyzeCustomPoisResult<CustomPoiInput>>>();
expectTypeOf(client.spatial.nearestAssets({ ...point, maxAge: '1h' })).toEqualTypeOf<
  Promise<SpatialAssetsResponse>
>();

// ─── T-3 level: null on zone/POI options, never on zoneDistances ─────────────

void client.spatial.nearestZones({ ...point, level: null });
void client.spatial.zonesContainingPoint({ ...point, level: 0 });
void client.spatial.poisByTag({ tag: 'exit', level: null });
void client.spatial.zoneDistances({ ...point, zoneIds: [1, '2'] });
// @ts-expect-error zoneDistances takes no level
void client.spatial.zoneDistances({ ...point, zoneIds: [1], level: null });

// ─── T-4 analyzeCustomZones takes a Feature array or a FeatureCollection ─────

type Props = { name: string; risk: number };
declare const square: SpatialPolygonFeature<Props>;
declare const collection: GeoJSONFeatureCollection<SpatialPolygonFeature<Props>>;
expectTypeOf(
  client.spatial.analyzeCustomZones<Props>({ ...point, customZones: [square] })
).toEqualTypeOf<Promise<AnalyzeCustomZonesResult<Props>>>();
expectTypeOf(
  client.spatial.analyzeCustomZones<Props>({ ...point, customZones: collection })
).toEqualTypeOf<Promise<AnalyzeCustomZonesResult<Props>>>();
expectTypeOf(
  client.spatial.analyzeCustomZones<Props>('ns', {
    reference_point: point,
    custom_zones: collection,
  })
).toEqualTypeOf<Promise<AnalyzeCustomZonesResult<Props>>>();

// ─── T-5 zone results are Features ────────────────────────────────────────────

declare const nearest: NearestZonesResult;
const firstZone = nearest.zones[0] as SpatialZoneMatch;
expectTypeOf(firstZone.properties.name).toEqualTypeOf<string>();
// @ts-expect-error the 0.2.0 flat item is gone: the name is in properties
void firstZone.name;

// ─── T-6 query<T> types the hits ──────────────────────────────────────────────

declare const searched: EsSearchResponse<AssetPosition>;
expectTypeOf(client.positions.query<AssetPosition>('positions', dsl)).toEqualTypeOf<
  Promise<EsSearchResponse<AssetPosition, Record<string, unknown>>>
>();
expectTypeOf(searched.hits.hits[0]!._source.user.udid).toEqualTypeOf<string>();
// @ts-expect-error dataType outside the spec enum
void client.positions.query('tag_actions', dsl);

// ─── T-7 deprecated aliases still compile ─────────────────────────────────────

const oldList: ListPositionsOptions = { key: 'user.udid', timestampFrom: 0 };
const oldParams: ListPositionsParams = { namespace: 'ns', mapUuids: ['m'] };
const oldSpatial: SpatialQueryOptions = { ...point, limit: 1 };
expectTypeOf<SpatialQueryOptions>().toEqualTypeOf<NearestQueryOptions>();
expectTypeOf<ZoneWithDistance>().toEqualTypeOf<SpatialZoneMatch>();
expectTypeOf<POIWithDistance>().toEqualTypeOf<SpatialPoiMatch>();
void client.positions.listLast(oldParams);
void client.positions.listLast('ns', oldList);
void client.spatial.nearestZones(oldSpatial);

// ─── T-8 nearestAssetsRealtime has no maxAge ──────────────────────────────────

void client.spatial.nearestAssetsRealtime({ ...point, limit: 5 });
// @ts-expect-error maxAge only exists on nearestAssets
void client.spatial.nearestAssetsRealtime({ ...point, maxAge: '1m' });

// ─── T-9 time bounds take P1's TimeInput ──────────────────────────────────────

expectTypeOf<ListLastPositionsOptions['timestampFrom']>().toEqualTypeOf<TimeInput | undefined>();
expectTypeOf<ListLastPositionsOptions['timestampTo']>().toEqualTypeOf<TimeInput | undefined>();
