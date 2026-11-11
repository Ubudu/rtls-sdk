[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / CreateDashboardInput

# Interface: CreateDashboardInput

Input of `dashboards.create()`.

## Properties

### name

> **name**: `string`

***

### data?

> `optional` **data?**: [`DashboardData`](../type-aliases/DashboardData.md)

Default `[]` (the product UI's widget array). An empty object `{}` is rejected client-side (USI-P5-10).

***

### description?

> `optional` **description?**: `string`

***

### dynamicVariables?

> `optional` **dynamicVariables?**: [`DynamicVariable`](DynamicVariable.md)[]

Stored only when a non-empty array.

***

### shared\_with?

> `optional` **shared\_with?**: [`DashboardShareInput`](DashboardShareInput.md)[]

***

### selected\_by?

> `optional` **selected\_by?**: `string`[]

The server keeps only the creator and users the dashboard is shared with.

***

### ~~namespace?~~

> `optional` **namespace?**: `string`

#### Deprecated

use `options.namespace` or the client default
