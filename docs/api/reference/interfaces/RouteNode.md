[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / RouteNode

# Interface: RouteNode

One node of a route.

## Extended by

- [`MultiStopRouteNode`](MultiStopRouteNode.md)

## Properties

### id

> **id**: `number` \| `null`

`null` for POI nodes (the server `parseInt`s node ids).

***

### name

> **name**: `string`

Path node: its name, or `'Node <id>'` when unnamed; POI node: the POI name.

***

### type

> **type**: `"poi"` \| [`PathNodeType`](../type-aliases/PathNodeType.md)

The node's `node_type` (`'waypoint'` when absent), or `'poi'`.

***

### level

> **level**: `number`

***

### coordinates

> **coordinates**: \[`number`, `number`\]

`[lon, lat]`

***

### x

> **x**: `number`

lon

***

### y

> **y**: `number`

lat
