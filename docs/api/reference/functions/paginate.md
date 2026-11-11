[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / paginate

# ~~Function: paginate()~~

> **paginate**\<`T`\>(`fetcher`, `options?`): `AsyncGenerator`\<`T`, `void`, `unknown`\>

Iterates a 0.2.0-style paged fetcher. Accepts the flat 0.2.0 shape and the real `{ data, pagination }` envelope
(0.2.0 stopped after page 1 on the envelope); stops on `hasNext === false` or an empty page.

## Type Parameters

### T

`T`

## Parameters

### fetcher

(`page`, `limit`) => `Promise`\<[`PaginatedResponse`](../interfaces/PaginatedResponse.md)\<`T`\> \| [`Page`](../interfaces/Page.md)\<`T`\>\>

### options?

#### pageSize?

`number`

#### startPage?

`number`

## Returns

`AsyncGenerator`\<`T`, `void`, `unknown`\>

## Deprecated

since 0.3.0 — use [paginatePages](paginatePages.md).
