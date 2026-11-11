// Write section: tier none; budget positions=0 notifications=0 ble=0 etl=0; read skips none
/**
 * 13 - Venues and maps: "What does my site look like, and where was this tag in the last hour?"
 *
 * Read-only (no `--write` section):
 * - venues with their statistics, then the first venue's details and today's opening hours
 * - floor maps grouped by level, with the tile template check and the Leaflet bounds (the tile URL itself is
 *   not printed: it may carry a host or a query string)
 * - zones per level, POIs filtered by a tag, the path network and its elevators and staircases
 * - the zone-presence timeline of one asset over its last hour, printed as `HH:MM zone` (the newest cached
 *   position whose MAC is not a test MAC)
 *
 * Run (unguarded, your own namespace): npm run js -- javascript/13-venues-maps.js
 */
import { isTestMac, runExample } from '../shared/config.js';
/** @import { IndoorMap, Zone } from 'ubudu-rtls-sdk' */

const HOUR = 3_600_000;

/**
 * @template T
 * @param {T[]} items
 * @param {(item: T) => number} key
 * @returns {Map<number, T[]>}
 */
function groupBy(items, key) {
  /** @type {Map<number, T[]>} */
  const groups = new Map();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return new Map([...groups].sort(([a], [b]) => a - b));
}

/** @param {number} ms */
const hhmm = (ms) => new Date(ms).toISOString().slice(11, 16);

await runExample('13-venues-maps', async ({ client, log }) => {
  const venues = await client.venues.list();
  log(`${venues.length} venue(s)`);
  for (const v of venues) {
    const s = v.statistics;
    log(
      `  ${v.id} ${v.name}: ${s.zones} zones, ${s.pois} POIs, ${s.pathNodes} path nodes, floors ${s.floors.join(',')}`
    );
  }
  const [first] = venues;
  if (!first) throw new Error('no venue in the namespace');
  const ctx = { venueId: first.id };

  const details = await client.venues.get(ctx);
  const day = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const hours = details.metadata?.openingHours?.week[day];
  log(
    `\n${details.name ?? first.name} (${details.metadata?.timezone ?? 'no timezone'}): today ${hours ?? 'no opening hours'}`
  );

  const maps = await client.venues.listMaps(ctx);
  log(`\n${maps.length} floor map(s)`);
  for (const [level, atLevel] of groupBy(maps, (/** @type {IndoorMap} */ m) => m.level)) {
    for (const m of atLevel) {
      const template = ['{z}', '{x}', '{y}'].every((t) => m.tiles_url_base.includes(t));
      log(
        `  level ${level}: ${m.name}, tile template ${template ? 'ok' : 'without {z}/{x}/{y}'}, Leaflet bounds ${JSON.stringify(m.map_bounds)}`
      );
    }
  }

  const zones = await client.zones.listAsArray(ctx);
  log(`\n${zones.length} zone(s)`);
  for (const [level, atLevel] of groupBy(zones, (/** @type {Zone} */ z) => z.level)) {
    log(`  level ${level}: ${atLevel.map((z) => z.name).join(', ')}`);
  }

  const pois = await client.venues.listPoisAsArray(ctx);
  const tag = pois.find((p) => p.tags.length > 0)?.tags[0];
  if (tag === undefined) log(`\n${pois.length} POI(s), none tagged`);
  else {
    const tagged = await client.venues.listPoisAsArray({ ...ctx, tag });
    log(`\n${tagged.length} POI(s) tagged "${tag}": ${tagged.map((p) => p.name).join(', ')}`);
  }

  const elevators = await client.venues.listPathNodes({ ...ctx, nodeType: 'elevator' });
  const staircases = await client.venues.listPathNodes({ ...ctx, nodeType: 'staircase' });
  log(`\nPath graph: ${elevators.length} elevator node(s), ${staircases.length} staircase node(s)`);
  const paths = await client.venues.listPaths(ctx);
  const segments = paths.features.filter((f) => f.geometry.type === 'LineString').length;
  log(`Path network: ${paths.features.length} feature(s), ${segments} segment(s)`);

  const cached = await client.positions.listCached();
  /** @type {string | undefined} */
  let mac;
  let newest = Number.NEGATIVE_INFINITY;
  for (const item of cached) {
    /** @type {unknown} */
    const udid = item.user_udid;
    /** @type {unknown} */
    const ts = item.timestamp;
    const at = typeof ts === 'number' ? ts : typeof ts === 'string' ? Date.parse(ts) : Number.NaN;
    if (typeof udid !== 'string' || isTestMac(udid) || !Number.isFinite(at) || at <= newest)
      continue;
    newest = at;
    mac = udid;
  }
  if (mac === undefined) {
    log('\nNo cached position: no zone timeline');
    return;
  }
  const to = Math.min(Date.now(), newest + 60_000);
  const slots = await client.zones.getPresence({
    value: mac,
    timestampFrom: to - HOUR,
    timestampTo: to,
    interval: '5m',
  });
  log(`\nZone timeline of the most recently seen tag over its last hour (${slots.length} slot(s))`);
  for (const s of slots) log(`  ${hhmm(s.timestamp)} ${s.name}`);
});
