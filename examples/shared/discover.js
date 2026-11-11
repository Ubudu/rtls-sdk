// Run-time discovery and the safe publish point.
// One implementation for the harness and the examples: the harness imports `buildDiscovery` and
// `safePublishPoint` from here; examples call `discover()` (raw GETs with the loadConfig() credentials) and
// `safePublishPoint(discovery)`, and never assemble a Discovery from SDK reads.
//
// Selection: the first venue with an integer id; its first map with a non-empty `uuid` and a lat-first
// `map_bounds` `[[lat, lng], [lat, lng]]`. Zones: the union of the Polygon and MultiPolygon features of
// `GET /venues/{ns}/{venueId}/zones` and of the chosen map's own `map_features`, deduplicated by `properties.id`, on
// all levels; never `GET …/maps/{mapId}/zones` (sample data) and no other fallback zone set. Safe point: a 9 × 9 grid
// inside the bounds inset 10 %, ordered by distance from the bounds centre; the first point outside every polygon
// (ray casting on [lng, lat]) and at least 10 m from every edge (equirectangular metres), else null.

/** Minimum distance of the publish point from every zone edge, in metres. */
export const EDGE_MARGIN_M = 10;
/** Grid points per side. */
export const GRID_SIZE = 9;
/** Fraction of the bounds left out on each side. */
export const BOUNDS_INSET = 0.1;
const EARTH_RADIUS_M = 6371008.8;
const M_PER_DEG = (Math.PI * EARTH_RADIUS_M) / 180;

/** No venue or no usable map: the live block that needs a Discovery skips ("no map"). */
export class DiscoveryError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(`discover: ${message}`);
    this.name = 'DiscoveryError';
  }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Items of a listing: a bare array, or the `data` array of a page envelope.
 *
 * @param {unknown} value
 * @returns {unknown[]}
 */
function itemsOf(value) {
  if (Array.isArray(value)) return value;
  if (isObject(value) && Array.isArray(value.data)) return value.data;
  return [];
}

/**
 * Features of a FeatureCollection (or of a bare feature array).
 *
 * @param {unknown} value
 * @returns {unknown[]}
 */
function featuresOf(value) {
  if (Array.isArray(value)) return value;
  if (isObject(value) && Array.isArray(value.features)) return value.features;
  return [];
}

/**
 * @param {unknown} n
 * @returns {n is number}
 */
