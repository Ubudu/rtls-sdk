[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / RtlsError

# Class: RtlsError

Base class of every SDK error.

## Example

```typescript
import { RtlsError, NotFoundError } from 'ubudu-rtls-sdk';

try {
  await client.assets.get('aabbccddeeff');
} catch (err) {
  if (err instanceof NotFoundError) console.log('no such asset');
  else if (RtlsError.is(err)) console.log(err.status, err.code, err.apiCode, err.message);
  else throw err;
}
```

## Extends

- `Error`

## Extended by

- [`ValidationError`](ValidationError.md)
- [`AuthenticationError`](AuthenticationError.md)
- [`AuthorizationError`](AuthorizationError.md)
- [`NotFoundError`](NotFoundError.md)
- [`ConflictError`](ConflictError.md)
- [`GoneError`](GoneError.md)
- [`PayloadTooLargeError`](PayloadTooLargeError.md)
- [`UnsupportedMediaTypeError`](UnsupportedMediaTypeError.md)
- [`RateLimitError`](RateLimitError.md)
- [`ServerError`](ServerError.md)
- [`TimeoutError`](TimeoutError.md)
- [`AbortError`](AbortError.md)
- [`NetworkError`](NetworkError.md)
- [`ResponseParseError`](ResponseParseError.md)
- [`StreamError`](StreamError.md)
- [`ContextError`](ContextError.md)

## Constructors

### Constructor

> **new RtlsError**(`message`, `status`, `body?`, `code?`): `RtlsError`

0.2.0 form, kept: `new RtlsError(message, status, body?, code?)`.

#### Parameters

##### message

`string`

##### status

`number`

##### body?

`unknown`

##### code?

`string`

#### Returns

`RtlsError`

#### Overrides

`Error.constructor`

### Constructor

> **new RtlsError**(`message`, `init`): `RtlsError`

`new RtlsError(message, { status, code?, apiCode?, details?, retryAfter?, body?, cause? })`.

#### Parameters

##### message

`string`

##### init

[`RtlsErrorInit`](../interfaces/RtlsErrorInit.md)

#### Returns

`RtlsError`

#### Overrides

`Error.constructor`

## Properties

### status

> `readonly` **status**: `number`

Real HTTP status; `0` when no response was received (client-side, timeout, abort, network).

***

### code

> `readonly` **code**: `string`

SDK class code, for example `VALIDATION_ERROR` or `NOT_FOUND`.

***

### apiCode?

> `readonly` `optional` **apiCode?**: `string`

Code sent by the server, when the error body carries one.

***

### details?

> `readonly` `optional` **details?**: `string`[]

Detail lines sent by the server.

***

### retryAfter?

> `readonly` `optional` **retryAfter?**: `number`

Delay requested by the server through `Retry-After`, in milliseconds (any status).

***

### body

> `readonly` **body**: `unknown`

Parsed error body, the raw text cut to 4 000 characters, or `undefined` when the body was empty.

## Methods

### isStatus()

> **isStatus**(`status`): `boolean`

`true` when [RtlsError.status](#status) equals `status`.

#### Parameters

##### status

`number`

#### Returns

`boolean`

***

### isClientError()

> **isClientError**(): `boolean`

`true` for a 4xx status (`status 0` is neither a client nor a server error).

#### Returns

`boolean`

***

### isServerError()

> **isServerError**(): `boolean`

`true` for a status of 500 or more.

#### Returns

`boolean`

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
