// Write section: tier none; budget positions=0 notifications=0 ble=0 etl=0; read skips none
/**
 * 20 - Asset tracking view (recipe: docs/recipes/asset-tracking-view.md)
 *
 * Joins venues, zones, assets and cached positions into one table (newest first), counts assets per zone, then
 * follows live POSITIONS messages for a few seconds and prints the updated counts. Read-only.
 *
 *   node javascript/20-asset-tracking-view.js [--seconds 5] [--out assets.geojson]      (from examples/)
 *
 * --seconds  length of the live subscription (default 5, hard maximum 30)
 * --out      writes a GeoJSON FeatureCollection of the asset points; the file holds data of your namespace,
 *            keep it out of version control
 */
import { writeFileSync } from 'node:fs';
import { SubscriptionType } from 'ubudu-rtls-sdk';
import { getArg, runExample, skip } from '../shared/config.js';

const MAX_SECONDS = 30;
const CONNECT_DEADLINE_MS = 10_000;
const CLOSE_DEADLINE_MS = 5_000;
const TOP = 20;

/**
 * A position outside every zone carries the zone-0 pseudo-zone (id 0, OUTSIDE_ALL_ZONES); null-safe all the same.
 *
 * @param {{ id?: number; name?: string } | null | undefined} zone
 * @returns {string}
 */
function zoneLabel(zone) {
  if (!zone || zone.id === 0 || !zone.name) return 'outside all zones';
  return zone.name;
}

/**
 * @param {string | number} timestamp
 * @param {number} now
 * @returns {string}
 */
function age(timestamp, now) {
  const ms = now - (typeof timestamp === 'number' ? timestamp : Date.parse(timestamp));
  if (!Number.isFinite(ms)) return '?';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86_400)}d`;
}

/**
 * Resolves with the value of `p`, or rejects when `ms` pass first.
 *
 * @template T
 * @param {Promise<T>} p
 * @param {number} ms
 * @param {string} what
 * @returns {Promise<T>}
 */
async function deadline(p, ms, what) {
  /** @type {NodeJS.Timeout | undefined} */
  let timer;
  /** @type {Promise<never>} */
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} did not finish within ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([p, expired]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Waits `seconds`, or less when `signal` aborts.
 *
 * @param {number} seconds
 * @param {AbortSignal} signal
 * @returns {Promise<void>}
 */
function listen(seconds, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, seconds * 1000);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

/**
 * @param {Map<string, string>} zoneOf
 * @returns {[string, number][]}
 */
function countByZone(zoneOf) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const label of zoneOf.values()) counts.set(label, (counts.get(label) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

await runExample('20-asset-tracking-view', async ({ client, log, signal }) => {
  const seconds = Math.min(MAX_SECONDS, Number(getArg('seconds', '5')));
  if (!Number.isFinite(seconds) || seconds <= 0)
    throw new Error('--seconds must be a positive number');
  const out = getArg('out', '');

  // 1. Venue context: the first venue becomes the client's default venue.
  const [venue] = await client.venues.list();
  if (!venue) skip('no-fixture', 'the namespace has no venue');
  client.setVenue(venue.id);
  const maps = await client.venues.listMaps();
  log(
    `venue ${venue.id}: ${maps.length} map(s)${maps[0] ? `, first map level ${maps[0].level}` : ''}`
  );

  // 2. Zones of the venue (id → name), assets of the namespace (udid → name and type).
  const zones = await client.zones.listAsArray();
  const zoneName = new Map(zones.map((z) => [z.id, z.name]));
  log(`zones: ${zones.length}`);
  const assets = await client.assets.list();
  const assetOf = new Map(assets.map((a) => [a.user_udid, a]));
  log(`assets: ${assets.length}`);

  // 3. Cached positions joined with the assets by user_udid; the server ignores sort and fields on these routes,
  //    so sorting and projection happen here.
  const now = Date.now();
  const positions = await client.positions.listCached();
  log(`cached positions: ${positions.length}`);
  const rows = positions
    .map((p) => {
      const asset = assetOf.get(p.user_udid);
      const zone =
        p.zone && p.zone.id !== 0
          ? { id: p.zone.id, name: zoneName.get(p.zone.id) ?? p.zone.name }
          : p.zone;
      return {
        udid: p.user_udid,
        name: asset?.user_name ?? p.user_name ?? '(unnamed)',
        type: asset?.user_type ?? p.user_type ?? '-',
        zone: zoneLabel(zone),
        timestamp: p.timestamp,
        lat: p.lat,
        lon: p.lon,
      };
    })
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  log(`newest ${Math.min(TOP, rows.length)} positions:`);
  log('  name | type | zone | age | lat, lon');
  for (const r of rows.slice(0, TOP)) {
    log(
      `  ${r.name} | ${r.type} | ${r.zone} | ${age(r.timestamp, now)} | ${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}`
    );
  }

  const zoneOf = new Map(rows.map((r) => [r.udid, r.zone]));
  log('assets per zone (cache):');
  for (const [label, n] of countByZone(zoneOf)) log(`  ${label}: ${n}`);

  if (out !== '') {
    const collection = {
      type: 'FeatureCollection',
      features: rows.map((r) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
        properties: {
          udid: r.udid,
          name: r.name,
          type: r.type,
          zone: r.zone,
          timestamp: r.timestamp,
        },
      })),
    };
    writeFileSync(out, `${JSON.stringify(collection, null, 2)}\n`);
    log(`wrote ${rows.length} features to ${out}`);
  }

  // 4. Live positions for a few seconds: each message moves its asset to the zone it reports.
  const ws = client.createWebSocket();
  let received = 0;
  try {
    await deadline(ws.connect({ subscriberOnly: true }), CONNECT_DEADLINE_MS, 'WebSocket connect');
    ws.on('POSITIONS', (m) => {
      received += 1;
      zoneOf.set(m.user_udid, zoneLabel(m.zone));
    });
    await deadline(
      ws.subscribe([SubscriptionType.POSITIONS]),
      CONNECT_DEADLINE_MS,
      'WebSocket subscribe'
    );
    log(`listening to POSITIONS for ${seconds} s`);
    await listen(seconds, signal);
  } finally {
    await deadline(ws.disconnect(), CLOSE_DEADLINE_MS, 'WebSocket close').catch((err) => {
      log(`WebSocket close: ${err instanceof Error ? err.message : String(err)}`);
    });
  }
  log(`live positions received: ${received}`);
  log('assets per zone (cache + live):');
  for (const [label, n] of countByZone(zoneOf)) log(`  ${label}: ${n}`);
});
