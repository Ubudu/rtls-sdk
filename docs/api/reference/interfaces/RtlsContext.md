[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / RtlsContext

# Interface: RtlsContext

Default context values configurable at client creation.
These values are used as defaults for all API calls.

## Extended by

- [`ResolvedNamespaceContext`](ResolvedNamespaceContext.md)
- [`ResolvedVenueContext`](ResolvedVenueContext.md)
- [`ResolvedMapContext`](ResolvedMapContext.md)

## Properties

### namespace?

> `optional` **namespace?**: `string`

Default application namespace for all requests

***

### venueId?

> `optional` **venueId?**: `number`

Default venue ID for venue-scoped requests

***

### mapId?

> `optional` **mapId?**: `number`

Default map ID for map-scoped requests

***

### level?

> `optional` **level?**: `number`

Default floor level for spatial queries
