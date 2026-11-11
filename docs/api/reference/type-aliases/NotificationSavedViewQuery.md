[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationSavedViewQuery

# Type Alias: NotificationSavedViewQuery

> **NotificationSavedViewQuery** = [`NotificationFilter`](../interfaces/NotificationFilter.md) & `object`

The query stored in a saved view: the list filters, with `from` / `to` as epoch ms (USI-P6-11).

## Type Declaration

### group\_by?

> `optional` **group\_by?**: [`NotificationGroupBy`](NotificationGroupBy.md) \| `"flat"`

## Remarks

Spec: `query` is a property-less object; the index signature keeps any other stored key.
