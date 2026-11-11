[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / ZonesResource

# Class: ZonesResource

Zones of a venue. `list()` returns the GeoJSON FeatureCollection; `listAsArray()` is its flat `Zone[]` form.

## Extends

- `ResourceBase`

## Methods

### list()

#### Call Signature

> **list**(`options?`, `requestOptions?`): `Promise`\<[`ZoneFeatureCollection`](../interfaces/ZoneFeatureCollection.md)\>

The zones of a venue as a GeoJSON FeatureCollection (`GET /venues/{ns}/{venueId}/zones`). A filtered call adds
`total` to the collection.

##### Parameters

###### options?

[`ListZonesOptions`](../type-aliases/ListZonesOptions.md)

per-call `namespace`, `venueId`, `level` (floor filter on `properties.level`; the client's
  default level is not applied), `tag` (exact element of `properties.tags`), `filters`, request options

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`ZoneFeatureCollection`](../interfaces/ZoneFeatureCollection.md)\>

##### Deprecated

pass the request options in `options` (these keys win when both are given)

##### Throws

no namespace or venue, or a malformed id or level (nothing is sent)

##### Example

```typescript
import { createRtlsClient } from 'ubudu-rtls-sdk';

const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace', venueId: 42 });
const docks = await client.zones.list({ level: 0, tag: 'dock' });
console.log(docks.total, docks.features.length);
```

#### Call Signature

> **list**(`namespace`, `venueId`, `requestOptions?`): `Promise`\<[`ZoneFeatureCollection`](../interfaces/ZoneFeatureCollection.md)\>

Legacy positional form; a digit-string id is read as a number.

##### Parameters

###### namespace

`string`

###### venueId

`string` \| `number`

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`ZoneFeatureCollection`](../interfaces/ZoneFeatureCollection.md)\>

***

### listAsArray()

#### Call Signature

> **listAsArray**(`options?`, `requestOptions?`): `Promise`\<[`Zone`](../interfaces/Zone.md)[]\>

The zones of a venue as flat items (`color` from `rgb_color`, `geometry` kept).

##### Parameters

###### options?

[`ListZonesOptions`](../type-aliases/ListZonesOptions.md)

as [ZonesResource.list](#list)

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`Zone`](../interfaces/Zone.md)[]\>

##### Deprecated

pass the request options in `options`

##### Throws

no namespace or venue, or a malformed id or level (nothing is sent)

##### Example

```typescript
import { createRtlsClient } from 'ubudu-rtls-sdk';

const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace', venueId: 42 });
const zones = await client.zones.listAsArray();
```

#### Call Signature

> **listAsArray**(`namespace`, `venueId`, `requestOptions?`): `Promise`\<[`Zone`](../interfaces/Zone.md)[]\>

Legacy positional form; a digit-string id is read as a number.

##### Parameters

###### namespace

`string`

###### venueId

`string` \| `number`

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`Zone`](../interfaces/Zone.md)[]\>

***

### iterate()

#### Call Signature

> **iterate**(`options?`): `AsyncGenerator`\<[`Zone`](../interfaces/Zone.md)\>

Yields the zones of [ZonesResource.listAsArray](#listasarray) one by one (one request, then each zone).

##### Parameters

###### options?

[`ListZonesOptions`](../type-aliases/ListZonesOptions.md)

##### Returns

`AsyncGenerator`\<[`Zone`](../interfaces/Zone.md)\>

##### Throws

from the first `next()` when no namespace or venue is set (nothing is sent)

##### Example

```typescript
import { createRtlsClient } from 'ubudu-rtls-sdk';

const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace', venueId: 42 });
for await (const zone of client.zones.iterate({ level: 0 })) console.log(zone.name);
```

#### Call Signature

> **iterate**(`namespace`, `venueId`): `AsyncGenerator`\<[`Zone`](../interfaces/Zone.md)\>

Legacy positional form; a digit-string id is read as a number.

##### Parameters

###### namespace

`string`

###### venueId

`string` \| `number`

##### Returns

`AsyncGenerator`\<[`Zone`](../interfaces/Zone.md)\>

***

### ~~getAll()~~

#### Call Signature

> **getAll**(`options?`, `requestOptions?`): `Promise`\<[`Zone`](../interfaces/Zone.md)[]\>

##### Parameters

###### options?

[`ListZonesOptions`](../type-aliases/ListZonesOptions.md)

as [ZonesResource.list](#list)

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`Zone`](../interfaces/Zone.md)[]\>

##### Deprecated

use [ZonesResource.listAsArray](#listasarray) (same result); removed in a later minor.

##### Deprecated

pass the request options in `options`

##### Throws

no namespace or venue, or a malformed id or level (nothing is sent)

#### Call Signature

> **getAll**(`namespace`, `venueId`, `requestOptions?`): `Promise`\<[`Zone`](../interfaces/Zone.md)[]\>

##### Parameters

###### namespace

`string`

###### venueId

`string` \| `number`

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`Zone`](../interfaces/Zone.md)[]\>

##### Deprecated

use `listAsArray`.

***

### ~~listByMap()~~

#### Call Signature

> **listByMap**(`options?`, `requestOptions?`): `Promise`\<[`ZoneFeatureCollection`](../interfaces/ZoneFeatureCollection.md)\>

The zones of one map (`GET /venues/{ns}/{venueId}/maps/{mapId}/zones`).

##### Parameters

###### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

per-call `namespace`, `venueId`, `mapId`, request options

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`ZoneFeatureCollection`](../interfaces/ZoneFeatureCollection.md)\>

