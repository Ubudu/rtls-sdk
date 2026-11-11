[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationCleanupPolicy

# Interface: NotificationCleanupPolicy

The caller's retention policy. `_id` absent = server defaults (30 / 180 days), nothing stored.

## Remarks

Spec: correct fields, but it does not say that `_id`, `updated_at` and `__v` are absent for defaults.

## Properties

### app\_namespace

> **app\_namespace**: `string`

***

### user\_id

> **user\_id**: `string`

***

### auto\_archive\_days

> **auto\_archive\_days**: `number`

***

### auto\_purge\_days

> **auto\_purge\_days**: `number`

***

### \_id?

> `optional` **\_id?**: `string`

***

### updated\_at?

> `optional` **updated\_at?**: `number`

***

### \_\_v?

> `optional` **\_\_v?**: `number`
