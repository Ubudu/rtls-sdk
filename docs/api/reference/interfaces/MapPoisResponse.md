[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / MapPoisResponse

# ~~Interface: MapPoisResponse~~

Body of `GET /venues/{ns}/{venueId}/maps/{mapId}/pois`: `{ items, total }`, not GeoJSON (spec gap).

## Deprecated

sample data only; always empty for real namespaces (USI-P4-6). Use `venues.listPois({ level })`.

## Properties

### ~~items~~

> **items**: [`RawPoi`](RawPoi.md)[]

***

### ~~total~~

> **total**: `number`

***

### ~~limit?~~

> `optional` **limit?**: `number`

***

### ~~offset?~~

> `optional` **offset?**: `number`

***

### ~~hasMore?~~

> `optional` **hasMore?**: `boolean`
