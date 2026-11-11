[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationRecipientMappingInput

# Interface: NotificationRecipientMappingInput

Input of `admin.recipientMappings.create()`. `enabled` is required: the server default is `true`.

## Remarks

Spec: the request body is the response schema (with `id`).

## Properties

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
