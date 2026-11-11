[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationCleanupPolicyResource

# Class: NotificationCleanupPolicyResource

The notification retention policy: get, replace (the server has no delete route).

## Extends

- `ResourceBase`

## Methods

### get()

> **get**(`options?`): `Promise`\<[`NotificationCleanupPolicy`](../interfaces/NotificationCleanupPolicy.md)\>

The caller's policy: the stored row, or the server defaults (`auto_archive_days: 30`, `auto_purge_days: 180`)
without `_id` when nothing is stored. The read never creates a row.

#### Parameters

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationCleanupPolicy`](../interfaces/NotificationCleanupPolicy.md)\>

#### Throws

no namespace (per call or client default); nothing is sent

***

### replace()

> **replace**(`policy`, `options?`): `Promise`\<[`NotificationCleanupPolicy`](../interfaces/NotificationCleanupPolicy.md)\>

Replaces the caller's policy. Both fields are required on every write: the server resets an omitted field to
its default rather than keeping it.

Warning (USI-P6-6): this creates a **permanent** row (there is no delete route); the values are clamped to the
tenant `cleanup_cap`.

#### Parameters

##### policy

[`NotificationCleanupPolicyInput`](../interfaces/NotificationCleanupPolicyInput.md)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationCleanupPolicy`](../interfaces/NotificationCleanupPolicy.md)\>

#### Throws

status 0 unless both fields are integers `>= 1` (nothing is sent)

#### Example

```typescript
await client.notifications.cleanupPolicy.replace({ auto_archive_days: 30, auto_purge_days: 180 });
```
