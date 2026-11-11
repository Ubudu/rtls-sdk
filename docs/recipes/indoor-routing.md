# Recipe: indoor routing

Route people through a building with the venue's path graph: the shortest path between two points, a tour
through several stops, the nearest point of interest of a type, and an evacuation route. The recipe resolves every
answer's node ids from the venue's own path nodes before it prints anything.

Files: [TypeScript](../../examples/typescript/23-indoor-routing.ts),
[JavaScript](../../examples/javascript/23-indoor-routing.js). Read-only.

## Prerequisites

- A namespace with a venue whose path graph has at least two active nodes on one level (the recipe prints
  `SKIPPED: no-fixture …` otherwise).
- The repository examples set up as in [examples/README.md](../../examples/README.md) (`.env` with
  `APP_NAMESPACE` and `RTLS_API_KEY`).

## Run it

```bash
npm run examples:check -- 23
# or, from examples/
npx tsx typescript/23-indoor-routing.ts
node javascript/23-indoor-routing.js
```

The recipe takes no options and has no write section.

## Steps

### 1. Set the venue

Every navigation call needs a venue. The SDK sends the venue id with each request and raises `ContextError`
before any request when none is set; without it the server would route on a sample graph of its own.

<!-- snippet: prelude=client -->
```ts
const [venue] = await client.venues.list();
if (!venue) throw new Error('no venue');
client.setVenue(venue.id);
```

### 2. Read the path graph

`venues.listPathNodes()` flattens the venue's path GeoJSON into nodes (`id`, `name`, `level`, `nodeType`,
`isActive`, `lat`, `lng`). Keep the active ones and remember their ids: they are the reference for every answer.

<!-- snippet: continue -->
```ts
const nodes = (await client.venues.listPathNodes()).filter((n) => n.isActive);
const known = new Set(nodes.map((n) => String(n.id)));
```

The recipe picks the two active nodes of one level that are farthest apart (A and B) and two nodes near the
thirds of the line between them (C and D).

### 3. Shortest path between two nodes

`start` and `end` are node ids or coordinates. The answer lists the route's nodes (`id`, `name`, `type`,
`level`, `coordinates` as `[lon, lat]`), the distance in metres and the estimated walking time in seconds.

<!-- snippet: continue -->
```ts
const [a, b] = nodes;
if (!a || !b) throw new Error('fewer than two nodes');
const route = await client.navigation.shortestPath({ start: a.id, end: b.id });
const unresolved = route.path.filter((n) => n.id !== null && !known.has(String(n.id))).length;
if (unresolved > 0) throw new Error(`${unresolved} node id(s) do not resolve from the active path nodes`);
console.log(`${Math.round(route.distance)} m, ${Math.round(route.estimatedTime)} s, ${route.path.length} nodes`);
```

The recipe resolves every node id of the route from the active path nodes of step 2 (`known`) before it prints
the route and how many nodes it has; an id that does not resolve stops the recipe with an error.

### 4. Start from a coordinate

Navigation coordinates use `lat`/`lon` (venues and path nodes use `lat`/`lng`). The server snaps the point to the
graph; when it cannot, the call raises `NotFoundError`.

<!-- snippet: continue -->
```ts
const fromPoint = await client.navigation.shortestPath({
  start: { lat: a.lat, lon: a.lng, level: a.level },
  end: b.id,
});
console.log(`from a coordinate: ${fromPoint.path.length} nodes`);
```

A start coordinate with a latitude or longitude of exactly 0 cannot be routed (USI-P4-11); the SDK rejects it
with a `ValidationError` before sending.

### 5. A tour through several stops

`multiStop` orders the stops (unless `optimizeOrder: false`) and returns one path through all of them.

<!-- snippet: continue -->
```ts
const tour = await client.navigation.multiStop({ start: a.id, stops: [b.id] });
console.log(`${tour.multiStopInfo.stopCount} stops, optimized ${tour.multiStopInfo.optimized}`);
```

### 6. Nearest point of interest

`poiType` is required. The server matches it against the first tag of each venue POI; `'all'` matches any POI
(USI-P4-14). The recipe uses the first tag it finds on a venue POI.

<!-- snippet: continue -->
```ts
const pois = await client.venues.listPois();
const poiType = pois.features.find((f) => (f.properties.tags ?? []).length > 0)?.properties.tags?.[0] ?? 'all';
const nearest = await client.navigation.nearestPoi(a.id, { poiType });
console.log(`nearest POI on level ${nearest.poi.level}, ${Math.round(nearest.distance)} m`);
```

### 7. Evacuation route

The server looks exits up in its POI index, so the call usually answers `404` with `critical: true` in the error
body, even on venues that have exits (USI-P4-15). Adding exits does not change that: treat the 404 as "no route
available", not as a missing exit or a failure.

<!-- snippet: continue -->
```ts
try {
  const evacuation = await client.navigation.evacuationRoute(a.id);
  console.log(`exit at ${Math.round(evacuation.distance)} m`);
} catch (err) {
  if (!(err instanceof NotFoundError)) throw err;
  const body = err.body as { critical?: boolean } | undefined;
  console.log(`no evacuation route (status ${err.status}, critical ${body?.critical === true})`);
}
```

### Accessible routes

`navigation.accessiblePath` takes the same request as `shortestPath` and requests a route with the wheelchair
profile, but gives no reliable accessibility guarantee, and cross-level segments without a `connection_type` count
as stairs (USI-P4-12). Do not rely on it alone for wheelchair routing. The recipe does not call it.

<!-- snippet: continue -->
```ts
async function accessibleRoute(start: number, end: number) {
  return client.navigation.accessiblePath({ start, end });
}
```

## Example output

Illustrative; names and numbers are invented.

```text
active path nodes: 104
route endpoints on level 0, 62 m apart in a straight line
shortest path: 81 m, 68 s, 14 nodes
  Entrance → Corridor 1 → Corridor 2 → … → Store room
shortest path from a coordinate: 81 m, 15 nodes
multi-stop: 3 stops, optimized true, 97 m, 19 nodes
  Entrance → … → Store room
venue POIs: 6; nearest POI type: first POI tag
nearest POI: Printer on level 0, 12 m
evacuation route: NotFoundError status 404, critical
DONE 23-indoor-routing
```

## Pitfalls

- Navigation errors: an unknown node id answers `500` (`ServerError`) on `shortestPath` and `accessiblePath`
  (USI-P4-10), but `404` (`NotFoundError`) on `multiStop` and `nearestPoi`; a point the server cannot snap answers
  `404`. The recipe prints only the error class and status of a navigation error, never its message.
- `poiType` is a POI tag, not a node type such as `elevator` (USI-P4-14).
- Level-0 POIs can appear on level −1 in the navigation graph (USI-P4-16).
- Coordinate snapping and POI lookups can intermittently fail for valid input (USI-P4-17); retry later rather
  than in a loop.

## Going further

- [Venues and navigation guide](../guides/venues-navigation.md)
- [Error handling](../guides/error-handling.md)
- [All recipes](README.md)
