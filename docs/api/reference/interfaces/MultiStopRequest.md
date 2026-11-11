[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / MultiStopRequest

# Interface: MultiStopRequest

Body of `navigation.multiStop`.

## Properties

### start

> **start**: [`NavigationEndpoint`](../type-aliases/NavigationEndpoint.md)

***

### stops

> **stops**: [`NavigationEndpoint`](../type-aliases/NavigationEndpoint.md)[]

At least one stop.

***

### optimizeOrder?

> `optional` **optimizeOrder?**: `boolean`

Default `true` (server).

***

### algorithm?

> `optional` **algorithm?**: [`TspAlgorithm`](../type-aliases/TspAlgorithm.md)

Default `'twoOpt'` (server).

***

### returnToStart?

> `optional` **returnToStart?**: `boolean`

***

### walkingSpeed?

> `optional` **walkingSpeed?**: `number`

m/s, server default 1.2; must be > 0.

***

### stopNames?

> `optional` **stopNames?**: `string`[]

Names of the stops, by input position; length ≤ `stops.length`.
