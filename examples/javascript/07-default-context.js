// Write section: tier none; budget positions=0 notifications=0 ble=0 etl=0; read skips none
/**
 * 07 - Default context
 *
 * A client carries a default namespace, venue, map and level; scoped clients copy the context without changing
 * the original. The namespace and venue defaults apply wherever a call needs them and does not pass its own
 * value. The default level applies to navigation and to the spatial zone and POI lookups only: venue and zone
 * listings take `level` per call. The default map is read only by the deprecated map routes. Missing context
 * raises a ContextError before any request is sent. Read-only.
 *
 *   npm run js -- javascript/07-default-context.js      (from examples/)
 */
import { ContextError, createRtlsClient } from 'ubudu-rtls-sdk';
import { runExample } from '../shared/config.js';

await runExample('07-default-context', async ({ client, config, log }) => {
  // 1. The namespace set at creation is the default of every call.
  const assets = await client.assets.list();
  log(`assets (default namespace): ${assets.length}`);

  // 2. A per-call namespace wins over the default. The same value is used here; another namespace is passed the
  //    same way.
  const sameAssets = await client.assets.list({ namespace: config.namespace });
  log(`assets (per-call namespace): ${sameAssets.length}`);

  // 3. A default venue for venue-scoped resources, and a per-call venueId.
  const [venue] = await client.venues.list();
  if (!venue) throw new Error('the namespace has no venue');
  client.setVenue(venue.id);
  const zones = await client.zones.list();
  log(`zones (default venue): ${zones.features.length}`);
  const zonesPerCall = await client.zones.list({ venueId: venue.id });
  log(`zones (per-call venueId): ${zonesPerCall.features.length}`);

  // 4. Scoped clients: forNamespace(), forVenue(), forMap() and withContext() return new clients; the original
  //    keeps its context.
  const maps = await client.venues.listMaps();
  const map = maps[0];
  if (!map) throw new Error('the venue has no map');
  const nsClient = client.forNamespace(config.namespace);
  const venueClient = client.forVenue(venue.id);
  const mapClient = client.forMap(map.id, { level: map.level });
  const ctxClient = client.withContext({ venueId: venue.id, mapId: map.id });
  log(
    `forNamespace keeps the venue: ${nsClient.venueId === venue.id}, forVenue sets the venue: ${venueClient.venueId === venue.id}`
  );
  log(
    `forMap sets the map and level: ${mapClient.mapId === map.id && mapClient.level === map.level}, withContext sets the map: ${ctxClient.mapId === map.id}`
  );
  log(`original client still has no default map: ${client.mapId === undefined}`);

  // 5. setContext() sets several defaults at once. Venue and zone listings do not apply the default level:
  //    pass `level` per call to list one floor.
  client.setContext({ mapId: map.id, level: map.level });
  log(
    `setContext sets the map and level: ${client.mapId === map.id && client.level === map.level}`
  );
  const levelZones = await client.zones.list({ level: map.level });
  log(`zones on level ${map.level}: ${levelZones.features.length}`);
  const levelPois = await client.venues.listPois({ level: map.level });
  log(`venue POIs on level ${map.level}: ${levelPois.features.length}`);

  // 6. clearContext() removes every default: the next venue-scoped call raises ContextError, nothing is sent.
  client.clearContext();
  try {
    await client.zones.list();
    throw new Error('zones.list() without context did not raise');
  } catch (e) {
    if (!(e instanceof ContextError)) throw e;
    log(`after clearContext: ContextError for ${e.field}`);
  }

  // 7. Navigation always needs a venue: without one the SDK raises ContextError locally.
  const noVenue = createRtlsClient({
    apiKey: config.apiKey,
    namespace: config.namespace,
    baseUrl: config.baseUrl,
  });
  try {
    await noVenue.navigation.shortestPath({ start: 'a', end: 'b' });
    throw new Error('shortestPath() without a venue did not raise');
  } catch (e) {
    if (!(e instanceof ContextError)) throw e;
    log(`navigation without a venue: ContextError for ${e.field}`);
  }
});
