[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / RetryPolicy

# Interface: RetryPolicy

When a failed request is tried again. Retries are off unless the client sets `retry: true` (these
defaults) or a policy object.

## Example

```typescript
import { createRtlsClient } from 'ubudu-rtls-sdk';

const client = createRtlsClient({
  apiKey: process.env.RTLS_API_KEY,
  retry: { retries: 3, methods: ['GET', 'PUT'] },
});
```

## Properties

### retries?

> `optional` **retries?**: `number`

Further attempts after the first; integer 0..10; default 2.

***

### retryOn?

> `optional` **retryOn?**: `number`[]

HTTP statuses that are retried; integers 400..599; default `[429, 502, 503, 504]`.

***

### methods?

> `optional` **methods?**: [`HttpMethod`](../type-aliases/HttpMethod.md)[]

Methods that are retried; default `['GET']`. `PUT` and `DELETE` are opt-in. `POST` and `PATCH` are not
idempotent and are ignored here: a `POST` is retried only when the SDK marks that call as a read-only one.

***

### baseDelayMs?

> `optional` **baseDelayMs?**: `number`

Base of the exponential backoff in ms; default 300.

***

### maxDelayMs?

> `optional` **maxDelayMs?**: `number`

Upper bound of one backoff delay in ms; default 10 000.

***

### maxRetryAfterMs?

> `optional` **maxRetryAfterMs?**: `number`

Longest `Retry-After` (ms) that is waited for; default 60 000. A longer one is not waited for: the error is
thrown at once.

***

### retryNetworkErrors?

> `optional` **retryNetworkErrors?**: `boolean`

Also retry `NetworkError` and `TimeoutError` on retryable methods; default `true`.
