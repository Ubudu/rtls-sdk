[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationSecret

# Type Alias: NotificationSecret

> **NotificationSecret** = `string` \| [`NotificationRedactedSecret`](../interfaces/NotificationRedactedSecret.md)

A secret of the tenant configuration. Write: a plain string. Read: the redacted object. Sending the redacted
object back keeps the stored secret.

## Remarks

Spec: the tenant configuration is untyped; secret redaction is not documented.
