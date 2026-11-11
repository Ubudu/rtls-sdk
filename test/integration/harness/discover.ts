// Run-time discovery (P0 §6.2 discover.ts; P8 §9.1 steps 1–3, hoisted). The selection, the zone union and the safe
// publish point come from `examples/shared/discover.js`, so the harness and the examples run one implementation
// (CONVENTIONS §9). `discover()` reads through the guarded fetch (raw GETs: venues, the first venue's maps, zones and
// paths; never `…/maps/{mapId}/zones`), is cached per run context and writes `.state/<runId>/discovery.json`
// `{ venueId, mapId, hasSafePoint }` for report.json. Nothing here logs a response.
import { join } from 'node:path';
import {
  buildDiscovery,
  DiscoveryError,
  firstVenueId,
  safePublishPoint as sharedSafePublishPoint,
  type Discovery,
  type GeoJsonFeature,
} from '../../../examples/shared/discover.js';
import { activeHarness } from './active';
import type { Harness } from './context';
import { rawRequest } from './raw';
import { writeJsonFileAtomicSync } from './state-io.mjs';

export { DiscoveryError };
export type { Discovery, GeoJsonFeature };

const cache = new WeakMap<Harness, Promise<Discovery>>();

async function read(path: string, optional = false): Promise<unknown> {
  const r = await rawRequest('GET', path);
  if (r.status === 200) return r.json;
  if (optional) return null;
  throw new DiscoveryError(
    `GET ${path.replace(/\/\d+(?=\/|$)/g, '/{venueId}')} answered ${r.status}`
  );
}

async function load(h: Harness): Promise<Discovery> {
  const venues = await read('/venues/{ns}');
  const venueId = firstVenueId(venues);
  if (venueId === null) throw new DiscoveryError('no venue with an integer id');
  const maps = await read(`/venues/{ns}/${venueId}/maps`);
  const venueZones = await read(`/venues/{ns}/${venueId}/zones`);
  const paths = await read(`/venues/{ns}/${venueId}/paths`, true);
  const discovery = buildDiscovery({ venues, maps, venueZones, paths });
  writeJsonFileAtomicSync(join(h.stateDir, 'discovery.json'), {
    venueId: discovery.venueId,
    mapId: discovery.mapId,
    hasSafePoint: sharedSafePublishPoint(discovery) !== null,
  });
  return discovery;
}

/** The run's Discovery (cached per run context; a failed discovery is not cached). */
export function discover(): Promise<Discovery> {
  const h = activeHarness();
  let pending = cache.get(h);
  if (!pending) {
    pending = load(h);
    cache.set(h, pending);
    pending.catch(() => cache.delete(h));
  }
  return pending;
}

/**
 * 9 × 9 grid in the bounds inset 10 %, ordered by distance from the centre; the first point outside every
 * Polygon/MultiPolygon of `discovery.zones` and ≥ 10 m from every edge; null → the tier-S block skips with
 * "no safe publish point" (reported, never a failure). Reads `mapBounds`, `level` and `zones` only.
 */
export function safePublishPoint(
  discovery: Discovery
): { lat: number; lng: number; level: number } | null {
  return sharedSafePublishPoint(discovery);
}
