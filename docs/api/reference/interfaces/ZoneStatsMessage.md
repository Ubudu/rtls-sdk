[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / ZoneStatsMessage

# Interface: ZoneStatsMessage

M3: zone counter update. Times are in seconds.

## Properties

### action

> **action**: `"notifyEvent"`

***

### event\_type

> **event\_type**: `"UPDATE_ZONE_COUNTER"`

***

### app\_namespace

> **app\_namespace**: `string`

***

### zone

> **zone**: [`WsZoneStub`](WsZoneStub.md) \| [`WsZoneFeature`](WsZoneFeature.md)

***

### total

> **total**: `number`

***

### total\_tags

> **total\_tags**: `number`

***

### total\_mobiles

> **total\_mobiles**: `number`

***

### avg\_time

> **avg\_time**: `number`

***

### avg\_time\_tags

> **avg\_time\_tags**: `number`

***

### avg\_time\_mobiles

> **avg\_time\_mobiles**: `number`

***

### timestamp?

> `optional` **timestamp?**: `string` \| `number`

***

### map\_uuid?

> `optional` **map\_uuid?**: `string`

Only with a full zone Feature.

***

### is\_synthetic\_exit?

> `optional` **is\_synthetic\_exit?**: `boolean`

Set to true on every counter carrying a full Feature.
