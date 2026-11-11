[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / AnalyzeCustomPoisRequest

# Interface: AnalyzeCustomPoisRequest\<T\>

Wire body of `POST /spatial/pois/{namespace}/analyze-custom` (legacy form, sent verbatim).

## Type Parameters

### T

`T` = [`CustomPoiInput`](CustomPoiInput.md)

## Properties

### reference\_point

> **reference\_point**: [`SpatialReferencePoint`](SpatialReferencePoint.md)

***

### custom\_pois

> **custom\_pois**: `T`[]

***

### operation

> **operation**: [`CustomPoiOperation`](../type-aliases/CustomPoiOperation.md)

***

### options?

> `optional` **options?**: [`CustomPoiOperationOptions`](CustomPoiOperationOptions.md)
