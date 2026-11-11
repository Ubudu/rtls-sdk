[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationFacets

# Interface: NotificationFacets

Counts by facet of the items matching a filter. With no `state` filter the base filter is "not archived", so
`state.archived` is 0 unless `state` is `'all'` or `'archived'`.

## Remarks

Spec: the response is an untyped object and only `q` is declared as a filter.

## Properties

### kind

> **kind**: `Partial`\<`Record`\<[`NotificationKind`](../type-aliases/NotificationKind.md), `number`\>\>

***

### severity

> **severity**: `Partial`\<`Record`\<[`NotificationSeverity`](../type-aliases/NotificationSeverity.md), `number`\>\>

***

### zone

> **zone**: `Record`\<`string`, `number`\>

Key = zone id as a string; items without a zone are not counted.

***

### channel

> **channel**: `Record`\<`string`, `number`\>

Counts of deliveries per channel.

***

### state

> **state**: `object`

#### unread

> **unread**: `number`

#### read

> **read**: `number`

#### needs\_action

> **needs\_action**: `number`

#### archived

> **archived**: `number`

#### muted

> **muted**: `number`

#### snoozed

> **snoozed**: `number`

#### pinned

> **pinned**: `number`
