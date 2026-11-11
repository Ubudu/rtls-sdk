[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / AnalyzeCustomZonesRequest

# Interface: AnalyzeCustomZonesRequest\<P\>

Wire body of `POST /spatial/zones/{namespace}/analyze-custom` (legacy form, sent verbatim).

## Type Parameters

### P

`P` = `Record`\<`string`, `unknown`\>

## Properties

### reference\_point

> **reference\_point**: [`SpatialReferencePoint`](SpatialReferencePoint.md)

***

### custom\_zones

> **custom\_zones**: [`GeoJSONFeatureCollection`](GeoJSONFeatureCollection.md)\<[`SpatialPolygonFeature`](../type-aliases/SpatialPolygonFeature.md)\<`P`\>\>
