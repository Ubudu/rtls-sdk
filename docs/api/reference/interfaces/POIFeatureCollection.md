[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / POIFeatureCollection

# Interface: POIFeatureCollection

`GET /venues/{ns}/{venueId}/pois`. Hand-written: `metadata` optional, `total`/`hasMore` on filtered calls.

## Extends

- [`GeoJSONFeatureCollection`](GeoJSONFeatureCollection.md)\<[`POIFeature`](../type-aliases/POIFeature.md)\>

## Properties

### type

> **type**: `"FeatureCollection"`

#### Inherited from

[`GeoJSONFeatureCollection`](GeoJSONFeatureCollection.md).[`type`](GeoJSONFeatureCollection.md#type)

***

### features

> **features**: [`POIFeature`](../type-aliases/POIFeature.md)[]

#### Inherited from

[`GeoJSONFeatureCollection`](GeoJSONFeatureCollection.md).[`features`](GeoJSONFeatureCollection.md#features)

***

### total?

> `optional` **total?**: `number`

Present when a filter was sent: the number of matching features.

#### Inherited from

[`GeoJSONFeatureCollection`](GeoJSONFeatureCollection.md).[`total`](GeoJSONFeatureCollection.md#total)

***

### hasMore?

> `optional` **hasMore?**: `boolean`

Present when a filter and `limit`/`offset` were sent (the SDK never sends `limit`/`offset`).

#### Inherited from

[`GeoJSONFeatureCollection`](GeoJSONFeatureCollection.md).[`hasMore`](GeoJSONFeatureCollection.md#hasmore)

***

### metadata?

> `optional` **metadata?**: [`CollectionMetadata`](CollectionMetadata.md)\<`"pois"`\>

#### Overrides

[`GeoJSONFeatureCollection`](GeoJSONFeatureCollection.md).[`metadata`](GeoJSONFeatureCollection.md#metadata)
