[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / TagLostMessage

# Interface: TagLostMessage

M5: tag lost, one event per zone whose presence expired.

## Properties

### action

> **action**: `"notifyEvent"`

***

### event\_type

> **event\_type**: `"USR_EXIT"`

***

### app\_namespace

> **app\_namespace**: `string`

***

### user\_udid

> **user\_udid**: `string`

***

### is\_synthetic\_exit?

> `optional` **is\_synthetic\_exit?**: `boolean`

***

### map\_uuid?

> `optional` **map\_uuid?**: `string`

***

### zone?

> `optional` **zone?**: [`WsZoneStub`](WsZoneStub.md) \| [`WsZoneFeature`](WsZoneFeature.md) \| `null`

***

### user\_name?

> `optional` **user\_name?**: `string`

***

### tags?

> `optional` **tags?**: `string`[] \| `null`

***

### data?

> `optional` **data?**: `Record`\<`string`, `unknown`\>

***

### external\_id?

> `optional` **external\_id?**: `string` \| `null`
