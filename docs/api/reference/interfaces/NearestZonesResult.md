[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NearestZonesResult

# Interface: NearestZonesResult

Result of `nearestZones`. `hasMore` is not meaningful here (USI-P3-13).

## Properties

### reference\_point

> **reference\_point**: [`SpatialReferencePoint`](SpatialReferencePoint.md)

***

### level

> **level**: `number` \| `null`

***

### max\_distance\_meters

> **max\_distance\_meters**: `number` \| `null`

***

### total\_zones

> **total\_zones**: `number`

***

### zones

> **zones**: [`SpatialZoneMatch`](../type-aliases/SpatialZoneMatch.md)[]

***

### hasMore?

> `optional` **hasMore?**: `boolean`
