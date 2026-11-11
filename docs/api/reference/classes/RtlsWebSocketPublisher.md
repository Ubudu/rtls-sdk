[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / RtlsWebSocketPublisher

# Class: RtlsWebSocketPublisher

Publisher of the broker's `ws/publisher` socket. There is no acknowledgement: `success: true` means the frame
was handed to the socket. For acknowledged delivery use `client.positions.publish()` (HTTP).

## Example

```typescript
const publisher = new RtlsWebSocketPublisher({ apiKey, namespace, mapUuid });
const result = await publisher.sendPosition({ macAddress: 'aabbccddeeff', latitude: 48.85, longitude: 2.35 });
```

## Extends

- `BaseWebSocketConnection`\<[`PublisherEventMap`](../interfaces/PublisherEventMap.md)\>

## Constructors

### Constructor

> **new RtlsWebSocketPublisher**(`config`): `RtlsWebSocketPublisher`

#### Parameters

##### config

[`WebSocketPublisherConfig`](../interfaces/WebSocketPublisherConfig.md)

#### Returns

`RtlsWebSocketPublisher`

#### Overrides

`BaseWebSocketConnection<PublisherEventMap>.constructor`

## Methods

### connect()

> **connect**(): `Promise`\<`void`\>

Opens the connection. Resolves when the socket is open (and, on a reconnect, the subscription replayed);
resolves at once while open; shares the pending attempt while connecting.

#### Returns

`Promise`\<`void`\>

#### Throws

the handshake was refused (401/403) or the credential provider failed

#### Throws

timeout, connection error, `disconnect()`, or retries exhausted

#### Inherited from

`BaseWebSocketConnection.connect`

***

### disconnect()

> **disconnect**(): `Promise`\<`void`\>

Closes the connection and stops reconnecting. An open socket is closed with 1000 and the close echo is
awaited for up to 3 s (then terminated); a pending `connect()` rejects.

#### Returns

`Promise`\<`void`\>

#### Inherited from

`BaseWebSocketConnection.disconnect`

***

### isConnected()

> **isConnected**(): `boolean`

`true` while the socket is open.

#### Returns

`boolean`

#### Inherited from

`BaseWebSocketConnection.isConnected`

***

### getState()

> **getState**(): [`ConnectionState`](../type-aliases/ConnectionState.md)

The connection state.

#### Returns

[`ConnectionState`](../type-aliases/ConnectionState.md)

#### Inherited from

`BaseWebSocketConnection.getState`

***

### getConnectionStatus()

> **getConnectionStatus**(): [`ConnectionStatus`](../interfaces/ConnectionStatus.md)

A status snapshot.

#### Returns

[`ConnectionStatus`](../interfaces/ConnectionStatus.md)

#### Inherited from

`BaseWebSocketConnection.getConnectionStatus`

***

### on()

> **on**\<`K`\>(`event`, `handler`): () => `void`

Registers a handler; returns a function that removes it.

#### Type Parameters

##### K

`K` *extends* keyof [`PublisherEventMap`](../interfaces/PublisherEventMap.md)

#### Parameters

##### event

`K`

##### handler

(`data`) => `void`

#### Returns

() => `void`

#### Inherited from

`BaseWebSocketConnection.on`

***

### once()

> **once**\<`K`\>(`event`, `handler`): () => `void`

Registers a handler called at most once; returns a function that removes it.

#### Type Parameters

##### K

`K` *extends* keyof [`PublisherEventMap`](../interfaces/PublisherEventMap.md)

#### Parameters

##### event

`K`

##### handler

(`data`) => `void`

#### Returns

() => `void`

#### Inherited from

`BaseWebSocketConnection.once`

***

### off()

> **off**\<`K`\>(`event`, `handler`): `void`

Removes a handler registered with `on` or `once`.

#### Type Parameters

##### K

`K` *extends* keyof [`PublisherEventMap`](../interfaces/PublisherEventMap.md)

#### Parameters

##### event

`K`

##### handler

(`data`) => `void`

#### Returns

`void`

#### Inherited from

`BaseWebSocketConnection.off`

***

### removeAllListeners()

> **removeAllListeners**(`event?`): `void`

Removes every handler of `event`, or of every event.

#### Parameters

##### event?

keyof PublisherEventMap

#### Returns

`void`

#### Inherited from

`BaseWebSocketConnection.removeAllListeners`

***

### listenerCount()

> **listenerCount**(`event`): `number`

Number of handlers of `event`.

#### Parameters

##### event

keyof [`PublisherEventMap`](../interfaces/PublisherEventMap.md)

#### Returns

`number`

#### Inherited from

`BaseWebSocketConnection.listenerCount`

***

### hasListeners()

> **hasListeners**(`event`): `boolean`

`true` when `event` has at least one handler.

#### Parameters

##### event

keyof [`PublisherEventMap`](../interfaces/PublisherEventMap.md)

#### Returns

`boolean`

#### Inherited from

`BaseWebSocketConnection.hasListeners`

***

### eventNames()

> **eventNames**(): (keyof [`PublisherEventMap`](../interfaces/PublisherEventMap.md))[]

The events that have handlers.

#### Returns

(keyof [`PublisherEventMap`](../interfaces/PublisherEventMap.md))[]

#### Inherited from

`BaseWebSocketConnection.eventNames`

***

### sendPosition()

> **sendPosition**(`data`): `Promise`\<[`PublishResult`](../interfaces/PublishResult.md)\>

Validates, connects when needed, and sends one position. Never throws.

#### Parameters

##### data

[`WebSocketPublishPositionData`](../interfaces/WebSocketPublishPositionData.md)

#### Returns

`Promise`\<[`PublishResult`](../interfaces/PublishResult.md)\>

***

### sendBatch()

> **sendBatch**(`positions`): `Promise`\<[`BatchPublishResult`](../interfaces/BatchPublishResult.md)\>

Validates every position, connects once when at least one is valid, and sends one frame per valid position
in input order. Never throws.

#### Parameters

##### positions

readonly [`WebSocketPublishPositionData`](../interfaces/WebSocketPublishPositionData.md)[]

#### Returns

`Promise`\<[`BatchPublishResult`](../interfaces/BatchPublishResult.md)\>

***

### getMapUuid()

> **getMapUuid**(): `string`

The configured map.

#### Returns

`string`
