[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationGroupQuery

# Interface: NotificationGroupQuery

The query of `listGroups()` (free-text `q` is not allowed: it would force flat results).

## Remarks

Spec: grouping is not documented (USI-P6-2).

## Extends

- `Omit`\<[`NotificationListQuery`](NotificationListQuery.md), `"q"`\>

## Properties

### state?

> `optional` **state?**: [`NotificationState`](../type-aliases/NotificationState.md)

Absent = the active inbox (not archived); `'needs_action'` overrides `kind`.

#### Inherited from

[`NotificationFilter`](NotificationFilter.md).[`state`](NotificationFilter.md#state)

***

### kind?

> `optional` **kind?**: [`NotificationKind`](../type-aliases/NotificationKind.md)

#### Inherited from

[`NotificationFilter`](NotificationFilter.md).[`kind`](NotificationFilter.md#kind)

***

### severity?

> `optional` **severity?**: [`NotificationSeverity`](../type-aliases/NotificationSeverity.md)

#### Inherited from

[`NotificationFilter`](NotificationFilter.md).[`severity`](NotificationFilter.md#severity)

***

### zone?

> `optional` **zone?**: `number`

Integer zone id.

#### Inherited from

[`NotificationFilter`](NotificationFilter.md).[`zone`](NotificationFilter.md#zone)

***

### asset?

> `optional` **asset?**: `string`

Asset udid, sent as given.

#### Inherited from

[`NotificationFilter`](NotificationFilter.md).[`asset`](NotificationFilter.md#asset)

***

### thread\_key?

> `optional` **thread\_key?**: `string`

#### Inherited from

[`NotificationFilter`](NotificationFilter.md).[`thread_key`](NotificationFilter.md#thread_key)

***

### pinned?

> `optional` **pinned?**: `true`

The server has no "not pinned" filter.

#### Inherited from

[`NotificationFilter`](NotificationFilter.md).[`pinned`](NotificationFilter.md#pinned)

***

### from?

> `optional` **from?**: `string` \| `number` \| `Date`

`created_at >=` this time.

#### Inherited from

[`NotificationFilter`](NotificationFilter.md).[`from`](NotificationFilter.md#from)

***

### to?

> `optional` **to?**: `string` \| `number` \| `Date`

`created_at <=` this time.

#### Inherited from

[`NotificationFilter`](NotificationFilter.md).[`to`](NotificationFilter.md#to)

***

### limit?

> `optional` **limit?**: `number`

Integer 1..200; server default 50.

#### Inherited from

[`NotificationListQuery`](NotificationListQuery.md).[`limit`](NotificationListQuery.md#limit)

***

### offset?

> `optional` **offset?**: `number`

Integer >= 0.

#### Inherited from

[`NotificationListQuery`](NotificationListQuery.md).[`offset`](NotificationListQuery.md#offset)

***

### group\_by?

> `optional` **group\_by?**: [`NotificationGroupBy`](../type-aliases/NotificationGroupBy.md)

Default `'thread'`.
