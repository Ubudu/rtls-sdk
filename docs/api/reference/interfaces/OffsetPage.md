[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / OffsetPage

# Interface: OffsetPage\<T\>

One page of a `limit`/`offset` listing: the items, the total when the server reports it (`X-Total-Count` or a
body `total`; it may be missing), and the `limit` and `offset` of the request.

## Type Parameters

### T

`T`

## Properties

### items

> **items**: `T`[]

***

### total?

> `optional` **total?**: `number`

***

### limit

> **limit**: `number`

***

### offset

> **offset**: `number`
