[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / EtlActivityQuery

# Interface: EtlActivityQuery

Query of `activities.listPage()`. The SDK validates `page`/`limit` before sending and sends `search` as literal
text (USI-P7-9).

## Properties

### page?

> `optional` **page?**: `number`

Integer ≥ 1.

***

### limit?

> `optional` **limit?**: `number`

Integer ≥ 1.

***

### sortField?

> `optional` **sortField?**: `string` & `object` \| `"timestamp"` \| `"action"` \| `"resourceType"`

Default `'timestamp'`.

***

### sortOrder?

> `optional` **sortOrder?**: `"asc"` \| `"desc"`

Anything but `'asc'` sorts descending.

***

### search?

> `optional` **search?**: `string`

Literal text (USI-P7-9). Matches details.name, resourceType, action (not filenames).

***

### action?

> `optional` **action?**: [`EtlActivityAction`](../type-aliases/EtlActivityAction.md)

***

### resourceType?

> `optional` **resourceType?**: `"mapping"` \| `"file"`
