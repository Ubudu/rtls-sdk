[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / WebSocketAuthenticationError

# Class: WebSocketAuthenticationError

The credential is missing or was refused at the handshake (`status` 401/403; 0 for client-side checks).

## Extends

- [`WebSocketError`](WebSocketError.md)

## Constructors

### Constructor

> **new WebSocketAuthenticationError**(`message?`, `status?`, `cause?`): `WebSocketAuthenticationError`

#### Parameters

##### message?

`string` = `'WebSocket authentication failed'`

##### status?

`number`

##### cause?

`unknown`

#### Returns

`WebSocketAuthenticationError`

#### Overrides

[`WebSocketError`](WebSocketError.md).[`constructor`](WebSocketError.md#constructor)

## Properties

### status

> `readonly` **status**: `number`

Real HTTP status; `0` when no response was received (client-side, timeout, abort, network).

#### Inherited from

[`WebSocketError`](WebSocketError.md).[`status`](WebSocketError.md#status)

***

### code

> `readonly` **code**: `string`

SDK class code, for example `VALIDATION_ERROR` or `NOT_FOUND`.

#### Inherited from

[`WebSocketError`](WebSocketError.md).[`code`](WebSocketError.md#code)

***

### apiCode?

> `readonly` `optional` **apiCode?**: `string`

Code sent by the server, when the error body carries one.

#### Inherited from

[`WebSocketError`](WebSocketError.md).[`apiCode`](WebSocketError.md#apicode)

***

### details?

> `readonly` `optional` **details?**: `string`[]

Detail lines sent by the server.

#### Inherited from

[`WebSocketError`](WebSocketError.md).[`details`](WebSocketError.md#details)

***

### retryAfter?

> `readonly` `optional` **retryAfter?**: `number`

Delay requested by the server through `Retry-After`, in milliseconds (any status).

#### Inherited from

[`WebSocketError`](WebSocketError.md).[`retryAfter`](WebSocketError.md#retryafter)

***

### body

> `readonly` **body**: `unknown`

Parsed error body, the raw text cut to 4 000 characters, or `undefined` when the body was empty.

#### Inherited from

[`WebSocketError`](WebSocketError.md).[`body`](WebSocketError.md#body)

***

### reason

> `readonly` **reason**: [`StreamErrorReason`](../type-aliases/StreamErrorReason.md)

Why the stream failed.

#### Inherited from

[`WebSocketError`](WebSocketError.md).[`reason`](WebSocketError.md#reason)

***

### closeCode?

> `readonly` `optional` **closeCode?**: `number`

Close code of the close that caused the error.

#### Inherited from

[`WebSocketError`](WebSocketError.md).[`closeCode`](WebSocketError.md#closecode)

***

### closeReason?

> `readonly` `optional` **closeReason?**: `string`

Close reason of the close that caused the error.

#### Inherited from

[`WebSocketError`](WebSocketError.md).[`closeReason`](WebSocketError.md#closereason)

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

[`WebSocketError`](WebSocketError.md).[`isStatus`](WebSocketError.md#isstatus)

***

### isClientError()

> **isClientError**(): `boolean`

`true` for a 4xx status (`status 0` is neither a client nor a server error).

#### Returns

`boolean`

#### Inherited from

[`WebSocketError`](WebSocketError.md).[`isClientError`](WebSocketError.md#isclienterror)

***

### isServerError()

> **isServerError**(): `boolean`

`true` for a status of 500 or more.

#### Returns

`boolean`

#### Inherited from

[`WebSocketError`](WebSocketError.md).[`isServerError`](WebSocketError.md#isservererror)

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

[`WebSocketError`](WebSocketError.md).[`is`](WebSocketError.md#is)
