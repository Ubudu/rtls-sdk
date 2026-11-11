[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / ResolvedMapContext

# Interface: ResolvedMapContext

Resolved context with mapId guaranteed.

## Extends

- [`RtlsContext`](RtlsContext.md)

## Properties

### namespace?

> `optional` **namespace?**: `string`

Default application namespace for all requests

#### Inherited from

[`RtlsContext`](RtlsContext.md).[`namespace`](RtlsContext.md#namespace)

***

### venueId?

> `optional` **venueId?**: `number`

Default venue ID for venue-scoped requests

#### Inherited from

[`RtlsContext`](RtlsContext.md).[`venueId`](RtlsContext.md#venueid)

***

### level?

> `optional` **level?**: `number`

Default floor level for spatial queries

#### Inherited from

[`RtlsContext`](RtlsContext.md).[`level`](RtlsContext.md#level)

***

### mapId

> **mapId**: `number`

Default map ID for map-scoped requests

#### Overrides

[`RtlsContext`](RtlsContext.md).[`mapId`](RtlsContext.md#mapid)
