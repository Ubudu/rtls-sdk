[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / PublisherEventMap

# Interface: PublisherEventMap

Publisher events.

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

#### Overrides

`WsConnectionEvents.message`
