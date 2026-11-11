[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / ZoneDistance

# Interface: ZoneDistance

One zone of `zoneDistances` (ascending boundary distance; non-polygon zones are skipped).

## Properties

### zone\_id

> **zone\_id**: `string` \| `number`

***

### zone\_name

> **zone\_name**: `string`

***

### level?

> `optional` **level?**: `number`

`properties.level`; absent when the zone has none.

***

### boundary\_distance\_meters

> **boundary\_distance\_meters**: `number`

***

### centroid\_distance\_meters

> **centroid\_distance\_meters**: `number`

***

### is\_inside

> **is\_inside**: `boolean`

***

### centroid

> **centroid**: [`SpatialPoint`](SpatialPoint.md)
