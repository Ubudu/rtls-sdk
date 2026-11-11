[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / TagActionsSettings

# Type Alias: TagActionsSettings

> **TagActionsSettings** = `Record`\<`string`, [`TagActionSetting`](TagActionSetting.md) \| `Record`\<`string`, [`TagActionSetting`](TagActionSetting.md)\>\>

The `tagActions` setting: `tagActions[action]` (flat form) or `tagActions[service][action]`, where `service` is
a tag family such as `pdi`, `minew` or `bleComms` and `action` a key such as `ptlRed` or `uwbBlink`. Shape read by
the product UI; not in the spec (USI-P5-12).
