[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NearestAssetsOptions

# Interface: NearestAssetsOptions

`nearestAssets` options.

## Properties

### lat

> **lat**: `number`

***

### lon

> **lon**: `number`

***

### limit?

> `optional` **limit?**: `number`

1–100, server default 10.

***

### maxDistanceMeters?

> `optional` **maxDistanceMeters?**: `number`

Metres; sent as `max_distance`.

***

### search?

> `optional` **search?**: [`AssetSearch`](AssetSearch.md)

***

### maxAge?

> `optional` **maxAge?**: `string` \| `number`

Freshness bound: a string such as `'15m'`, `'2h'`, `'1d'` (sent verbatim), or a number of milliseconds
(truncated to an integer, which must be at least 1).
