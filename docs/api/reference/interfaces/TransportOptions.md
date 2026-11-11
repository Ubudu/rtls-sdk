[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / TransportOptions

# Interface: TransportOptions

Options of one transport call.

## Properties

### params?

> `optional` **params?**: `Record`\<`string`, `string` \| `number`\>

Path parameters; each `{name}` of the path is replaced by its encoded value.

***

### query?

> `optional` **query?**: `Record`\<`string`, [`QueryValue`](../type-aliases/QueryValue.md)\>

Query parameters (insertion order kept; `undefined`/`null` skipped; arrays joined with `,`).

***

### body?

> `optional` **body?**: `unknown`

Request body, sent as JSON.

***

### headers?

> `optional` **headers?**: `Record`\<`string`, `string`\>

Per-call headers; they win over client headers.

***

### signal?

> `optional` **signal?**: `AbortSignal`

Caller's signal; aborting it ends the call with `AbortError`.

***

### timeoutMs?

> `optional` **timeoutMs?**: `number`

Per-attempt timeout in ms (headers and body); `0` or `Infinity` disables it. Default: the client's.

***

### parseAs?

> `optional` **parseAs?**: [`ParseAs`](../type-aliases/ParseAs.md)

How the 2xx body is read; default `'auto'` (by content type; an empty body yields `undefined`).

***

### retry?

> `optional` **retry?**: `false` \| \{ `idempotent`: `true`; \}

`false`: never retried; `{ idempotent: true }`: a read-only POST retried under the client policy.
