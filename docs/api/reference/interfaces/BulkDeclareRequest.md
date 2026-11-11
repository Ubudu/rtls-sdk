[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / BulkDeclareRequest

# Interface: BulkDeclareRequest

Body of `POST /assets/{namespace}/bulk-declare`.

## Properties

### assets

> **assets**: [`BulkDeclareItem`](BulkDeclareItem.md)[]

1..500 items.

***

### shared\_location?

> `optional` **shared\_location?**: [`DeclaredLocation`](DeclaredLocation.md)

Used by the items without their own `declared_location`.

***

### auto\_create\_virtual\_assets?

> `optional` **auto\_create\_virtual\_assets?**: `boolean`

Default `false`; `true` creates permanent virtual assets for unknown external ids.

***

### default\_asset\_model?

> `optional` **default\_asset\_model?**: `string`

Model of auto-created virtual assets; default `"UNKNOWN"`.
