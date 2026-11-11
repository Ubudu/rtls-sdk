[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / applyFilters

# Function: applyFilters()

> **applyFilters**\<`T`, `Q`\>(`items`, `query?`): [`Page`](../interfaces/Page.md)\<`Q` *extends* `unknown` ? `"fields"` *extends* keyof `Q` ? [`DeepPartial`](../type-aliases/DeepPartial.md)\<`T`\> : `T` : `never`\>

Applies the universal filter grammar locally: filters, then `sort`, then the `fields` projection, then the
page, with exactly the semantics the server applies on its universal routes. It runs on
the serialized strings (`serializeFilters(query.filters, 'universal')`), so it sees what the server would see. Use
it where the server returns everything, for example the asset list, which honours only `key`/`value`.

Always returns a `Page`. Without `page` and `limit` the page is the whole result:
`{ page: 1, limit: total, total, totalPages: total ? 1 : 0, hasNext: false, hasPrev: false }`. `page` and `limit`
must be integers >= 1 (the server turns `0` into its default and slices meaninglessly on negative values; this
function refuses both). With `fields`, the items are projections: the item type is `DeepPartial<T>` whenever the
query's type has a `fields` key (also an optional one, as in `LocalQuery`), else `T`. The input is not modified.

## Type Parameters

### T

`T`

### Q

`Q` *extends* [`LocalQuery`](../interfaces/LocalQuery.md) = `Record`\<`never`, `never`\>

## Parameters

### items

readonly `T`[]

### query?

`Q`

## Returns

[`Page`](../interfaces/Page.md)\<`Q` *extends* `unknown` ? `"fields"` *extends* keyof `Q` ? [`DeepPartial`](../type-aliases/DeepPartial.md)\<`T`\> : `T` : `never`\>

## Throws

status 0 for a rejected filter, `page`, `limit`, `sort` or `fields`

## Example

```typescript
import { applyFilters, filters } from 'ubudu-rtls-sdk';

const assets = await client.assets.list();
const page = applyFilters(assets, {
  filters: filters.startsWith('user_name', 'fork'),
  sort: ['user_type:asc', 'user_name:desc'],
  page: 2,
  limit: 25,
});
page.pagination.total; // matches before paging
```
