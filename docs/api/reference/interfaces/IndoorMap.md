[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / IndoorMap

# Interface: IndoorMap

Item of `GET /venues/{ns}/{venueId}/maps`. Hand-written: the spec has no map schema. Several maps may share a level.

## Properties

### id

> **id**: `number`

***

### uuid

> **uuid**: `string`

***

### name

> **name**: `string`

***

### level

> **level**: `number`

***

### tiles\_url\_base

> **tiles\_url\_base**: `string`

Template with literal `{z}`, `{x}`, `{y}`; substitute on the raw string, never after `new URL()` (it encodes the
braces).

***

### map\_bounds

> **map\_bounds**: [`LatLngBounds`](../type-aliases/LatLngBounds.md)

***

### map\_features?

> `optional` **map\_features?**: `unknown`

***

### beacons\_positions?

> `optional` **beacons\_positions?**: `unknown`
