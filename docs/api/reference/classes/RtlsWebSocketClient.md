[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / RtlsWebSocketClient

# Class: RtlsWebSocketClient

Subscriber and publisher behind one object.

## Example

```typescript
const ws = new RtlsWebSocketClient({ apiKey, namespace, mapUuid });
ws.on('POSITIONS', (p) => console.log(p.user_uuid));
ws.on('publisher:error', ({ error }) => console.error(error.message));
await ws.connect();
await ws.subscribe('ALL');
```

## Extends

- `TypedEventEmitter`\<[`UnifiedEventMap`](../type-aliases/UnifiedEventMap.md)\>

## Constructors

### Constructor

> **new RtlsWebSocketClient**(`config`): `RtlsWebSocketClient`

#### Parameters

##### config

[`WebSocketClientConfig`](../interfaces/WebSocketClientConfig.md)

#### Returns

`RtlsWebSocketClient`

#### Overrides

`TypedEventEmitter<UnifiedEventMap>.constructor`

## Methods

### connect()

> **connect**(`options?`): `Promise`\<`void`\>

Connects the subscriber and the publisher (or only one of them).

#### Parameters

##### options?

[`WebSocketConnectOptions`](../interfaces/WebSocketConnectOptions.md) = `{}`

#### Returns

`Promise`\<`void`\>

***

### disconnect()

> **disconnect**(): `Promise`\<`void`\>

Disconnects both sockets.

#### Returns

`Promise`\<`void`\>

***

### subscribe()

> **subscribe**(`request?`): `Promise`\<[`SubscriptionResult`](../interfaces/SubscriptionResult.md)\>

See `RtlsWebSocketSubscriber.subscribe`.

#### Parameters

##### request?

[`SubscriptionRequest`](../type-aliases/SubscriptionRequest.md)

#### Returns

`Promise`\<[`SubscriptionResult`](../interfaces/SubscriptionResult.md)\>

***

### unsubscribe()

> **unsubscribe**(`types?`): `Promise`\<`void`\>

See `RtlsWebSocketSubscriber.unsubscribe`.

#### Parameters

##### types?

[`SubscriptionTypes`](../type-aliases/SubscriptionTypes.md)

#### Returns

`Promise`\<`void`\>

***

### setTagFilter()

> **setTagFilter**(`uuids`): `Promise`\<`void`\>

See `RtlsWebSocketSubscriber.setTagFilter`.

#### Parameters

##### uuids

readonly `string`[] \| `null`

#### Returns

`Promise`\<`void`\>

***

### getSubscription()

> **getSubscription**(): [`SubscriptionState`](../interfaces/SubscriptionState.md) \| `null`

See `RtlsWebSocketSubscriber.getSubscription`.

#### Returns

[`SubscriptionState`](../interfaces/SubscriptionState.md) \| `null`

***

### getActiveSubscriptions()

> **getActiveSubscriptions**(): [`SubscriptionType`](../type-aliases/SubscriptionType.md)[]

See `RtlsWebSocketSubscriber.getActiveSubscriptions`.

#### Returns

[`SubscriptionType`](../type-aliases/SubscriptionType.md)[]

***

### sendPosition()

> **sendPosition**(`data`): `Promise`\<[`PublishResult`](../interfaces/PublishResult.md)\>

Publishes one position; without a publisher returns a failure result.

#### Parameters

##### data

[`WebSocketPublishPositionData`](../interfaces/WebSocketPublishPositionData.md)

#### Returns

`Promise`\<[`PublishResult`](../interfaces/PublishResult.md)\>

***

### sendBatch()

> **sendBatch**(`positions`): `Promise`\<[`BatchPublishResult`](../interfaces/BatchPublishResult.md)\>

Publishes positions; without a publisher returns a failure result.

#### Parameters

##### positions

readonly [`WebSocketPublishPositionData`](../interfaces/WebSocketPublishPositionData.md)[]

#### Returns

`Promise`\<[`BatchPublishResult`](../interfaces/BatchPublishResult.md)\>

***

### getConnectionStatus()

> **getConnectionStatus**(): [`UnifiedConnectionStatus`](../interfaces/UnifiedConnectionStatus.md)

Status of both sockets.

#### Returns

[`UnifiedConnectionStatus`](../interfaces/UnifiedConnectionStatus.md)

***

### isConnected()

> **isConnected**(): `boolean`

`true` when the subscriber, and the publisher when configured, are connected.

#### Returns

`boolean`

***

### isSubscriberConnected()

> **isSubscriberConnected**(): `boolean`

#### Returns

`boolean`

***

### isPublisherConnected()

> **isPublisherConnected**(): `boolean`

#### Returns

`boolean`

***

### getSubscriber()

> **getSubscriber**(): [`RtlsWebSocketSubscriber`](RtlsWebSocketSubscriber.md)

#### Returns

[`RtlsWebSocketSubscriber`](RtlsWebSocketSubscriber.md)

***

### getPublisher()

> **getPublisher**(): [`RtlsWebSocketPublisher`](RtlsWebSocketPublisher.md) \| `null`

#### Returns

[`RtlsWebSocketPublisher`](RtlsWebSocketPublisher.md) \| `null`

***

### getConfig()

> **getConfig**(): [`WebSocketClientConfig`](../interfaces/WebSocketClientConfig.md)

A copy of the configuration.

#### Returns

[`WebSocketClientConfig`](../interfaces/WebSocketClientConfig.md)

***

### getNamespace()

> **getNamespace**(): `string`

#### Returns

`string`

***

### on()

> **on**\<`K`\>(`event`, `handler`): () => `void`

Registers a handler; returns a function that removes it.

#### Type Parameters

##### K

`K` *extends* keyof SubscriberEventMap \| `"publisher:connected"` \| `"publisher:disconnected"` \| `"publisher:reconnecting"` \| `"publisher:reconnected"` \| `"publisher:reconnect_failed"` \| `"publisher:error"`

#### Parameters

##### event

`K`

##### handler

(`data`) => `void`

#### Returns

() => `void`

#### Inherited from

`TypedEventEmitter.on`

***

### once()

> **once**\<`K`\>(`event`, `handler`): () => `void`

Registers a handler called at most once; returns a function that removes it.

#### Type Parameters

##### K

`K` *extends* keyof SubscriberEventMap \| `"publisher:connected"` \| `"publisher:disconnected"` \| `"publisher:reconnecting"` \| `"publisher:reconnected"` \| `"publisher:reconnect_failed"` \| `"publisher:error"`

#### Parameters

##### event

`K`

##### handler

(`data`) => `void`

#### Returns

() => `void`

#### Inherited from

`TypedEventEmitter.once`

***

### off()

> **off**\<`K`\>(`event`, `handler`): `void`

Removes a handler registered with `on` or `once`.

#### Type Parameters

##### K

`K` *extends* keyof SubscriberEventMap \| `"publisher:connected"` \| `"publisher:disconnected"` \| `"publisher:reconnecting"` \| `"publisher:reconnected"` \| `"publisher:reconnect_failed"` \| `"publisher:error"`

#### Parameters

##### event

`K`

##### handler

(`data`) => `void`

#### Returns

`void`

#### Inherited from

`TypedEventEmitter.off`

***

### removeAllListeners()

> **removeAllListeners**(`event?`): `void`

Removes every handler of `event`, or of every event.

#### Parameters

##### event?

keyof SubscriberEventMap \| `"publisher:connected"` \| `"publisher:disconnected"` \| `"publisher:reconnecting"` \| `"publisher:reconnected"` \| `"publisher:reconnect_failed"` \| `"publisher:error"`

#### Returns

`void`

#### Inherited from

`TypedEventEmitter.removeAllListeners`

***

### listenerCount()

> **listenerCount**(`event`): `number`

Number of handlers of `event`.

#### Parameters

##### event

keyof SubscriberEventMap \| `"publisher:connected"` \| `"publisher:disconnected"` \| `"publisher:reconnecting"` \| `"publisher:reconnected"` \| `"publisher:reconnect_failed"` \| `"publisher:error"`

#### Returns

`number`

#### Inherited from

`TypedEventEmitter.listenerCount`

***

### hasListeners()

> **hasListeners**(`event`): `boolean`

`true` when `event` has at least one handler.

#### Parameters

##### event

keyof SubscriberEventMap \| `"publisher:connected"` \| `"publisher:disconnected"` \| `"publisher:reconnecting"` \| `"publisher:reconnected"` \| `"publisher:reconnect_failed"` \| `"publisher:error"`

#### Returns

`boolean`

#### Inherited from

`TypedEventEmitter.hasListeners`

***

### eventNames()

> **eventNames**(): (keyof SubscriberEventMap \| `"publisher:connected"` \| `"publisher:disconnected"` \| `"publisher:reconnecting"` \| `"publisher:reconnected"` \| `"publisher:reconnect_failed"` \| `"publisher:error"`)[]

The events that have handlers.

#### Returns

(keyof SubscriberEventMap \| `"publisher:connected"` \| `"publisher:disconnected"` \| `"publisher:reconnecting"` \| `"publisher:reconnected"` \| `"publisher:reconnect_failed"` \| `"publisher:error"`)[]

#### Inherited from

`TypedEventEmitter.eventNames`
