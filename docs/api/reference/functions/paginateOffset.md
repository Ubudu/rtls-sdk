[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / paginateOffset

# Function: paginateOffset()

> **paginateOffset**\<`T`\>(`fetchPage`, `options?`): `AsyncGenerator`\<`T`, `void`, `undefined`\>

Iterates the items of a `limit`/`offset` listing.

The offset grows by `limit` (never by the number of items received). It stops when a page is empty; when the
total is known and `offset + limit >= total`; when the total is unknown, `stopOnShortPage` is set (default) and a
page is shorter than `limit`; or after `maxPages` pages. Pass `stopOnShortPage: false` when a page may be short
although more items remain (grouped rows counted by item). Lazy, like [paginatePages](paginatePages.md).

## Type Parameters

### T

`T`

## Parameters

### fetchPage

(`offset`, `limit`, `signal?`) => `Promise`\<[`OffsetPage`](../interfaces/OffsetPage.md)\<`T`\>\>

### options?

#### limit?

`number`

#### startOffset?

`number`

#### maxPages?

`number`

#### stopOnShortPage?

`boolean`

#### signal?

`AbortSignal`

## Returns

`AsyncGenerator`\<`T`, `void`, `undefined`\>

## Throws

status 0, at once, when `limit` is not an integer `>= 1`, `startOffset` not an integer
  `>= 0` or `maxPages` neither `Infinity` nor an integer `>= 1`
