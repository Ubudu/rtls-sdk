[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / AlertRuleEvent

# Type Alias: AlertRuleEvent

> **AlertRuleEvent** = \{ `type`: `"message"`; `params`: [`AlertRuleEventCommon`](../interfaces/AlertRuleEventCommon.md) & `object`; \} \| \{ `type`: `"post_to_email"`; `params`: [`AlertRuleEventCommon`](../interfaces/AlertRuleEventCommon.md) & `object`; \} \| \{ `type`: `"post_to_callback_url"`; `params`: [`AlertRuleEventCommon`](../interfaces/AlertRuleEventCommon.md) & `object`; \} \| \{ `type`: `"set_variable"`; `params`: [`AlertRuleEventCommon`](../interfaces/AlertRuleEventCommon.md) & `object`; \} \| \{ `type`: `"delete_asset"`; `params`: [`AlertRuleEventCommon`](../interfaces/AlertRuleEventCommon.md); \}

What an enabled rule does when its conditions match: an in-app message, an e-mail, an HTTP callback, an asset
data change or an asset deletion. Replaces the spec's `actions` (USI-P5-1).
