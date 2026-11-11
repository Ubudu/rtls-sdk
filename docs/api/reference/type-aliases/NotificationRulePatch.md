[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationRulePatch

# Type Alias: NotificationRulePatch

> **NotificationRulePatch** = `Partial`\<[`NotificationRuleInput`](../interfaces/NotificationRuleInput.md)\>

Input of `rules.update()`: `match` is replaced wholesale and `channels: []` is ignored (USI-P6-9).

## Remarks

Spec: `PATCH /rules/{id}` declares no request body.
