[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / AlertRuleIssue

# Interface: AlertRuleIssue

One finding of `validateAlertRuleSet` (client-side check; the server has none, USI-P5-2).

## Properties

### severity

> **severity**: `"error"` \| `"warning"`

***

### code

> **code**: [`AlertRuleIssueCode`](../type-aliases/AlertRuleIssueCode.md)

***

### message

> **message**: `string`

***

### path

> **path**: `string`

Where the issue is, e.g. `'rules[2].conditions.all[0]'`; `''` for the whole document.

***

### ruleId?

> `optional` **ruleId?**: `string`

The `id` of the rule the issue is in, when that rule has a string id.
