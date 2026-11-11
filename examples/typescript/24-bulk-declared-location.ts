// Write section: tier S; budget positions=1 notifications=0 ble=0 etl=0; read skips none
/**
 * 24 - Recipe: bulk declared location
 *
 * Read-only by default: finds a point of the map outside every zone and prints the declare it would make. With
 * --write it creates one test asset, declares its location at that point (the position server then publishes
 * one position for it), verifies the stored location and removes everything again in reverse order. The same
 * bulkDeclare call takes up to 500 assets.
 *
 *   npm run ts -- typescript/24-bulk-declared-location.ts      (from examples/)
 */
import { NotFoundError } from 'ubudu-rtls-sdk';
import {
  preflightAllows,
  preflightRules,
  reportBudget,
  runExample,
  skip,
  testMac,
  testName,
} from '../shared/config.js';
import { discover, safePublishPoint } from '../shared/discover.js';

const TOLERANCE = 1e-6;

await runExample('24-bulk-declared-location', async ({ client, config, log }) => {
  // 1. Fixture point: the venue's zones and the chosen map's features, and a grid point outside all of them.
  const discovery = await discover();
  const point = safePublishPoint(discovery);
  if (!point) skip('no-fixture', 'no point of the map lies outside every zone');
  const location = {
    lat: point.lat,
    lng: point.lng,
    level: point.level,
    map_uuid: discovery.mapUuid,
  };

  // 2. The plan: one test asset, one declared location, one published position.
  const mac = testMac(91);
  const name = testName('dl-1');
  log(`planned declare: 1 asset (${mac}) on level ${point.level}, outside every zone`);
  log(`planned point: ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`);
  log('expected budget: positions=1');

  if (!config.write) {
    log('read-only pass: nothing written (start with --write to declare)');
    return;
  }

  // Write section (tiers W + S). The rule preflight decides whether a declared position is safe here.
  const pf = await preflightRules();
  if (!preflightAllows(pf, 'declared'))
    skip('preflight', 'an alert rule may react to the declared position');

  // Existing-entity guard: asset creation is an upsert keyed by MAC, so the test MAC must be free.
  let exists = true;
  try {
    await client.assets.get(mac);
  } catch (e) {
    if (!(e instanceof NotFoundError)) throw e;
    exists = false;
  }
  if (exists) throw new Error(`test asset ${mac} already exists; nothing written`);

  let created = false;
  let declared = false;
  const problems: string[] = [];
  try {
    created = true;
    await client.assets.create(mac, { user_name: name });
    const asset = await client.assets.get(mac);
    if (asset.user_name !== name) throw new Error('the created asset has another name');
    log('created: 1 test asset');

    let result;
    try {
      declared = true;
      result = await client.declaredLocations.bulkDeclare({
        assets: [{ mac_address: mac }],
        shared_location: location,
        auto_create_virtual_assets: false,
      });
    } finally {
      reportBudget({ positions: 1 });
    }
    if (
      result.success !== 1 ||
      result.failed !== 0 ||
      result.created !== 0 ||
      result.errors.length !== 0
    ) {
      throw new Error(
        `declare: success=${result.success} failed=${result.failed} created=${result.created}`
      );
    }
    log('declared: 1 asset');

    const stored = (await client.assets.get(mac)).declared_location;
    if (!stored) throw new Error('the asset has no declared_location after the declare');
    if (
      Math.abs(stored.lat - point.lat) > TOLERANCE ||
      Math.abs(stored.lng - point.lng) > TOLERANCE
    ) {
      throw new Error('the stored declared location differs from the declared point');
    }
    log('verified: declared_location stored');

    // The synthetic position may take a moment to reach the cache; its timing is not asserted.
    let cached = false;
    for (let i = 0; i < 10 && !cached; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        await client.positions.getCached(mac);
        cached = true;
      } catch (e) {
        if (!(e instanceof NotFoundError)) throw e;
      }
    }
    log(`declared position in the cache within 10 s: ${cached}`);
  } finally {
    // Cleanup in reverse order: clear the declared location, delete the asset, check nothing is left.
    if (declared) {
      try {
        const cleared = await client.declaredLocations.bulkClear({ mac_addresses: [mac] });
        if (cleared.success !== 1) problems.push(`clear: success=${cleared.success}`);
      } catch (e) {
        problems.push(`clear failed: ${e instanceof Error ? e.name : 'error'}`);
      }
    }
    if (created) {
      try {
        await client.assets.delete(mac);
      } catch (e) {
        if (!(e instanceof NotFoundError))
          problems.push(`delete failed: ${e instanceof Error ? e.name : 'error'}`);
      }
    }
    try {
      await client.assets.get(mac);
      problems.push(`residue: test asset ${mac} still exists`);
    } catch (e) {
      if (!(e instanceof NotFoundError))
        problems.push(`residue check failed: ${e instanceof Error ? e.name : 'error'}`);
    }
    for (const p of problems) log(`cleanup problem: ${p}`);
  }
  if (problems.length > 0) throw new Error(`cleanup incomplete for ${mac}`);
  log('cleanup: declared location cleared, test asset deleted');
});
