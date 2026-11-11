[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / ValidationError

# Class: ValidationError

400 or 422, or an argument rejected before any request (then `status` is 0).

## Extends

- [`RtlsError`](RtlsError.md)

## Constructors

### Constructor

> **new ValidationError**(`message?`, `body?`, `init?`): `ValidationError`

Default status 422; the error mapper passes the real status. Client-side validation (no HTTP exchange) uses
`new ValidationError(message, undefined, { status: 0, details? })`.

#### Parameters

##### message?

`string` = `'Validation failed'`

##### body?

`unknown`

##### init?

`Partial`\<[`RtlsErrorInit`](../interfaces/RtlsErrorInit.md)\>

#### Returns

`ValidationError`

#### Overrides

[`RtlsError`](RtlsError.md).[`constructor`](RtlsError.md#constructor)

## Properties

### status

> `readonly` **status**: `number`

Real HTTP status; `0` when no response was received (client-side, timeout, abort, network).

#### Inherited from

[`RtlsError`](RtlsError.md).[`status`](RtlsError.md#status)

***

### code

> `readonly` **code**: `string`

SDK class code, for example `VALIDATION_ERROR` or `NOT_FOUND`.

#### Inherited from

[`RtlsError`](RtlsError.md).[`code`](RtlsError.md#code)

***

### apiCode?

> `readonly` `optional` **apiCode?**: `string`

Code sent by the server, when the error body carries one.

#### Inherited from

[`RtlsError`](RtlsError.md).[`apiCode`](RtlsError.md#apicode)

***

### details?

> `readonly` `optional` **details?**: `string`[]

Detail lines sent by the server.

#### Inherited from

[`RtlsError`](RtlsError.md).[`details`](RtlsError.md#details)

***

### retryAfter?

> `readonly` `optional` **retryAfter?**: `number`

Delay requested by the server through `Retry-After`, in milliseconds (any status).

#### Inherited from

[`RtlsError`](RtlsError.md).[`retryAfter`](RtlsError.md#retryafter)

***

### body

> `readonly` **body**: `unknown`

Parsed error body, the raw text cut to 4 000 characters, or `undefined` when the body was empty.

#### Inherited from

[`RtlsError`](RtlsError.md).[`body`](RtlsError.md#body)

***

### ~~errors~~

> `readonly` **errors**: `Record`\<`string`, `string`[]\>

Field map of a `{ errors: { field: [messages] } }` body.

#### Deprecated

since 0.3.0 — the API sends no such map; read [RtlsError.details](RtlsError.md#details).

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

[`RtlsError`](RtlsError.md).[`isStatus`](RtlsError.md#isstatus)

***

### isClientError()

> **isClientError**(): `boolean`

`true` for a 4xx status (`status 0` is neither a client nor a server error).

#### Returns

`boolean`

#### Inherited from

[`RtlsError`](RtlsError.md).[`isClientError`](RtlsError.md#isclienterror)

***

### isServerError()

> **isServerError**(): `boolean`

`true` for a status of 500 or more.

#### Returns

`boolean`

#### Inherited from

[`RtlsError`](RtlsError.md).[`isServerError`](RtlsError.md#isservererror)

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

[`RtlsError`](RtlsError.md).[`is`](RtlsError.md#is)
