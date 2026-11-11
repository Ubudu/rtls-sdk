[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / requireVenueId

# Function: requireVenueId()

> **requireVenueId**(`context`): [`ResolvedVenueContext`](../interfaces/ResolvedVenueContext.md)

Assert that venueId is present in context and is an integer `>= 0`.

## Parameters

### context

[`RtlsContext`](../interfaces/RtlsContext.md)

## Returns

[`ResolvedVenueContext`](../interfaces/ResolvedVenueContext.md)

## Throws

If venueId is not set, or problem `'invalid'` for NaN, a float, a negative number, `null`
  or a string
