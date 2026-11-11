[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationGroup

# Interface: NotificationGroup

One group row of `listGroups()`, built from the current page only (at most `limit` newest matching items).

## Remarks

Spec: the list endpoint is declared as `Notification[]`; group rows are not documented (USI-P6-2).

## Properties

### group\_key

> **group\_key**: `string`

`thread` → the thread key; `type` → the kind; `zone` → `zone:<id>` / `no-zone`; `asset` → `asset:<udid>` / `no-asset`.

***

### group\_by

> **group\_by**: [`NotificationGroupBy`](../type-aliases/NotificationGroupBy.md)

***

### item\_ids

> **item\_ids**: `string`[]

***

### newest

> **newest**: `object`

#### \_id

> **\_id**: `string`

#### title?

> `optional` **title?**: `string`

#### severity

> **severity**: [`NotificationSeverity`](../type-aliases/NotificationSeverity.md)

#### created\_at

> **created\_at**: `number`

#### thread\_key

> **thread\_key**: `string`

***

### count

> **count**: `number`

***

### unread\_count

> **unread\_count**: `number`

***

### max\_severity

> **max\_severity**: [`NotificationSeverity`](../type-aliases/NotificationSeverity.md)

***

### needs\_ack

> **needs\_ack**: `boolean`

Any actionable, unacknowledged item in the group.
