# Venues, maps, zones and navigation

This guide covers `client.venues`, `client.zones` and `client.navigation`: venue metadata, floor maps, zones, points
of interest (POIs), the path graph, the zone-presence timeline of one asset, and indoor routing. Every behaviour
described here is the one of rtls-api 3.4.0; where the server deviates from its own specification, the
[known limitations](#11-known-server-limitations) section says so.

## 1. Concepts

A **venue** is a site. It has one or more **floor maps** (raster tiles plus bounds; several maps can share one
level), **zones** (polygons), **POIs** (points) and a **path graph** (nodes and segments) used for routing. Each
item carries a `level` (an integer floor number).

Coordinate conventions differ by source, and the SDK keeps the wire names:

| Where | Form |
|---|---|
| Venue `coordinates`, flat `POI`, `PathNode` | `{ lat, lng }` / `lat`, `lng` |
| GeoJSON geometries, route `coordinates` | `[lon, lat]` |
| Navigation input points | `{ lat, lon, level? }` (note `lon`) |
| Map `map_bounds` | `[[lat, lng], [lat, lng]]`, latitude first |

**Default context.** `namespace` and `venueId` come from the call, else from the client, else the call throws a
`ContextError` before any request. A per-call `level` on the venue list methods (`listMaps`, `zones.list*`,
`listPois*`, `listPaths*`) is a **floor filter for that call only**: the client's default `level` is not applied
there. Navigation coordinate points without a `level` take the call's `level`, else the client default. (The
spatial queries of `client.spatial` apply the client default level; see the
[positions and spatial guide](positions-spatial.md#7-zones).)

```ts
import { createRtlsClient } from 'ubudu-rtls-sdk';

const client = createRtlsClient({
  apiKey: process.env.RTLS_API_KEY ?? '',
  namespace: 'my-namespace',
  venueId: 42,
});
```

**Freshness.** The server caches the venue list for 10 minutes and venue details, maps, zones, POIs, paths and the
navigation graph for 5 minutes. A change made in the map editor can take up to 10 minutes to show.

## 2. Venues

`list()` returns every venue of the namespace as `VenueSummary[]` (id, name, address, coordinates, statistics). The
SDK never sends paging or sort keys: the server's paging switches the body to another shape and computes totals
on the sliced page, so the whole list is returned in one call. `iterate()` makes the same single request and
yields each item.

<!-- snippet: prelude=client -->
```ts
import { filters } from 'ubudu-rtls-sdk';

const venues = await client.venues.list();
for (const v of venues) console.log(v.id, v.name, `${v.statistics.zones} zones`, `floors ${v.statistics.floors.join(',')}`);

const halls = await client.venues.list({ filters: filters.startsWith('name', 'Hall') });
const other = await client.venues.list({ namespace: 'other-namespace' });
console.log(halls.length, other.length);
```

**Filters** go to the server as one `filters` query key holding a JSON array, so values keep their JSON types:

| Operator (DSL) | Server meaning |
|---|---|
| `equals`, `notEquals` | strict equality: the number `1` does not match the string `"1"` |
| `greaterThan`, `greaterThanOrEqual`, `lessThan`, `lessThanOrEqual`, `between` | numeric comparison |
| `contains`, `startsWith`, `endsWith`, `matches` | **case-sensitive** on strings; `contains` on an array field is an exact element test (`properties.tags` contains `exit`) |
| `in`, `notIn`, `exists` | membership, presence |
| `size`, `all`, `elemMatch` | rejected with a client-side `ValidationError` (no venue-route counterpart) |

`get()` returns `VenueDetails`. Opening hours, when the venue has them, are `metadata.openingHours.week` and
`.specificDays`, each value `"HH:MM - HH:MM"` or `"Closed"`, with the day keys as stored upstream.

<!-- snippet: prelude=client -->
```ts
const venue = await client.venues.get();
const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
console.log(venue.name, venue.metadata?.timezone, venue.metadata?.openingHours?.week[today] ?? 'no opening hours');

const stub = await client.venues.get({ venueId: 999999999 });
console.log(stub.name === undefined ? 'unknown venue' : stub.name);
```

An unknown venue id answers **200** with a stub `{ id, statistics }` whose counts are 0, not a 404 (USI-P4-2), which
is why `name` and `coordinates` are optional on `VenueDetails`.

## 3. Floor maps

`listMaps()` returns `IndoorMap[]` (`id`, `uuid`, `name`, `level`, `tiles_url_base`, `map_bounds`). Several maps can
share a level, so pick by level, not by index:

<!-- snippet: prelude=client -->
```ts
const maps = await client.venues.listMaps();
const wanted = 1;
const levels = [...new Set(maps.map((m) => m.level))];
const closest = levels.reduce((a, b) => (Math.abs(b - wanted) < Math.abs(a - wanted) ? b : a), levels[0] ?? 0);
const atLevel = maps.filter((m) => m.level === closest);
const sameAsFilter = await client.venues.listMaps({ level: closest });
console.log(atLevel.length === sameAsFilter.length);
```

`tiles_url_base` is a template with literal `{z}`, `{x}` and `{y}`. Substitute on the raw string; `new URL()` would
percent-encode the braces first.

<!-- snippet: prelude=client -->
```ts
const [map] = await client.venues.listMaps();
if (map) {
  const tile = (z: number, x: number, y: number): string =>
    map.tiles_url_base.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
  const leafletBounds = map.map_bounds; // [[lat, lng], [lat, lng]]: Leaflet takes it as is
  const lngLatBounds = map.map_bounds.map(([lat, lng]) => [lng, lat]); // GeoJSON / MapLibre order
  console.log(tile(18, 1, 2).length > 0, leafletBounds, lngLatBounds);
}
```

## 4. Zones

`zones.list()` returns the zone `FeatureCollection` (Polygon features with `id`, `name`, `level`, `rgb_color`,
`tags`, `type`); `zones.listAsArray()` returns flat `Zone` objects (`color` from `rgb_color`, `geometry` kept);
`zones.iterate()` yields them. With a filter the collection also carries `total` (the count after filtering).

<!-- snippet: prelude=client -->
```ts
const ground = await client.zones.list({ level: 0 });
const docks = await client.zones.listAsArray({ tag: 'dock' });
console.log(ground.total, docks.map((z) => `${z.name} ${z.color}`));
for await (const zone of client.zones.iterate({ level: 1 })) console.log(zone.name);
```

`tag` keeps the items whose `tags` contain that exact string; it is sent inside `filters=<JSON>`, where the value
keeps its JSON type. `zones.getAll()` is a deprecated alias of `listAsArray()`. `zones.listByMap()` /
`listByMapAsArray()` are deprecated: the map-level route serves a bundled sample dataset and is empty for real
namespaces (USI-P4-6); use `zones.list({ level })`.

## 5. POIs

`venues.listPois()` returns the POI `FeatureCollection` (Point features); `listPoisAsArray()` returns flat `POI`
objects (`lat`, `lng`, `tags` defaulting to `[]`). A POI `id` is a number or a string (the server emits the
external id when set, else its internal id).

<!-- snippet: prelude=client -->
```ts
const exits = await client.venues.listPois({ tag: 'exit' });
const firstFloor = await client.venues.listPoisAsArray({ level: 1 });
console.log(exits.total, firstFloor.map((p) => `${p.name} @ ${p.lat},${p.lng}`));
```

`venues.listMapPois()` is deprecated: its route serves sample data only and answers `{ items: [], total: 0 }`
for real namespaces (USI-P4-6); use `listPois({ level })`.

## 6. Path graph

`venues.listPaths()` returns nodes (`Point`, `type: 'path_node'`) and segments (`LineString`, `type:
'path_segment'`) in one collection; `listPaths({ nodeType })` keeps nodes of one type, and since segments have
no node type, a `nodeType` filter returns no segments. `listPathNodes()` and `listPathSegments()` return flat
objects.

| Node property (wire) | Flat `PathNode` | Meaning |
|---|---|---|
| `id`, `external_id` | `id`, `externalId` | numbers |
| `node_type` | `nodeType` | `waypoint`, `entrance`, `elevator`, `staircase`, `escalator`, `restroom`, `emergency_exit`, or another string |
| `name`, `level`, `is_active`, `tags` | `name`, `level`, `isActive`, `tags` | |
| `cross_level_connections` | `crossLevelConnections` | node ids or `{ target_node_id, connection_type }` |
| `poi_type`, `is_accessible`, `is_emergency_exit` | `poiType`, `isAccessible`, `isEmergencyExit` | optional |

| Segment property (wire) | Flat `PathSegment` | Meaning |
|---|---|---|
| `source_node_id`, `target_node_id` | `sourceNodeId`, `targetNodeId` | node ids |
| `bidirectional` | `bidirectional` | `false` = one way, source to target |
| `distance`, `estimated_time` | `distance`, `estimatedTime` | metres, seconds |
| `accessibility` | `accessibility` | `{ wheelchair, visual_impaired, hearing_impaired }` booleans |
| `penalty_factor`, `is_active`, `tags`, `connection_type?` | `penaltyFactor`, `isActive`, `tags`, `connectionType` | |

Building an adjacency list:

<!-- snippet: prelude=client -->
```ts
const nodes = await client.venues.listPathNodes();
const segments = await client.venues.listPathSegments();
const active = new Set(nodes.filter((n) => n.isActive).map((n) => String(n.id)));
const adjacency = new Map<string, string[]>();
const link = (from: string, to: string): void => {
  adjacency.set(from, [...(adjacency.get(from) ?? []), to]);
};
for (const s of segments) {
  const a = String(s.sourceNodeId);
  const b = String(s.targetNodeId);
  if (!active.has(a) || !active.has(b)) continue;
  link(a, b);
  if (s.bidirectional) link(b, a);
}
console.log(adjacency.size);
```

The flat methods convert the collections with exported helpers: `extractPathNodesFromGeoJSON`,
`extractPathSegmentsFromGeoJSON`, `extractPoisFromGeoJSON` (behind `listPoisAsArray()`) and
`extractZonesFromGeoJSON` (behind `zones.listAsArray()`). Features without a geometry are skipped. Use them when
you already hold a collection, for example to get nodes and segments from a single request:

<!-- snippet: prelude=client -->
```ts
import { extractPathNodesFromGeoJSON, extractPathSegmentsFromGeoJSON } from 'ubudu-rtls-sdk';

const graph = await client.venues.listPaths();
const nodes = extractPathNodesFromGeoJSON(graph);
const segments = extractPathSegmentsFromGeoJSON(graph);
console.log(graph.features.length, nodes.length, segments.length);
```

## 7. Zone presence timeline

`zones.getPresence()` returns the zone timeline of **one asset**: pass its MAC as `value`. Without `value` the
server returns the asset with the most position documents in the range, not all assets. A valid MAC is normalised
to the stored 12-lowercase-hex form; any other value is sent verbatim.

<!-- snippet: prelude=client -->
```ts
const to = Date.now();
const slots = await client.zones.getPresence({
  value: '02:5D:4B:00:00:01',
  timestampFrom: to - 3_600_000,
  timestampTo: to,
  interval: '5m',
});
for (const s of slots) console.log(new Date(s.timestamp).toISOString().slice(11, 16), s.name);
```

- **Range.** Neither bound: the last 24 h. Only `timestampFrom`: up to now. Only `timestampTo`: the 24 h before it.
  Bounds accept epoch ms, `Date` or ISO strings; `from > to` throws a `ValidationError` before any request.
- **Interval.** `interval` must match `^[1-9]\d*(ms|s|m|h|d)$`; calendar units (`1w`, `1M`, `1y`) are rejected
  locally. Without it the server picks one from the range:

| Range up to | 15 min | 30 min | 1 h | 3 h | 6 h | 1 d | 7 d | 30 d | 180 d | 365 d | more |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Interval | `1m` | `2m` | `5m` | `15m` | `30m` | `1h` | `6h` | `1d` | `7d` | `14d` | `30d` |

- **Slots.** `timestamp` is the slot start (epoch ms, aligned to the interval); slots span only the asset's first to
  last document in the range. An occupied slot carries the zone (`id`, `name`, `tags`, `color`) of **one** position
  document of the slot, a sample rather than the dominant zone. A slot outside every zone is
  `{ id: 0, name: 'OUTSIDE_ALL_ZONES', tags: [], color: null }`; a document without zone gives `'UNKNOWN_ZONE'`.
- `key` is deprecated: only the default `user.udid` returns data (USI-P4-18).

## 8. Navigation

Every navigation call sends `venueId` (from the call or the client): without it the server would route on a bundled
sample graph while still reporting `dataSource: 'real'` (USI-P4-7). Endpoints are node ids (strings or numbers, sent
as strings) or points `{ lat, lon, level? }`. A point snaps to the nearest active node within 100 m on its level;
the server falls back to the levels just above and below only when the requested level has **no nodes at all**.

<!-- snippet: prelude=client -->
```ts
const byIds = await client.navigation.shortestPath({ start: 101, end: '205' });
console.log(byIds.distance, byIds.estimatedTime, byIds.path.length);

const byPoint = await client.navigation.shortestPath(
  { start: { lat: 48.8566, lon: 2.3522 }, end: 205, walkingSpeed: 1.5 },
  { level: 0 }
);
const roundTrip = await client.navigation.shortestPath({ start: 101, end: 205, returnToStart: true });
console.log(byPoint.algorithm, roundTrip.roundTripInfo?.returnDistance);
```

- `distance` is metres (haversine), `estimatedTime` seconds (`distance / walkingSpeed`, default 1.2 m/s).
- With `returnToStart` the path and `distance` include the way back and `roundTripInfo.returnDistance` is set.
- Route node ids are numbers for path nodes and `null` for POI nodes; `coordinates` is `[lon, lat]`.
- A start point with a latitude or longitude of exactly 0 is rejected locally (the server would read it as a node id).

**Accessible route.** `accessiblePath()` takes the same request. It gives **no reliable accessibility
guarantee** (USI-P4-12): do not rely on it alone for wheelchair routing. The SDK never retries it, whatever the
client's retry policy.

<!-- snippet: prelude=client -->
```ts
const accessible = await client.navigation.accessiblePath({ start: 101, end: 205 });
console.log(accessible.distance);
```

**Multi-stop.** `multiStop()` visits `stops` from `start`. `optimizeOrder` defaults to `true` with the `twoOpt`
algorithm; `nearestNeighbor` and `simulatedAnnealing` (random) are the other choices (`genetic` always fails on the
server and is not offered). The cost grows with the square of the stop count: above about ten stops pass a larger
`timeoutMs`. Stop nodes carry `isStop`, `stopIndex` (1-based index into **your** `stops`) and `stopName`.

<!-- snippet: prelude=client -->
```ts
const tour = await client.navigation.multiStop(
  { start: 101, stops: [150, 175, 205], algorithm: 'twoOpt', stopNames: ['Dock', 'Store', 'Exit'] },
  { timeoutMs: 60_000 }
);
const order = tour.path.filter((n) => n.isStop).map((n) => n.stopIndex);
console.log(order, tour.multiStopInfo.optimized, tour.multiStopInfo.optimizationDistance);
```

With `optimizeOrder` and `returnToStart` together, `multiStopInfo.roundTripInfo.returnDistance` is 0 while
`distance` includes the return (USI-P4-13).

**Nearest POI.** `poiType` is matched against a POI's **first tag** (or a path node's `poi_type`); `'all'` or
`'any'` match every POI. When no POI node is indexed the server answers 404 `No POIs of type … found` (USI-P4-14).

**Evacuation.** `evacuationRoute(nodeId)` looks exits up in the POI index, so it usually answers 404 with
`critical: true` in the body (USI-P4-15).

<!-- snippet: prelude=client -->
```ts
import { NotFoundError, type NavigationFailureBody } from 'ubudu-rtls-sdk';

try {
  const nearest = await client.navigation.nearestPoi(101, { poiType: 'all' });
  console.log(nearest.poi.name, nearest.distance);
  const exit = await client.navigation.evacuationRoute(101);
  console.log(exit.exit.name, exit.estimatedEvacuationTime);
} catch (error) {
  if (error instanceof NotFoundError) {
    const body = error.body as NavigationFailureBody;
    console.log(error.message, body.critical === true ? 'no evacuation route' : 'not found');
  } else {
    throw error;
  }
}
```

## 9. Rendering a route

A route is a list of nodes that may change level. One GeoJSON `LineString` per level run:

<!-- snippet: prelude=client -->
```ts
import type { RouteNode } from 'ubudu-rtls-sdk';

const route = await client.navigation.shortestPath({ start: 101, end: 205 });
const runs: { level: number; nodes: RouteNode[] }[] = [];
for (const node of route.path) {
  const last = runs[runs.length - 1];
  if (last && last.level === node.level) last.nodes.push(node);
  else runs.push({ level: node.level, nodes: [node] });
}
const features = runs.map((run) => ({
  type: 'Feature' as const,
  properties: { level: run.level },
  geometry: { type: 'LineString' as const, coordinates: run.nodes.map((n) => n.coordinates) },
}));
console.log({ type: 'FeatureCollection', features });
```

## 10. Errors

| Situation | Status | SDK class | Message |
|---|---|---|---|
| Missing `namespace` / `venueId` / `mapId`, or a malformed id | — | `ContextError` (no request) | names the field |
| Invalid local argument (blank node id, out-of-range point, bad interval, zone-presence `from > to` or invalid bound) | — | `ValidationError`, `status` 0 (no request) | |
| Navigation request incomplete | 400 | `ValidationError` | `Missing required parameters: …` |
| No path between the nodes | 404 | `NotFoundError` | `No path found between nodes` |
| Point too far from every node | 404 | `NotFoundError` | `No node found near start position (…)` |
| Multi-stop or nearest-POI node unknown | 404 | `NotFoundError` | `Node <id> not found` |
| No POI of the type | 404 | `NotFoundError` | `No POIs of type <t> found` |
| No evacuation route | 404 | `NotFoundError` | body `critical: true` |
| Unknown node id on a shortest/accessible route | 500 | `ServerError` | `Start node <id> not found` / `End node <id> not found` |

Navigation 404 bodies are `NavigationFailureBody` (`success: false`, `message`, optional `error`, `critical`,
`startNodeId`, `endNodeId`) on `error.body`; the human text is in `error.message`.

<!-- snippet: prelude=client -->
```ts
import { NotFoundError, ServerError, ValidationError, type NavigationFailureBody } from 'ubudu-rtls-sdk';

try {
  await client.navigation.shortestPath({ start: 101, end: 'unknown' });
} catch (error) {
  if (error instanceof NotFoundError) console.log('no route', (error.body as NavigationFailureBody).message);
  else if (error instanceof ServerError) console.log('server', error.status, error.message);
  else if (error instanceof ValidationError) console.log('invalid', error.message);
  else throw error;
}
```

## 11. Known server limitations

| Id | Limitation | What the SDK does |
|---|---|---|
| USI-P4-1 | Venue list items never carry the `location`/`metadata` the specification shows | `VenueSummary` types what is returned |
| USI-P4-2 | Unknown venue id answers 200 with a stub | documented; `name`/`coordinates` optional |
| USI-P4-3 | Paging keys switch the venue list and maps to `{data, pagination}` with page-local totals | sends no paging or sort key |
| USI-P4-4 | Unknown query keys on venue routes empty the result | sends only `filters` |
| USI-P4-5 | GeoJSON venue routes ignore paging and sort without a filter | no paging offered |
| USI-P4-6 | Map-level zones and POIs serve a sample dataset | methods deprecated, replacements named |
| USI-P4-7 | Navigation without `venueId` routes on a sample graph | `venueId` always sent |
| USI-P4-9 | Route options other than `walkingSpeed` and `returnToStart` are ignored | not offered |
| USI-P4-10 | Unknown node id answers 500 instead of 400 | `ServerError` |
| USI-P4-11 | A start point with latitude or longitude 0 is read as a node id | rejected locally |
| USI-P4-12 | Accessible routing gives no reliable guarantee | documented; never retried |
| USI-P4-13 | Multi-stop: `genetic` fails, unknown algorithms fall back, failed legs skipped, `returnDistance` 0 with `optimizeOrder` | `genetic` not offered |
| USI-P4-14 | Nearest POI matches the first tag; POI nodes can be missing | documented |
| USI-P4-15 | Evacuation usually answers 404 `critical` | documented |
| USI-P4-16 | Level-0 POIs are placed on level −1 in the routing graph | documented |
| USI-P4-17 | Snapping and POI lookups can intermittently fail for valid input | retry a 404/500 once |
| USI-P4-18 | Zone presence returns one asset; `key` other than `user.udid` returns nothing; the slot zone is a sample | MAC normalised, `key` deprecated |
| USI-P4-19 | The venue list answers 200 `[]` when the upstream fails | an empty list cannot be told apart |

## 12. Upgrading from 0.2

| Area | 0.2 | 0.3 |
|---|---|---|
| Navigation calls | `navigation.shortestPath('ns', {…})` threw | `navigation.shortestPath({ start, end }, { namespace?, venueId? })` |
| Request types | `ShortestPathRequest`, `AccessiblePathRequest`, `MultiStopRequest` with 0.2 fields | the shapes of section 8 (same names) |
| Nearest POI / evacuation | `nearestPoi('ns', nodeId)`, `evacuation('ns', nodeId)` threw | `nearestPoi(nodeId, { poiType })`, `evacuationRoute(nodeId)` |
| `NavigationResponse` | stale generated type | deprecated alias of `RouteResult` |
| `PathSegment`, `PathSegmentProperties` | 0.2 field names (always `undefined`) | the wire names of section 6 |
| `PathNode.nodeType` | five fixed values | `PathNodeType` (open string union) |
| `crossLevelConnections` | `number[]` | `CrossLevelConnection[]` |
| `listMapPois()` | typed as GeoJSON | `MapPoisResponse`, deprecated |
| `listMapPoisAsArray()` | threw on every call | removed; use `listPoisAsArray({ level })` |
| Collection `metadata` | required | optional; `total?`, `hasMore?` added |
| `POI` | `id: number`, `description`/`color` required | `id: number \| string`, both optional |
| Local argument errors | request sent anyway | `ValidationError` / `ContextError`, no request |
| `venues.list({ namespace })` | override ignored | honoured |
| `venues.list/get/listMaps` | untyped | `VenueSummary[]` / `VenueDetails` / `IndoorMap[]` |
| per-call `level` on venue lists | ignored | filters by floor |
| `zones.getPresence` | untyped, bounds required | `ZonePresenceSlot[]`, 24 h default, MAC normalised |
| `zones.getAll`, `zones.listByMap*`, `venues.listMapPois` | — | deprecated |
| Trailing `requestOptions` | `zones.list({ venueId: 7 }, { timeoutMs: 5_000 })` | `zones.list({ venueId: 7, timeoutMs: 5_000 })`; the 0.2 call keeps working |

The full before/after code is in the migration guide.
