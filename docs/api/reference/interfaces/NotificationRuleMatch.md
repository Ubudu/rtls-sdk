[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationRuleMatch

# Interface: NotificationRuleMatch

What a forwarding rule (or recipient mapping) matches; absent or `{}` matches every event.

## Remarks

Spec: `match` is a property-less object.

## Properties

### kinds?

> `optional` **kinds?**: [`NotificationKind`](../type-aliases/NotificationKind.md)[]

***

### min\_severity?

> `optional` **min\_severity?**: [`NotificationSeverity`](../type-aliases/NotificationSeverity.md)

***

### zones?

> `optional` **zones?**: `number`[]

***

### asset\_tags?

> `optional` **asset\_tags?**: `string`[]

***

### event\_types?

> `optional` **event\_types?**: `string`[]
