[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / AssetPatch

# Type Alias: AssetPatch

> **AssetPatch** = \{ \[K in keyof AssetInput as K extends "user\_name" \| "user\_udid" \| "createdBy" \| "dateCreated" \| "dateChanged" \| "battery\_percent" \| "maintenance" ? never : K\]?: AssetInput\[K\] \| null \} & `object`

A JSON merge patch of an asset (`assets.update`): `null` deletes a key. `user_name` and `user_udid` cannot be
deleted (`update` rejects `null` for them), and the server-owned fields cannot be set.

## Type Declaration

### user\_name?

> `optional` **user\_name?**: `string`

A non-empty string.

### user\_udid?

> `optional` **user\_udid?**: `string`

The asset's MAC (any accepted form; sent normalised).

### createdBy?

> `optional` **createdBy?**: `never`

### dateCreated?

> `optional` **dateCreated?**: `never`

### dateChanged?

> `optional` **dateChanged?**: `never`

### battery\_percent?

> `optional` **battery\_percent?**: `never`

### maintenance?

> `optional` **maintenance?**: `never`