function isNum(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

/**
 * `[[lat, lng], [lat, lng]]` with finite numbers.
 *
 * @param {unknown} b
 * @returns {b is [[number, number], [number, number]]}
 */
export function isMapBounds(b) {
  return (
    Array.isArray(b) &&
    b.length === 2 &&
    b.every((p) => Array.isArray(p) && p.length >= 2 && isNum(p[0]) && isNum(p[1]))
  );
}

/**
 * @param {unknown} f
 * @returns {f is import('./discover.js').GeoJsonFeature}
 */
function isPolygonal(f) {
  if (!isObject(f) || !isObject(f.geometry)) return false;
  const { type, coordinates } = f.geometry;
  return (type === 'Polygon' || type === 'MultiPolygon') && Array.isArray(coordinates);
}

/**
 * Polygons of a feature as rings of [lng, lat] points (outer ring first, then holes).
 *
 * @param {import('./discover.js').GeoJsonFeature} f
 * @returns {number[][][][]}
 */
function polygonsOf(f) {
  const g = f.geometry;
  const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return /** @type {number[][][][]} */ (polygons).filter(
    (poly) =>
      Array.isArray(poly) &&
      poly.every(
        (ring) =>
          Array.isArray(ring) &&
          ring.every((pt) => Array.isArray(pt) && isNum(pt[0]) && isNum(pt[1]))
      ) &&
      Array.isArray(poly[0]) &&
      poly[0].length >= 3
  );
}

/**
 * The id of the first venue with an integer id, else null.
 *
 * @param {unknown} venues
 * @returns {number | null}
 */
export function firstVenueId(venues) {
  const venue = itemsOf(venues).find((v) => isObject(v) && Number.isInteger(v.id));
  return venue ? /** @type {number} */ (/** @type {any} */ (venue).id) : null;
}

/**
 * Union of the polygonal features, deduplicated by `properties.id` (features without an id are all kept).
 *
 * @param {unknown[][]} sources
 * @returns {import('./discover.js').GeoJsonFeature[]}
 */
function unionZones(...sources) {
  /** @type {import('./discover.js').GeoJsonFeature[]} */
  const out = [];
  const seen = new Set();
  for (const source of sources) {
    for (const f of source) {
      if (!isPolygonal(f) || polygonsOf(f).length === 0) continue;
      const id = isObject(f.properties) ? f.properties.id : undefined;
      if (id !== undefined && id !== null) {
        const key = String(id);
        if (seen.has(key)) continue;
        seen.add(key);
      }
      out.push(f);
    }
  }
  return out;
}

/**
 * Ray casting on [lng, lat].
 *
 * @param {number} lng
 * @param {number} lat
 * @param {number[][]} ring
 */
function inRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = /** @type {[number, number]} */ (ring[i]);
    const [xj, yj] = /** @type {[number, number]} */ (ring[j]);
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Inside the outer ring and outside every hole.
 *
 * @param {number} lng
 * @param {number} lat
 * @param {number[][][]} polygon
 */
function inPolygon(lng, lat, polygon) {
  const [outer, ...holes] = polygon;
  return (
    inRing(lng, lat, /** @type {number[][]} */ (outer)) && !holes.some((h) => inRing(lng, lat, h))
  );
}

/**
 * True when the point lies inside a polygon of any zone.
 *
 * @param {{ lat: number; lng: number }} point
 * @param {import('./discover.js').GeoJsonFeature[]} zones
 */
export function insideAnyZone(point, zones) {
  return zones.some((z) => polygonsOf(z).some((poly) => inPolygon(point.lng, point.lat, poly)));
}

/**
 * Smallest distance in metres from the point to any edge of any zone ring (equirectangular around the point).
 *
 * @param {{ lat: number; lng: number }} point
 * @param {import('./discover.js').GeoJsonFeature[]} zones
 */
export function edgeDistanceM(point, zones) {
  const kx = M_PER_DEG * Math.cos((point.lat * Math.PI) / 180);
  const ky = M_PER_DEG;
  let best = Infinity;
  for (const z of zones) {
    for (const poly of polygonsOf(z)) {
      for (const ring of poly) {
        for (let i = 0; i < ring.length; i++) {
          const a = /** @type {number[]} */ (ring[i]);
          const b = /** @type {number[]} */ (ring[(i + 1) % ring.length]);
          const ax = /** @type {number} */ (a[0] - point.lng) * kx;
          const ay = /** @type {number} */ (a[1] - point.lat) * ky;
          const bx = /** @type {number} */ (b[0] - point.lng) * kx;
          const by = /** @type {number} */ (b[1] - point.lat) * ky;
          const dx = bx - ax;
          const dy = by - ay;
          const len2 = dx * dx + dy * dy;
          const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
          best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
        }
      }
    }
  }
  return best;
}

/**
 * A point inside the zone: the area centroid of its first (largest) polygon when it lies inside, else the inside
 * point of a 21 × 21 grid over that polygon's box that is closest to the centroid.
 *
 * @param {import('./discover.js').GeoJsonFeature} zone
 * @returns {{ lat: number; lng: number }}
 */
export function zoneInteriorPoint(zone) {
  const polys = polygonsOf(zone);
  const area = (/** @type {number[][]} */ ring) => {
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = /** @type {[number, number]} */ (ring[i]);
      const [xj, yj] = /** @type {[number, number]} */ (ring[j]);
      a += xj * yi - xi * yj;
    }
    return a / 2;
  };
  const poly = [...polys].sort(
    (p, q) =>
      Math.abs(area(/** @type {number[][]} */ (q[0]))) -
      Math.abs(area(/** @type {number[][]} */ (p[0])))
  )[0];
  if (!poly) throw new DiscoveryError('zone without a polygon');
  const outer = /** @type {number[][]} */ (poly[0]);
  let cx = 0;
  let cy = 0;
  const a = area(outer);
  for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
    const [xi, yi] = /** @type {[number, number]} */ (outer[i]);
    const [xj, yj] = /** @type {[number, number]} */ (outer[j]);
    const f = xj * yi - xi * yj;
    cx += (xi + xj) * f;
    cy += (yi + yj) * f;
  }
  const centroid =
    a === 0
      ? { lng: /** @type {number} */ (outer[0]?.[0]), lat: /** @type {number} */ (outer[0]?.[1]) }
      : { lng: cx / (6 * a), lat: cy / (6 * a) };
  if (inPolygon(centroid.lng, centroid.lat, poly)) return centroid;
  const xs = outer.map((p) => /** @type {number} */ (p[0]));
  const ys = outer.map((p) => /** @type {number} */ (p[1]));
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  /** @type {{ lat: number; lng: number } | null} */
  let best = null;
  let bestD = Infinity;
  for (let i = 1; i < 21; i++) {
    for (let j = 1; j < 21; j++) {
      const lng = minX + ((maxX - minX) * i) / 21;
      const lat = minY + ((maxY - minY) * j) / 21;
      if (!inPolygon(lng, lat, poly)) continue;
      const d = Math.hypot(lng - centroid.lng, lat - centroid.lat);
      if (d < bestD) {
        bestD = d;
        best = { lat, lng };
      }
    }
  }
  return best ?? centroid;
}

