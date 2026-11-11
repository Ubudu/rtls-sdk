[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / ZoneFeatureCollection

# Interface: ZoneFeatureCollection

`GET /venues/{ns}/{venueId}/zones`. Hand-written: the spec types `metadata` as required; it is not (USI-P4-5).

## Extends

- [`GeoJSONFeatureCollection`](GeoJSONFeatureCollection.md)\<[`ZoneFeature`](../type-aliases/ZoneFeature.md)\>

## Properties

### type

> **type**: `"FeatureCollection"`

#### Inherited from

[`GeoJSONFeatureCollection`](GeoJSONFeatureCollection.md).[`type`](GeoJSONFeatureCollection.md#type)

***

### features

> **features**: [`ZoneFeature`](../type-aliases/ZoneFeature.md)[]

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

> `optional` **metadata?**: [`CollectionMetadata`](CollectionMetadata.md)\<`"zones"`\>

#### Overrides

[`GeoJSONFeatureCollection`](GeoJSONFeatureCollection.md).[`metadata`](GeoJSONFeatureCollection.md#metadata)
