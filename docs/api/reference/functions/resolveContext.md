[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / resolveContext

# Function: resolveContext()

> **resolveContext**(`defaults`, `overrides?`): [`RtlsContext`](../interfaces/RtlsContext.md)

Merge call-time context overrides with client defaults. An override that is `undefined`, `null` or `''` falls
back to the default; any other value wins (it is validated where it is used).

## Parameters

### defaults

[`RtlsContext`](../interfaces/RtlsContext.md)

Default context from client configuration

### overrides?

[`RtlsContext`](../interfaces/RtlsContext.md)

Per-call context overrides

## Returns

[`RtlsContext`](../interfaces/RtlsContext.md)

Merged context
