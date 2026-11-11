[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / POIProperties

# Interface: POIProperties

Properties of a POI feature. Hand-written: the server sets `id` to the POI's external id or, without one, its
string `_id`, and copies the raw POI fields, most of them optional (spec lists 14 required properties).

## Properties

### id

> **id**: `string` \| `number`

***

### name

> **name**: `string`

***

### level

> **level**: `number`

***

### description?

> `optional` **description?**: `string`

***

### color?

> `optional` **color?**: `string`

***

### tags?

> `optional` **tags?**: `string`[]

***

### \_id?

> `optional` **\_id?**: `string`

***

### coordinates?

> `optional` **coordinates?**: `object`

#### lat

> **lat**: `number`

#### lng

> **lng**: `number`

***

### createdAt?

> `optional` **createdAt?**: `string`

***

### updatedAt?

> `optional` **updatedAt?**: `string`

***

### externalId?

> `optional` **externalId?**: `number`

***

### externalVenueId?

> `optional` **externalVenueId?**: `number`

***

### externalApplicationId?

> `optional` **externalApplicationId?**: `number`

***

### index?

> `optional` **index?**: `number`
