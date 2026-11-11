[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / AnalyzeCustomPoisOptions

# Interface: AnalyzeCustomPoisOptions\<T\>

`analyzeCustomPois` options. `operation` defaults to `'nearest'` (`limit`, `maxDistanceMeters` apply);
`'within-radius'` needs a positive `radiusMeters`. GeoJSON Point Features are flattened to
`{ ...properties, lat, lon }`.

## Type Parameters

### T

`T` = [`CustomPoiInput`](CustomPoiInput.md)

## Properties

### lat

> **lat**: `number`

***

### lon

> **lon**: `number`

***

### customPois

> **customPois**: (`T` \| [`GeoJSONFeature`](GeoJSONFeature.md)\<[`GeoJSONPoint`](GeoJSONPoint.md), `object`\>)[]

Flat points or GeoJSON Point Features (`client.venues.listPois()` features included).

***

### operation?

> `optional` **operation?**: [`CustomPoiOperation`](../type-aliases/CustomPoiOperation.md)

***

### limit?

> `optional` **limit?**: `number`

***

### maxDistanceMeters?

> `optional` **maxDistanceMeters?**: `number`

***

### radiusMeters?

> `optional` **radiusMeters?**: `number`
