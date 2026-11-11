[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationDelivery

# Interface: NotificationDelivery

The outcome of one channel fan-out.

## Remarks

Spec: `deliveries[].channel` is a plain string; the `error` codes are not documented.

## Properties

### channel

> **channel**: `string`

***

### status

> **status**: `"failed"` \| `"queued"` \| `"sent"` \| `"skipped"`

***

### error?

> `optional` **error?**: `string`

Sanitized code, e.g. `'not_connected'`, `'not_verified'`, `'rate_limited'`, `'smtp_error'`.

***

### ts?

> `optional` **ts?**: `number`

Epoch milliseconds.
