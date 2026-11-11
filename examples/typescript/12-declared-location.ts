// Write section: tier S; budget positions=1 notifications=0 ble=0 etl=0; read skips none
/**
 * Example 12: declared locations (RFID, QR or WMS check-ins).
 *
 * Read-only: counts the assets that carry a declared location and prints the DL error codes of the bulk routes.
 * With `--write`: creates a test asset, declares it at a point (by default a point outside every zone of the first
 * map; `--lat <lat> --lng <lng>` in your own run), reads it back, clears it and deletes the asset. The declare
 * publishes one position (origin `declared`), which the alert-rule engine evaluates, so the section first runs the
 * rule preflight. Clearing publishes nothing.
 *
 * Run through the guarded runner: `npm run examples:check -- 12` (read-only) or
 * `RTLS_IT_WRITES=1 RTLS_IT_SIDE_EFFECTS=1 npm run examples:check -- 12 --write`.
 */
import { NotFoundError, type DeclaredLocation, type RtlsClient } from 'ubudu-rtls-sdk';
import {
  getArg,
  preflightAllows,
  preflightRules,
  reportBudget,
  runExample,
  skip,
  testMac,
  testName,
} from '../shared/config.js';
import { discover, safePublishPoint } from '../shared/discover.js';

const DL_CODES: Record<string, string> = {
  DL_002: 'no location: neither the item nor shared_location has one',
  DL_004: 'asset not found (or an unexpected server error, 500)',
  DL_005: 'invalid MAC address',
  DL_007: 'lat, lng or level out of range',
  DL_010: 'assets missing, empty or more than 500 items',
  DL_011: 'external_id matches no asset (and auto-create is off)',
  DL_012: 'item without mac_address or external_id (clear: no identifier at all)',
  DL_013: 'duplicate identifier in the request',
  DL_014: 'invalid external_id',
  DL_016: 'the virtual asset could not be created',
  DL_017: 'clear failed for this asset (for example an unknown MAC)',
};

/** The first test MAC of this example's block (70-74) whose asset does not exist yet. */
async function freeMac(client: RtlsClient, signal: AbortSignal): Promise<number> {
  for (let n = 70; n <= 74; n += 1) {
    try {
      await client.assets.get(testMac(n), { signal });
    } catch (err) {
      if (err instanceof NotFoundError) return n;
      throw err;
    }
  }
  return skip('no-fixture', 'no free test MAC (70-74)');
}

await runExample('12-declared-location', async ({ client, config, log, signal }) => {
  // ─── Read-only part ──────────────────────────────────────────────────────────
  const declared = await client.assets.list({ 'declared_location:exists': true, signal });
  log(`assets with a declared location: ${declared.length}`);
  for (const [code, meaning] of Object.entries(DL_CODES)) log(`  ${code}  ${meaning}`);

  if (!config.write) return;

  // ─── Write part (tier S: one declared position) ──────────────────────────────
  const pf = await preflightRules(client);
  if (!preflightAllows(pf, 'declared')) {
    skip('preflight', 'a declared position could fire an alert rule or reach a linked namespace');
  }
  let location: DeclaredLocation;
  const lat = getArg('lat', '');
  const lng = getArg('lng', '');
  if (lat !== '' && lng !== '') {
    location = { lat: Number(lat), lng: Number(lng) };
  } else {
    const d = await discover(client);
    const p = safePublishPoint(d);
    if (p === null) skip('no-fixture', 'no safe publish point');
    location = { ...p, map_uuid: d.mapUuid, venue_id: d.venueId };
  }
  location = { ...location, source: 'api', declared_via: 'rtls-api', device_id: 'sdk-example' };

  const n = await freeMac(client, signal);
  const mac = testMac(n);
  let created = false;
  try {
    await client.assets.create(
      mac,
      { user_name: testName(`ex12-${n}`), model: 'sdk-test', tags: ['sdk-test'] },
      { signal }
    );
    created = true;

    const result = await client.declaredLocations.bulkDeclare(
      { assets: [{ mac_address: mac, declared_location: location }] },
      { signal }
    );
    log(`declare: success=${result.success} failed=${result.failed} created=${result.created}`);
    for (const e of result.errors) log(`  ${e.identifier}: ${e.error} ${DL_CODES[e.error] ?? ''}`);

    const asset = await client.assets.get(mac, { signal });
    log(`stored location: lat=${asset.declared_location?.lat} lng=${asset.declared_location?.lng}`);

    const cleared = await client.declaredLocations.bulkClear({ mac_addresses: [mac] }, { signal });
    log(`clear: ${cleared.results.map((r) => `${r.mac_address} ${r.status}`).join(', ')}`);
  } finally {
    if (created) {
      await client.assets.delete(mac).catch((err: unknown) => {
        if (!(err instanceof NotFoundError)) throw err;
      });
      log(`deleted asset ${mac}`);
    }
  }
  // Reached only when the declare (the one published position) and the clean-up succeeded.
  reportBudget({ positions: 1, notifications: 0, ble: 0, etl: 0 });
});
