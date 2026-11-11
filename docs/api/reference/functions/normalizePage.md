[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / normalizePage

# Function: normalizePage()

> **normalizePage**\<`T`\>(`response`, `request?`): [`Page`](../interfaces/Page.md)\<`T`\>

Any list response as a [Page](../interfaces/Page.md):
- an envelope `{ data, pagination }` is returned as is;
- the flat 0.2.0 shape (`{ data, page, limit, total, totalPages, hasNext, hasPrev }`) is nested;
- `{ data }` without `pagination` and a bare array become a synthetic single page (the server ignored paging, so
  the array is everything it sent): `{ page: request.page ?? 1, limit: request.limit ?? data.length,
  total: data.length, totalPages: data.length ? 1 : 0, hasNext: false, hasPrev: (request.page ?? 1) > 1 }`.

## Type Parameters

### T

`T`

## Parameters

### response

[`Page`](../interfaces/Page.md)\<`T`\> \| [`PaginatedResponse`](../interfaces/PaginatedResponse.md)\<`T`\> \| `T`[] \| \{ `data`: `T`[]; \}

### request?

#### page?

`number`

#### limit?

`number`

## Returns

[`Page`](../interfaces/Page.md)\<`T`\>

## Throws

status 0 when the value is none of these shapes

## Example

```typescript
import { normalizePage } from 'ubudu-rtls-sdk';

normalizePage([1, 2]).pagination; // { page: 1, limit: 2, total: 2, totalPages: 1, hasNext: false, hasPrev: false }
```
