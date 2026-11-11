// Write section: tier none; budget positions=0 notifications=0 ble=0 etl=0; read skips none
/**
 * 04 - Indoor navigation: "How do I get from here to there?"
 *
 * Read-only (no `--write` section):
 * - the first venue's path graph; the example keeps its node ids to resolve the nodes of each route
 * - three nodes A, B, D picked by a breadth-first search on one level
 * - a route by node ids, by coordinates and as a round trip, printed as a turn list with level changes
 * - a multi-stop tour in input order versus the `twoOpt` optimised order (distance, time, saving)
 * - the nearest POI by the first POI tag (or 'all') and the evacuation route from A
 *
 * The routes by ids and by coordinates print how many nodes they have. Every node id of a route is resolved from
 * the venue's own node list before the route is printed; an id that does not resolve stops the example (exit 1).
 * `accessiblePath` is never called (it gives no reliable accessibility guarantee).
 *
 * Run (unguarded, your own namespace): npm run js -- javascript/04-navigation.js
 */
import { NotFoundError, RtlsError } from 'ubudu-rtls-sdk';
import { runExample } from '../shared/config.js';

/** @typedef {import('ubudu-rtls-sdk').PathNode} PathNode */
/** @typedef {import('ubudu-rtls-sdk').RouteNode} RouteNode */

/**
 * A = first active node with an edge; D = a farthest node on A's level (BFS); B = the 2nd node towards D.
 *
 * @param {PathNode[]} nodes
 * @param {import('ubudu-rtls-sdk').PathSegment[]} segments
 * @returns {{ A: PathNode; B: PathNode; D: PathNode } | null}
 */
function pickNodes(nodes, segments) {
  const byId = new Map(nodes.map((n) => [String(n.id), n]));
  /** @type {Map<string, string[]>} */
  const adjacency = new Map();
  /** @param {string} from @param {string} to */
  const link = (from, to) => {
    adjacency.set(from, [...(adjacency.get(from) ?? []), to]);
  };
  for (const s of segments) {
    const a = String(s.sourceNodeId);
    const b = String(s.targetNodeId);
    if (!byId.get(a)?.isActive || !byId.get(b)?.isActive) continue;
    link(a, b);
    if (s.bidirectional) link(b, a);
  }
  const start = nodes.find((n) => n.isActive && (adjacency.get(String(n.id))?.length ?? 0) > 0);
  if (!start) return null;
  /** @type {Map<string, string | null>} */
  const parent = new Map([[String(start.id), null]]);
  const queue = [String(start.id)];
  let last = String(start.id);
  while (queue.length > 0) {
    const current = /** @type {string} */ (queue.shift());
    last = current;
    for (const next of adjacency.get(current) ?? []) {
      if (parent.has(next) || byId.get(next)?.level !== start.level) continue;
      parent.set(next, current);
      queue.push(next);
    }
  }
  /** @type {string[]} */
  const path = [];
  for (let id = /** @type {string | null} */ (last); id !== null; id = parent.get(id) ?? null)
    path.unshift(id);
  const B = byId.get(path[1] ?? '');
  const D = byId.get(path[path.length - 1] ?? '');
  return path.length >= 3 && B && D ? { A: start, B, D } : null;
}

/**
 * Resolves every node id of the route from the venue's node list; throws when one does not resolve.
 *
 * @param {RouteNode[] | null} path
 * @param {Set<string>} nodeIds
 */
function checkNodeSet(path, nodeIds) {
  const unknown = (path ?? []).filter((n) => n.id !== null && !nodeIds.has(String(n.id))).length;
  if (unknown > 0)
    throw new Error(`${unknown} node id(s) of the route do not resolve from the venue's node list`);
}

/**
 * @param {RouteNode[]} path
 * @returns {string[]}
 */
function turnList(path) {
  /** @type {string[]} */
  const lines = [];
  path.forEach((node, i) => {
    const previous = path[i - 1];
    if (i === 0) lines.push(`start at ${node.name} (level ${node.level})`);
    else if (previous && previous.level !== node.level)
      lines.push(`change level ${previous.level} -> ${node.level} at ${node.name}`);
    else if (i === path.length - 1) lines.push(`arrive at ${node.name} (level ${node.level})`);
  });
  return lines;
}

/**
 * 404 → print class and status and go on; anything else stops the example.
 *
 * @param {string} label
 * @param {unknown} error
 * @param {(...a: unknown[]) => void} log
 */
