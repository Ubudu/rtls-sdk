[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / UnifiedEventMap

# Type Alias: UnifiedEventMap

> **UnifiedEventMap** = [`SubscriberEventMap`](../interfaces/SubscriberEventMap.md) & `object`

Unified client events: the subscriber's under their names, the publisher lifecycle as `publisher:*`.

## Type Declaration

### publisher:connected

> **publisher:connected**: [`ConnectionEventData`](../interfaces/ConnectionEventData.md)

### publisher:disconnected

> **publisher:disconnected**: [`DisconnectionEventData`](../interfaces/DisconnectionEventData.md)

### publisher:reconnecting

> **publisher:reconnecting**: [`ReconnectionEventData`](../interfaces/ReconnectionEventData.md)

### publisher:reconnected

> **publisher:reconnected**: [`ReconnectedEventData`](../interfaces/ReconnectedEventData.md)

### publisher:reconnect\_failed

> **publisher:reconnect\_failed**: [`ReconnectFailedEventData`](../interfaces/ReconnectFailedEventData.md)

### publisher:error

> **publisher:error**: [`ErrorEventData`](../interfaces/ErrorEventData.md)
