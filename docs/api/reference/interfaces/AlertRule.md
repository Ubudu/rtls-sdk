[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / AlertRule

# Interface: AlertRule

One stored alert rule. The rule editor enables a rule by deleting `disabled`; a truthy `disabled` makes the
engine skip it. Replaces the spec's `AlertRule` schema (`id, name, type, enabled, conditions, actions`), which
does not describe the stored rule (USI-P5-1). Unknown keys written by the editor are preserved.

## Indexable

> \[`key`: `string`\]: `unknown`

## Properties

### id

> **id**: `string`

***

### conditions

> **conditions**: [`AlertRuleConditionGroup`](../type-aliases/AlertRuleConditionGroup.md)

***

### event

> **event**: [`AlertRuleEvent`](../type-aliases/AlertRuleEvent.md)

***

### disabled?

> `optional` **disabled?**: `boolean`

***

### priority?

> `optional` **priority?**: `number`
