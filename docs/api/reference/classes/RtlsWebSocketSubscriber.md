[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / RtlsWebSocketSubscriber

# Class: RtlsWebSocketSubscriber

Subscriber of the broker's `ws/subscriber` socket.

## Example

```typescript
const subscriber = new RtlsWebSocketSubscriber({ apiKey, namespace });
subscriber.on('POSITIONS', (p) => console.log(p.user_uuid, p.lat, p.lon));
await subscriber.connect();
await subscriber.subscribe([SubscriptionType.POSITIONS]);
```

## Extends

- `BaseWebSocketConnection`\<[`SubscriberEventMap`](../interfaces/SubscriberEventMap.md)\>

## Constructors

### Constructor

> **new RtlsWebSocketSubscriber**(`config`): `RtlsWebSocketSubscriber`

#### Parameters

##### config

[`WebSocketSubscriberConfig`](../interfaces/WebSocketSubscriberConfig.md)

#### Returns

`RtlsWebSocketSubscriber`

#### Overrides

`BaseWebSocketConnection<SubscriberEventMap>.constructor`

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

`K` *extends* keyof [`SubscriberEventMap`](../interfaces/SubscriberEventMap.md)

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

`K` *extends* keyof [`SubscriberEventMap`](../interfaces/SubscriberEventMap.md)

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

`K` *extends* keyof [`SubscriberEventMap`](../interfaces/SubscriberEventMap.md)

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

keyof SubscriberEventMap

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

keyof [`SubscriberEventMap`](../interfaces/SubscriberEventMap.md)

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

keyof [`SubscriberEventMap`](../interfaces/SubscriberEventMap.md)

#### Returns

`boolean`

#### Inherited from

`BaseWebSocketConnection.hasListeners`

***

### eventNames()

> **eventNames**(): (keyof [`SubscriberEventMap`](../interfaces/SubscriberEventMap.md))[]

The events that have handlers.

#### Returns

(keyof [`SubscriberEventMap`](../interfaces/SubscriberEventMap.md))[]

#### Inherited from

`BaseWebSocketConnection.eventNames`

***

### subscribe()

> **subscribe**(`request?`): `Promise`\<[`SubscriptionResult`](../interfaces/SubscriptionResult.md)\>

Subscribes (`'ALL'` by default; `[]` is a deprecated alias of `'ALL'`). On a socket that already sent
SUBSCRIBE, the change is sent as UNSUBSCRIBE then SUBSCRIBE. Resolves on the broker's confirmation.

#### Parameters

##### request?

[`SubscriptionRequest`](../type-aliases/SubscriptionRequest.md) = `'ALL'`

#### Returns

`Promise`\<[`SubscriptionResult`](../interfaces/SubscriptionResult.md)\>

#### Throws

not connected, invalid input (nothing sent), timeout, close or
`disconnect()` before the confirmation, send failure

***

### unsubscribe()

> **unsubscribe**(`types?`): `Promise`\<`void`\>

Without `types`: UNSUBSCRIBE (delivery stops, no replay). With `types`: the remaining types are
re-subscribed (UNSUBSCRIBE, SUBSCRIBE); none remaining → UNSUBSCRIBE only. From `'ALL'` the remainder is the
explicit list of the other filter values. Not connected: only the stored state changes (the next `connect()`
replays it while active).

#### Parameters

##### types?

[`SubscriptionTypes`](../type-aliases/SubscriptionTypes.md)

#### Returns

`Promise`\<`void`\>

***

### setTagFilter()

> **setTagFilter**(`uuids`): `Promise`\<`void`\>

Replaces the tag filter (positions only). Active: FILTER_MGT (`[]` clears); inactive: stored and sent with
the next SUBSCRIBE. MAC-shaped entries are normalised.

#### Parameters

##### uuids

readonly `string`[] \| `null`

#### Returns

`Promise`\<`void`\>

#### Throws

an entry that is not a non-empty string (nothing sent), send failure

***

### getSubscription()

> **getSubscription**(): [`SubscriptionState`](../interfaces/SubscriptionState.md) \| `null`

The stored subscription; `null` before the first `subscribe()`.

#### Returns

[`SubscriptionState`](../interfaces/SubscriptionState.md) \| `null`

***

### getActiveSubscriptions()

> **getActiveSubscriptions**(): [`SubscriptionType`](../type-aliases/SubscriptionType.md)[]

The filter values delivered now: under `'ALL'` the five values; inactive `[]`.

#### Returns

[`SubscriptionType`](../type-aliases/SubscriptionType.md)[]
