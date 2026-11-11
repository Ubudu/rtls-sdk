[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / WebSocketConstructorLike

# Type Alias: WebSocketConstructorLike

> **WebSocketConstructorLike** = new (`url`, `protocols?`) => [`WebSocketLike`](../interfaces/WebSocketLike.md)

A WebSocket constructor. Header mode builds `new Impl(url, { headers })` (ws-like implementations only);
otherwise `new Impl(url)`. No `handshakeTimeout` is passed: `connectionTimeout` is the single timeout.

## Parameters

### url

`string`

### protocols?

`string` \| `string`[]

## Returns

[`WebSocketLike`](../interfaces/WebSocketLike.md)
