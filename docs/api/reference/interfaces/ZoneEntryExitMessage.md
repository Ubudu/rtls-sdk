[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / ZoneEntryExitMessage

# Interface: ZoneEntryExitMessage

M2: zone enter or exit. The tag is `user_udid`; there is no `user_uuid` on this kind.

## Properties

### action

> **action**: `"notifyEvent"`

***

### event\_type

> **event\_type**: `"ENTER_ZONE"` \| `"EXIT_ZONE"`

***

### app\_namespace

> **app\_namespace**: `string`

***

### map\_uuid?

> `optional` **map\_uuid?**: `string`

***

### user\_udid

> **user\_udid**: `string`

***

### zone

> **zone**: [`WsZoneStub`](WsZoneStub.md) \| [`WsZoneFeature`](WsZoneFeature.md) \| `null`

`null` = the outside-all-zones pseudo-zone; a stub on synthetic exits.

***

### timestamp?

> `optional` **timestamp?**: `string` \| `number`

***

### user\_name?

> `optional` **user\_name?**: `string`

***

### external\_id?

> `optional` **external\_id?**: `string` \| `null`

***

### tags?

> `optional` **tags?**: `string`[]

***

### data?

> `optional` **data?**: `Record`\<`string`, `unknown`\>

***

### path?

> `optional` **path?**: `string` \| `null`

***

### model?

> `optional` **model?**: `string` \| `null`

***

### color?

> `optional` **color?**: `string` \| `null`

***

### visit\_id?

> `optional` **visit\_id?**: `string` \| `null`

***

### start\_ts?

> `optional` **start\_ts?**: `string` \| `number` \| `null`

ISO string on the live wire (LT-R3); a number is accepted too.

***

### exit\_ts?

> `optional` **exit\_ts?**: `string` \| `number` \| `null`

ISO string on the live wire; `null` on ENTER_ZONE.
