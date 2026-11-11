[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / AssetHistoryEntry

# Interface: AssetHistoryEntry

One entry of the audit trail of an asset record (`GET /asset_history/…`): not a position.

Spec defect: the spec does not name this schema; `user` and `app_namespace` may be absent, and `timestamp` is unix
**seconds** as a decimal string (`"0"` when the server could not read it), USI-P2-7.

## Properties

### id

> **id**: `string`

***

### action

> **action**: [`AssetHistoryAction`](../type-aliases/AssetHistoryAction.md)

***

### timestamp

> **timestamp**: `string`

Unix seconds as a decimal string; `"0"` when unknown.

***

### app\_namespace?

> `optional` **app\_namespace?**: `string`

***

### user?

> `optional` **user?**: `string`

Absent on entries written without a user.

***

### data?

> `optional` **data?**: [`Asset`](Asset.md)

The asset after the action; absent on `delete` entries.
