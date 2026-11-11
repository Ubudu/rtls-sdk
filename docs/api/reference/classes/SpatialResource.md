[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / SpatialResource

# Class: SpatialResource

Spatial lookups. Methods with a legacy overload take `(namespace, options, requestOptions?)` when the first
argument is a string; the object form takes the namespace and request options in its bag.

`level` (zone and POI lookups only): omitted → the client default `level` applies when set; `null` → all levels,
even with a client default; any integer is sent, `0` included. A non-integer throws `ContextError`.

## Example

```typescript
const zones = await client.zones.list({ venueId: 1 });
const res = await client.spatial.analyzeCustomZones({ lat: 48.85, lon: 2.35, customZones: zones.features });
console.log(res.containing_zones.map((z) => z.properties.name));
```

## Extends

- `ResourceBase`

## Methods

### zonesContainingPoint()

#### Call Signature

> **zonesContainingPoint**(`options`, `requestOptions?`): `Promise`\<[`ZonesContainingPointResult`](../interfaces/ZonesContainingPointResult.md)\>

Zones of the first venue that contain the point (GET `/spatial/zones/{namespace}/containing-point`).

Known issue USI-P3-1: the server returns no zones today. Use `analyzeCustomZones` with the features of
`client.zones.list()`; its `containing_zones` is the working equivalent.

##### Parameters

###### options

`object` & [`SpatialLevelOption`](../interfaces/SpatialLevelOption.md) & `Omit`\<[`RtlsContext`](../interfaces/RtlsContext.md), `"level"`\> & [`RequestOptions`](../interfaces/RequestOptions.md)

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

**Deprecated**

since 0.3.0 — pass `signal`/`timeoutMs`/`headers` in `options`

##### Returns

`Promise`\<[`ZonesContainingPointResult`](../interfaces/ZonesContainingPointResult.md)\>

##### Throws

status 0 for an out-of-range point (nothing sent)

##### Throws

no namespace, or a non-integer `level`

##### Example

```typescript
const res = await client.spatial.zonesContainingPoint({ lat: 48.85, lon: 2.35, level: null });
res.containing_zones.forEach((z) => console.log(z.properties.name, z.level));
```

#### Call Signature

> **zonesContainingPoint**(`namespace`, `options`, `requestOptions?`): `Promise`\<[`ZonesContainingPointResult`](../interfaces/ZonesContainingPointResult.md)\>

Legacy positional form (namespace first); the object form is `zonesContainingPoint({ ...options, namespace })`.

##### Parameters

###### namespace

`string`

###### options

[`PointQueryOptions`](../type-aliases/PointQueryOptions.md)

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`ZonesContainingPointResult`](../interfaces/ZonesContainingPointResult.md)\>

***

### nearestZones()

#### Call Signature

> **nearestZones**(`options`, `requestOptions?`): `Promise`\<[`NearestZonesResult`](../interfaces/NearestZonesResult.md)\>

Zones of the first venue nearest to the point, with distances in whole metres (GET
`/spatial/zones/{namespace}/nearest-to-point`). `limit` defaults to 10 on the server; `hasMore` is not
meaningful here (USI-P3-13).

Known issue USI-P3-1: `total_zones` counts zones but `zones` is empty today. Use `analyzeCustomZones` with the
features of `client.zones.list()`; its `nearby_zones` are sorted by distance.

##### Parameters

###### options

`object` & [`SpatialLevelOption`](../interfaces/SpatialLevelOption.md) & `object` & `Omit`\<[`RtlsContext`](../interfaces/RtlsContext.md), `"level"`\> & [`RequestOptions`](../interfaces/RequestOptions.md)

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

**Deprecated**

since 0.3.0 — pass `signal`/`timeoutMs`/`headers` in `options`

##### Returns

`Promise`\<[`NearestZonesResult`](../interfaces/NearestZonesResult.md)\>

##### Throws

status 0 for an out-of-range point (nothing sent)

##### Throws

no namespace, or a non-integer `level`

#### Call Signature

> **nearestZones**(`namespace`, `options`, `requestOptions?`): `Promise`\<[`NearestZonesResult`](../interfaces/NearestZonesResult.md)\>

Legacy positional form (namespace first); the object form is `nearestZones({ ...options, namespace })`.

