[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / FilterValue

# Type Alias: FilterValue

> **FilterValue** = `string` \| `number` \| `boolean` \| `Date` \| readonly (`string` \| `number`)[]

The typed value of one filter. Builders keep it typed (`filters.between('x', 1, 2)` holds `[1, 2]`);
`serializeFilters` turns it into the wire form of the grammar (a `Date` becomes epoch milliseconds).
