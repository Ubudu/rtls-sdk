[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / PathSegmentProperties

# Interface: PathSegmentProperties

Properties of a path segment feature (keys as on the wire). Hand-written: the 0.2 SDK typed names the server
never sends; these are the stored names.

## Properties

### id

> **id**: `number`

***

### external\_id

> **external\_id**: `number`

***

### type

> **type**: `"path_segment"`

***

### source\_node\_id

> **source\_node\_id**: `number`

***

### target\_node\_id

> **target\_node\_id**: `number`

***

### level

> **level**: `number`

***

### bidirectional

> **bidirectional**: `boolean`

***

### distance

> **distance**: `number`

metres

***

### estimated\_time

> **estimated\_time**: `number`

seconds

***

### accessibility

> **accessibility**: [`SegmentAccessibility`](SegmentAccessibility.md)

***

### penalty\_factor

> **penalty\_factor**: `number`

***

### is\_active

> **is\_active**: `boolean`

***

### tags

> **tags**: `string`[]

***

### connection\_type?

> `optional` **connection\_type?**: `string`