##### Parameters

###### namespace

`string`

###### options

[`NearestQueryOptions`](../type-aliases/NearestQueryOptions.md)

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`NearestZonesResult`](../interfaces/NearestZonesResult.md)\>

***

### zonesWithinRadius()

#### Call Signature

> **zonesWithinRadius**(`options`, `requestOptions?`): `Promise`\<[`ZonesWithinRadiusResult`](../interfaces/ZonesWithinRadiusResult.md)\>

Zones of the first venue within `radiusMeters` of the point (GET `/spatial/zones/{namespace}/within-radius`;
server cap 1000 results). A radius `<= 0` is rejected by the server (400 `Radius must be positive`).

Known issue USI-P3-1: `zones` is empty today. Use `analyzeCustomZones` with the features of
`client.zones.list()` and filter `nearby_zones` by `distance_meters`.

##### Parameters

###### options

`object` & [`SpatialLevelOption`](../interfaces/SpatialLevelOption.md) & `object` & `Omit`\<[`RtlsContext`](../interfaces/RtlsContext.md), `"level"`\> & [`RequestOptions`](../interfaces/RequestOptions.md)

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

**Deprecated**

since 0.3.0 — pass `signal`/`timeoutMs`/`headers` in `options`

##### Returns

`Promise`\<[`ZonesWithinRadiusResult`](../interfaces/ZonesWithinRadiusResult.md)\>

##### Throws

status 0 for an out-of-range point (nothing sent)

##### Throws

no namespace, or a non-integer `level`

#### Call Signature

> **zonesWithinRadius**(`namespace`, `options`, `requestOptions?`): `Promise`\<[`ZonesWithinRadiusResult`](../interfaces/ZonesWithinRadiusResult.md)\>

Legacy positional form (namespace first); the object form is `zonesWithinRadius({ ...options, namespace })`.

##### Parameters

###### namespace

`string`

###### options

[`RadiusQueryOptions`](../type-aliases/RadiusQueryOptions.md)

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`ZonesWithinRadiusResult`](../interfaces/ZonesWithinRadiusResult.md)\>

***

### zoneDistances()

> **zoneDistances**(`options`): `Promise`\<[`ZoneDistancesResult`](../interfaces/ZoneDistancesResult.md)\>

Distances from the point to the given zones of the first venue, ascending boundary distance (POST
`/spatial/zones/{namespace}/calculate-distances`). Not affected by USI-P3-1.

`zoneIds` must be the `properties.id` values exactly as `client.zones.list()` returns them: the server compares
them strictly (`1` and `'1'` differ); an empty array is a 400. A reference point with `lat` or `lon` exactly
`0` is rejected by the server (USI-P3-6). Read-only: retried under the client's retry policy.

#### Parameters

##### options

[`ZoneDistancesOptions`](../interfaces/ZoneDistancesOptions.md) & `Omit`\<[`RtlsContext`](../interfaces/RtlsContext.md), `"level"`\> & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`ZoneDistancesResult`](../interfaces/ZoneDistancesResult.md)\>

#### Throws

status 0 for an out-of-range point (nothing sent)

#### Example

```typescript
const zones = await client.zones.list({ venueId: 1 });
const res = await client.spatial.zoneDistances({
  lat: 48.85,
  lon: 2.35,
  zoneIds: zones.features.map((z) => z.properties.id),
});
console.log(res.zones[0]?.zone_name, res.zones[0]?.boundary_distance_meters);
```

***

### analyzeCustomZones()

#### Call Signature

> **analyzeCustomZones**\<`P`\>(`options`, `requestOptions?`): `Promise`\<[`AnalyzeCustomZonesResult`](../interfaces/AnalyzeCustomZonesResult.md)\<`P`\>\>

Point-in-polygon and distances against the caller's polygons (POST `/spatial/zones/{namespace}/analyze-custom`).
The reliable zone lookup today: pass the features of `client.zones.list()` (USI-P3-1 does not affect it).

`customZones` is an array of polygon Features (wrapped into a FeatureCollection) or a FeatureCollection (sent
as given). Only polygons count, outer ring only; `index` in the result is the position in the input. The
legacy form sends `request` verbatim. A reference point with `lat` or `lon` exactly `0` is rejected by the
server (USI-P3-6); the body is limited to 100 kB. Read-only: retried under the client's retry policy.

