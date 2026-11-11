[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationFilter

# Interface: NotificationFilter

A filter of the inbox (list, facets, export, bulk). Every value is sent as a string.

## Remarks

Spec: `zone`, `asset`, `thread_key`, `pinned`, `from` and `to` are not documented (USI-P6-2); facets and
  export declare almost none of them.

## Extended by

- [`NotificationListQuery`](NotificationListQuery.md)

## Properties

### q?

> `optional` **q?**: `string`

Scoped terms (`zone:<int>`, `tag:<tag>`, `from:<source>`, `severity:<…>`) and free text; free text forces flat results.

***

### state?

> `optional` **state?**: [`NotificationState`](../type-aliases/NotificationState.md)

Absent = the active inbox (not archived); `'needs_action'` overrides `kind`.

***

### kind?

> `optional` **kind?**: [`NotificationKind`](../type-aliases/NotificationKind.md)

***

### severity?

> `optional` **severity?**: [`NotificationSeverity`](../type-aliases/NotificationSeverity.md)

***

### zone?

> `optional` **zone?**: `number`

Integer zone id.

***

### asset?

> `optional` **asset?**: `string`

Asset udid, sent as given.

***

### thread\_key?

> `optional` **thread\_key?**: `string`

***

### pinned?

> `optional` **pinned?**: `true`

The server has no "not pinned" filter.

***

### from?

> `optional` **from?**: `string` \| `number` \| `Date`

`created_at >=` this time.

***

### to?

> `optional` **to?**: `string` \| `number` \| `Date`

`created_at <=` this time.
