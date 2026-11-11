[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / requireNamespace

# Function: requireNamespace()

> **requireNamespace**(`context`): [`ResolvedNamespaceContext`](../interfaces/ResolvedNamespaceContext.md)

Assert that namespace is present in context.

## Parameters

### context

[`RtlsContext`](../interfaces/RtlsContext.md)

## Returns

[`ResolvedNamespaceContext`](../interfaces/ResolvedNamespaceContext.md)

## Throws

If namespace is not set (`undefined`, `null`, `''`), or problem `'invalid'` for a
  non-string
