[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationExportQuery

# Type Alias: NotificationExportQuery

> **NotificationExportQuery** = [`NotificationFilter`](../interfaces/NotificationFilter.md) & `object`

The query of `export()`; `limit`, `offset` and grouping are ignored by the server.

## Type Declaration

### format?

> `optional` **format?**: `"csv"` \| `"json"`

## Remarks

Spec: only `format` is declared; every list filter is accepted.
