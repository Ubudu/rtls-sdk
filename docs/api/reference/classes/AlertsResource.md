[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / AlertsResource

# Class: AlertsResource

Fired alerts and the deprecated alert-rule methods.

## Extends

- `ResourceBase`

## Methods

### list()

#### Call Signature

> **list**(`options?`): `Promise`\<[`AlertEvent`](../interfaces/AlertEvent.md)[]\>

Fired alerts of the namespace (`GET /es/alerts/{appNamespace}`), newest first. The range is inclusive and
defaults to the last 24 hours (only `timestampFrom` → up to now; only `timestampTo` → the 24 hours before it).
`set_variable` events are never returned; there is no pagination: `size` (1…10 000, server default 100) caps
the result.

##### Parameters

###### options?

[`ListAlertsOptions`](../interfaces/ListAlertsOptions.md) & [`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

`timestampFrom` / `timestampTo` (`Date`, epoch ms or a date string), `size`, per-call
  `namespace` and request options

##### Returns

`Promise`\<[`AlertEvent`](../interfaces/AlertEvent.md)[]\>

##### Throws

status 0 for `size` outside 1…10 000 or not an integer, an invalid bound, or
  `timestampFrom` after `timestampTo` (nothing is sent)

##### Throws

when no namespace is given or set (nothing is sent)

##### Example

```typescript
const alerts = await client.alerts.list({ timestampFrom: Date.now() - 7 * 86_400_000, size: 50 });
for (const a of alerts) console.log(new Date(a.timestamp).toISOString(), a.event.type, a.event.title);
```

#### Call Signature

> **list**(`options`, `requestOptions`): `Promise`\<[`AlertEvent`](../interfaces/AlertEvent.md)[]\>

##### Parameters

###### options

[`ListAlertsOptions`](../interfaces/ListAlertsOptions.md) & [`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md) \| `undefined`

###### requestOptions

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`AlertEvent`](../interfaces/AlertEvent.md)[]\>

##### Deprecated

since 0.3.0 — 0.2.0 two-object form: pass the request options in `options`.

#### Call Signature

> **list**(`namespace`, `options?`, `requestOptions?`): `Promise`\<[`AlertEvent`](../interfaces/AlertEvent.md)[]\>

Legacy positional form: explicit namespace.

##### Parameters

###### namespace

`string`

###### options?

[`ListAlertsOptions`](../interfaces/ListAlertsOptions.md)

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`AlertEvent`](../interfaces/AlertEvent.md)[]\>

***

### ~~getRules()~~

#### Call Signature

> **getRules**(`options?`): `Promise`\<[`AlertRuleSet`](../interfaces/AlertRuleSet.md)\>

The namespace's alert-rule document, normalised to `{ name, rules }`; same request and result as
`client.alertRules.get()`.

##### Parameters

###### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`AlertRuleSet`](../interfaces/AlertRuleSet.md)\>

##### Deprecated

since 0.3.0 — use `client.alertRules.get()`.

##### Throws

when no namespace is given or set (nothing is sent)

##### Example

```typescript
const set = await client.alertRules.get();
```

#### Call Signature

> **getRules**(`namespace`, `requestOptions?`): `Promise`\<[`AlertRuleSet`](../interfaces/AlertRuleSet.md)\>

##### Parameters

###### namespace

`string`

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`AlertRuleSet`](../interfaces/AlertRuleSet.md)\>

##### Deprecated

since 0.3.0 — use `client.alertRules.get({ namespace })`.

***

### ~~saveRules()~~

#### Call Signature

> **saveRules**(`rules`, `options?`): `Promise`\<`void`\>

Saves alert rules, always as the `{ name, rules }` document and always validated. A rule set (an object with a
`rules` array) is written as it is (`client.alertRules.replace()`). An array of rules reads the stored document
first and writes `{ ...stored extra keys, name: stored name, rules }` (full replace of the rules; a legacy
`decisions` key is dropped). SDK 0.2.0 posted the bare array here, which stopped every rule of the namespace.

##### Parameters

###### rules

[`AlertRuleSet`](../interfaces/AlertRuleSet.md) \| [`AlertRule`](../interfaces/AlertRule.md)[]

###### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<`void`\>

##### Deprecated

since 0.3.0 — use `client.alertRules.replace()` or `upsertRule` / `removeRule` / `setRuleEnabled`.

##### Throws

status 0 when the resulting set is invalid (nothing is written)

##### Throws

when no namespace is given or set (nothing is sent)

##### Example

```typescript
const set = await client.alertRules.get();
await client.alertRules.replace({ ...set, rules: set.rules });
```

#### Call Signature

> **saveRules**(`namespace`, `rules`, `requestOptions?`): `Promise`\<`void`\>

##### Parameters

###### namespace

`string`

###### rules

[`AlertRuleSet`](../interfaces/AlertRuleSet.md) \| [`AlertRule`](../interfaces/AlertRule.md)[]

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<`void`\>

##### Deprecated

since 0.3.0 — use `client.alertRules.replace(set, { namespace })`.
