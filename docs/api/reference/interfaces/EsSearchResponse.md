[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / EsSearchResponse

# Interface: EsSearchResponse\<T, A\>

The raw Elasticsearch search response of `POST /es/query`.

## Type Parameters

### T

`T` = `Record`\<`string`, `unknown`\>

### A

`A` = `Record`\<`string`, `unknown`\>

## Properties

### took

> **took**: `number`

***

### timed\_out

> **timed\_out**: `boolean`

***

### terminated\_early?

> `optional` **terminated\_early?**: `boolean`

`true` when the server-injected `terminate_after` cut the search short (partial results).

***

### \_shards

> **\_shards**: `object`

#### total

> **total**: `number`

#### successful

> **successful**: `number`

#### skipped?

> `optional` **skipped?**: `number`

#### failed

> **failed**: `number`

***

### hits

> **hits**: `object`

#### total?

> `optional` **total?**: `object`

Absent unless the body sets `track_total_hits: true`.

##### total.value

> **value**: `number`

##### total.relation

> **relation**: `"eq"` \| `"gte"`

#### max\_score

> **max\_score**: `number` \| `null`

#### hits

> **hits**: [`EsSearchHit`](EsSearchHit.md)\<`T`\>[]

***

### aggregations?

> `optional` **aggregations?**: `A`