##### Type Parameters

###### P

`P` = `Record`\<`string`, `unknown`\>

##### Parameters

###### options

[`AnalyzeCustomZonesOptions`](../interfaces/AnalyzeCustomZonesOptions.md)\<`P`\> & `Omit`\<[`RtlsContext`](../interfaces/RtlsContext.md), `"level"`\> & [`RequestOptions`](../interfaces/RequestOptions.md)

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

**Deprecated**

since 0.3.0 — pass `signal`/`timeoutMs`/`headers` in `options`

##### Returns

`Promise`\<[`AnalyzeCustomZonesResult`](../interfaces/AnalyzeCustomZonesResult.md)\<`P`\>\>

##### Throws

status 0 for an out-of-range point, legacy `reference_point` included (nothing sent)

##### Example

```typescript
const zones = await client.zones.list({ venueId: 1 });
const res = await client.spatial.analyzeCustomZones({ lat: 48.85, lon: 2.35, customZones: zones.features });
const inside = res.containing_zones.map((z) => z.properties.name);
```

#### Call Signature

> **analyzeCustomZones**\<`P`\>(`namespace`, `request`, `requestOptions?`): `Promise`\<[`AnalyzeCustomZonesResult`](../interfaces/AnalyzeCustomZonesResult.md)\<`P`\>\>

Legacy positional form (namespace first); the object form is `analyzeCustomZones({ lat, lon, customZones, namespace })`.

##### Type Parameters

###### P

`P` = `Record`\<`string`, `unknown`\>

##### Parameters

###### namespace

`string`

###### request

[`AnalyzeCustomZonesRequest`](../interfaces/AnalyzeCustomZonesRequest.md)\<`P`\>

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`AnalyzeCustomZonesResult`](../interfaces/AnalyzeCustomZonesResult.md)\<`P`\>\>

***

### nearestPois()

#### Call Signature

> **nearestPois**(`options`, `requestOptions?`): `Promise`\<[`NearestPoisResult`](../interfaces/NearestPoisResult.md)\>

POIs of the first venue nearest to the point (GET `/spatial/pois/{namespace}/nearest-to-point`). `tags` is an
OR filter, echoed as `tags_filter`.

Known issue USI-P3-2: the server returns no POIs today. Use `analyzeCustomPois` with the features of
`client.venues.listPois()` (Point Features are flattened for you).

##### Parameters

###### options

`object` & [`SpatialLevelOption`](../interfaces/SpatialLevelOption.md) & `object` & [`PoiTagsOption`](../interfaces/PoiTagsOption.md) & `Omit`\<[`RtlsContext`](../interfaces/RtlsContext.md), `"level"`\> & [`RequestOptions`](../interfaces/RequestOptions.md)

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

**Deprecated**

since 0.3.0 — pass `signal`/`timeoutMs`/`headers` in `options`

##### Returns

`Promise`\<[`NearestPoisResult`](../interfaces/NearestPoisResult.md)\>

##### Throws

status 0 for an out-of-range point (nothing sent)

##### Throws

no namespace, or a non-integer `level`

#### Call Signature

> **nearestPois**(`namespace`, `options`, `requestOptions?`): `Promise`\<[`NearestPoisResult`](../interfaces/NearestPoisResult.md)\>

Legacy positional form (namespace first); the object form is `nearestPois({ ...options, namespace })`.

##### Parameters

###### namespace

`string`

###### options

`object` & [`SpatialLevelOption`](../interfaces/SpatialLevelOption.md) & `object` & [`PoiTagsOption`](../interfaces/PoiTagsOption.md)

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`NearestPoisResult`](../interfaces/NearestPoisResult.md)\>

***

### poisWithinRadius()

#### Call Signature

> **poisWithinRadius**(`options`, `requestOptions?`): `Promise`\<[`PoisWithinRadiusResult`](../interfaces/PoisWithinRadiusResult.md)\>

POIs of the first venue within `radiusMeters` of the point (GET `/spatial/pois/{namespace}/within-radius`;
server cap 1000 results).

Known issue USI-P3-2: the server returns no POIs today. Use `analyzeCustomPois` with
`operation: 'within-radius'` over the features of `client.venues.listPois()`.

