[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / ResolvedNamespaceContext

# Interface: ResolvedNamespaceContext

Resolved context with namespace guaranteed (required for most API calls).

## Extends

- [`RtlsContext`](RtlsContext.md)

## Properties

### venueId?

> `optional` **venueId?**: `number`

Default venue ID for venue-scoped requests

#### Inherited from

[`RtlsContext`](RtlsContext.md).[`venueId`](RtlsContext.md#venueid)

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

### namespace

> **namespace**: `string`

Default application namespace for all requests

#### Overrides

[`RtlsContext`](RtlsContext.md).[`namespace`](RtlsContext.md#namespace)
