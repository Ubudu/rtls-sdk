[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / AlertRulesResource

# Class: AlertRulesResource

Read and write the namespace's alert rules (`GET`/`POST /alert_rules/{app_namespace}`).

Every write is a full replace of the document; there is no version or ETag, so concurrent writers lose updates
(last writer wins, USI-P5-2). A write takes effect on the next position event, and enabled rules have side
effects: in-app alerts, e-mails, HTTP callbacks, asset data changes and asset deletion.

## Extends

- `ResourceBase`

## Methods

### get()

> **get**(`options?`): `Promise`\<[`AlertRuleSet`](../interfaces/AlertRuleSet.md)\>

The namespace's alert-rule document, normalised to `{ name, rules }` (read-only; never throws on an odd stored
shape): nothing stored → `{ name: '', rules: [] }`; a legacy `decisions` document → its decisions as `rules`; a
bare array (written by SDK 0.2.0, no rule fires) → `{ name: '', rules: <array> }`; anything else →
`rules: []`. Extra top-level keys are kept.

#### Parameters

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

per-call `namespace` (else the client default) and request options

#### Returns

`Promise`\<[`AlertRuleSet`](../interfaces/AlertRuleSet.md)\>

#### Throws

when no namespace is given or set (nothing is sent)

#### Throws

401; [ServerError](ServerError.md) 500 on a store error

#### Example

```typescript
const set = await client.alertRules.get();
console.log(set.rules.length, 'rules');
```

***

### replace()

> **replace**(`ruleSet`, `options?`): `Promise`\<`void`\>

Replaces the whole document with `ruleSet`, sent unchanged. Unless `skipValidation` is set,
[validateAlertRuleSet](../functions/validateAlertRuleSet.md) runs first and any error throws before a request is sent.

Full replace, last writer wins; enabled rules start firing on the next position event (in-app alerts, e-mails,
HTTP callbacks, asset changes and deletions). Integers outside ±(2^53−1) read from the store were already
rounded by `JSON.parse` and are written back rounded. `skipValidation` exists only to restore a backup
verbatim. A backup taken with [AlertRulesResource.get](#get) is the stored document only when that document
is canonical (`{ name: <string>, rules: <array> }`): `get()` normalises every other shape, so restoring it
writes `{ name, rules }` in place of a stored bare array or legacy document, and rules that never fired start
firing on the next position event.

#### Parameters

##### ruleSet

[`AlertRuleSet`](../interfaces/AlertRuleSet.md)

the complete `{ name, rules }` document

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md) & `object`

per-call `namespace`, request options, and `skipValidation`

#### Returns

`Promise`\<`void`\>

#### Throws

status 0 with one `details` entry per validation error (nothing is sent); status 400
  `Invalid alert rules` from the server

#### Throws

when no namespace is given or set (nothing is sent)

#### Example

```typescript
const backup = await client.alertRules.get(); // the stored document if it is canonical { name, rules }
// … later, write it back unvalidated:
await client.alertRules.replace(backup, { skipValidation: true });
```

***

### upsertRule()

> **upsertRule**(`rule`, `options?`): `Promise`\<[`AlertRuleSet`](../interfaces/AlertRuleSet.md)\>

Adds `rule`, or replaces the stored rule with the same `id` at its index (read-modify-write), and returns the
written set. Other rules, their order, `name` and extra top-level keys are kept; a legacy `decisions` key is
dropped. The resulting set is validated: an error in any rule, including one this call did not touch, blocks
the write (such a set can only be written with `replace()`).

No concurrency check (the server has no version): a change saved by someone else between the read and the
write is lost. Integers outside ±(2^53−1) in the stored document are written back rounded.

#### Parameters

##### rule

[`AlertRule`](../interfaces/AlertRule.md)

the rule; `id` is required (for example `crypto.randomUUID()`)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`AlertRuleSet`](../interfaces/AlertRuleSet.md)\>

#### Throws

status 0 for a rule without `id` (nothing is sent), a stored document that is not in
  the `{ name, rules }` format, or an invalid resulting set (only the read is sent)

#### Throws

when no namespace is given or set (nothing is sent)

#### Example

```typescript
await client.alertRules.upsertRule({
  id: crypto.randomUUID(),
  disabled: true,
  conditions: { all: [{ fact: 'zone_name', operator: 'equal', value: 'Dock' }] },
  event: { type: 'message', params: { title: 'Dock', text: '{{user_name}} at the dock', style: 'info',
    duration: 2000, coalescence: 60, coalescence_group: 'dock_{{user_udid}}' } },
});
```

***

### removeRule()

> **removeRule**(`ruleId`, `options?`): `Promise`\<[`AlertRuleSet`](../interfaces/AlertRuleSet.md)\>

Removes the rule with this id (read-modify-write) and returns the written set. The resulting set is validated
like [AlertRulesResource.upsertRule](#upsertrule); no concurrency check; integers outside ±(2^53−1) are written back
rounded.

#### Parameters

##### ruleId

`string`

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`AlertRuleSet`](../interfaces/AlertRuleSet.md)\>

#### Throws

status 0 for an empty id (nothing is sent), an unknown id, a stored document that is
  not `{ name, rules }` or an invalid resulting set (only the read is sent)

#### Throws

when no namespace is given or set (nothing is sent)

#### Example

```typescript
await client.alertRules.removeRule('4c60fcf9-54f0-4d8a-bf8e-6e5f82b5c939');
```

***

### setRuleEnabled()

> **setRuleEnabled**(`ruleId`, `enabled`, `options?`): `Promise`\<[`AlertRuleSet`](../interfaces/AlertRuleSet.md)\>

Enables or disables the rule with this id (read-modify-write) and returns the written set: `false` sets
`disabled: true`; `true` deletes the `disabled` key (the rule editor's convention). Always writes, even when
nothing changes. The resulting set is validated like [AlertRulesResource.upsertRule](#upsertrule), so enabling a rule
the engine cannot load is refused; no concurrency check; integers outside ±(2^53−1) are written back rounded.

#### Parameters

##### ruleId

`string`

##### enabled

`boolean`

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`AlertRuleSet`](../interfaces/AlertRuleSet.md)\>

#### Throws

status 0 for an empty id or a non-boolean `enabled` (nothing is sent), an unknown id,
  a stored document that is not `{ name, rules }` or an invalid resulting set (only the read is sent)

#### Throws

when no namespace is given or set (nothing is sent)

#### Example

```typescript
await client.alertRules.setRuleEnabled('4c60fcf9-54f0-4d8a-bf8e-6e5f82b5c939', false);
```
