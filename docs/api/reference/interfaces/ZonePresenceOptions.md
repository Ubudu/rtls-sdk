[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / ZonePresenceOptions

# Interface: ZonePresenceOptions

Options of `zones.getPresence`.

## Properties

### timestampFrom?

> `optional` **timestampFrom?**: `string` \| `number` \| `Date`

Epoch ms, `Date` or ISO string; default `timestampTo` − 24 h.

***

### timestampTo?

> `optional` **timestampTo?**: `string` \| `number` \| `Date`

Epoch ms, `Date` or ISO string; default now.

***

### value?

> `optional` **value?**: `string`

Asset udid (MAC). When `key` is absent or `'user.udid'`, a valid MAC is normalised to the stored 12-lowercase-hex
form; anything else is sent verbatim. Omitted: the server returns the asset with the most documents in the
range, not all assets.

***

### interval?

> `optional` **interval?**: `string`

ES fixed interval matching `/^[1-9]\d*(ms|s|m|h|d)$/`; default chosen by the server from the range.

***

### ~~key?~~

> `optional` **key?**: `string`

#### Deprecated

only `user.udid` (the default) returns data (USI-P4-18).
