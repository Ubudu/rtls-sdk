[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / MultiStopRouteNode

# Interface: MultiStopRouteNode

One node of a multi-stop route; stop nodes carry the stop markers.

## Extends

- [`RouteNode`](RouteNode.md)

## Properties

### id

> **id**: `number` \| `null`

`null` for POI nodes (the server `parseInt`s node ids).

#### Inherited from

[`RouteNode`](RouteNode.md).[`id`](RouteNode.md#id)

***

### name

> **name**: `string`

Path node: its name, or `'Node <id>'` when unnamed; POI node: the POI name.

#### Inherited from

[`RouteNode`](RouteNode.md).[`name`](RouteNode.md#name)

***

### type

> **type**: `"poi"` \| [`PathNodeType`](../type-aliases/PathNodeType.md)

The node's `node_type` (`'waypoint'` when absent), or `'poi'`.

#### Inherited from

[`RouteNode`](RouteNode.md).[`type`](RouteNode.md#type)

***

### level

> **level**: `number`

#### Inherited from

[`RouteNode`](RouteNode.md).[`level`](RouteNode.md#level)

***

### coordinates

> **coordinates**: \[`number`, `number`\]

`[lon, lat]`

#### Inherited from

[`RouteNode`](RouteNode.md).[`coordinates`](RouteNode.md#coordinates)

***

### x

> **x**: `number`

lon

#### Inherited from

[`RouteNode`](RouteNode.md).[`x`](RouteNode.md#x)

***

### y

> **y**: `number`

lat

#### Inherited from

[`RouteNode`](RouteNode.md).[`y`](RouteNode.md#y)

***

### isStop?

> `optional` **isStop?**: `true`

***

### stopIndex?

> `optional` **stopIndex?**: `number`

1-based index into the input `stops`.

***

### stopName?

> `optional` **stopName?**: `string`

From `stopNames`, default `'Stop <n>'`.
