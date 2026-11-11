[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / AssetPosition

# Interface: AssetPosition

A position document of `GET /es/last_positions` and `GET /es/position_history` (latest first / ascending).

## Properties

### timestamp

> **timestamp**: `number`

Epoch milliseconds.

***

### user

> **user**: [`AssetPositionUser`](AssetPositionUser.md)

***

### location?

> `optional` **location?**: `object`

#### lat

> **lat**: `number`

#### lon

> **lon**: `number`

***

### map\_uuid?

> `optional` **map\_uuid?**: `string`

***

### origin?

> `optional` **origin?**: `number`

***

### origin\_detail?

> `optional` **origin\_detail?**: `string`

`'declared'` for declared positions.

***

### zone?

> `optional` **zone?**: [`PositionZone`](PositionZone.md) \| `null`

***

### model?

> `optional` **model?**: `string`

***

### color?

> `optional` **color?**: `string`

***

### path?

> `optional` **path?**: `string`

***

### dateCreated?

> `optional` **dateCreated?**: `number`

Epoch milliseconds.

***

### dateChanged?

> `optional` **dateChanged?**: `number`

Epoch milliseconds.

***

### battery\_percent?

> `optional` **battery\_percent?**: `number`

***

### is\_virtual?

> `optional` **is\_virtual?**: `boolean`

***

### declared\_location?

> `optional` **declared\_location?**: [`DeclaredLocation`](DeclaredLocation.md) \| `null`

***

### span?

> `optional` **span?**: `object`

Present on position-history items.

#### dist?

> `optional` **dist?**: `number`