/**
 * Pure part of discover(): the selection, the zone union, a zone's interior point and a path node, from
 * responses already read (`paths` optional: `pathNodeId` is null without it).
 *
 * @param {{ venues: unknown; maps: unknown; venueZones: unknown; paths?: unknown }} inputs
 * @returns {import('./discover.js').Discovery}
 */
export function buildDiscovery({ venues, maps, venueZones, paths }) {
  const venueId = firstVenueId(venues);
  if (venueId === null) throw new DiscoveryError('no venue with an integer id');
  const map = itemsOf(maps).find(
    (m) =>
      isObject(m) &&
      typeof m.uuid === 'string' &&
      m.uuid !== '' &&
      isMapBounds(m.map_bounds) &&
      Number.isFinite(Number(m.id))
  );
  if (!isObject(map)) throw new DiscoveryError('no map with a uuid and map_bounds');
  const level = isNum(map.level)
    ? map.level
    : Number.isFinite(Number(map.level))
      ? Number(map.level)
      : 0;
  const bounds = /** @type {[[number, number], [number, number]]} */ (
    map.map_bounds.map((/** @type {number[]} */ p) => [p[0], p[1]])
  );
  const zones = unionZones(featuresOf(venueZones), featuresOf(map.map_features));
  const onLevel = zones.find((z) => isObject(z.properties) && Number(z.properties.level) === level);
  const zone = onLevel ?? zones[0];
  const zoneCentroid = zone
    ? zoneInteriorPoint(zone)
    : { lat: (bounds[0][0] + bounds[1][0]) / 2, lng: (bounds[0][1] + bounds[1][1]) / 2 };
  const nodes = /** @type {Record<string, any>[]} */ (
    featuresOf(paths).filter(
      (f) => isObject(f) && isObject(f.geometry) && f.geometry.type === 'Point'
    )
  );
  const nodeId = (/** @type {any} */ f) => {
    const id = isObject(f.properties) ? f.properties.id : undefined;
    const value = id ?? f.id;
    return typeof value === 'string' || typeof value === 'number' ? value : null;
  };
  const node =
    nodes.find(
      (f) => isObject(f.properties) && Number(f.properties.level) === level && nodeId(f) !== null
    ) ?? nodes.find((f) => nodeId(f) !== null);
  return {
    venueId,
    mapId: Number(map.id),
    mapUuid: map.uuid,
    level,
    mapBounds: bounds,
    zones,
    zoneCentroid,
    pathNodeId: node ? nodeId(node) : null,
  };
}

