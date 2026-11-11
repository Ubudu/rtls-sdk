[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / ReconnectOptions

# Interface: ReconnectOptions

Reconnection policy.

## Properties

### initialDelayMs?

> `optional` **initialDelayMs?**: `number`

Default 5000.

***

### maxDelayMs?

> `optional` **maxDelayMs?**: `number`

Default 30000.

***

### multiplier?

> `optional` **multiplier?**: `number`

Default 2.

***

### jitter?

> `optional` **jitter?**: `"none"` \| `"full"`

Default `'full'`: delay = floor(random() × min(maxDelayMs, initialDelayMs × multiplier^n)).

***

### maxAttempts?

> `optional` **maxAttempts?**: `number`

Consecutive failed attempts before `reconnect_failed`; default Infinity.

***

### retryInitialConnect?

> `optional` **retryInitialConnect?**: `boolean`

Default false; true: a failing first `connect()` retries with the same policy.
