[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / VenuesResource

# Class: VenuesResource

Venues of a namespace and their maps, POIs and path graph. `list*()` of a GeoJSON route returns the
FeatureCollection; `listPoisAsArray()`, `listPathNodes()` and `listPathSegments()` return flat items.

## Extends

- `ResourceBase`

## Methods

### list()

#### Call Signature

> **list**(`options?`): `Promise`\<[`VenueSummary`](../interfaces/VenueSummary.md)[]\>

The venues of the namespace (`GET /venues/{ns}`), as one array (the route has no server paging the SDK uses).

##### Parameters

###### options?

[`ListVenuesOptions`](../type-aliases/ListVenuesOptions.md)

per-call `namespace`, `filters` (sent as `filters=<JSON>`), request options

##### Returns

`Promise`\<[`VenueSummary`](../interfaces/VenueSummary.md)[]\>

##### Throws

no namespace (nothing is sent)

##### Throws

the body is neither an array nor `{ data: [...] }`

##### Example

```typescript
import { createRtlsClient, filters } from 'ubudu-rtls-sdk';

const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace' });
const venues = await client.venues.list();
const hall = await client.venues.list({ filters: filters.equals('name', 'Hall A') });
```

#### Call Signature

> **list**(`namespace`, `requestOptions?`): `Promise`\<[`VenueSummary`](../interfaces/VenueSummary.md)[]\>

Legacy positional namespace.

##### Parameters

###### namespace

`string`

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`VenueSummary`](../interfaces/VenueSummary.md)[]\>

***

### iterate()

#### Call Signature

> **iterate**(`options?`): `AsyncGenerator`\<[`VenueSummary`](../interfaces/VenueSummary.md)\>

Yields the venues of [VenuesResource.list](#list) one by one (one request, then each item).

##### Parameters

###### options?

[`ListVenuesOptions`](../type-aliases/ListVenuesOptions.md)

##### Returns

`AsyncGenerator`\<[`VenueSummary`](../interfaces/VenueSummary.md)\>

##### Throws

from the first `next()` when no namespace is set (nothing is sent)

##### Example

```typescript
import { collectAll, createRtlsClient } from 'ubudu-rtls-sdk';

const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace' });
const firstTen = await collectAll(client.venues.iterate(), { maxItems: 10 });
```

#### Call Signature

> **iterate**(`namespace`, `requestOptions?`): `AsyncGenerator`\<[`VenueSummary`](../interfaces/VenueSummary.md)\>

Legacy positional namespace.

##### Parameters

###### namespace

`string`

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`AsyncGenerator`\<[`VenueSummary`](../interfaces/VenueSummary.md)\>

***

### get()

#### Call Signature

> **get**(`options?`, `requestOptions?`): `Promise`\<[`VenueDetails`](../interfaces/VenueDetails.md)\>

One venue (`GET /venues/{ns}/{venueId}`). For an unknown id rtls-api answers 200 `{ id, statistics }` instead of
404 (USI-P4-2); the stub is returned as is.

##### Parameters

###### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

per-call `namespace`, `venueId`, request options

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`VenueDetails`](../interfaces/VenueDetails.md)\>

##### Deprecated

pass the request options in `options` (these keys win when both are given)

##### Throws

no namespace or venue, or a malformed venue id (nothing is sent)

##### Throws

404 `{ error: 'Venue not found' }`

##### Example

```typescript
import { createRtlsClient } from 'ubudu-rtls-sdk';

const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace', venueId: 42 });
const venue = await client.venues.get();
console.log(venue.name, venue.metadata?.openingHours?.week);
```

#### Call Signature

> **get**(`namespace`, `venueId`, `requestOptions?`): `Promise`\<[`VenueDetails`](../interfaces/VenueDetails.md)\>

Legacy positional form; a digit-string id is read as a number.

##### Parameters

###### namespace

`string`

###### venueId

`string` \| `number`

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`VenueDetails`](../interfaces/VenueDetails.md)\>

***

### listMaps()

#### Call Signature

> **listMaps**(`options?`, `requestOptions?`): `Promise`\<[`IndoorMap`](../interfaces/IndoorMap.md)[]\>

The indoor maps of a venue (`GET /venues/{ns}/{venueId}/maps`); several maps may share a level. `map_bounds` is
latitude first; `tiles_url_base` holds literal `{z}/{x}/{y}` placeholders.

##### Parameters

###### options?

[`ListMapsOptions`](../type-aliases/ListMapsOptions.md)

