[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / validateAlertRuleSet

# Function: validateAlertRuleSet()

> **validateAlertRuleSet**(`ruleSet`): [`AlertRuleValidationResult`](../interfaces/AlertRuleValidationResult.md)

Checks an alert-rule document against the rule format the SDK documents (the `{ name, rules }` set, each rule's
`id`, `event` and `conditions`, the `ALERT_RULE_OPERATORS`) and against the template tag syntax. Pure; sends
nothing. Every issue is collected.

Errors block every SDK write: anything that makes the engine throw while loading the rules (which disables every
rule of the namespace), a template syntax error, a set that is not `{ name, rules }`. In a rule with a truthy
`disabled`, rule-level errors become warnings (the engine skips it), except template errors, which are errors in
every rule (USI-P5-4). The validator is stricter than the engine for a root with both `all` and `any`,
`event: null`, `event.type: ''` and a `priority` of 0, a non-integer or a non-number.

## Parameters

### ruleSet

`unknown`

the document to check (any value)

## Returns

[`AlertRuleValidationResult`](../interfaces/AlertRuleValidationResult.md)

`{ valid, errors, warnings }`; `valid` is `errors.length === 0`; each issue has a `path` such as
  `'rules[2].conditions.all[0]'` and the `ruleId` of its rule

## Throws

when the value cannot be serialised to JSON (circular structure, BigInt)

## Example

```typescript
import { validateAlertRuleSet } from 'ubudu-rtls-sdk';

const result = validateAlertRuleSet({ name: '', rules: [] });
for (const issue of result.errors) console.log(issue.path, issue.code);
```