##### Parameters

###### options

`object` & [`SpatialLevelOption`](../interfaces/SpatialLevelOption.md) & `object` & [`PoiTagsOption`](../interfaces/PoiTagsOption.md) & `Omit`\<[`RtlsContext`](../interfaces/RtlsContext.md), `"level"`\> & [`RequestOptions`](../interfaces/RequestOptions.md)

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

**Deprecated**

since 0.3.0 — pass `signal`/`timeoutMs`/`headers` in `options`

##### Returns

`Promise`\<[`PoisWithinRadiusResult`](../interfaces/PoisWithinRadiusResult.md)\>

##### Throws

status 0 for an out-of-range point (nothing sent)

##### Throws

no namespace, or a non-integer `level`

#### Call Signature

> **poisWithinRadius**(`namespace`, `options`, `requestOptions?`): `Promise`\<[`PoisWithinRadiusResult`](../interfaces/PoisWithinRadiusResult.md)\>

Legacy positional form (namespace first); the object form is `poisWithinRadius({ ...options, namespace })`.

##### Parameters

###### namespace

`string`

###### options

`object` & [`SpatialLevelOption`](../interfaces/SpatialLevelOption.md) & `object` & [`PoiTagsOption`](../interfaces/PoiTagsOption.md)

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`PoisWithinRadiusResult`](../interfaces/PoisWithinRadiusResult.md)\>

***

### poisByTag()

> **poisByTag**(`options`): `Promise`\<[`PoisByTagResult`](../interfaces/PoisByTagResult.md)\>

POIs of the first venue carrying `tag` (GET `/spatial/pois/{namespace}/by-tag`); an empty tag is a 400.

Known issue USI-P3-2: the server returns no POIs today. Use `client.venues.listPois({ tag })`.

#### Parameters

##### options

`object` & [`SpatialLevelOption`](../interfaces/SpatialLevelOption.md) & `Omit`\<[`RtlsContext`](../interfaces/RtlsContext.md), `"level"`\> & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`PoisByTagResult`](../interfaces/PoisByTagResult.md)\>

#### Throws

no namespace, or a non-integer `level`

***

### poiStatistics()

> **poiStatistics**(`options?`): `Promise`\<[`PoiStatistics`](../interfaces/PoiStatistics.md)\>

POI counts of the first venue (GET `/spatial/pois/{namespace}/statistics`). `total_pois` and `levels` are
right; `tags` and `venues` stay empty for GeoJSON POIs (USI-P3-3): count tags over `client.venues.listPois()`.
Never sends `level`.

#### Parameters

##### options?

[`SpatialCallOptions`](../type-aliases/SpatialCallOptions.md)

#### Returns

`Promise`\<[`PoiStatistics`](../interfaces/PoiStatistics.md)\>

#### Throws

no namespace

***

### analyzeCustomPois()

#### Call Signature

> **analyzeCustomPois**\<`T`\>(`options`, `requestOptions?`): `Promise`\<[`AnalyzeCustomPoisResult`](../interfaces/AnalyzeCustomPoisResult.md)\<`T`\>\>

Nearest or within-radius search over the caller's POIs (POST `/spatial/pois/{namespace}/analyze-custom`). The
reliable POI lookup today: pass the features of `client.venues.listPois()` (USI-P3-2 does not affect it).

Each item is a flat `{ lat, lon, ... }` object or a GeoJSON Point Feature, flattened to
`{ ...properties, lat, lon }`; the keys `location`, `position`, `coordinates`, `latitude`, `longitude` are
removed (the server would read them first). `operation` defaults to `'nearest'` (`limit`, server default 10,
and `maxDistanceMeters` apply); `'within-radius'` needs a positive `radiusMeters`. The legacy form sends
`request` verbatim. The server rejects a reference point with `lat` or `lon` exactly `0` and silently drops
custom POIs with a `0` coordinate (USI-P3-6); the body is limited to 100 kB. Read-only: retried under the
client's retry policy.

##### Type Parameters

###### T

`T` *extends* [`CustomPoiInput`](../interfaces/CustomPoiInput.md) = [`CustomPoiInput`](../interfaces/CustomPoiInput.md)

##### Parameters

###### options

