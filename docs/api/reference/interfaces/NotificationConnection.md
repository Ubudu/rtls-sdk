[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationConnection

# Interface: NotificationConnection

A channel connection of the caller (spec name `ChannelConnection`), one per channel.

## Remarks

Spec: `credentials` is a property-less object and `verified_at` / `__v` are not declared.

## Properties

### \_id

> **\_id**: `string`

***

### app\_namespace

> **app\_namespace**: `string`

***

### user\_id

> **user\_id**: `string`

***

### channel

> **channel**: [`NotificationChannel`](../type-aliases/NotificationChannel.md)

***

### enabled

> **enabled**: `boolean`

***

### verified

> **verified**: `boolean`

***

### credentials

> **credentials**: [`NotificationConnectionCredentials`](NotificationConnectionCredentials.md)

***

### created\_at

> **created\_at**: `number`

***

### verified\_at?

> `optional` **verified\_at?**: `number`

***

### \_\_v?

> `optional` **\_\_v?**: `number`
