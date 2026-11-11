[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / PositionHistoryOptions

# Interface: PositionHistoryOptions

Options of `positions.getHistory()`.

## Properties

### value

> **value**: `string`

The value matched on `key` (the asset MAC with the default key).

***

### key?

> `optional` **key?**: `string`

Field matched against `value`; default `user.udid`; `data.x` is shorthand for `user.data.x`.

***

### timestampFrom?

> `optional` **timestampFrom?**: [`TimeInput`](../type-aliases/TimeInput.md)

Lower bound; default `timestampTo` − 24 h.

***

### timestampTo?

> `optional` **timestampTo?**: [`TimeInput`](../type-aliases/TimeInput.md)

Upper bound; default now.
