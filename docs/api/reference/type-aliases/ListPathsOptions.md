[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / ListPathsOptions

# Type Alias: ListPathsOptions

> **ListPathsOptions** = `object` & [`CallContext`](CallContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

Options of the path lists. A per-call `level` filters by floor (the client's default level is not applied).

## Type Declaration

### filters?

> `optional` **filters?**: [`FilterOptions`](FilterOptions.md)

### nodeType?

> `optional` **nodeType?**: [`PathNodeType`](PathNodeType.md)

Keeps nodes of this `node_type` (segments have no `node_type`, so they are dropped).
