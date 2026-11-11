[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / classifyMessage

# Function: classifyMessage()

> **classifyMessage**(`msg`): [`WebSocketMessageKind`](../type-aliases/WebSocketMessageKind.md)

The kind of a parsed frame, from its wire discriminators only: `action: 'subscribeEvent'` → `CONFIRMATION`;
`type` `assets` / `alert_rules`; `action: 'notifyEvent'` by `event_type`; another `action` by its value; no
`action` with numeric `lat`/`lon` and a string `user_uuid` → `POSITIONS`; anything else → `UNKNOWN`.

## Parameters

### msg

`unknown`

## Returns

[`WebSocketMessageKind`](../type-aliases/WebSocketMessageKind.md)