/**
 * The safe publish point: reads `mapBounds`, `level` and `zones` only.
 *
 * @param {import('./discover.js').Discovery} discovery
 * @returns {{ lat: number; lng: number; level: number } | null}
 */
export function safePublishPoint(discovery) {
  const { mapBounds, level, zones } = discovery;
  if (!isMapBounds(mapBounds)) return null;
  const [[aLat, aLng], [bLat, bLng]] = mapBounds;
  const [minLat, maxLat] = [Math.min(aLat, bLat), Math.max(aLat, bLat)];
  const [minLng, maxLng] = [Math.min(aLng, bLng), Math.max(aLng, bLng)];
  const dLat = (maxLat - minLat) * BOUNDS_INSET;
  const dLng = (maxLng - minLng) * BOUNDS_INSET;
  const [lat0, lat1, lng0, lng1] = [minLat + dLat, maxLat - dLat, minLng + dLng, maxLng - dLng];
  const centre = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
  const kx = M_PER_DEG * Math.cos((centre.lat * Math.PI) / 180);
  /** @type {{ lat: number; lng: number; d: number; k: number }[]} */
  const points = [];
  for (let i = 0; i < GRID_SIZE; i++) {
    for (let j = 0; j < GRID_SIZE; j++) {
      const lat = lat0 + ((lat1 - lat0) * i) / (GRID_SIZE - 1);
      const lng = lng0 + ((lng1 - lng0) * j) / (GRID_SIZE - 1);
      const d = Math.hypot((lat - centre.lat) * M_PER_DEG, (lng - centre.lng) * kx);
      points.push({ lat, lng, d, k: i * GRID_SIZE + j });
    }
  }
  points.sort((p, q) => p.d - q.d || p.k - q.k);
  const polygonal = Array.isArray(zones) ? zones.filter(isPolygonal) : [];
  for (const p of points) {
    if (insideAnyZone(p, polygonal)) continue;
    if (edgeDistanceM(p, polygonal) < EDGE_MARGIN_M) continue;
    return { lat: p.lat, lng: p.lng, level };
  }
  return null;
}

/**
 * Raw authenticated GET (no SDK involved).
 *
 * @param {{ baseUrl: string; apiKey: string; namespace: string }} config
 * @param {string} template path with `{ns}`
 * @returns {Promise<unknown>}
 */
async function rawGet(config, template) {
  const url = `${config.baseUrl}${template.replace('{ns}', encodeURIComponent(config.namespace))}`;
  const res = await fetch(url, {
    headers: { 'X-API-Key': config.apiKey, Accept: 'application/json' },
  });
  if (!res.ok)
    throw new DiscoveryError(
      `GET ${template.replace(/\/\d+(?=\/|$)/g, '/{venueId}')} answered ${res.status}`
    );
  return res.json();
}

/**
 * Discovery of the configured namespace: raw GETs of the venues, the first venue's maps, zones and paths with
 * the loadConfig() credentials, then buildDiscovery. `client` is accepted for call-site compatibility and unused.
 * Never reads `…/maps/{mapId}/zones`.
 *
 * @param {unknown} [_client]
 * @returns {Promise<import('./discover.js').Discovery>}
 */
export async function discover(_client) {
  // Computed specifier: config.js (and the SDK it imports) load only here, so the harness can import this file.
  const { loadConfig } = await import(new URL('./config.js', import.meta.url).href);
  const config = loadConfig();
  const venues = await rawGet(config, '/venues/{ns}');
  const venueId = firstVenueId(venues);
  if (venueId === null) throw new DiscoveryError('no venue with an integer id');
  const maps = await rawGet(config, `/venues/{ns}/${venueId}/maps`);
  const venueZones = await rawGet(config, `/venues/{ns}/${venueId}/zones`);
  // Paths only provide `pathNodeId`: a venue without a path graph still has a discovery.
  const paths = await rawGet(config, `/venues/{ns}/${venueId}/paths`).catch(() => null);
  return buildDiscovery({ venues, maps, venueZones, paths });
}