per-call `namespace`, `venueId`, `level` (floor filter; the client's default level is not
  applied), `filters`, request options

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`IndoorMap`](../interfaces/IndoorMap.md)[]\>

##### Deprecated

pass the request options in `options` (these keys win when both are given)

##### Throws

no namespace or venue, or a malformed id or level (nothing is sent)

##### Example

```typescript
import { createRtlsClient } from 'ubudu-rtls-sdk';

const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace', venueId: 42 });
const groundFloor = await client.venues.listMaps({ level: 0 });
```

#### Call Signature

> **listMaps**(`namespace`, `venueId`, `requestOptions?`): `Promise`\<[`IndoorMap`](../interfaces/IndoorMap.md)[]\>

Legacy positional form; a digit-string id is read as a number.

##### Parameters

###### namespace

`string`

###### venueId

`string` \| `number`

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`IndoorMap`](../interfaces/IndoorMap.md)[]\>

***

### listPois()

#### Call Signature

> **listPois**(`options?`, `requestOptions?`): `Promise`\<[`POIFeatureCollection`](../interfaces/POIFeatureCollection.md)\>

The POIs of a venue as a GeoJSON FeatureCollection (`GET /venues/{ns}/{venueId}/pois`). A filtered call adds
`total` to the collection.

##### Parameters

###### options?

[`ListPoisOptions`](../type-aliases/ListPoisOptions.md)

per-call `namespace`, `venueId`, `level` (floor filter on `properties.level`; the client's
  default level is not applied), `tag` (exact element of `properties.tags`), `filters`, request options

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`POIFeatureCollection`](../interfaces/POIFeatureCollection.md)\>

##### Deprecated

pass the request options in `options` (these keys win when both are given)

##### Throws

no namespace or venue, or a malformed id or level (nothing is sent)

##### Example

```typescript
import { createRtlsClient } from 'ubudu-rtls-sdk';

const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace', venueId: 42 });
const exits = await client.venues.listPois({ tag: 'exit', level: 0 });
```

#### Call Signature

> **listPois**(`namespace`, `venueId`, `requestOptions?`): `Promise`\<[`POIFeatureCollection`](../interfaces/POIFeatureCollection.md)\>

Legacy positional form; a digit-string id is read as a number.

##### Parameters

###### namespace

`string`

###### venueId

`string` \| `number`

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`POIFeatureCollection`](../interfaces/POIFeatureCollection.md)\>

***

### listPoisAsArray()

#### Call Signature

> **listPoisAsArray**(`options?`, `requestOptions?`): `Promise`\<[`POI`](../interfaces/POI.md)[]\>

The POIs of a venue as flat items ([VenuesResource.listPois](#listpois) then `extractPoisFromGeoJSON`).

##### Parameters

###### options?

[`ListPoisOptions`](../type-aliases/ListPoisOptions.md)

as [VenuesResource.listPois](#listpois)

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`POI`](../interfaces/POI.md)[]\>

##### Deprecated

pass the request options in `options`

##### Throws

no namespace or venue, or a malformed id or level (nothing is sent)

##### Example

```typescript
import { createRtlsClient } from 'ubudu-rtls-sdk';

const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace', venueId: 42 });
const pois = await client.venues.listPoisAsArray({ level: 0 });
```

#### Call Signature

> **listPoisAsArray**(`namespace`, `venueId`, `requestOptions?`): `Promise`\<[`POI`](../interfaces/POI.md)[]\>

Legacy positional form; a digit-string id is read as a number.

##### Parameters

###### namespace

`string`

###### venueId

`string` \| `number`

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`POI`](../interfaces/POI.md)[]\>

***

### listPaths()

#### Call Signature

> **listPaths**(`options?`, `requestOptions?`): `Promise`\<[`PathFeatureCollection`](../interfaces/PathFeatureCollection.md)\>

The path graph of a venue as a GeoJSON FeatureCollection of nodes (points) and segments (line strings)
(`GET /venues/{ns}/{venueId}/paths`).

##### Parameters

###### options?

[`ListPathsOptions`](../type-aliases/ListPathsOptions.md)

per-call `namespace`, `venueId`, `level` (floor filter; the client's default level is not
  applied), `nodeType` (keeps nodes of that `node_type` only), `filters`, request options

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`PathFeatureCollection`](../interfaces/PathFeatureCollection.md)\>

##### Deprecated

pass the request options in `options` (these keys win when both are given)

##### Throws

no namespace or venue, or a malformed id or level (nothing is sent)

##### Example

