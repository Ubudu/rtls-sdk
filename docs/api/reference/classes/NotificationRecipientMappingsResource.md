[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationRecipientMappingsResource

# Class: NotificationRecipientMappingsResource

Recipient mappings (who receives matching engine events by role, zone responsibility or user id): list, get,
create, update, delete. Ids look like `map_<epochms>_<seq>` (not ObjectIds). Role-gated (`manage_api_keys`).

The mappings are one namespace-wide document written read-modify-write: a concurrent admin edit can be lost.
An **enabled** mapping makes its recipients receive every matching engine event.

## Extends

- `ResourceBase`

## Methods

### list()

> **list**(`options?`): `Promise`\<[`NotificationRecipientMapping`](../interfaces/NotificationRecipientMapping.md)[]\>

The namespace's mappings (`[]` when none).

#### Parameters

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationRecipientMapping`](../interfaces/NotificationRecipientMapping.md)[]\>

#### Throws

without the `manage_api_keys` role

***

### get()

> **get**(`id`, `options?`): `Promise`\<[`NotificationRecipientMapping`](../interfaces/NotificationRecipientMapping.md)\>

One mapping by id.

#### Parameters

##### id

`string`

the mapping's `id` (non-empty string)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationRecipientMapping`](../interfaces/NotificationRecipientMapping.md)\>

#### Throws

status 0 for an empty id (nothing is sent)

#### Throws

unknown id

***

### create()

> **create**(`input`, `options?`): `Promise`\<[`NotificationRecipientMapping`](../interfaces/NotificationRecipientMapping.md)\>

Adds a mapping. `enabled` is required: the server would default it to `true`, which routes matching events to
the recipients at once. `recipients.roles` and `recipients.zone_responsibles` are stored but not resolved yet.

#### Parameters

##### input

[`NotificationRecipientMappingInput`](../interfaces/NotificationRecipientMappingInput.md)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationRecipientMapping`](../interfaces/NotificationRecipientMapping.md)\>

#### Throws

status 0 when `input.enabled` is not a boolean (nothing is sent); status 400 for an
  invalid value

#### Example

```typescript
const mapping = await client.notifications.admin.recipientMappings.create({
  enabled: false,
  match: { kinds: ['alert'], min_severity: 'critical' },
  recipients: { user_ids: ['user-1'] },
  channels: ['inapp'],
});
```

***

### update()

> **update**(`id`, `patch`, `options?`): `Promise`\<[`NotificationRecipientMapping`](../interfaces/NotificationRecipientMapping.md)\>

Shallow-merges the given keys into a mapping.

#### Parameters

##### id

`string`

the mapping's `id` (non-empty string)

##### patch

[`NotificationRecipientMappingPatch`](../type-aliases/NotificationRecipientMappingPatch.md)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationRecipientMapping`](../interfaces/NotificationRecipientMapping.md)\>

#### Throws

status 0 for an empty id (nothing is sent); status 400 for an invalid value

#### Throws

unknown id

***

### delete()

> **delete**(`id`, `options?`): `Promise`\<`void`\>

Deletes a mapping (204).

#### Parameters

##### id

`string`

the mapping's `id` (non-empty string)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<`void`\>

#### Throws

status 0 for an empty id (nothing is sent)

#### Throws

unknown id
