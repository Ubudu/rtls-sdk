[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / CachedAssetPosition

# Interface: CachedAssetPosition

A cached position (`GET /cache/{app_namespace}/positions[/{mac}]`) or the last position of one asset
(`GET /asset_last_position/{app_namespace}/{mac}`).

## Properties

### app\_namespace

> **app\_namespace**: `string`

***

### user\_udid

> **user\_udid**: `string`

The asset MAC, stored as published (12 lower-case hex on assets created through the API).

***

### user\_uuid?

> `optional` **user\_uuid?**: `string`

Set by the publisher to the same MAC as `user_udid`.

***

### user\_name?

> `optional` **user\_name?**: `string`

***

### user\_type?

> `optional` **user\_type?**: `string`

***

### user\_motion?

> `optional` **user\_motion?**: `string`

***

### external\_id?

> `optional` **external\_id?**: `string`

***

### lat

> **lat**: `number`

***

### lon

> **lon**: `number`

***

### map\_uuid?

> `optional` **map\_uuid?**: `string`

***

### timestamp

> **timestamp**: `string`

ISO 8601, second precision.

***

### origin?

> `optional` **origin?**: `number`

***

### zone?

> `optional` **zone?**: [`PositionZone`](PositionZone.md) \| `null`

***

### prev\_pos\_distance?

> `optional` **prev\_pos\_distance?**: `number`

***

### prev\_pos\_time\_diff\_seconds?

> `optional` **prev\_pos\_time\_diff\_seconds?**: `number`

***

### speed?

> `optional` **speed?**: `number`

***

### tags?

> `optional` **tags?**: `string`[]

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

### data?

> `optional` **data?**: `Record`\<`string`, `unknown`\>

Free-form asset data.

***

### createdBy?

> `optional` **createdBy?**: `string`

***

### dateCreated?

> `optional` **dateCreated?**: `number`

Epoch milliseconds.

***

### dateChanged?

> `optional` **dateChanged?**: `number`

Epoch milliseconds.

***

### targetApplications?

> `optional` **targetApplications?**: `string`[]

Declared by the spec; not observed on production responses.
