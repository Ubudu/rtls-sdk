[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / AssetMessage

# Interface: AssetMessage

M6: asset change. No timestamp; `data` absent on delete.

## Properties

### type

> **type**: `"assets"`

***

### action

> **action**: `"create"` \| `"update"` \| `"delete"`

***

### app\_namespace

> **app\_namespace**: `string`

***

### mac\_address

> **mac\_address**: `string`

***

### data?

> `optional` **data?**: [`WsAssetData`](WsAssetData.md)
