[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / AlertRuleOperator

# Type Alias: AlertRuleOperator

> **AlertRuleOperator** = `"equal"` \| `"notEqual"` \| `"lessThan"` \| `"lessThanInclusive"` \| `"greaterThan"` \| `"greaterThanInclusive"` \| `"in"` \| `"notIn"` \| `"contains"` \| `"doesNotContain"` \| `"empty"` \| `"notEmpty"` \| `"afterDate"` \| `"afterDateInclusive"` \| `"beforeDate"` \| `"beforeDateInclusive"`

A condition operator the rule engine knows: the 10 engine operators plus the custom ones registered by the
server (16 distinct names). Any other operator makes the rule fail when it is evaluated.
Replaces the untyped `conditions: object` of the spec's `AlertRule` (USI-P5-1).
