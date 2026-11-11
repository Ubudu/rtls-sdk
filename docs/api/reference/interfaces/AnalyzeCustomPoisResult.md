[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / AnalyzeCustomPoisResult

# Interface: AnalyzeCustomPoisResult\<T\>

Result of `analyzeCustomPois`.

## Type Parameters

### T

`T` = [`CustomPoiInput`](CustomPoiInput.md)

## Properties

### reference\_point

> **reference\_point**: [`SpatialReferencePoint`](SpatialReferencePoint.md)

***

### operation

> **operation**: [`CustomPoiOperation`](../type-aliases/CustomPoiOperation.md)

***

### options?

> `optional` **options?**: [`CustomPoiOperationOptions`](CustomPoiOperationOptions.md)

***

### total\_custom\_pois

> **total\_custom\_pois**: `number`

***

### matching\_pois

> **matching\_pois**: `number`

***

### pois

> **pois**: [`CustomPoiMatch`](../type-aliases/CustomPoiMatch.md)\<`T`\>[]

Ascending distance.
