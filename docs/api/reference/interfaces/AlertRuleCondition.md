[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / AlertRuleCondition

# Interface: AlertRuleCondition

A leaf condition. The `value` key is required by the engine even for `empty` / `notEmpty` (`value: null` is
fine); a leaf without it makes the engine reject the whole namespace's rules.
Replaces the untyped `conditions: object` of the spec's `AlertRule` (USI-P5-1).

## Properties

### fact

> **fact**: `string` & `object` \| [`AlertRuleFact`](../type-aliases/AlertRuleFact.md)

***

### operator

> **operator**: [`AlertRuleOperator`](../type-aliases/AlertRuleOperator.md)

***

### value

> **value**: `unknown`

***

### path?

> `optional` **path?**: `string`

JSONPath into the fact value, e.g. `'$.battery'` with fact `'user_data'`.

***

### model?

> `optional` **model?**: `string`

***

### params?

> `optional` **params?**: `Record`\<`string`, `unknown`\>

***

### priority?

> `optional` **priority?**: `number`
