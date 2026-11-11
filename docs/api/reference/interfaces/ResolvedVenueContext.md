[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / ResolvedVenueContext

# Interface: ResolvedVenueContext

Resolved context with venueId guaranteed.

## Extends

- [`RtlsContext`](RtlsContext.md)

## Properties

### namespace?

> `optional` **namespace?**: `string`

Default application namespace for all requests

#### Inherited from

[`RtlsContext`](RtlsContext.md).[`namespace`](RtlsContext.md#namespace)

***

### mapId?

> `optional` **mapId?**: `number`

Default map ID for map-scoped requests

#### Inherited from

[`RtlsContext`](RtlsContext.md).[`mapId`](RtlsContext.md#mapid)

***

### level?

> `optional` **level?**: `number`

Default floor level for spatial queries

#### Inherited from

[`RtlsContext`](RtlsContext.md).[`level`](RtlsContext.md#level)

***

### venueId

> **venueId**: `number`

Default venue ID for venue-scoped requests

#### Overrides

[`RtlsContext`](RtlsContext.md).[`venueId`](RtlsContext.md#venueid)
