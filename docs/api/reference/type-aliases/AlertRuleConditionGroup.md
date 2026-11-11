[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / AlertRuleConditionGroup

# Type Alias: AlertRuleConditionGroup

> **AlertRuleConditionGroup** = \{ `all`: [`AlertRuleNode`](AlertRuleNode.md)[]; `priority?`: `number`; \} \| \{ `any`: [`AlertRuleNode`](AlertRuleNode.md)[]; `priority?`: `number`; \}

A group of conditions: exactly one of `all` / `any` (there is no `not` group).
Not described by the spec (USI-P5-1).
