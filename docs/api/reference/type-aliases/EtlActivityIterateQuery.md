[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / EtlActivityIterateQuery

# Type Alias: EtlActivityIterateQuery

> **EtlActivityIterateQuery** = `Omit`\<[`EtlActivityQuery`](../interfaces/EtlActivityQuery.md), `"page"` \| `"limit"`\> & `object`

Query of `activities.iterate()`: the filters of [EtlActivityQuery](../interfaces/EtlActivityQuery.md) plus `pageSize` (default 100, never sent).

## Type Declaration

### pageSize?

> `optional` **pageSize?**: `number`

Integer ≥ 1; default 100.
