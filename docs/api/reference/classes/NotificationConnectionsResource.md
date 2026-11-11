[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationConnectionsResource

# Class: NotificationConnectionsResource

Per-user channel connections: list, get, upsert, test, delete. Secrets are write-only: they come back as
`{ set: true, fingerprint }`.

## Extends

- `ResourceBase`

## Methods

### list()

> **list**(`options?`): `Promise`\<[`NotificationConnection`](../interfaces/NotificationConnection.md)[]\>

The caller's connections (secrets redacted).

#### Parameters

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationConnection`](../interfaces/NotificationConnection.md)[]\>

#### Throws

no namespace (per call or client default); nothing is sent

***

### get()

> **get**(`id`, `options?`): `Promise`\<[`NotificationConnection`](../interfaces/NotificationConnection.md)\>

One connection by id (secrets redacted).

#### Parameters

##### id

`string`

the connection's `_id` (24-hex ObjectId)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationConnection`](../interfaces/NotificationConnection.md)\>

#### Throws

status 0 when `id` is not an ObjectId; nothing is sent

#### Throws

unknown id

***

### upsert()

> **upsert**(`input`, `options?`): `Promise`\<[`NotificationConnection`](../interfaces/NotificationConnection.md)\>

Creates or replaces the caller's connection for `input.channel` (one per channel): the credentials are
replaced, `verified` is reset to `false` and `created_at` is reset. An unverified connection is never used by
the fan-out: call [test](#test) to verify it.

#### Parameters

##### input

[`NotificationConnectionInput`](../type-aliases/NotificationConnectionInput.md)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationConnection`](../interfaces/NotificationConnection.md)\>

#### Throws

status 400 for an invalid channel, or `apiCode 'ssrf_blocked'` for a rejected
  outbound URL

#### Example

```typescript
const inapp = await client.notifications.connections.upsert({ channel: 'inapp' });
```

***

### test()

> **test**(`id`, `options?`): `Promise`\<[`NotificationConnectionTestResult`](../interfaces/NotificationConnectionTestResult.md)\>

Sends a test message through a connection. On success (200) the connection becomes verified. A delivery that
did not go through (422 `{ verified: false, delivery }`) **resolves** with that result instead of throwing.

For every channel except `inapp` this sends a **real external message** when credentials are present.

#### Parameters

##### id

`string`

the connection's `_id` (24-hex ObjectId)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationConnectionTestResult`](../interfaces/NotificationConnectionTestResult.md)\>

#### Throws

status 0 when `id` is not an ObjectId; status 422 when the body is not a test result

#### Throws

unknown id (nothing is sent)

#### Example

```typescript
const { verified, delivery } = await client.notifications.connections.test(connection._id);
if (!verified) console.log(delivery.status, delivery.error);
```

***

### delete()

> **delete**(`id`, `options?`): `Promise`\<`void`\>

Deletes a connection (204).

#### Parameters

##### id

`string`

the connection's `_id` (24-hex ObjectId)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<`void`\>

#### Throws

status 0 when `id` is not an ObjectId; nothing is sent

#### Throws

unknown id
