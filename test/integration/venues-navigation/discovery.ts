// Run-time fixture discovery of the venues-navigation live tests (P4 spec §9.1), tier R, through the SDK only.
// Each test file calls it from its own beforeAll (the harness context is fresh per file). Ids are compared as
// `String(id)` throughout (O4). Failures throw with a fixed message and no response value.
import type { IndoorMap, PathNode, PathSegment, POI, RtlsClient, VenueSummary } from '../../../src';
import { createLiveClient, getHarness, isTestMac } from '../harness';

export interface RouteFixture {
  /** first active node with at least one edge */
  A: PathNode;
  /** 2nd node of the BFS path A→D */
  B: PathNode;
  /** 3rd node of the BFS path A→D */
  C: PathNode;
  /** a node at the largest BFS depth from A on A's level (depth ≥ 3) */
  D: PathNode;
}

export interface PresenceFixture {
  /** user_udid of the newest cached position whose MAC is not a test MAC */
  mac: string;
  /** t1 − 1 h */
  t0: number;
  /** min(now, newest timestamp + 60 s) */
  t1: number;
}

export interface VenueDiscovery {
  namespace: string;
  /** client scoped to { namespace, venueId: venue.id } */
  client: RtlsClient;
  venue: VenueSummary;
  maps: IndoorMap[];
  mapId: number;
  nodes: PathNode[];
  segments: PathSegment[];
  nodeIds: Set<string>;
  pois: POI[];
  /** first tag of the first POI that has tags; undefined when Demo Factory has no tagged POI */
  poiTag: string | undefined;
}

/** Outcome of a call without a try/catch in the test: exactly one of `value` / `error` is set. */
export function settle<T>(p: Promise<T>): Promise<{ value?: T; error?: unknown }> {
  return p.then(
    (value) => ({ value }),
    (error: unknown) => ({ error })
  );
}

/** a relative to b within 1e-6 */
export function close(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-6 * Math.max(Math.abs(b), 1e-9);
}

/**
 * Fixture-dependent cases (§9.1 step 5, §9.3): the value, or a run-time skip with its reason (reported in the run,
 * never a pass). `ctx.skip` throws, so nothing after the call runs when the value is absent.
 */
export function presentOrSkip<T>(
  ctx: { skip: (note?: string) => void },
  value: T | undefined,
  reason: string
): T {
  if (value === undefined) ctx.skip(reason);
  return value as T;
}

export class DiscoveryFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiscoveryFailure';
  }
}

/** Steps 1–3 and 5 of §9.1 (7 requests). */
export async function discoverVenue(): Promise<VenueDiscovery> {
  const namespace = getHarness().env.namespace;
  const venues = await createLiveClient().venues.list();
  const venue = venues[0];
  if (venue === undefined) throw new DiscoveryFailure('venue fixture insufficient: no venue');
  const client = createLiveClient({ venueId: venue.id });
  const maps = await client.venues.listMaps();
  const map = maps[0];
  if (map === undefined) throw new DiscoveryFailure('map fixture insufficient: no map');
  const nodes = await client.venues.listPathNodes();
  const segments = await client.venues.listPathSegments();
  const pois = await client.venues.listPoisAsArray();
  const tagged = pois.find((p) => p.tags.length > 0);
  return {
    namespace,
    client,
    venue,
    maps,
    mapId: map.id,
    nodes,
    segments,
    nodeIds: new Set(nodes.map((n) => String(n.id))),
    pois,
    poiTag: tagged?.tags[0],
  };
}

/** Step 4 of §9.1: A, B, C, D on one level, B and C on the BFS path A→D. Pure (no request). */
export function routeFixture(nodes: PathNode[], segments: PathSegment[]): RouteFixture {
  const byId = new Map(nodes.map((n) => [String(n.id), n]));
  const active = (id: string): boolean => byId.get(id)?.isActive === true;
  const adjacency = new Map<string, string[]>();
  const link = (from: string, to: string): void => {
    const list = adjacency.get(from) ?? [];
    list.push(to);
    adjacency.set(from, list);
  };
  for (const s of segments) {
    const a = String(s.sourceNodeId);
    const b = String(s.targetNodeId);
    if (!active(a) || !active(b)) continue;
    link(a, b);
    if (s.bidirectional !== false) link(b, a);
  }
  const start = nodes.find((n) => n.isActive && (adjacency.get(String(n.id))?.length ?? 0) >= 1);
  if (start === undefined) throw new DiscoveryFailure('path-graph fixture insufficient');
  const startId = String(start.id);
  const parent = new Map<string, string | null>([[startId, null]]);
  const depth = new Map<string, number>([[startId, 0]]);
  const queue = [startId];
  let farthest = startId;
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const next of adjacency.get(current) ?? []) {
      if (parent.has(next) || byId.get(next)?.level !== start.level) continue;
      parent.set(next, current);
      const d = (depth.get(current) ?? 0) + 1;
      depth.set(next, d);
      if (d > (depth.get(farthest) ?? 0)) farthest = next;
      queue.push(next);
    }
  }
  const path: string[] = [];
  for (let id: string | null = farthest; id !== null; id = parent.get(id) ?? null) path.unshift(id);
  const [a, b, c] = path;
  const d = path[path.length - 1];
  const picked = [a, b, c, d].map((id) => (id === undefined ? undefined : byId.get(id)));
  const [A, B, C, D] = picked;
  if (
    path.length < 4 ||
    A === undefined ||
    B === undefined ||
    C === undefined ||
    D === undefined ||
    new Set([a, b, c, d]).size !== 4
  ) {
    throw new DiscoveryFailure('path-graph fixture insufficient');
  }
  return { A, B, C, D };
}

/** Step 6 of §9.1: the newest cached position with a non-test MAC and a 1 h window ending at it. */
export async function presenceFixture(client: RtlsClient): Promise<PresenceFixture> {
  const cached: unknown[] = await client.positions.listCached();
  let mac: string | undefined;
  let newest = Number.NEGATIVE_INFINITY;
  for (const item of cached) {
    if (typeof item !== 'object' || item === null) continue;
    const udid: unknown = (item as { user_udid?: unknown }).user_udid;
    const timestamp: unknown = (item as { timestamp?: unknown }).timestamp;
    if (typeof udid !== 'string' || isTestMac(udid)) continue;
    const at =
      typeof timestamp === 'number'
        ? timestamp
        : typeof timestamp === 'string'
          ? Date.parse(timestamp)
          : Number.NaN;
    if (!Number.isFinite(at) || at <= newest) continue;
    newest = at;
    mac = udid;
  }
  if (mac === undefined) throw new DiscoveryFailure('presence fixture insufficient');
  const t1 = Math.min(Date.now(), newest + 60_000);
  return { mac, t0: t1 - 3_600_000, t1 };
}
