[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / LocalQuery

# Interface: LocalQuery

What `applyFilters` evaluates locally: the filters, then `sort` (`'field:asc'` / `'field:desc'`, several keys as an
array), then the `fields` projection (dot paths), then the page (`page` / `limit`, integers >= 1).

## Properties

### filters?

> `optional` **filters?**: [`FilterOptions`](../type-aliases/FilterOptions.md)

***

### sort?

> `optional` **sort?**: `string` \| readonly `string`[]

***

### page?

> `optional` **page?**: `number`

***

### limit?

> `optional` **limit?**: `number`

***

### fields?

> `optional` **fields?**: readonly `string`[]
