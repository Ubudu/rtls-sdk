[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / EtlFieldMapping

# Interface: EtlFieldMapping

Value of `mappings[targetPath]`, where targetPath is an asset path: `'user_name'`, `'external_id'`,
`'data.<field>'`. Server truth; the spec types mapping values as strings (USI-P7-1).

## Properties

### sourceColumn

> **sourceColumn**: `string`

Source column name in the file.

***

### transformation?

> `optional` **transformation?**: [`EtlTransformation`](../type-aliases/EtlTransformation.md)

Default `'none'`.

***

### required?

> `optional` **required?**: `boolean`

A row whose cell is missing or empty is rejected.

***

### type?

> `optional` **type?**: `"string"` \| `"number"` \| `"boolean"` \| `"datetime"` \| `string` & `object` \| `"date"`

`'date'`/`'datetime'` convert Excel serials; `'boolean'` reads true/false/yes/no/1/0.

***

### sourceFormat?

> `optional` **sourceFormat?**: `string`

moment.js format for `toDate`, for example `'DD/MM/YYYY'`.
