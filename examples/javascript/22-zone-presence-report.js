// Write section: tier none; budget positions=0 notifications=0 ble=0 etl=0; read skips none
/**
 * 22 - Zone presence report (recipe: docs/recipes/zone-presence-report.md)
 *
 * For up to 20 assets of the position cache, reads the zone presence timeline of the last hours (one slot per
 * interval) and prints the dwell time per zone as CSV. Read-only; at most 20 presence requests, 200 ms apart.
 *
 *   node javascript/22-zone-presence-report.js [--hours 24] [--interval 1h] [--type <user_type>]
 *                                              [--max-assets 20] [--out report.csv]      (from examples/)
 *
 * --hours       window ending now (default 24, hard maximum 168)
 * --interval    slot length, a fixed unit m, h or d (default 1h)
 * --type        only assets of this user_type
 * --max-assets  number of assets (default and hard maximum 20)
 * --out         writes the CSV to a file; it holds data of your namespace, keep it out of version control
 */
import { writeFileSync } from 'node:fs';
import { applyFilters, filters } from 'ubudu-rtls-sdk';
import { getArg, runExample, skip } from '../shared/config.js';

const MAX_ASSETS = 20;
const MAX_HOURS = 168;
const SPACING_MS = 200;
const INTERVAL_RE = /^([1-9]\d*)([mhd])$/;
/** @type {Record<string, number>} */
const MINUTES = { m: 1, h: 60, d: 1440 };

/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * CSV cell: quoted when it holds a comma, a quote or a line break.
 *
 * @param {string | number} value
 * @returns {string}
 */
function csv(value) {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

await runExample('22-zone-presence-report', async ({ client, log }) => {
  const hours = Number(getArg('hours', '24'));
  if (!Number.isFinite(hours) || hours <= 0 || hours > MAX_HOURS)
    throw new Error(`--hours must be a number in (0, ${MAX_HOURS}]`);
  const interval = getArg('interval', '1h');
  const m = INTERVAL_RE.exec(interval);
  if (!m) throw new Error('--interval must be a fixed interval such as 30m, 1h or 1d');
  const slotMinutes = Number(m[1]) * (MINUTES[/** @type {string} */ (m[2])] ?? 0);
  const maxAssets = Math.min(MAX_ASSETS, Number(getArg('max-assets', String(MAX_ASSETS))));
  if (!Number.isInteger(maxAssets) || maxAssets <= 0)
    throw new Error('--max-assets must be a positive integer');
  const type = getArg('type', '');
  const out = getArg('out', '');

  // 1. Assets to report on: the cached positions carry each asset's udid exactly as stored, which is what the
  //    presence timeline is keyed by.
  const cached = await client.positions.listCached();
  const selected =
    type === ''
      ? cached
      : applyFilters(cached, { filters: filters.equals('user_type', type) }).data;
  const assets = selected.slice(0, maxAssets);
  log(
    `cached positions: ${cached.length}; selected assets: ${assets.length}${type ? ` (type ${type})` : ''}`
  );
  if (assets.length === 0) skip('no-fixture', 'no cached position matches the selection');

  // 2. One presence timeline per asset, sequential and spaced, always with an explicit interval.
  const timestampTo = Date.now();
  const timestampFrom = timestampTo - hours * 3_600_000;
  /** @type {string[]} */
  const rows = [];
  let requests = 0;
  for (const [i, p] of assets.entries()) {
    if (i > 0) await sleep(SPACING_MS);
    requests += 1;
    const slots = await client.zones.getPresence({
      value: p.user_udid,
      timestampFrom,
      timestampTo,
      interval,
    });
    if (i === 0) log(`slots for the first asset: ${slots.length}`);
    // A slot carries the zone of one sampled position of the interval: OUTSIDE_ALL_ZONES means no position was
    // recorded in it, UNKNOWN_ZONE positions without zone data. Both stay rows of their own.
    /** @type {Map<string, { id: string; name: string; slots: number }>} */
    const perZone = new Map();
    for (const s of slots) {
      const id = s.id === undefined ? '' : String(s.id);
      const key = `${id}|${s.name}`;
      const entry = perZone.get(key) ?? { id, name: s.name, slots: 0 };
      entry.slots += 1;
      perZone.set(key, entry);
    }
    for (const z of [...perZone.values()].sort((a, b) => b.slots - a.slots)) {
      rows.push(
        [p.user_udid, p.user_name ?? '', z.id, z.name, z.slots, z.slots * slotMinutes]
          .map(csv)
          .join(',')
      );
    }
  }
  log(`presence requests: ${requests}`);

  // 3. Dwell per zone = slots × interval: an approximation, each slot stands for the zone of one sample.
  const header = 'asset_udid,asset_name,zone_id,zone_name,slots,dwell_minutes';
  const text = `${[header, ...rows].join('\n')}\n`;
  if (out !== '') {
    writeFileSync(out, text);
    log(header);
    log(`wrote ${rows.length} rows to ${out}`);
  } else {
    for (const line of text.trimEnd().split('\n')) log(line);
  }
});
