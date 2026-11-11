[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / ListZonesOptions

# Type Alias: ListZonesOptions

> **ListZonesOptions** = `object` & [`CallContext`](CallContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

Options of the zone lists. A per-call `level` filters by floor (the client's default level is not applied).

## Type Declaration

### filters?

> `optional` **filters?**: [`FilterOptions`](FilterOptions.md)

### tag?

> `optional` **tag?**: `string`

Keeps zones whose `tags` contain this exact string (sent inside `filters=<JSON>`, where the value stays a
string).
