[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / EvacuationRouteResult

# Interface: EvacuationRouteResult

200 body of `evacuationRoute`.

## Properties

### success

> **success**: `true`

***

### emergency

> **emergency**: `true`

***

### path

> **path**: [`RouteNode`](RouteNode.md)[] \| `null`

***

### exit

> **exit**: [`NavigationPoi`](NavigationPoi.md)

***

### distance

> **distance**: `number`

***

### estimatedEvacuationTime

> **estimatedEvacuationTime**: `number`

seconds (`distance / 2`)
