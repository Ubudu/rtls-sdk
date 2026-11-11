[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / GeoJSONFeatureCollection

# Interface: GeoJSONFeatureCollection\<F\>

A GeoJSON feature collection as the venue routes return it. Hand-written: `metadata` is absent on some paths and
`total`/`hasMore` are added only when a filter was sent (USI-P4-5).

## Extended by

- [`ZoneFeatureCollection`](ZoneFeatureCollection.md)
- [`POIFeatureCollection`](POIFeatureCollection.md)
- [`PathFeatureCollection`](PathFeatureCollection.md)

## Type Parameters

### F

`F`

## Properties

### type

> **type**: `"FeatureCollection"`

***

### features

> **features**: `F`[]

***

### metadata?

> `optional` **metadata?**: [`CollectionMetadata`](CollectionMetadata.md)\<`string`\>

***

### total?

> `optional` **total?**: `number`

Present when a filter was sent: the number of matching features.

***

### hasMore?

> `optional` **hasMore?**: `boolean`

Present when a filter and `limit`/`offset` were sent (the SDK never sends `limit`/`offset`).
