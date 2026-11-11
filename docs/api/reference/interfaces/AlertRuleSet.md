[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / AlertRuleSet

# Interface: AlertRuleSet

The alert-rule document of a namespace (`GET`/`POST /alert_rules/{app_namespace}`): `{ name, rules }`, `name`
`''` when unset. Extra top-level keys are preserved by the SDK. The spec types the POST body as an array of the
wrong `AlertRule` (USI-P5-1); a bare array stops every rule of the namespace.

## Indexable

> \[`key`: `string`\]: `unknown`

## Properties

### name

> **name**: `string`

***

### rules

> **rules**: [`AlertRule`](AlertRule.md)[]
