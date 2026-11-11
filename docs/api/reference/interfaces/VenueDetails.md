[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / VenueDetails

# Interface: VenueDetails

`GET /venues/{ns}/{venueId}`. Hand-written: for an unknown id the server answers 200 `{ id, statistics }`
(USI-P4-2), so `name` and `coordinates` are optional.

## Properties

### id

> **id**: `number`

***

### name?

> `optional` **name?**: `string`

***

### address?

> `optional` **address?**: `string`

***

### coordinates?

> `optional` **coordinates?**: [`LatLng`](LatLng.md)

***

### metadata?

> `optional` **metadata?**: `object`

#### externalVenueId?

> `optional` **externalVenueId?**: `number`

#### applicationNamespace?

> `optional` **applicationNamespace?**: `string`

#### createdAt?

> `optional` **createdAt?**: `string`

#### updatedAt?

> `optional` **updatedAt?**: `string`

#### isActive?

> `optional` **isActive?**: `boolean`

#### timezone?

> `optional` **timezone?**: `string`

#### openingHours?

> `optional` **openingHours?**: [`VenueOpeningHours`](VenueOpeningHours.md)

#### context?

> `optional` **context?**: `object`

##### context.description?

> `optional` **description?**: `string`

##### context.venueType?

> `optional` **venueType?**: `string`

##### context.primaryActivities?

> `optional` **primaryActivities?**: `string`

#### statistics?

> `optional` **statistics?**: `object`

##### statistics.totalZones

> **totalZones**: `number`

##### statistics.totalPOIs

> **totalPOIs**: `number`

##### statistics.totalPathNodes

> **totalPathNodes**: `number`

##### statistics.totalPathSegments

> **totalPathSegments**: `number`

##### statistics.floors

> **floors**: `number`[]

##### statistics.lastDataSync?

> `optional` **lastDataSync?**: `string`

***

### statistics?

> `optional` **statistics?**: [`VenueStatistics`](VenueStatistics.md)
