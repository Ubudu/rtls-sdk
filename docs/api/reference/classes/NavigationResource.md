[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NavigationResource

# Class: NavigationResource

Navigation over a venue's path graph. Routing is always A* on the server, whatever the spec's options say
(USI-P4-9). Route node ids come back as numbers for path nodes and `null` for POI nodes.

## Extends

- `ResourceBase`

## Methods

### shortestPath()

> **shortestPath**(`request`, `options?`): `Promise`\<[`RouteResult`](../interfaces/RouteResult.md)\>

The shortest route between two endpoints (`POST /spatial/navigate/{ns}/shortest-path`).

An endpoint is a node id (sent as a string) or a point `{ lat, lon, level? }` (`lon`, not `lng`); a point
snaps to the nearest active node within 100 m on its level (missing `level`: the call's, else the client's).
The call is a read-only computation and is retried under the client's retry policy.

Errors: 400 `{ error: 'Missing required parameters: …' }` → `ValidationError`; 404 `{ success: false,
message: 'No path found between nodes' | 'No node found near start position (…)' }` → `NotFoundError` (its
`body` is a `NavigationFailureBody`); 500 `{ error: 'Start node <id> not found' | 'End node <id> not found' }`
→ `ServerError` (the spec says 400, USI-P4-10); 401 → `AuthenticationError`.

Limitations: a start point with a latitude or longitude of exactly 0 cannot be routed by rtls-api (USI-P4-11),
so it is refused locally; snapping can intermittently fail for valid input: retry such a call once (USI-P4-17).

#### Parameters

##### request

[`ShortestPathRequest`](../interfaces/ShortestPathRequest.md)

`start`, `end`, optional `walkingSpeed` (m/s, > 0) and `returnToStart`

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

per-call `namespace`, `venueId` (mandatory: per call or client default), `level`, request options

#### Returns

`Promise`\<[`RouteResult`](../interfaces/RouteResult.md)\>

#### Throws

no namespace or venue (nothing is sent)

#### Throws

status 0 for an invalid endpoint or `walkingSpeed` (nothing is sent)

#### Example

```typescript
import { createRtlsClient } from 'ubudu-rtls-sdk';

const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace', venueId: 42 });
const route = await client.navigation.shortestPath({ start: 101, end: { lat: 48.85, lon: 2.35, level: 0 } });
console.log(route.distance, route.estimatedTime, route.path.length);
```

***

### accessiblePath()

> **accessiblePath**(`request`, `options?`): `Promise`\<[`RouteResult`](../interfaces/RouteResult.md)\>

A route with the wheelchair profile (`POST /spatial/navigate/{ns}/accessible-path`). Same request and result
as [NavigationResource.shortestPath](#shortestpath).

**No accessibility guarantee.** The server gives no reliable accessibility guarantee (USI-P4-12): do not rely on
this route alone for wheelchair routing. Cross-level segments without `connection_type` count as stairs. The SDK
never retries this call, whatever the client's retry policy.

Errors: as `shortestPath` (400 → `ValidationError`, 404 → `NotFoundError`, 500 → `ServerError`, 401 →
`AuthenticationError`).

#### Parameters

##### request

[`ShortestPathRequest`](../interfaces/ShortestPathRequest.md)

`start`, `end`, optional `walkingSpeed` (m/s, > 0) and `returnToStart`

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

per-call `namespace`, `venueId` (mandatory: per call or client default), `level`, request options

#### Returns

`Promise`\<[`RouteResult`](../interfaces/RouteResult.md)\>

#### Throws

no namespace or venue (nothing is sent)

#### Throws

status 0 for an invalid endpoint or `walkingSpeed` (nothing is sent)

#### Example

```typescript
import { createRtlsClient } from 'ubudu-rtls-sdk';

const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace', venueId: 42 });
const route = await client.navigation.accessiblePath({ start: 101, end: 205 });
```

***

### multiStop()

> **multiStop**(`request`, `options?`): `Promise`\<[`MultiStopRouteResult`](../interfaces/MultiStopRouteResult.md)\>

A tour from `start` through every stop (`POST /spatial/navigate/{ns}/multi-stop`).

Stops are node ids or points (a coordinate with a 0 latitude or longitude is accepted here). Stop nodes of the
result carry `isStop`, `stopIndex` (1-based index into the input `stops`, also after reordering) and `stopName`
(from `stopNames`, default `'Stop <n>'`). `algorithm`: `'twoOpt'` (server default), `'nearestNeighbor'` or
`'simulatedAnnealing'` (random); the spec's `'genetic'` always fails (404 `TSPSolver.genetic is not a function`)
and is not offered. The cost grows with the square of the stop count: pass a larger `timeoutMs` above about 10
stops. Read-only computation, retried under the client's retry policy.

Limitations (USI-P4-13): failed legs are skipped, so `success: true` can carry a gapped path; `dataSource` is
always `'real'`; with `optimizeOrder` and `returnToStart`, `multiStopInfo.roundTripInfo.returnDistance` is 0
while `distance` includes the return.

Errors: 400 `{ error: 'Missing required parameters: …' }` → `ValidationError`; 404 `{ success: false, message:
'Node <id> not found' | 'No node found near stop <n> position …' }` → `NotFoundError`; 500 → `ServerError`;
401 → `AuthenticationError`.

#### Parameters

##### request

[`MultiStopRequest`](../interfaces/MultiStopRequest.md)

`start`, `stops` (at least one), optional `optimizeOrder`, `algorithm`, `returnToStart`,
  `walkingSpeed` (> 0), `stopNames` (length ≤ `stops.length`)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

per-call `namespace`, `venueId` (mandatory: per call or client default), `level`, request options

#### Returns

`Promise`\<[`MultiStopRouteResult`](../interfaces/MultiStopRouteResult.md)\>

#### Throws

no namespace or venue (nothing is sent)

#### Throws

status 0 for an invalid endpoint, empty `stops`, too many `stopNames` or an invalid
  `walkingSpeed` (nothing is sent)

#### Example

```typescript
import { createRtlsClient } from 'ubudu-rtls-sdk';

const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace', venueId: 42 });
const tour = await client.navigation.multiStop({ start: 101, stops: [205, 310], stopNames: ['Dock', 'Office'] });
console.log(tour.multiStopInfo.optimized, tour.path.filter((n) => n.isStop).map((n) => n.stopName));
```

***

### nearestPoi()

> **nearestPoi**(`nodeId`, `options`): `Promise`\<[`NearestPoiResult`](../interfaces/NearestPoiResult.md)\>

The nearest POI of a type from a node, with the route to it
(`GET /spatial/navigate/{ns}/nearest-poi/{nodeId}?poiType=…&venueId=…`).

`poiType` is matched against a POI's **first tag** (or a path node's `poi_type`), plus `'all'` / `'any'`; it is
not a node type. `distance` is the straight-line distance in metres; `path` may be `null`.

Limitations: the POI nodes are intermittently missing, and the call then answers 404 `No POIs of type … found`
(USI-P4-14). Level-0 POIs are placed on level −1 in the graph (USI-P4-16). Valid input can intermittently answer
404 `End node … not found`: retry such a call once (USI-P4-17).

Errors: 400 `{ error: 'Missing required query parameter: poiType' }` → `ValidationError`; 404 `{ success:
false, message: 'Node <id> not found' | 'No POIs of type <t> found' | 'End node <id> not found' }` →
`NotFoundError`; 500 → `ServerError`; 401 → `AuthenticationError`.

#### Parameters

##### nodeId

[`NodeId`](../type-aliases/NodeId.md)

start node id (non-blank string or finite number)

##### options

[`NearestPoiOptions`](../interfaces/NearestPoiOptions.md) & [`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

`poiType` (non-blank), per-call `namespace`, `venueId` (mandatory: per call or client default),
  request options

#### Returns

`Promise`\<[`NearestPoiResult`](../interfaces/NearestPoiResult.md)\>

#### Throws

no namespace or venue (nothing is sent)

#### Throws

status 0 for a blank `nodeId` or `poiType` (nothing is sent)

#### Example

```typescript
import { createRtlsClient } from 'ubudu-rtls-sdk';

const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace', venueId: 42 });
const nearest = await client.navigation.nearestPoi(101, { poiType: 'all' });
console.log(nearest.poi.name, nearest.distance);
```

***

### evacuationRoute()

> **evacuationRoute**(`nodeId`, `options?`): `Promise`\<[`EvacuationRouteResult`](../interfaces/EvacuationRouteResult.md)\>

The evacuation route from a node to the nearest exit
(`GET /spatial/navigate/{ns}/evacuation/{nodeId}?venueId=…`).

`estimatedEvacuationTime` is `distance / 2` seconds; `path` may be `null`.

Limitations: the server looks exits up in its POI-type index, so the call usually answers 404 with
`critical: true` (USI-P4-15).

Errors: 404 `{ success: false, message: 'Cannot find evacuation route' | 'No evacuation routes available' | …,
critical: true }` → `NotFoundError` (its `body` is a `NavigationFailureBody`); 500 → `ServerError`; 401 →
`AuthenticationError`.

#### Parameters

##### nodeId

[`NodeId`](../type-aliases/NodeId.md)

start node id (non-blank string or finite number)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

per-call `namespace`, `venueId` (mandatory: per call or client default), request options

#### Returns

`Promise`\<[`EvacuationRouteResult`](../interfaces/EvacuationRouteResult.md)\>

#### Throws

no namespace or venue (nothing is sent)

#### Throws

status 0 for a blank `nodeId` (nothing is sent)

#### Example

```typescript
import { createRtlsClient, NotFoundError } from 'ubudu-rtls-sdk';

const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace', venueId: 42 });
try {
  const route = await client.navigation.evacuationRoute(101);
  console.log(route.exit.name, route.estimatedEvacuationTime);
} catch (error) {
  if (!(error instanceof NotFoundError)) throw error;
}
```
