[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / normalizeListResponse

# ~~Function: normalizeListResponse()~~

> **normalizeListResponse**\<`T`\>(`response`): [`PaginatedResponse`](../interfaces/PaginatedResponse.md)\<`T`\>

Normalizes API responses that may be arrays or paginated objects.
Converts direct arrays to PaginatedResponse format for consistency.

## Type Parameters

### T

`T`

## Parameters

### response

[`PaginatedResponse`](../interfaces/PaginatedResponse.md)\<`T`\> \| `T`[]

## Returns

[`PaginatedResponse`](../interfaces/PaginatedResponse.md)\<`T`\>

## Deprecated

since 0.3.0 — returns the flat 0.2.0 shape; use `normalizePage`, which returns the server's
  `{ data, pagination }` envelope and also converts arrays and `{ data }` objects.
