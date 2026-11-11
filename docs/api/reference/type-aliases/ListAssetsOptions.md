[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / ListAssetsOptions

# Type Alias: ListAssetsOptions

> **ListAssetsOptions** = [`QueryOptions`](../interfaces/QueryOptions.md) & [`FilterOptions`](FilterOptions.md) & `object`

Options of `assets.list` / `iterate` / `getAll` (the server matches `key`/`value`; the rest is local).

## Type Declaration

### key?

> `optional` **key?**: `string`

Server-side exact match on this field (dot path, for example `data.zone`); requires `value`.

### value?

> `optional` **value?**: `string` \| `number` \| `boolean`

The value `key` must have; sent as `String(value)`; requires `key`.

### filters?

> `optional` **filters?**: [`FilterOptions`](FilterOptions.md)

Filters evaluated locally; merged with the top-level `"field:op"` keys (these filters win on the same key).
