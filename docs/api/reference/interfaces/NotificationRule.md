[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationRule

# Interface: NotificationRule

A forwarding rule of the caller (spec name `ForwardingRule`). An enabled rule subscribes its owner to every
matching engine event.

## Remarks

Spec: `match` and `throttle` are property-less objects and `__v` is not declared.

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

### name?

> `optional` **name?**: `string`

***

### enabled

> **enabled**: `boolean`

***

### match?

> `optional` **match?**: [`NotificationRuleMatch`](NotificationRuleMatch.md)

Absent or `{}` = matches every event.

***

### channels?

> `optional` **channels?**: [`NotificationChannel`](../type-aliases/NotificationChannel.md)[]

***

### throttle?

> `optional` **throttle?**: [`NotificationRuleThrottle`](NotificationRuleThrottle.md)

***

### created\_at

> **created\_at**: `number`

***

### \_\_v?

> `optional` **\_\_v?**: `number`
