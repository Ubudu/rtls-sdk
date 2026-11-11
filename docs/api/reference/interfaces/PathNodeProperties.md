[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / PathNodeProperties

# Interface: PathNodeProperties

Properties of a path node feature (keys as on the wire). Hand-written: the spec's node schema is stale.

## Properties

### id

> **id**: `number`

***

### external\_id

> **external\_id**: `number`

***

### type

> **type**: `"path_node"`

***

### node\_type

> **node\_type**: [`PathNodeType`](../type-aliases/PathNodeType.md)

***

### name

> **name**: `string`

***

### level

> **level**: `number`

***

### is\_active

> **is\_active**: `boolean`

***

### cross\_level\_connections

> **cross\_level\_connections**: [`CrossLevelConnection`](../type-aliases/CrossLevelConnection.md)[]

***

### tags

> **tags**: `string`[]

***

### poi\_type?

> `optional` **poi\_type?**: `string`

***

### is\_accessible?

> `optional` **is\_accessible?**: `boolean`

***

### is\_emergency\_exit?

> `optional` **is\_emergency\_exit?**: `boolean`
