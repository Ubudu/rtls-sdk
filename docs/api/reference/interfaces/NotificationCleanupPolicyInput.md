[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationCleanupPolicyInput

# Interface: NotificationCleanupPolicyInput

Input of `cleanupPolicy.replace()`: both fields are required (the server resets an omitted field to its default).

## Remarks

Spec: the request body is the response schema and does not say that omitted fields are reset (USI-P6-6).

## Properties

### auto\_archive\_days

> **auto\_archive\_days**: `number`

***

### auto\_purge\_days

> **auto\_purge\_days**: `number`
