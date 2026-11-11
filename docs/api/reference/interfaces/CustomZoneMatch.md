[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / CustomZoneMatch

# Interface: CustomZoneMatch\<P\>

One custom zone of `analyzeCustomZones`: its index in the input and its echoed properties.

## Type Parameters

### P

`P` = `Record`\<`string`, `unknown`\>

## Properties

### index

> **index**: `number`

***

### properties

> **properties**: `P`

The Feature's properties (`{}` when absent).

***

### distance\_meters

> **distance\_meters**: `number`

***

### centroid\_distance\_meters

> **centroid\_distance\_meters**: `number`

***

### is\_inside

> **is\_inside**: `boolean`

***

### centroid

> **centroid**: [`SpatialPoint`](SpatialPoint.md)
