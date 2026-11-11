[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / RouteResult

# Interface: RouteResult

200 body of `shortestPath` / `accessiblePath`.

## Properties

### success

> **success**: `true`

***

### path

> **path**: [`RouteNode`](RouteNode.md)[]

***

### distance

> **distance**: `number`

metres (haversine)

***

### estimatedTime

> **estimatedTime**: `number`

seconds (`distance / walkingSpeed`)

***

### algorithm

> **algorithm**: `string` & `object` \| `"astar"`

***

### dataSource

> **dataSource**: `"real"` \| `"mock"`

***

### roundTripInfo?

> `optional` **roundTripInfo?**: [`RoundTripInfo`](RoundTripInfo.md)
