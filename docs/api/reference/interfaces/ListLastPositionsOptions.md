[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / ListLastPositionsOptions

# Interface: ListLastPositionsOptions

Options of `positions.listLast()`; only these keys are sent.

## Properties

### key?

> `optional` **key?**: `string`

Field that identifies a document; default `user.udid`; `data.x` is shorthand for `user.data.x`.

***

### queryString?

> `optional` **queryString?**: `string`

Lucene query string.

***

### mapUuids?

> `optional` **mapUuids?**: `string`[]

Map UUIDs (OR); sent as CSV, omitted when empty.

***

### timestampFrom?

> `optional` **timestampFrom?**: [`TimeInput`](../type-aliases/TimeInput.md)

Lower bound; default `timestampTo` − 24 h. `0` requests the whole history (slow: pass `timeoutMs`).

***

### timestampTo?

> `optional` **timestampTo?**: [`TimeInput`](../type-aliases/TimeInput.md)

Upper bound; default now.

***

### current?

> `optional` **current?**: `boolean`

Current-position semantics, honoured only when the platform switch is on (sent only when `true`).
