[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / VenueSummary

# Interface: VenueSummary

Item of `GET /venues/{ns}`. Hand-written: the spec's `location`/`metadata` are never returned (USI-P4-1).

## Properties

### id

> **id**: `number`

***

### name

> **name**: `string`

***

### address?

> `optional` **address?**: `string`

***

### coordinates

> **coordinates**: [`LatLng`](LatLng.md)

***

### hasMetadata?

> `optional` **hasMetadata?**: `boolean`

***

### lastUpdated?

> `optional` **lastUpdated?**: `string`

***

### statistics

> **statistics**: [`VenueStatistics`](VenueStatistics.md)
