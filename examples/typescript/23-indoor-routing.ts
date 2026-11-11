// Write section: tier none; budget positions=0 notifications=0 ble=0 etl=0; read skips none
/**
 * 23 - Indoor routing (recipe: docs/recipes/indoor-routing.md)
 *
 * Picks two distant path nodes of one level and routes between them (by node id and from a coordinate), plans a
 * multi-stop tour, looks up the nearest POI and an evacuation route. The routes and the tour print how many nodes
 * they have; every node id of an answer is resolved from the venue's own list of active path nodes before anything
 * is printed. Navigation errors print only their class and status. Read-only.
 *
 *   npx tsx typescript/23-indoor-routing.ts      (from examples/)
 */
import { NotFoundError, RtlsError } from 'ubudu-rtls-sdk';
import { runExample, skip } from '../shared/config.js';

interface NodeLike {
  id: number;
  name: string;
  level: number;
  lat: number;
  lng: number;
}
interface RouteNodeLike {
  id: number | string | null;
  name: string;
  level: number;
}

/** Great-circle distance in metres. */
function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** The two nodes of one level that are farthest apart, or null when no level has two nodes. */
function farthestPair<N extends NodeLike>(nodes: N[]): [N, N] | null {
  let best: [N, N] | null = null;
  let bestDistance = -1;
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i] as N;
      const b = nodes[j] as N;
      if (a.level !== b.level) continue;
      const d = metres(a, b);
      if (d > bestDistance) {
        best = [a, b];
        bestDistance = d;
      }
    }
  }
  return best;
}

/** The node of `candidates` nearest to the point at `t` (0..1) of the straight line from a to b. */
function nearestTo<N extends NodeLike>(candidates: N[], a: N, b: N, t: number): N | undefined {
  const point = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
  return [...candidates].sort((x, y) => metres(x, point) - metres(y, point))[0];
}

/** Number of node ids of `path` that do not resolve from `known` (POI nodes have no id). */
function unresolvedIds(path: readonly RouteNodeLike[], known: ReadonlySet<string>): number {
  return path.filter((n) => n.id !== null && !known.has(String(n.id))).length;
}

/** The route as names, with a marker where the level changes. */
function describePath(path: readonly RouteNodeLike[]): string {
  let level: number | undefined;
  return path
    .map((n) => {
      const marker = level !== undefined && n.level !== level ? `[level ${n.level}] ` : '';
      level = n.level;
      return `${marker}${n.name}`;
    })
    .join(' → ');
}

