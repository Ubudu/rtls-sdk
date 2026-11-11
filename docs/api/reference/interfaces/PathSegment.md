[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / PathSegment

# Interface: PathSegment

A path segment as a flat object.

## Properties

### id

> **id**: `number`

***

### externalId

> **externalId**: `number`

***

### sourceNodeId

> **sourceNodeId**: `number`

***

### targetNodeId

> **targetNodeId**: `number`

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

### estimatedTime

> **estimatedTime**: `number`

seconds

***

### accessibility

> **accessibility**: [`SegmentAccessibility`](SegmentAccessibility.md)

***

### penaltyFactor

> **penaltyFactor**: `number`

***

### isActive

> **isActive**: `boolean`

***

### tags

> **tags**: `string`[]

***

### connectionType?

> `optional` **connectionType?**: `string`

***

### coordinates

> **coordinates**: \[`number`, `number`\][]

`[lon, lat]` positions of the line.
