[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationRulesResource

# Class: NotificationRulesResource

Per-user notification rules: list, get, create, update, delete. Every rule belongs to the caller (the user who
created the API key).

An **enabled** rule subscribes its owner to every matching engine event, and an absent or empty `match` matches
every event.

## Extends

- `ResourceBase`

## Methods

### list()

> **list**(`options?`): `Promise`\<[`NotificationRule`](../interfaces/NotificationRule.md)[]\>

The caller's rules.

#### Parameters

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationRule`](../interfaces/NotificationRule.md)[]\>

#### Throws

no namespace (per call or client default); nothing is sent

***

### get()

> **get**(`id`, `options?`): `Promise`\<[`NotificationRule`](../interfaces/NotificationRule.md)\>

One rule by id.

#### Parameters

##### id

`string`

the rule's `_id` (24-hex ObjectId)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationRule`](../interfaces/NotificationRule.md)\>

#### Throws

status 0 when `id` is not an ObjectId; nothing is sent

#### Throws

unknown id

***

### create()

> **create**(`input`, `options?`): `Promise`\<[`NotificationRule`](../interfaces/NotificationRule.md)\>

Creates a rule. `enabled` is required: the server would default it to `true` and subscribe the caller to every
matching event at once.

#### Parameters

##### input

[`NotificationRuleInput`](../interfaces/NotificationRuleInput.md)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationRule`](../interfaces/NotificationRule.md)\>

#### Throws

status 0 when `input.enabled` is not a boolean (nothing is sent); status 400 for an
  invalid value (first problem in `message`)

#### Example

```typescript
const rule = await client.notifications.rules.create({
  enabled: false,
  name: 'Critical alerts to Slack',
  match: { kinds: ['alert'], min_severity: 'critical' },
  channels: ['slack'],
});
```

***

### update()

> **update**(`id`, `patch`, `options?`): `Promise`\<[`NotificationRule`](../interfaces/NotificationRule.md)\>

Updates the given keys of a rule (`{}` leaves it unchanged).

`match` is replaced wholesale, not merged; `channels: []` is ignored by the server, so channels cannot be
cleared (USI-P6-9). Enabling a broad rule subscribes the caller to every matching event.

#### Parameters

##### id

`string`

the rule's `_id` (24-hex ObjectId)

##### patch

[`NotificationRulePatch`](../type-aliases/NotificationRulePatch.md)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationRule`](../interfaces/NotificationRule.md)\>

#### Throws

status 0 when `id` is not an ObjectId; status 400 for an invalid value

#### Throws

unknown id

***

### delete()

> **delete**(`id`, `options?`): `Promise`\<`void`\>

Deletes a rule (204).

#### Parameters

##### id

`string`

the rule's `_id` (24-hex ObjectId)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<`void`\>

#### Throws

status 0 when `id` is not an ObjectId; nothing is sent

#### Throws

unknown id