function reportNotFound(label, error, log) {
  if (!(error instanceof NotFoundError)) throw error;
  log(`${label}: ${error.name} ${error.status}`);
}

await runExample('04-navigation', async ({ client, log }) => {
  const [venue] = await client.venues.list();
  if (!venue) throw new Error('no venue in the namespace');
  const ctx = { venueId: venue.id };
  const nodes = await client.venues.listPathNodes(ctx);
  const segments = await client.venues.listPathSegments(ctx);
  const nodeIds = new Set(nodes.map((n) => String(n.id)));
  log(`Venue ${venue.name}: ${nodes.length} path nodes, ${segments.length} segments`);

  const picked = pickNodes(nodes, segments);
  if (!picked) throw new Error('the path graph has no route of three nodes on one level');
  const { A, B, D } = picked;

  const byIds = await client.navigation.shortestPath({ start: A.id, end: D.id }, ctx);
  checkNodeSet(byIds.path, nodeIds);
  log(
    `\nRoute by ids: ${byIds.distance.toFixed(1)} m, ${byIds.estimatedTime.toFixed(0)} s, ${byIds.path.length} nodes`
  );
  for (const line of turnList(byIds.path)) log(`  ${line}`);

  const request = {
    start: { lat: A.lat, lon: A.lng, level: A.level },
    end: { lat: D.lat, lon: D.lng, level: D.level },
  };
  const byPoint = await client.navigation
    .shortestPath(request, ctx)
    .catch((/** @type {unknown} */ error) =>
      error instanceof RtlsError && error.status >= 404
        ? new Promise((resolve) => setTimeout(resolve, 1_000)).then(() =>
            client.navigation.shortestPath(request, ctx)
          )
        : Promise.reject(error)
    );
  checkNodeSet(byPoint.path, nodeIds);
  log(`Route by coordinates: ${byPoint.distance.toFixed(1)} m, ${byPoint.path.length} nodes`);

  const roundTrip = await client.navigation.shortestPath(
    { start: A.id, end: D.id, returnToStart: true },
    ctx
  );
  checkNodeSet(roundTrip.path, nodeIds);
  log(
    `Round trip: ${roundTrip.distance.toFixed(1)} m (return ${roundTrip.roundTripInfo?.returnDistance.toFixed(1) ?? '-'} m)`
  );

  const stops = [D.id, B.id];
  const sequential = await client.navigation.multiStop(
    { start: A.id, stops, optimizeOrder: false },
    { ...ctx, timeoutMs: 60_000 }
  );
  const optimised = await client.navigation.multiStop(
    { start: A.id, stops, algorithm: 'twoOpt' },
    { ...ctx, timeoutMs: 60_000 }
  );
  checkNodeSet(sequential.path, nodeIds);
  checkNodeSet(optimised.path, nodeIds);
  const saving = sequential.distance > 0 ? (1 - optimised.distance / sequential.distance) * 100 : 0;
  log(
    `\nMulti-stop in input order: ${sequential.distance.toFixed(1)} m, ${sequential.estimatedTime.toFixed(0)} s`
  );
  log(
    `Multi-stop twoOpt: ${optimised.distance.toFixed(1)} m, ${optimised.estimatedTime.toFixed(0)} s, saving ${saving.toFixed(1)} %`
  );
  log(
    `  visit order: ${optimised.path
      .filter((n) => n.isStop)
      .map((n) => n.stopIndex)
      .join(' -> ')}`
  );

  const pois = await client.venues.listPoisAsArray(ctx);
  const poiType = pois.find((p) => p.tags.length > 0)?.tags[0] ?? 'all';
  try {
    const nearest = await client.navigation.nearestPoi(A.id, { ...ctx, poiType });
    checkNodeSet(nearest.path, nodeIds);
    log(
      `\nNearest POI (${poiType}): ${nearest.poi.name ?? nearest.poi.id}, ${nearest.distance.toFixed(1)} m`
    );
  } catch (error) {
    reportNotFound(`\nNearest POI (${poiType})`, error, log);
  }

  try {
    const evacuation = await client.navigation.evacuationRoute(A.id, ctx);
    checkNodeSet(evacuation.path, nodeIds);
    log(
      `Evacuation: ${evacuation.distance.toFixed(1)} m, about ${evacuation.estimatedEvacuationTime.toFixed(0)} s`
    );
  } catch (error) {
    reportNotFound('Evacuation', error, log);
  }
});
