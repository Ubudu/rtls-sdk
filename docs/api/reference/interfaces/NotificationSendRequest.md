[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationSendRequest

# Interface: NotificationSendRequest

A `send()` request. Only the defined keys are sent; the SDK never sends `source`.

## Remarks

Spec: `kind` is declared required (the server defaults it); `mission_id` and `event_type` are not
  documented; `zone`, `asset` and `rule_id` are ignored by the server (USI-P6-7).

## Properties

### recipients

> **recipients**: [`NotificationRecipient`](NotificationRecipient.md)[]

***

### kind?

> `optional` **kind?**: [`NotificationKind`](../type-aliases/NotificationKind.md)

Server default `'direct_message'`.

***

### severity?

> `optional` **severity?**: [`NotificationSeverity`](../type-aliases/NotificationSeverity.md)

Server default `'info'`; `'critical'` needs the `send_notifications` role.

***

### title?

> `optional` **title?**: `string`

***

### body?

> `optional` **body?**: `string`

Markdown, rendered as untrusted.

***

### params?

> `optional` **params?**: `Record`\<`string`, `unknown`\>

Put zone/asset context here (the server ignores `zone` / `asset`).

***

### channels?

> `optional` **channels?**: [`NotificationChannel`](../type-aliases/NotificationChannel.md)[]

External fan-out to each recipient's verified connections; absent = nothing leaves the platform.

***

### conversation\_id?

> `optional` **conversation\_id?**: `string`

Direct-message threading → thread key `'dm:<id>'`.

***

### mission\_id?

> `optional` **mission\_id?**: `string`

Mission threading → thread key `'mission:<id>'`.

***

### mission?

> `optional` **mission?**: `object`

Kept only for `kind: 'mission'`; `due` is sent as epoch milliseconds.

#### assignee?

> `optional` **assignee?**: `string`

#### status?

> `optional` **status?**: [`NotificationMissionStatus`](../type-aliases/NotificationMissionStatus.md)

#### due?

> `optional` **due?**: `string` \| `number` \| `Date`

***

### event\_type?

> `optional` **event\_type?**: `string`

Default `'NOTIFICATION'`; matched by rule `match.event_types`.
