[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / paginatePages

# Function: paginatePages()

> **paginatePages**\<`T`\>(`fetchPage`, `options?`): `AsyncGenerator`\<`T`, `void`, `undefined`\>

Iterates the items of a page-envelope listing, page by page.

After each page it stops when the page is empty, when an envelope says `pagination.hasNext === false`, when a bare
array is shorter than `limit`, or after `maxPages` pages. The iterator is lazy: the next page is fetched only when
the consumer pulls past the last item of the current one. `signal` is checked before each fetch (`AbortError`)
and passed to `fetchPage`.

## Type Parameters

### T

`T`

## Parameters

### fetchPage

(`page`, `limit`, `signal?`) => `Promise`\<[`Page`](../interfaces/Page.md)\<`T`\> \| `T`[]\>

### options?

#### limit?

`number`

#### startPage?

`number`

#### maxPages?

`number`

#### signal?

`AbortSignal`

## Returns

`AsyncGenerator`\<`T`, `void`, `undefined`\>

## Throws

status 0, at once, when `limit` is not an integer `>= 1`, `startPage` not an integer
  `>= 1` or `maxPages` neither `Infinity` nor an integer `>= 1`

## Example

```typescript
import { collectAll, paginatePages } from 'ubudu-rtls-sdk';

const venues = await collectAll(
  paginatePages((page, limit) => fetchVenuePage(page, limit), { limit: 20 }),
  { maxItems: 100 }
);
```
