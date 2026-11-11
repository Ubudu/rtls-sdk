[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / DataModelField

# Interface: DataModelField

One entry of the data model taxonomy (`GET /data_filters_taxonomy/…`), stored verbatim (`[]` when unset,
USI-P2-9).

Spec defect: the spec types `type` as a closed enum and omits `label` and `enabledForLLM`; the server stores any
value.

## Indexable

> \[`key`: `string`\]: `unknown`

## Properties

### key

> **key**: `string`

Dot path (for example `"user.name"`), or `"data_models"` for the entry that carries the model definitions.

***

### type?

> `optional` **type?**: [`DataModelFieldType`](../type-aliases/DataModelFieldType.md) \| `string` & `object`

***

### label?

> `optional` **label?**: `string`

***

### visible?

> `optional` **visible?**: `boolean`

***

### showInFilters?

> `optional` **showInFilters?**: `boolean`

***

### showInTagPairingApp?

> `optional` **showInTagPairingApp?**: `boolean`

***

### enabledForLLM?

> `optional` **enabledForLLM?**: `boolean`

***

### computed?

> `optional` **computed?**: `boolean`

***

### validation?

> `optional` **validation?**: `Record`\<`string`, `unknown`\>

***

### dateAdded?

> `optional` **dateAdded?**: `number` \| `null`

***

### dateChanged?

> `optional` **dateChanged?**: `number` \| `null`

***

### data?

> `optional` **data?**: [`DataModelDefinition`](DataModelDefinition.md)[]

Only on the entry whose `key` is `"data_models"`.
