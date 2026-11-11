[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / MultiStopRouteResult

# Interface: MultiStopRouteResult

200 body of `multiStop`.

## Extends

- `Omit`\<[`RouteResult`](RouteResult.md), `"path"` \| `"roundTripInfo"`\>

## Properties

### success

> **success**: `true`

#### Inherited from

[`RouteResult`](RouteResult.md).[`success`](RouteResult.md#success)

***

### distance

> **distance**: `number`

metres (haversine)

#### Inherited from

[`RouteResult`](RouteResult.md).[`distance`](RouteResult.md#distance)

***

### estimatedTime

> **estimatedTime**: `number`

seconds (`distance / walkingSpeed`)

#### Inherited from

[`RouteResult`](RouteResult.md).[`estimatedTime`](RouteResult.md#estimatedtime)

***

### algorithm

> **algorithm**: `string` & `object` \| `"astar"`

#### Inherited from

[`RouteResult`](RouteResult.md).[`algorithm`](RouteResult.md#algorithm)

***

### dataSource

> **dataSource**: `"real"` \| `"mock"`

#### Inherited from

[`RouteResult`](RouteResult.md).[`dataSource`](RouteResult.md#datasource)

***

### path

> **path**: [`MultiStopRouteNode`](MultiStopRouteNode.md)[]

***

### multiStopInfo

> **multiStopInfo**: [`MultiStopInfo`](MultiStopInfo.md)
