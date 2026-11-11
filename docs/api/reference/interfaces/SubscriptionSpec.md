[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / SubscriptionSpec

# Interface: SubscriptionSpec

Object form of a subscription request.

## Properties

### types?

> `optional` **types?**: `"ALL"` \| readonly [`SubscriptionType`](../type-aliases/SubscriptionType.md)[]

Absent → `'ALL'`.

***

### uuids?

> `optional` **uuids?**: readonly `string`[] \| `null`

Present: replaces the tag filter (`null` clears); absent: keeps the current filter.