await runExample('23-indoor-routing', async ({ client, log }) => {
  // 1. Venue context: navigation always needs a venue (the SDK sends its id with every routing call).
  const [venue] = await client.venues.list();
  if (!venue) skip('no-fixture', 'the namespace has no venue');
  client.setVenue(venue.id);

  // 2. The venue's path graph: active nodes only; their ids are the reference for every answer below.
  const nodes = (await client.venues.listPathNodes()).filter((n) => n.isActive);
  const known = new Set(nodes.map((n) => String(n.id)));
  log(`active path nodes: ${nodes.length}`);
  const pair = farthestPair(nodes);
  if (!pair) skip('no-fixture', 'fewer than two active path nodes on one level');
  const [a, b] = pair;
  const sameLevel = nodes.filter((n) => n.level === a.level && n.id !== a.id && n.id !== b.id);
  const c = nearestTo(sameLevel, a, b, 1 / 3);
  const d = nearestTo(
    sameLevel.filter((n) => n.id !== c?.id),
    a,
    b,
    2 / 3
  );
  log(
    `route endpoints on level ${a.level}, ${Math.round(metres(a, b))} m apart in a straight line`
  );

  /** Runs a navigation call; errors print class and status only. A 404 is tolerated when `optional`. */
  async function navigate<T>(
    what: string,
    call: () => Promise<T>,
    optional: boolean
  ): Promise<T | null> {
    try {
      return await call();
    } catch (err) {
      if (!(err instanceof RtlsError)) throw err;
      const body = err.body as { critical?: unknown } | undefined;
      const critical =
        typeof body === 'object' && body !== null && body.critical === true ? ', critical' : '';
      log(`${what}: ${err.name} status ${err.status}${critical}`);
      if (optional && err instanceof NotFoundError) return null;
      throw new Error(`${what} failed with ${err.name} (status ${err.status})`, { cause: err });
    }
  }

  /** Stops the example when a node id of an answer does not resolve from the venue's active path nodes. */
  function check(what: string, path: readonly RouteNodeLike[]): void {
    const unresolved = unresolvedIds(path, known);
    if (unresolved > 0)
      throw new Error(
        `${what}: ${unresolved} node id(s) do not resolve from the venue's active path nodes`
      );
  }

  // 3. Shortest path between the two node ids: first and last node must be the requested ones.
  const route = await navigate(
    'shortest path',
    () => client.navigation.shortestPath({ start: a.id, end: b.id }),
    false
  );
  if (route) {
    check('shortest path', route.path);
    const first = route.path[0];
    const last = route.path.at(-1);
    if (String(first?.id) !== String(a.id) || String(last?.id) !== String(b.id))
      throw new Error('shortest path: the route does not start and end at the requested nodes');
    log(
      `shortest path: ${Math.round(route.distance)} m, ${Math.round(route.estimatedTime)} s, ${route.path.length} nodes`
    );
    log(`  ${describePath(route.path)}`);
  }

  // 4. The same route from a coordinate (navigation uses lat/lon; venues and path nodes use lat/lng).
  const fromPoint = await navigate(
    'shortest path from a coordinate',
    () =>
      client.navigation.shortestPath({
        start: { lat: a.lat, lon: a.lng, level: a.level },
        end: b.id,
      }),
    true
  );
  if (fromPoint) {
    check('shortest path from a coordinate', fromPoint.path);
    log(
      `shortest path from a coordinate: ${Math.round(fromPoint.distance)} m, ${fromPoint.path.length} nodes`
    );
  }

  // 5. A multi-stop tour through the nodes between the endpoints, ending at the far endpoint.
  const stops = [c, d, b]
    .filter((n): n is NonNullable<typeof n> => n !== undefined)
    .map((n) => n.id);
  const tour = await navigate(
    'multi-stop',
    () => client.navigation.multiStop({ start: a.id, stops }),
    false
  );
  if (tour) {
    check('multi-stop', tour.path);
    log(
      `multi-stop: ${tour.multiStopInfo.stopCount} stops, optimized ${tour.multiStopInfo.optimized}, ${Math.round(tour.distance)} m, ${tour.path.length} nodes`
    );
    log(`  ${describePath(tour.path)}`);
  }

  // 6. Nearest POI of a type: the first tag of a venue POI, or 'all'.
  const pois = await client.venues.listPois();
  const poiType =
    pois.features.find((f) => (f.properties.tags ?? []).length > 0)?.properties.tags?.[0] ?? 'all';
  log(
    `venue POIs: ${pois.features.length}; nearest POI type: ${poiType === 'all' ? 'all' : 'first POI tag'}`
  );
  const nearest = await navigate(
    'nearest POI',
    () => client.navigation.nearestPoi(a.id, { poiType }),
    true
  );
  if (nearest) {
    if (nearest.path) check('nearest POI', nearest.path);
    log(
      `nearest POI: ${nearest.poi.name ?? nearest.poi.type} on level ${nearest.poi.level}, ${Math.round(nearest.distance)} m`
    );
  }

  // 7. Evacuation route: needs nodes marked as emergency exits; without them the server answers 404 (critical).
  const evacuation = await navigate(
    'evacuation route',
    () => client.navigation.evacuationRoute(a.id),
    true
  );
  if (evacuation) {
    if (evacuation.path) check('evacuation route', evacuation.path);
    log(
      `evacuation route: exit ${evacuation.exit.name ?? evacuation.exit.type}, ${Math.round(evacuation.distance)} m, ${Math.round(evacuation.estimatedEvacuationTime)} s`
    );
  }
});
