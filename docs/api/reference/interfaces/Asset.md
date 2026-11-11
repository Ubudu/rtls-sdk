[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / Asset

# Interface: Asset

An asset record as the server stores and returns it.

Spec defect: the `Asset` schema marks `user_motion` and `path` as required; the server requires only `user_udid`
and `user_name` (a save without `data` stores `data: {}`). The spec also omits `user_type`, `is_virtual`,
`declared_location`, `battery_percent` and `maintenance`, which the server stores. Unknown keys are kept.

## Indexable

> \[`key`: `string`\]: `unknown`

## Properties

### user\_udid

> **user\_udid**: `string`

The asset key: 12 lowercase hex characters for every asset the SDK writes.

***

### user\_name

> **user\_name**: `string`

***

### user\_motion?

> `optional` **user\_motion?**: `string`

***

### user\_type?

> `optional` **user\_type?**: `string`

***

### model?

> `optional` **model?**: `string`

***

### color?

> `optional` **color?**: `string`

***

### path?

> `optional` **path?**: `string`

A node of the asset tree, for example `"/Root/Lv 1/"`.

***

### tags?

> `optional` **tags?**: `string`[]

***

### external\_id?

> `optional` **external\_id?**: `string`

***

### targetApplications?

> `optional` **targetApplications?**: `string`[]

***

### is\_virtual?

> `optional` **is\_virtual?**: `boolean`

`true` on virtual assets (created by `bulkDeclare` with `auto_create_virtual_assets`, MAC `0200…`).

***

### declared\_location?

> `optional` **declared\_location?**: [`DeclaredLocation`](DeclaredLocation.md) \| `null`

The declared (manually set) location; absent when none is declared.

***

### data?

> `optional` **data?**: `Record`\<`string`, `unknown`\>

***

### createdBy?

> `optional` **createdBy?**: `string`

Server-owned: set to the namespace on create.

***

### dateCreated?

> `optional` **dateCreated?**: `number`

Server-owned: epoch milliseconds.

***

### dateChanged?

> `optional` **dateChanged?**: `number`

Server-owned: epoch milliseconds.

***

### battery\_percent?

> `optional` **battery\_percent?**: `number`

Server-owned.

***

### maintenance?

> `optional` **maintenance?**: `unknown`

Server-owned; dropped by every write (USI-P2-6).
