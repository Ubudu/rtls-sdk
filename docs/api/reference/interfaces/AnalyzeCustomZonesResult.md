[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / AnalyzeCustomZonesResult

# Interface: AnalyzeCustomZonesResult\<P\>

Result of `analyzeCustomZones`.

## Type Parameters

### P

`P` = `Record`\<`string`, `unknown`\>

## Properties

### reference\_point

> **reference\_point**: [`SpatialReferencePoint`](SpatialReferencePoint.md)

***

### total\_zones

> **total\_zones**: `number`

Every input feature.

***

### containing\_zones

> **containing\_zones**: [`CustomZoneMatch`](CustomZoneMatch.md)\<`P`\>[]

***

### nearby\_zones

> **nearby\_zones**: [`CustomZoneMatch`](CustomZoneMatch.md)\<`P`\>[]

Every polygon feature, ascending distance.
