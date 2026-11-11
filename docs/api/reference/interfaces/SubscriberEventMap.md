[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / SubscriberEventMap

# Interface: SubscriberEventMap

Subscriber events.

## Extends

- `WsConnectionEvents`

## Properties

### connected

> **connected**: [`ConnectionEventData`](ConnectionEventData.md)

#### Inherited from

`WsConnectionEvents.connected`

***

### disconnected

> **disconnected**: [`DisconnectionEventData`](DisconnectionEventData.md)

#### Inherited from

`WsConnectionEvents.disconnected`

***

### reconnecting

> **reconnecting**: [`ReconnectionEventData`](ReconnectionEventData.md)

#### Inherited from

`WsConnectionEvents.reconnecting`

***

### reconnected

> **reconnected**: [`ReconnectedEventData`](ReconnectedEventData.md)

#### Inherited from

`WsConnectionEvents.reconnected`

***

### reconnect\_failed

> **reconnect\_failed**: [`ReconnectFailedEventData`](ReconnectFailedEventData.md)

#### Inherited from

`WsConnectionEvents.reconnect_failed`

***

### error

> **error**: [`ErrorEventData`](ErrorEventData.md)

#### Inherited from

`WsConnectionEvents.error`

***

### message

> **message**: [`WebSocketMessage`](../type-aliases/WebSocketMessage.md)

#### Inherited from

`WsConnectionEvents.message`

***

### POSITIONS

> **POSITIONS**: [`PositionMessage`](PositionMessage.md)

***

### ZONES\_ENTRIES\_EVENTS

> **ZONES\_ENTRIES\_EVENTS**: [`ZoneEntryExitMessage`](ZoneEntryExitMessage.md)

***

### ZONE\_STATS\_EVENTS

> **ZONE\_STATS\_EVENTS**: [`ZoneStatsMessage`](ZoneStatsMessage.md)

***

### ALERTS

> **ALERTS**: [`AlertMessage`](AlertMessage.md)

***

### ASSETS

> **ASSETS**: [`AssetMessage`](AssetMessage.md)

***

### TAG\_LOST

> **TAG\_LOST**: [`TagLostMessage`](TagLostMessage.md)

***

### ALERT\_RULES\_CHANGED

> **ALERT\_RULES\_CHANGED**: [`AlertRulesChangedMessage`](AlertRulesChangedMessage.md)

***

### ASSETS\_LIBRARY\_CHANGED

> **ASSETS\_LIBRARY\_CHANGED**: [`AssetsLibraryChangedMessage`](AssetsLibraryChangedMessage.md)

***

### DATA\_MODELS\_CHANGED

> **DATA\_MODELS\_CHANGED**: [`DataModelsChangedMessage`](DataModelsChangedMessage.md)

***

### SETTINGS\_CHANGED

> **SETTINGS\_CHANGED**: [`SettingsChangedMessage`](SettingsChangedMessage.md)

***

### MAP\_DATA\_CHANGED

> **MAP\_DATA\_CHANGED**: [`MapDataChangedMessage`](MapDataChangedMessage.md)

***

### unknown

> **unknown**: `Record`\<`string`, `unknown`\>
