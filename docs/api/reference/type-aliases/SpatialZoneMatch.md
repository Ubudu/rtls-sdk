[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / SpatialZoneMatch

# Type Alias: SpatialZoneMatch

> **SpatialZoneMatch** = [`SpatialZoneFeature`](SpatialZoneFeature.md) & `object`

A zone Feature with its distances to the reference point (whole metres).

## Type Declaration

### distance\_meters

> **distance\_meters**: `number`

### centroid\_distance\_meters

> **centroid\_distance\_meters**: `number`

### centroid

> **centroid**: [`SpatialPoint`](../interfaces/SpatialPoint.md)

Average of the ring vertices; can lie outside a concave zone.

### is\_inside

> **is\_inside**: `boolean`
