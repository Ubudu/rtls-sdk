// Write section: tier S; budget positions=0 notifications=0 ble=0 etl=0; read skips no-fixture
/**
 * 09 — WebSocket publisher.
 *
 * Connects the publisher socket and prints the position it would send for the test MAC `testMac(76)`. It
 * publishes exactly one position only when started with `--write` and all of `--map <uuid> --lat <lat>
 * --lon <lon>`; otherwise nothing is sent. The guarded write pass passes no other option, so it publishes
 * nothing (the header budget counts that run). A publish is a direct run in your own namespace, with
 * `RTLS_IT_WRITES=1 RTLS_IT_SIDE_EFFECTS=1` on the command line (else `SKIPPED: tier`); it prints
 * `BUDGET positions=1`.
 *
 * The point must lie outside every zone, and the namespace's enabled alert rules must not be able to match a test
 * MAC at zone 0: a position outside every zone still produces zone-0 events that the alert rules evaluate.
 * WebSocket publishing is fire-and-forget (no acknowledgement, no error frame); use the HTTP publish
 * `client.positions.publish(…)` when you need an acknowledged delivery.
 *
 *   npx tsx typescript/09-websocket-publisher.ts [--map <uuid> --lat <lat> --lon <lon>] [--help]
 */
import type { RtlsClient, WebSocketPublishPositionData } from 'ubudu-rtls-sdk';
import {
  getArg,
  hasFlag,
  preflightAllows,
  preflightRules,
  reportBudget,
  runExample,
  skip,
  testMac,
} from '../shared/config.js';

const HELP = `usage: 09-websocket-publisher [--map <uuid> --lat <lat> --lon <lon>] [--write]
  Publishes one position for a test MAC only with --write and all of --map, --lat and --lon.
  The point must lie outside every zone, and the enabled alert rules of the namespace must not be able
  to match a test MAC at zone 0.`;

/** The uuid of the first map of the first venue (read-only), or '' when there is none. */
async function firstMapUuid(client: RtlsClient): Promise<string> {
  const venues = await client.venues.list();
  const venueId = venues.map((v) => v.id).find((id) => typeof id === 'number');
  if (typeof venueId !== 'number') return '';
  const maps = await client.venues.listMaps({ venueId });
  const map = maps.find((m) => typeof m.uuid === 'string' && m.uuid !== '');
  return typeof map?.uuid === 'string' ? map.uuid : '';
}

runExample('09-websocket-publisher', async ({ client, config, log }) => {
  if (hasFlag('help')) {
    log(HELP);
    return;
  }
  const mapArg = getArg('map', '');
  const latArg = getArg('lat', '');
  const lonArg = getArg('lon', '');
  const explicit = mapArg !== '' && latArg !== '' && lonArg !== '';
  if (explicit && (!Number.isFinite(Number(latArg)) || !Number.isFinite(Number(lonArg)))) {
    throw new Error('--lat and --lon must be numbers');
  }

  const mapUuid = mapArg !== '' ? mapArg : await firstMapUuid(client);
  if (mapUuid === '') skip('no-fixture', 'no venue map with a uuid');
  const position: WebSocketPublishPositionData = {
    macAddress: testMac(76),
    latitude: explicit ? Number(latArg) : 0,
    longitude: explicit ? Number(lonArg) : 0,
  };

  const ws = client.createWebSocket({ mapUuid, reconnect: false });
  ws.on('publisher:error', (e) => log(`publisher error: ${e.error.name}`));
  try {
    await ws.connect({ publisherOnly: true });
    log('publisher connected');
    log(
      `position it would send: ${JSON.stringify({ ...position, ...(explicit ? {} : { latitude: '<--lat>', longitude: '<--lon>' }) })}`
    );
    log(
      'frame keys: app_namespace, user_uuid, lat, lon, map_uuid, timestamp (no defaults are added)'
    );
    log(
      'fire-and-forget: success means "handed to the socket"; the broker sends no acknowledgement'
    );

    if (explicit && config.write) {
      const verdicts = await preflightRules();
      if (!preflightAllows(verdicts, 'publish'))
        skip('preflight', 'an enabled alert rule may match a zone-0 test position');
      const result = await ws.sendPosition(position);
      reportBudget({ positions: 1 });
      if (!result.success) throw new Error(`publish failed: ${result.error ?? 'unknown'}`);
      log('published 1 position');
    } else {
      log('pass --map, --lat and --lon of a point outside every zone to publish');
      reportBudget({ positions: 0 });
    }
    log('acknowledged alternative: client.positions.publish(…) over HTTP');
  } finally {
    await ws.disconnect();
  }
});
