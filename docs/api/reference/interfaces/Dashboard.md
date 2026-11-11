[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / Dashboard

# Interface: Dashboard

A dashboard as the server returns it (USI-P5-6). There is no `id` field: the identifier is `_id`.

## Properties

### \_id

> **\_id**: `string`

24-hex document id.

***

### name

> **name**: `string`

***

### description?

> `optional` **description?**: `string`

***

### application\_namespace

> **application\_namespace**: `string`

***

### data?

> `optional` **data?**: [`DashboardData`](../type-aliases/DashboardData.md)

Widget configuration, opaque (an array in the product UI). Absent on a dashboard stored with `data: {}`, which
the server drops (USI-P5-10), for example one created by SDK 0.2.0 `create()` without `data`.

***

### dynamicVariables?

> `optional` **dynamicVariables?**: [`DynamicVariable`](DynamicVariable.md)[]

Absent unless set.

***

### created\_at

> **created\_at**: `string`

ISO date-time.

***

### updated\_at

> **updated\_at**: `string`

ISO date-time, bumped by every save.

***

### created\_by

> **created\_by**: `string`

Username of the creator (the user of the API key for dashboards created through the SDK).

***

### shared\_with?

> `optional` **shared\_with?**: [`DashboardShare`](DashboardShare.md)[]

Present only when the caller is the creator.

***

### selected\_by?

> `optional` **selected\_by?**: `string`[]

Present only when the caller is the creator.

***

### selected

> **selected**: `boolean`

The caller is in `selected_by`.

***

### can\_edit

> **can\_edit**: `boolean`

The caller is the creator or has `'edit'`.

***

### \_\_v?

> `optional` **\_\_v?**: `number`

Version key of the store.
