[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationItem

# Interface: NotificationItem

One inbox item of the caller (spec name `Notification`; not exported under that name because it shadows the DOM
global).

## Remarks

Spec: `zone`, `asset`, `mission` and `params` are property-less objects, and the list endpoint is
  declared as `Notification[]` although it defaults to group rows (USI-P6-2).

## Properties

### \_id

> **\_id**: `string`

24-hex ObjectId.

***

### app\_namespace

> **app\_namespace**: `string`

***

### user\_id

> **user\_id**: `string`

The recipient.

***

### event\_id

> **event\_id**: `string`

***

### kind

> **kind**: [`NotificationKind`](../type-aliases/NotificationKind.md)

***

### event\_type?

> `optional` **event\_type?**: `string`

`/send` default `'NOTIFICATION'`.

***

### severity

> **severity**: [`NotificationSeverity`](../type-aliases/NotificationSeverity.md)

`/send` default `'info'`.

***

### title?

> `optional` **title?**: `string`

***

### body?

> `optional` **body?**: `string`

Markdown; render it as untrusted content.

***

### source?

> `optional` **source?**: [`NotificationSource`](../type-aliases/NotificationSource.md)

Server-stamped (USI-P6-1).

***

### source\_ref?

> `optional` **source\_ref?**: `string`

`'user:<id>'` for sends.

***

### zone?

> `optional` **zone?**: [`NotificationZoneRef`](NotificationZoneRef.md)

Never set by `/send` (USI-P6-7).

***

### asset?

> `optional` **asset?**: [`NotificationAssetRef`](NotificationAssetRef.md)

Never set by `/send` (USI-P6-7).

***

### rule\_id?

> `optional` **rule\_id?**: `string`

***

### mission\_id?

> `optional` **mission\_id?**: `string`

Missions only.

***

### conversation\_id?

> `optional` **conversation\_id?**: `string`

Direct messages only.

***

### params?

> `optional` **params?**: `Record`\<`string`, `unknown`\>

Opaque passthrough, by design.

***

### thread\_key

> **thread\_key**: `string`

***

### search\_text?

> `optional` **search\_text?**: `string`

***

### read

> **read**: `boolean`

***

### read\_at

> **read\_at**: `number` \| `null`

***

### acknowledged

> **acknowledged**: `boolean`

***

### acked\_at

> **acked\_at**: `number` \| `null`

***

### acked\_by

> **acked\_by**: `string` \| `null`

***

### archived

> **archived**: `boolean`

***

### archived\_at

> **archived\_at**: `number` \| `null`

***

### pinned

> **pinned**: `boolean`

***

### muted

> **muted**: `boolean`

***

### snooze\_until

> **snooze\_until**: `number` \| `null`

***

### mission?

> `optional` **mission?**: [`NotificationMission`](NotificationMission.md)

Missions only.

***

### deliveries?

> `optional` **deliveries?**: [`NotificationDelivery`](NotificationDelivery.md)[]

Written after the fan-out; absent from the `/send` 201 body.

***

### created\_at

> **created\_at**: `number`

Epoch milliseconds.

***

### \_\_v?

> `optional` **\_\_v?**: `number`
