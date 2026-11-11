[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / AlertRuleEventCommon

# Interface: AlertRuleEventCommon

Parameters every event type carries. `coalescence` (seconds) and `coalescence_group` (often templated with
`{{user_udid}}`) throttle repeated alerts. Not described by the spec (USI-P5-1).

## Properties

### title

> **title**: `string`

***

### coalescence

> **coalescence**: `number`

***

### coalescence\_group

> **coalescence\_group**: `string`
