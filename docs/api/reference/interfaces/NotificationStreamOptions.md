[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationStreamOptions

# Interface: NotificationStreamOptions

Options of `notifications.stream()`. `signal` is required: the stream has no total timeout.

## Remarks

Spec: `/stream` declares `token` / `api_key` query parameters; the SDK authenticates by header only.

## Extends

- [`CallContext`](../type-aliases/CallContext.md)

## Properties

### namespace?

> `optional` **namespace?**: `string`

Default application namespace for all requests

#### Inherited from

`CallContext.namespace`

***

### venueId?

> `optional` **venueId?**: `number`

Default venue ID for venue-scoped requests

#### Inherited from

`CallContext.venueId`

***

### mapId?

> `optional` **mapId?**: `number`

Default map ID for map-scoped requests

#### Inherited from

`CallContext.mapId`

***

### level?

> `optional` **level?**: `number`

Default floor level for spatial queries

#### Inherited from

`CallContext.level`

***

### signal

> **signal**: `AbortSignal`

Required; aborting it closes the stream.

***

### reconnect?

> `optional` **reconnect?**: `boolean` \| \{ `initialDelayMs?`: `number`; `maxDelayMs?`: `number`; `maxAttempts?`: `number`; \}

Default `true` = `{ initialDelayMs: 1000, maxDelayMs: 30000, maxAttempts: Infinity }`.

***

### idleTimeoutMs?

> `optional` **idleTimeoutMs?**: `number`

Default 45 000 (more than two 20 s heartbeats).
