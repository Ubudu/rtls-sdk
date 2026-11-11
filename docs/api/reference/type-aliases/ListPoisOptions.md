[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / ListPoisOptions

# Type Alias: ListPoisOptions

> **ListPoisOptions** = `object` & [`CallContext`](CallContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

Options of the POI lists. A per-call `level` filters by floor (the client's default level is not applied).

## Type Declaration

### filters?

> `optional` **filters?**: [`FilterOptions`](FilterOptions.md)

### tag?

> `optional` **tag?**: `string`

Keeps POIs whose `tags` contain this exact string (sent inside `filters=<JSON>`, where the value stays a
string).
