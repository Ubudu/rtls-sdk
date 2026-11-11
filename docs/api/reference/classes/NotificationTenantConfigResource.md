[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationTenantConfigResource

# Class: NotificationTenantConfigResource

The tenant notification configuration (channel settings, rate limits, retention cap): get, update. Role-gated
(`manage_api_keys`).

## Extends

- `ResourceBase`

## Methods

### get()

> **get**(`options?`): `Promise`\<[`NotificationTenantConfig`](../interfaces/NotificationTenantConfig.md)\>

The tenant configuration with every secret redacted to `{ set: true, fingerprint }`; `{ app_namespace }` alone
when nothing is stored.

#### Parameters

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationTenantConfig`](../interfaces/NotificationTenantConfig.md)\>

#### Throws

without the `manage_api_keys` role

***

### update()

> **update**(`patch`, `options?`): `Promise`\<[`NotificationTenantConfig`](../interfaces/NotificationTenantConfig.md)\>

Merges `patch` into the tenant configuration at the top level: an omitted top-level key is kept, a supplied
channel object **replaces** the stored one wholesale. Secrets are write-only: a missing, empty or redacted
(`{ set: true, fingerprint }`) secret keeps the stored one, so a fetched document can be sent back as is.
`app_namespace`, `_id`, `updated_at` and `__v` are stripped. The write always upserts a **permanent** document
(there is no delete route) and is audited. Role-gated (`manage_api_keys`).

#### Parameters

##### patch

[`NotificationTenantConfigPatch`](../type-aliases/NotificationTenantConfigPatch.md)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationTenantConfig`](../interfaces/NotificationTenantConfig.md)\>

#### Throws

status 0 when `patch` is not a plain object or has no key left after stripping
  (nothing is sent)

#### Throws

without the `manage_api_keys` role

#### Example

```typescript
const config = await client.notifications.admin.tenantConfig.get();
await client.notifications.admin.tenantConfig.update({ ...config, cleanup_cap: { max_purge_days: 365 } });
```
