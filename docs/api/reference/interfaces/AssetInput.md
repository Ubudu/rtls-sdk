[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / AssetInput

# Interface: AssetInput

The writable fields of an asset (`assets.create`). Server-owned fields are excluded at type level.

Spec defect: the spec documents the upsert body as `Asset`; the server merges it into the stored asset (RFC 7396) and
requires a non-empty `user_name` after the merge. `user_udid` is never taken from the path: the SDK sends the
normalised MAC.

## Indexable

> \[`key`: `string`\]: `unknown`

## Properties

### user\_name

> **user\_name**: `string`

***

### user\_udid?

> `optional` **user\_udid?**: `string`

Optional; when given it must be the asset's MAC (compared after normalisation).

***

### user\_motion?

> `optional` **user\_motion?**: `string`

***

### user\_type?

> `optional` **user\_type?**: `string`

***

### model?

> `optional` **model?**: `string`

***

### color?

> `optional` **color?**: `string`

***

### path?

> `optional` **path?**: `string`

***

### tags?

> `optional` **tags?**: `string`[]

***

### external\_id?

> `optional` **external\_id?**: `string`

***

### targetApplications?

> `optional` **targetApplications?**: `string`[]

***

### declared\_location?

> `optional` **declared\_location?**: [`DeclaredLocation`](DeclaredLocation.md) \| `null`

Changing it publishes one synthetic position (origin `declared`).

***

### data?

> `optional` **data?**: `Record`\<`string`, `unknown`\>

***

### createdBy?

> `optional` **createdBy?**: `undefined`

***

### dateCreated?

> `optional` **dateCreated?**: `undefined`

***

### dateChanged?

> `optional` **dateChanged?**: `undefined`

***

### battery\_percent?

> `optional` **battery\_percent?**: `undefined`

***

### maintenance?

> `optional` **maintenance?**: `undefined`