##### Deprecated

served from the server's sample dataset; always empty for real namespaces (USI-P4-6). Use
  `zones.list({ level })`.

##### Deprecated

pass the request options in `options`

##### Throws

no namespace, venue or map, or a malformed id (nothing is sent)

#### Call Signature

> **listByMap**(`namespace`, `venueId`, `mapId`, `requestOptions?`): `Promise`\<[`ZoneFeatureCollection`](../interfaces/ZoneFeatureCollection.md)\>

##### Parameters

###### namespace

`string`

###### venueId

`string` \| `number`

###### mapId

`string` \| `number`

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`ZoneFeatureCollection`](../interfaces/ZoneFeatureCollection.md)\>

##### Deprecated

sample data only (USI-P4-6); use `zones.list({ level })`.

***

### ~~listByMapAsArray()~~

#### Call Signature

> **listByMapAsArray**(`options?`, `requestOptions?`): `Promise`\<[`Zone`](../interfaces/Zone.md)[]\>

The zones of one map as flat items.

##### Parameters

###### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

per-call `namespace`, `venueId`, `mapId`, request options

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`Zone`](../interfaces/Zone.md)[]\>

##### Deprecated

sample data only (USI-P4-6); use `zones.listAsArray({ level })`.

##### Deprecated

pass the request options in `options`

##### Throws

no namespace, venue or map, or a malformed id (nothing is sent)

#### Call Signature

> **listByMapAsArray**(`namespace`, `venueId`, `mapId`, `requestOptions?`): `Promise`\<[`Zone`](../interfaces/Zone.md)[]\>

##### Parameters

###### namespace

`string`

###### venueId

`string` \| `number`

###### mapId

`string` \| `number`

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`Zone`](../interfaces/Zone.md)[]\>

##### Deprecated

sample data only (USI-P4-6); use `zones.listAsArray({ level })`.

***

### getPresence()

#### Call Signature

> **getPresence**(`options?`, `requestOptions?`): `Promise`\<[`ZonePresenceSlot`](../interfaces/ZonePresenceSlot.md)[]\>

The zone timeline of **one asset** (`GET /es/zone_presence/{ns}`): one slot per interval, from the asset's first
to its last position document in the range.

Time range: neither bound → the last 24 h; only `timestampFrom` → up to now; only `timestampTo` → the 24 h before
it. `value` is the asset's udid: a valid MAC is normalised to the stored 12-lowercase-hex form; without `value`
the server picks the asset with the most documents in the range. Slots: occupied → the zone of one document of
the slot (not the dominant one, USI-P4-18) plus `timestamp`; empty → `{ id: 0, name: 'OUTSIDE_ALL_ZONES' }`;
document without zone → `{ name: 'UNKNOWN_ZONE' }`.

Errors: 400 `{ error: 'timestampFrom and timestampTo are required parameters' }` → `ValidationError`; 500
`{ error: <Elasticsearch message> }` → `ServerError`; 401 → `AuthenticationError`.

##### Parameters

###### options?

[`ZonePresenceOptions`](../interfaces/ZonePresenceOptions.md) & [`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

`timestampFrom`, `timestampTo` (epoch ms, `Date` or ISO string), `value`, `interval` (ES fixed
  interval such as `'15m'`), `key` (deprecated), per-call `namespace`, request options

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`ZonePresenceSlot`](../interfaces/ZonePresenceSlot.md)[]\>

##### Deprecated

pass the request options in `options`

##### Throws

no namespace (nothing is sent)

##### Throws

status 0 for `from > to`, an unparseable time or an invalid `interval` (nothing is sent)

##### Example

```typescript
import { createRtlsClient } from 'ubudu-rtls-sdk';

const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace' });
const slots = await client.zones.getPresence({
  value: 'AA:BB:CC:DD:EE:FF',
  timestampFrom: Date.now() - 3_600_000,
  interval: '5m',
});
```

#### Call Signature

> **getPresence**(`namespace`, `options?`, `requestOptions?`): `Promise`\<[`ZonePresenceSlot`](../interfaces/ZonePresenceSlot.md)[]\>

Legacy positional namespace.

##### Parameters

###### namespace

`string`

###### options?

[`ZonePresenceOptions`](../interfaces/ZonePresenceOptions.md)

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`ZonePresenceSlot`](../interfaces/ZonePresenceSlot.md)[]\>
