[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / WebSocketBaseConfig

# Interface: WebSocketBaseConfig

Configuration shared by the subscriber, the publisher and the unified client.

## Extended by

- [`WebSocketSubscriberConfig`](WebSocketSubscriberConfig.md)
- [`WebSocketPublisherConfig`](WebSocketPublisherConfig.md)
- [`WebSocketClientConfig`](WebSocketClientConfig.md)

## Properties

### namespace

> **namespace**: `string`

Required; one socket is bound to one namespace.

***

### apiKey?

> `optional` **apiKey?**: [`WsCredential`](../type-aliases/WsCredential.md)

API key, evaluated on every attempt.

***

### token?

> `optional` **token?**: [`WsCredential`](../type-aliases/WsCredential.md)

JWT (or API key) sent as a bearer token; wins over `apiKey`; evaluated on every attempt.

***

### authTransport?

> `optional` **authTransport?**: `"query"` \| `"header"`

Default `'query'`; `'header'` needs a ws-like implementation (Node `ws`).

***

### WebSocket?

> `optional` **WebSocket?**: [`WebSocketConstructorLike`](../type-aliases/WebSocketConstructorLike.md)

Injected implementation (tests, browsers, custom agents).

***

### connectionTimeout?

> `optional` **connectionTimeout?**: `number`

Milliseconds from the start of an attempt to open; default 10000.

***

### reconnect?

> `optional` **reconnect?**: `false` \| [`ReconnectOptions`](ReconnectOptions.md)

Reconnection policy; default `{}`; `false` disables reconnection.

***

### keepAliveIntervalMs?

> `optional` **keepAliveIntervalMs?**: `number`

Protocol ping interval; default 30000; 0 disables; effective only with `ping()` and `on('pong')`.

***

### pongTimeoutMs?

> `optional` **pongTimeoutMs?**: `number`

Default 10000.

***

### debug?

> `optional` **debug?**: `boolean`

Console logging; URLs and credentials are always redacted.

***

### ~~reconnectInterval?~~

> `optional` **reconnectInterval?**: `number`

#### Deprecated

use `reconnect.initialDelayMs`

***

### ~~maxReconnectAttempts?~~

> `optional` **maxReconnectAttempts?**: `number`

#### Deprecated

use `reconnect.maxAttempts`
