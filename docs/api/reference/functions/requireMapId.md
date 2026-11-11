[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / requireMapId

# Function: requireMapId()

> **requireMapId**(`context`): [`ResolvedMapContext`](../interfaces/ResolvedMapContext.md)

Assert that mapId is present in context and is an integer `>= 0`.

## Parameters

### context

[`RtlsContext`](../interfaces/RtlsContext.md)

## Returns

[`ResolvedMapContext`](../interfaces/ResolvedMapContext.md)

## Throws

If mapId is not set, or problem `'invalid'` for NaN, a float, a negative number, `null` or
  a string
