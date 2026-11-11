[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationRuleInput

# Interface: NotificationRuleInput

Input of `rules.create()`. `enabled` is required: the server would default it to `true` and subscribe the caller.

## Remarks

Spec: `POST /rules` body is the response schema (`_id`, `user_id`, … included) and does not say that
  `enabled` defaults to `true`.

## Properties

### enabled

> **enabled**: `boolean`

***

### name?

> `optional` **name?**: `string`

***

### match?

> `optional` **match?**: [`NotificationRuleMatch`](NotificationRuleMatch.md)

***

### channels?

> `optional` **channels?**: [`NotificationChannel`](../type-aliases/NotificationChannel.md)[]

***

### throttle?

> `optional` **throttle?**: [`NotificationRuleThrottle`](NotificationRuleThrottle.md)
