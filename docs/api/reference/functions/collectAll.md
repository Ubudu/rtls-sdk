[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / collectAll

# Function: collectAll()

## Call Signature

> **collectAll**\<`T`\>(`source`, `options?`): `Promise`\<`T`[]\>

Collects the items of an async iterable into an array, at most `maxItems` (the iterator's `return()` is called
when the cap is reached, so its clean-up runs).

### Type Parameters

#### T

`T`

### Parameters

#### source

`AsyncIterable`\<`T`\>

#### options?

##### maxItems?

`number`

### Returns

`Promise`\<`T`[]\>

### Throws

status 0 when `source` is neither an async iterable nor a fetcher function

### Example

```typescript
import { collectAll, paginateOffset } from 'ubudu-rtls-sdk';

const first100 = await collectAll(paginateOffset(fetchOffsetPage, { limit: 50 }), { maxItems: 100 });
```

## Call Signature

> **collectAll**\<`T`\>(`fetcher`, `options?`): `Promise`\<`T`[]\>

The 0.2.0 form: pages through a fetcher with [paginate](paginate.md).

### Type Parameters

#### T

`T`

### Parameters

#### fetcher

(`page`, `limit`) => `Promise`\<[`PaginatedResponse`](../interfaces/PaginatedResponse.md)\<`T`\> \| [`Page`](../interfaces/Page.md)\<`T`\>\>

#### options?

##### pageSize?

`number`

##### maxItems?

`number`

### Returns

`Promise`\<`T`[]\>

### Deprecated

since 0.3.0 — use `collectAll(paginatePages(fetchPage), { maxItems })`.