[`AnalyzeCustomPoisOptions`](../interfaces/AnalyzeCustomPoisOptions.md)\<`T`\> & `Omit`\<[`RtlsContext`](../interfaces/RtlsContext.md), `"level"`\> & [`RequestOptions`](../interfaces/RequestOptions.md)

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

**Deprecated**

since 0.3.0 — pass `signal`/`timeoutMs`/`headers` in `options`

##### Returns

`Promise`\<[`AnalyzeCustomPoisResult`](../interfaces/AnalyzeCustomPoisResult.md)\<`T`\>\>

##### Throws

status 0 for an out-of-range point or a missing / non-positive `radiusMeters` with
  `'within-radius'` (nothing sent)

##### Example

```typescript
const pois = await client.venues.listPois({ venueId: 1 });
const res = await client.spatial.analyzeCustomPois({
  lat: 48.85,
  lon: 2.35,
  customPois: pois.features,
  operation: 'within-radius',
  radiusMeters: 50,
});
res.pois.forEach((p) => console.log(p.name, p.distance_meters));
```

#### Call Signature

> **analyzeCustomPois**\<`T`\>(`namespace`, `request`, `requestOptions?`): `Promise`\<[`AnalyzeCustomPoisResult`](../interfaces/AnalyzeCustomPoisResult.md)\<`T`\>\>

Legacy positional form (namespace first); the object form is `analyzeCustomPois({ lat, lon, customPois, operation, namespace })`.

##### Type Parameters

###### T

`T` *extends* [`CustomPoiInput`](../interfaces/CustomPoiInput.md) = [`CustomPoiInput`](../interfaces/CustomPoiInput.md)

##### Parameters

###### namespace

`string`

###### request

[`AnalyzeCustomPoisRequest`](../interfaces/AnalyzeCustomPoisRequest.md)\<`T`\>

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`AnalyzeCustomPoisResult`](../interfaces/AnalyzeCustomPoisResult.md)\<`T`\>\>

***

### nearestAssets()

> **nearestAssets**(`options`): `Promise`\<[`SpatialAssetsResponse`](../type-aliases/SpatialAssetsResponse.md)\>

Assets nearest to the point, from the namespace's position cache (GET
`/spatial/assets/{namespace}/nearest-to-point`), ascending `distance_meters`.

`maxAge` is applied by the server **after** `limit`, so fewer than `limit` fresh assets can come back; when no
cached asset is left the server falls back to an Elasticsearch search, which today yields no assets
(USI-P3-8). Pass `maxAge` so that this fallback stays time-bounded. `search` keeps (`include`) or drops
(`exclude`) the assets whose `field` matches the regex `pattern`. Never sends `level`.

#### Parameters

##### options

[`NearestAssetsOptions`](../interfaces/NearestAssetsOptions.md) & `Omit`\<[`RtlsContext`](../interfaces/RtlsContext.md), `"level"`\> & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`SpatialAssetsResponse`](../type-aliases/SpatialAssetsResponse.md)\>

#### Throws

status 0 for an out-of-range point or a numeric `maxAge` that is not finite or is
  below 1 ms once truncated (nothing sent); status 400 for `limit` outside 1–100 or an invalid `maxAge` string

#### Example

```typescript
const res = await client.spatial.nearestAssets({ lat: 48.85, lon: 2.35, limit: 5, maxAge: '15m' });
res.assets.forEach((a) => console.log(a.user_udid, a.distance_meters));
```

***

### nearestAssetsRealtime()

> **nearestAssetsRealtime**(`options`): `Promise`\<[`SpatialAssetsResponse`](../type-aliases/SpatialAssetsResponse.md)\>

Assets nearest to the point, from the position cache only (GET `/spatial/assets/{namespace}/nearest-realtime`),
ascending `distance_meters`; items carry `color`, `model`, `speed`, `path`. Never sends `max_age` or `level`.

#### Parameters

##### options

[`NearestAssetsRealtimeOptions`](../type-aliases/NearestAssetsRealtimeOptions.md) & `Omit`\<[`RtlsContext`](../interfaces/RtlsContext.md), `"level"`\> & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`SpatialAssetsResponse`](../type-aliases/SpatialAssetsResponse.md)\>

#### Throws

status 0 for an out-of-range point (nothing sent); status 400 for `limit` outside
  1–100
