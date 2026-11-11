[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / ServiceUnavailableError

# Class: ServiceUnavailableError

503.

## Extends

- [`ServerError`](ServerError.md)

## Constructors

### Constructor

> **new ServiceUnavailableError**(`message?`, `body?`, `init?`): `ServiceUnavailableError`

#### Parameters

##### message?

`string` = `'Service unavailable'`

##### body?

`unknown`

##### init?

`Partial`\<[`RtlsErrorInit`](../interfaces/RtlsErrorInit.md)\>

#### Returns

`ServiceUnavailableError`

#### Overrides

[`ServerError`](ServerError.md).[`constructor`](ServerError.md#constructor)

## Properties

### status

> `readonly` **status**: `number`

Real HTTP status; `0` when no response was received (client-side, timeout, abort, network).

#### Inherited from

[`ServerError`](ServerError.md).[`status`](ServerError.md#status)

***

### code

> `readonly` **code**: `string`

SDK class code, for example `VALIDATION_ERROR` or `NOT_FOUND`.

#### Inherited from

[`ServerError`](ServerError.md).[`code`](ServerError.md#code)

***

### apiCode?

> `readonly` `optional` **apiCode?**: `string`

Code sent by the server, when the error body carries one.

#### Inherited from

[`ServerError`](ServerError.md).[`apiCode`](ServerError.md#apicode)

***

### details?

> `readonly` `optional` **details?**: `string`[]

Detail lines sent by the server.

#### Inherited from

[`ServerError`](ServerError.md).[`details`](ServerError.md#details)

***

### retryAfter?

> `readonly` `optional` **retryAfter?**: `number`

Delay requested by the server through `Retry-After`, in milliseconds (any status).

#### Inherited from

[`ServerError`](ServerError.md).[`retryAfter`](ServerError.md#retryafter)

***

### body

> `readonly` **body**: `unknown`

Parsed error body, the raw text cut to 4 000 characters, or `undefined` when the body was empty.

#### Inherited from

[`ServerError`](ServerError.md).[`body`](ServerError.md#body)

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

[`ServerError`](ServerError.md).[`isStatus`](ServerError.md#isstatus)

***

### isClientError()

> **isClientError**(): `boolean`

`true` for a 4xx status (`status 0` is neither a client nor a server error).

#### Returns

`boolean`

#### Inherited from

[`ServerError`](ServerError.md).[`isClientError`](ServerError.md#isclienterror)

***

### isServerError()

> **isServerError**(): `boolean`

`true` for a status of 500 or more.

#### Returns

`boolean`

#### Inherited from

[`ServerError`](ServerError.md).[`isServerError`](ServerError.md#isservererror)

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

[`ServerError`](ServerError.md).[`is`](ServerError.md#is)
