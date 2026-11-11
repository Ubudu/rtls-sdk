[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / WebSocketLike

# Interface: WebSocketLike

The part of a WebSocket instance the SDK uses (DOM `WebSocket`, Node `ws`, Bun, or a custom class).

## Properties

### readyState

> `readonly` **readyState**: `number`

0 CONNECTING, 1 OPEN, 2 CLOSING, 3 CLOSED.

***

### onopen

> **onopen**: ((`event`) => `void`) \| `null`

***

### onclose

> **onclose**: ((`event`) => `void`) \| `null`

***

### onerror

> **onerror**: ((`event`) => `void`) \| `null`

***

### onmessage

> **onmessage**: ((`event`) => `void`) \| `null`

## Methods

### send()

> **send**(`data`): `void`

#### Parameters

##### data

`string`

#### Returns

`void`

***

### close()

> **close**(`code?`, `reason?`): `void`

#### Parameters

##### code?

`number`

##### reason?

`string`

#### Returns

`void`

***

### ping()?

> `optional` **ping**(): `void`

Node `ws`: protocol ping.

#### Returns

`void`

***

### terminate()?

> `optional` **terminate**(): `void`

Node `ws`: immediate close.

#### Returns

`void`

***

### on()?

> `optional` **on**(`event`, `listener`): `unknown`

Node `ws`: pong listener.

#### Parameters

##### event

`"pong"`

##### listener

() => `void`

#### Returns

`unknown`
