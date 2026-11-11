// Write section: tier none; budget positions=0 notifications=0 ble=0 etl=0; read skips none
/**
 * 01 - Getting started
 *
 * Creates a client from the example configuration, checks the API health, selects the first venue as the default
 * context, reads maps, assets and cached positions, and checks and formats a MAC address. Read-only.
 *
 *   npm run js -- javascript/01-getting-started.js      (from examples/)
 */
import { createRtlsClient, formatMac, isValidMac } from 'ubudu-rtls-sdk';
import { runExample } from '../shared/config.js';

await runExample('01-getting-started', async ({ config, log }) => {
  // 1. An explicit client: credentials and namespace come from the configuration, never from source code.
  const client = createRtlsClient({
    apiKey: config.apiKey,
    namespace: config.namespace,
    baseUrl: config.baseUrl,
  });

  // 2. Health check (GET /health).
  const health = await client.health();
  log(`health: ${health.status}`);

  // 3. Venues: the first one becomes the default venue of the client.
  const venues = await client.venues.list();
  log(`venues: ${venues.length}`);
  const venue = venues[0];
  if (!venue) throw new Error('the namespace has no venue');
  log(`first venue: id=${venue.id} name=${venue.name}`);
  client.setVenue(venue.id);

  // 4. Maps of the default venue.
  const maps = await client.venues.listMaps();
  log(`maps: ${maps.length}${maps[0] ? `, first map level ${maps[0].level}` : ''}`);

  // 5. Assets are namespace-wide (not venue-scoped).
  const assets = await client.assets.list();
  log(`assets: ${assets.length}`);
  for (const asset of assets.slice(0, 3)) {
    log(`  ${asset.user_name} (${asset.user_type ?? 'no type'})`);
  }
  const first = assets[0];
  log(`first asset has a name: ${typeof first?.user_name === 'string'}`);

  // 6. Cached positions: the last known position of every tracked asset.
  const positions = await client.positions.listCached();
  log(`cached positions: ${positions.length}`);
  /** @type {string | undefined} */
  let newest;
  for (const p of positions) {
    if (newest === undefined || Date.parse(p.timestamp) > Date.parse(newest)) newest = p.timestamp;
  }
  log(`newest position: ${newest ?? 'none'}`);

  // 7. MAC helpers: isValidMac() accepts any separator and case; formatMac() returns the display form.
  const typed = '02-5d-4b-00-00-01';
  log(`isValidMac(${typed}): ${isValidMac(typed)}, formatMac: ${formatMac(typed)}`);
});
