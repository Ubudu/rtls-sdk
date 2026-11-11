[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / WebSocketError

# Class: WebSocketError

Base class of the WebSocket errors.

## Extends

- [`StreamError`](StreamError.md)

## Extended by

- [`WebSocketConnectionError`](WebSocketConnectionError.md)
- [`WebSocketAuthenticationError`](WebSocketAuthenticationError.md)
- [`WebSocketSubscriptionError`](WebSocketSubscriptionError.md)
- [`WebSocketSendError`](WebSocketSendError.md)

## Constructors

### Constructor

> **new WebSocketError**(`message`, `init?`): `WebSocketError`

#### Parameters

##### message

`string`

##### init?

[`WebSocketErrorInit`](../interfaces/WebSocketErrorInit.md) = `{}`

#### Returns

`WebSocketError`

#### Overrides

[`StreamError`](StreamError.md).[`constructor`](StreamError.md#constructor)

## Properties

### status

> `readonly` **status**: `number`

Real HTTP status; `0` when no response was received (client-side, timeout, abort, network).

#### Inherited from

[`StreamError`](StreamError.md).[`status`](StreamError.md#status)

***

### code

> `readonly` **code**: `string`

SDK class code, for example `VALIDATION_ERROR` or `NOT_FOUND`.

#### Inherited from

[`StreamError`](StreamError.md).[`code`](StreamError.md#code)

***

### apiCode?

> `readonly` `optional` **apiCode?**: `string`

Code sent by the server, when the error body carries one.

#### Inherited from

[`StreamError`](StreamError.md).[`apiCode`](StreamError.md#apicode)

***

### details?

> `readonly` `optional` **details?**: `string`[]

Detail lines sent by the server.

#### Inherited from

[`StreamError`](StreamError.md).[`details`](StreamError.md#details)

***

### retryAfter?

> `readonly` `optional` **retryAfter?**: `number`

Delay requested by the server through `Retry-After`, in milliseconds (any status).

#### Inherited from

[`StreamError`](StreamError.md).[`retryAfter`](StreamError.md#retryafter)

***

### body

> `readonly` **body**: `unknown`

Parsed error body, the raw text cut to 4 000 characters, or `undefined` when the body was empty.

#### Inherited from

[`StreamError`](StreamError.md).[`body`](StreamError.md#body)

***

### reason

> `readonly` **reason**: [`StreamErrorReason`](../type-aliases/StreamErrorReason.md)

Why the stream failed.

#### Inherited from

[`StreamError`](StreamError.md).[`reason`](StreamError.md#reason)

***

### closeCode?

> `readonly` `optional` **closeCode?**: `number`

Close code of the close that caused the error.

***

### closeReason?

> `readonly` `optional` **closeReason?**: `string`

Close reason of the close that caused the error.

## Methods

### isStatus()

> **isStatus**(`status`): `boolean`

`true` when [RtlsError.status](RtlsError.md#status) equals `status`.

#### Parameters

##### status

`number`

#### Returns

`boolean`

#### Inherited from

[`StreamError`](StreamError.md).[`isStatus`](StreamError.md#isstatus)

***

### isClientError()

> **isClientError**(): `boolean`

`true` for a 4xx status (`status 0` is neither a client nor a server error).

#### Returns

`boolean`

#### Inherited from

[`StreamError`](StreamError.md).[`isClientError`](StreamError.md#isclienterror)

***

### isServerError()

> **isServerError**(): `boolean`

`true` for a status of 500 or more.

#### Returns

`boolean`

#### Inherited from

[`StreamError`](StreamError.md).[`isServerError`](StreamError.md#isservererror)

***

### is()

> `static` **is**(`value`): `value is RtlsError`

`true` for any SDK error, also one thrown by another copy of the SDK (dual ESM/CJS loading, another realm),
where `instanceof` fails. The check reads a global brand symbol.

#### Parameters

##### value

`unknown`

#### Returns

`value is RtlsError`

#### Inherited from

[`StreamError`](StreamError.md).[`is`](StreamError.md#is)
