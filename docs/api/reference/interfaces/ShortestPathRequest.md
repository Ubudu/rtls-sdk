[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / ShortestPathRequest

# Interface: ShortestPathRequest

Body of `navigation.shortestPath`.

## Properties

### start

> **start**: [`NavigationEndpoint`](../type-aliases/NavigationEndpoint.md)

***

### end

> **end**: [`NavigationEndpoint`](../type-aliases/NavigationEndpoint.md)

***

### walkingSpeed?

> `optional` **walkingSpeed?**: `number`

m/s, server default 1.2; must be > 0.

***

### returnToStart?

> `optional` **returnToStart?**: `boolean`

The path and the distance include the way back.
