[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationConnectionInput

# Type Alias: NotificationConnectionInput

> **NotificationConnectionInput** = \{ `channel`: `"inapp"`; `enabled?`: `boolean`; \} \| \{ `channel`: `"email"`; `enabled?`: `boolean`; `credentials`: \{ `address`: `string`; \}; \} \| \{ `channel`: `"slack"`; `enabled?`: `boolean`; `credentials`: \{ `webhook_url`: `string`; `bot_token?`: `string`; \}; \} \| \{ `channel`: `"telegram"`; `enabled?`: `boolean`; `credentials`: \{ `chat_id`: `string`; \}; \} \| \{ `channel`: `"teams"`; `enabled?`: `boolean`; `credentials`: \{ `workflow_url`: `string`; \}; \} \| \{ `channel`: `"whatsapp"`; `enabled?`: `boolean`; `credentials`: \{ `phone_e164`: `string`; \}; \}

Input of `connections.upsert()`: one shape per channel with its credential fields.

## Remarks

Spec: `credentials` is a property-less object.