```typescript
import { createRtlsClient } from 'ubudu-rtls-sdk';

const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace', venueId: 42 });
const elevators = await client.venues.listPaths({ nodeType: 'elevator' });
```

#### Call Signature

> **listPaths**(`namespace`, `venueId`, `requestOptions?`): `Promise`\<[`PathFeatureCollection`](../interfaces/PathFeatureCollection.md)\>

Legacy positional form; a digit-string id is read as a number.

##### Parameters

###### namespace

`string`

###### venueId

`string` \| `number`

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`PathFeatureCollection`](../interfaces/PathFeatureCollection.md)\>

***

### listPathNodes()

#### Call Signature

> **listPathNodes**(`options?`, `requestOptions?`): `Promise`\<[`PathNode`](../interfaces/PathNode.md)[]\>

The path nodes of a venue as flat items ([VenuesResource.listPaths](#listpaths) then
`extractPathNodesFromGeoJSON`).

##### Parameters

###### options?

[`ListPathsOptions`](../type-aliases/ListPathsOptions.md)

as [VenuesResource.listPaths](#listpaths)

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`PathNode`](../interfaces/PathNode.md)[]\>

##### Deprecated

pass the request options in `options`

##### Throws

no namespace or venue, or a malformed id or level (nothing is sent)

##### Example

```typescript
import { createRtlsClient } from 'ubudu-rtls-sdk';

const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace', venueId: 42 });
const nodes = await client.venues.listPathNodes({ level: 0 });
```

#### Call Signature

> **listPathNodes**(`namespace`, `venueId`, `requestOptions?`): `Promise`\<[`PathNode`](../interfaces/PathNode.md)[]\>

Legacy positional form; a digit-string id is read as a number.

##### Parameters

###### namespace

`string`

###### venueId

`string` \| `number`

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`PathNode`](../interfaces/PathNode.md)[]\>

***

### listPathSegments()

#### Call Signature

> **listPathSegments**(`options?`, `requestOptions?`): `Promise`\<[`PathSegment`](../interfaces/PathSegment.md)[]\>

The path segments of a venue as flat items, with the stored property names (`sourceNodeId`, `targetNodeId`,
`bidirectional`, `distance`, …) ([VenuesResource.listPaths](#listpaths) then `extractPathSegmentsFromGeoJSON`).

##### Parameters

###### options?

`Omit`\<[`ListPathsOptions`](../type-aliases/ListPathsOptions.md), `"nodeType"`\>

as [VenuesResource.listPaths](#listpaths), without `nodeType`

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`PathSegment`](../interfaces/PathSegment.md)[]\>

##### Deprecated

pass the request options in `options`

##### Throws

no namespace or venue, or a malformed id or level (nothing is sent)

##### Example

```typescript
import { createRtlsClient } from 'ubudu-rtls-sdk';

const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace', venueId: 42 });
const oneWay = (await client.venues.listPathSegments()).filter((s) => !s.bidirectional);
```

#### Call Signature

> **listPathSegments**(`namespace`, `venueId`, `requestOptions?`): `Promise`\<[`PathSegment`](../interfaces/PathSegment.md)[]\>

Legacy positional form; a digit-string id is read as a number.

##### Parameters

###### namespace

`string`

###### venueId

`string` \| `number`

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`PathSegment`](../interfaces/PathSegment.md)[]\>

***

### ~~listMapPois()~~

#### Call Signature

> **listMapPois**(`options?`, `requestOptions?`): `Promise`\<[`MapPoisResponse`](../interfaces/MapPoisResponse.md)\>

The POIs of one map (`GET /venues/{ns}/{venueId}/maps/{mapId}/pois`), as the route returns them:
`{ items, total }`, not GeoJSON.

##### Parameters

###### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

per-call `namespace`, `venueId`, `mapId`, request options

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`MapPoisResponse`](../interfaces/MapPoisResponse.md)\>

##### Deprecated

served from the server's sample dataset; always empty for real namespaces (USI-P4-6). Use
  `listPois({ level })`.

##### Deprecated

pass the request options in `options`

##### Throws

no namespace, venue or map, or a malformed id (nothing is sent)

#### Call Signature

> **listMapPois**(`namespace`, `venueId`, `mapId`, `requestOptions?`): `Promise`\<[`MapPoisResponse`](../interfaces/MapPoisResponse.md)\>

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

`Promise`\<[`MapPoisResponse`](../interfaces/MapPoisResponse.md)\>

##### Deprecated

sample data only (USI-P4-6); use `listPois({ level })`.
