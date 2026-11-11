[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / AlertEvent

# Interface: AlertEvent

One fired alert (`GET /es/alerts/{appNamespace}`), newest first; `set_variable` events are never returned.
The spec's item schema omits `zone`, and `event.params` / `event.style` can be `null` (USI-P5-11).

## Properties

### timestamp

> **timestamp**: `number`

Epoch milliseconds.

***

### map\_uuid?

> `optional` **map\_uuid?**: `string`

***

### event

> **event**: `object`

#### type

> **type**: `string`

#### title

> **title**: `string`

`params.title`, else `params.text`, else `'no_title'`.

#### style

> **style**: `string` \| `null`

#### params

> **params**: [`AlertEventParams`](AlertEventParams.md) \| `null`

***

### user

> **user**: `object`

#### udid?

> `optional` **udid?**: `string`

#### external\_id?

> `optional` **external\_id?**: `string`

#### name?

> `optional` **name?**: `string`

#### type?

> `optional` **type?**: `string` \| `null`

#### tags?

> `optional` **tags?**: `string`[]

#### device\_info?

> `optional` **device\_info?**: `object`

##### device\_info.model?

> `optional` **model?**: `string` \| `null`

#### data

> **data**: `Record`\<`string`, `unknown`\>

***

### zone

> **zone**: `object`

#### id?

> `optional` **id?**: `number`

#### name?

> `optional` **name?**: `string`

#### tags?

> `optional` **tags?**: `string`[]

#### color?

> `optional` **color?**: `string`
