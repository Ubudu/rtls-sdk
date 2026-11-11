[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / WsAssetFields

# Interface: WsAssetFields

Named stored-asset fields (no index signature, so `extends` keeps them).

## Extended by

- [`WsAssetData`](WsAssetData.md)
- [`PositionMessage`](PositionMessage.md)

## Properties

### user\_name?

> `optional` **user\_name?**: `string`

***

### user\_type?

> `optional` **user\_type?**: `string`

***

### user\_motion?

> `optional` **user\_motion?**: `string`

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

### tags?

> `optional` **tags?**: `string`[]

***

### external\_id?

> `optional` **external\_id?**: `string` \| `null`

***

### data?

> `optional` **data?**: `Record`\<`string`, `unknown`\>

***

### targetApplications?

> `optional` **targetApplications?**: `unknown`

***

### battery\_percent?

> `optional` **battery\_percent?**: `number`

***

### declared\_location?

> `optional` **declared\_location?**: `Record`\<`string`, `unknown`\> \| `null`

***

### is\_virtual?

> `optional` **is\_virtual?**: `boolean`

***

### createdBy?

> `optional` **createdBy?**: `string`

***

### dateCreated?

> `optional` **dateCreated?**: `number`

***

### dateChanged?

> `optional` **dateChanged?**: `number`
