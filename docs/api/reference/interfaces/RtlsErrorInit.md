[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / RtlsErrorInit

# Interface: RtlsErrorInit

Fields of an [RtlsError](../classes/RtlsError.md), as accepted by the `init` constructor form.

## Properties

### status

> **status**: `number`

Real HTTP status; `0` when no response was received.

***

### code?

> `optional` **code?**: `string`

SDK class code; defaults to the class's own code.

***

### apiCode?

> `optional` **apiCode?**: `string`

Code sent by the server (for example `stale_write`, `rate_limited`).

***

### details?

> `optional` **details?**: `string`[]

Detail lines sent by the server (validation messages, offending fields).

***

### retryAfter?

> `optional` **retryAfter?**: `number`

Delay requested by the server through `Retry-After`, in **milliseconds**.

***

### body?

> `optional` **body?**: `unknown`

Parsed error body (object), the raw text cut to 4 000 characters, or `undefined` when empty.

***

### cause?

> `optional` **cause?**: `unknown`

Underlying error (standard ES2022 `Error.cause`).
