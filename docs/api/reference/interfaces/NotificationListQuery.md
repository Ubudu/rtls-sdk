[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationListQuery

# Interface: NotificationListQuery

A filter plus one page of the flat list.

## Remarks

Spec: `limit` / `offset` bounds are not documented (the server clamps silently).

## Extends

- [`NotificationFilter`](NotificationFilter.md)

## Properties

### q?

> `optional` **q?**: `string`

Scoped terms (`zone:<int>`, `tag:<tag>`, `from:<source>`, `severity:<…>`) and free text; free text forces flat results.

#### Inherited from

[`NotificationFilter`](NotificationFilter.md).[`q`](NotificationFilter.md#q)

***

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

***

### offset?

> `optional` **offset?**: `number`

Integer >= 0.
