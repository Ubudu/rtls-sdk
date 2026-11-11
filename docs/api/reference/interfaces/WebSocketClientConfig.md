[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / WebSocketClientConfig

# Interface: WebSocketClientConfig

Unified client configuration.

## Extends

- [`WebSocketBaseConfig`](WebSocketBaseConfig.md)

## Properties

### namespace

> **namespace**: `string`

Required; one socket is bound to one namespace.

#### Inherited from

[`WebSocketBaseConfig`](WebSocketBaseConfig.md).[`namespace`](WebSocketBaseConfig.md#namespace)

***

### apiKey?

> `optional` **apiKey?**: [`WsCredential`](../type-aliases/WsCredential.md)

API key, evaluated on every attempt.

#### Inherited from

[`WebSocketBaseConfig`](WebSocketBaseConfig.md).[`apiKey`](WebSocketBaseConfig.md#apikey)

***

### token?

> `optional` **token?**: [`WsCredential`](../type-aliases/WsCredential.md)

JWT (or API key) sent as a bearer token; wins over `apiKey`; evaluated on every attempt.

#### Inherited from

[`WebSocketBaseConfig`](WebSocketBaseConfig.md).[`token`](WebSocketBaseConfig.md#token)

***

### authTransport?

> `optional` **authTransport?**: `"query"` \| `"header"`

Default `'query'`; `'header'` needs a ws-like implementation (Node `ws`).

#### Inherited from

[`WebSocketBaseConfig`](WebSocketBaseConfig.md).[`authTransport`](WebSocketBaseConfig.md#authtransport)

***

### WebSocket?

> `optional` **WebSocket?**: [`WebSocketConstructorLike`](../type-aliases/WebSocketConstructorLike.md)

Injected implementation (tests, browsers, custom agents).

#### Inherited from

[`WebSocketBaseConfig`](WebSocketBaseConfig.md).[`WebSocket`](WebSocketBaseConfig.md#websocket)

***

### connectionTimeout?

> `optional` **connectionTimeout?**: `number`

Milliseconds from the start of an attempt to open; default 10000.

#### Inherited from

[`WebSocketBaseConfig`](WebSocketBaseConfig.md).[`connectionTimeout`](WebSocketBaseConfig.md#connectiontimeout)

***

### reconnect?

> `optional` **reconnect?**: `false` \| [`ReconnectOptions`](ReconnectOptions.md)

Reconnection policy; default `{}`; `false` disables reconnection.

#### Inherited from

[`WebSocketBaseConfig`](WebSocketBaseConfig.md).[`reconnect`](WebSocketBaseConfig.md#reconnect)

***

### keepAliveIntervalMs?

> `optional` **keepAliveIntervalMs?**: `number`

Protocol ping interval; default 30000; 0 disables; effective only with `ping()` and `on('pong')`.

#### Inherited from

[`WebSocketBaseConfig`](WebSocketBaseConfig.md).[`keepAliveIntervalMs`](WebSocketBaseConfig.md#keepaliveintervalms)

***

### pongTimeoutMs?

> `optional` **pongTimeoutMs?**: `number`

Default 10000.

#### Inherited from

[`WebSocketBaseConfig`](WebSocketBaseConfig.md).[`pongTimeoutMs`](WebSocketBaseConfig.md#pongtimeoutms)

***

### debug?

> `optional` **debug?**: `boolean`

Console logging; URLs and credentials are always redacted.

#### Inherited from

[`WebSocketBaseConfig`](WebSocketBaseConfig.md).[`debug`](WebSocketBaseConfig.md#debug)

***

### ~~reconnectInterval?~~

> `optional` **reconnectInterval?**: `number`

#### Deprecated

use `reconnect.initialDelayMs`

#### Inherited from

[`WebSocketBaseConfig`](WebSocketBaseConfig.md).[`reconnectInterval`](WebSocketBaseConfig.md#reconnectinterval)

***

### ~~maxReconnectAttempts?~~

> `optional` **maxReconnectAttempts?**: `number`

#### Deprecated

use `reconnect.maxAttempts`

#### Inherited from

[`WebSocketBaseConfig`](WebSocketBaseConfig.md).[`maxReconnectAttempts`](WebSocketBaseConfig.md#maxreconnectattempts)

***

### subscriberUrl?

> `optional` **subscriberUrl?**: `string`

***

### publisherUrl?

> `optional` **publisherUrl?**: `string`

***

### mapUuid?

> `optional` **mapUuid?**: `string`

Enables the publisher; not passed to the subscriber.

***

### subscriptionTimeoutMs?

> `optional` **subscriptionTimeoutMs?**: `number`
