[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationRecipientMapping

# Interface: NotificationRecipientMapping

Who receives matching engine events, besides rule owners (role-gated: `manage_api_keys`).

## Remarks

Spec: `id` is not an ObjectId (`'map_<epochms>_<seq>'`); `roles` and `zone_responsibles` are stored but
  not resolved by the server.

## Properties

### id

> **id**: `string`

***

### enabled

> **enabled**: `boolean`

***

### match?

> `optional` **match?**: [`NotificationRuleMatch`](NotificationRuleMatch.md)

***

### recipients?

> `optional` **recipients?**: `object`

#### roles?

> `optional` **roles?**: `string`[]

#### zone\_responsibles?

> `optional` **zone\_responsibles?**: `number`[]

#### user\_ids?

> `optional` **user\_ids?**: `string`[]

***

### channels?

> `optional` **channels?**: [`NotificationChannel`](../type-aliases/NotificationChannel.md)[]
