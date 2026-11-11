[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / UpdateDashboardInput

# Interface: UpdateDashboardInput

Input of `dashboards.update()`: an absent key leaves the stored value untouched.

## Properties

### name?

> `optional` **name?**: `string`

***

### description?

> `optional` **description?**: `string`

***

### data?

> `optional` **data?**: [`DashboardData`](../type-aliases/DashboardData.md)

An empty object `{}` is rejected client-side: the server drops it and every later update fails (USI-P5-10).

***

### dynamicVariables?

> `optional` **dynamicVariables?**: [`DynamicVariable`](DynamicVariable.md)[]

`[]` clears; omit to keep; `null` is rejected client-side (the server would clear them, USI-P5-9).

***

### application\_namespace?

> `optional` **application\_namespace?**: `string`

Moves the dashboard to another namespace.

***

### shared\_with?

> `optional` **shared\_with?**: [`DashboardShareInput`](DashboardShareInput.md)[]

Creator only; full replace.

***

### selected\_by?

> `optional` **selected\_by?**: `string`[]
