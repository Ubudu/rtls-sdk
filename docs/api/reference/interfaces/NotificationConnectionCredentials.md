[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationConnectionCredentials

# Interface: NotificationConnectionCredentials

The credentials of a channel connection (secrets come back redacted).

## Remarks

Spec: `credentials` is a property-less object.

## Properties

### address?

> `optional` **address?**: `string`

email

***

### webhook\_url?

> `optional` **webhook\_url?**: `string`

slack

***

### bot\_token?

> `optional` **bot\_token?**: [`NotificationRedactedSecret`](NotificationRedactedSecret.md)

slack (write-only secret)

***

### chat\_id?

> `optional` **chat\_id?**: `string`

telegram

***

### workflow\_url?

> `optional` **workflow\_url?**: `string`

teams

***

### phone\_e164?

> `optional` **phone\_e164?**: `string`

whatsapp
