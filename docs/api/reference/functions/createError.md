[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / createError

# Function: createError()

> **createError**(`status`, `body`, `messageOrInit?`): [`RtlsError`](../classes/RtlsError.md)

Maps an HTTP error status and body to the matching error class.

`body` is the parsed JSON value, or the raw text, or `undefined` for an empty body. The third argument is the
message (0.2.0 form, wins over the body) or `{ message?, headers?, contentType?, statusText?, cause? }`:
`headers` give `Retry-After` (→ `retryAfter` in ms, any status) and, without `contentType`, the content type;
`statusText` completes the fallback message `HTTP <status> <statusText>`.

## Parameters

### status

`number`

### body

`unknown`

### messageOrInit?

`string` \| \{ `message?`: `string`; `headers?`: `Headers`; `contentType?`: `string`; `statusText?`: `string`; `cause?`: `unknown`; \}

## Returns

[`RtlsError`](../classes/RtlsError.md)

## Example

```typescript
import { createError } from 'ubudu-rtls-sdk';

const err = createError(409, { error: 'stale_write', current: {} });
// ConflictError: message 'stale_write', apiCode 'stale_write', body.current kept
```
