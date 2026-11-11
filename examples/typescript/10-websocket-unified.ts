// Write section: tier S; budget positions=1 notifications=0 ble=0 etl=0; read skips none
/**
 * 10 — WebSocket unified client.
 *
 * One `client.createWebSocket({ mapUuid })` drives the subscriber and the publisher: it subscribes to every kind
 * for `--seconds` (default 15, at most 60), prints a kinds histogram and the forwarded `publisher:*` events.
 * With `--write` it publishes one position for the test MAC `testMac(77)` at a point outside every zone and waits
 * up to 10 s for it to come back through the subscriber. Without `--write` it prints the point it would use.
 *
 * Before publishing: the shared rule preflight must allow it (the enabled alert rules cannot match a test MAC at
 * zone 0), and the point comes from `--map/--lat/--lon` or from `discover()` and `safePublishPoint()`.
 *
 *   npx tsx typescript/10-websocket-unified.ts [--seconds 15] [--map <uuid> --lat <lat> --lon <lon>]
 *
 * Write section, through the guarded runner only:
 * `RTLS_IT_WRITES=1 RTLS_IT_SIDE_EFFECTS=1 npm run examples:check -- 10 --write`.
 */
import type { PositionMessage } from 'ubudu-rtls-sdk';
import {
  getArg,
  preflightAllows,
  preflightRules,
  reportBudget,
  runExample,
  skip,
  testMac,
  type PreflightVerdicts,
} from '../shared/config.js';
import { discover, safePublishPoint } from '../shared/discover.js';

const MAX_SECONDS = 60;

function waitSeconds(seconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, seconds * 1000);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

runExample('10-websocket-unified', async ({ client, config, log, signal }) => {
  // Write-section guard 1: the shared rule preflight, before any other write-section request.
  const verdicts: PreflightVerdicts | null = config.write ? await preflightRules() : null;

  const seconds = Math.min(MAX_SECONDS, Math.max(1, Number(getArg('seconds', '15')) || 15));
  const mapArg = getArg('map', '');
  const latArg = getArg('lat', '');
  const lonArg = getArg('lon', '');
  const explicit = mapArg !== '' && latArg !== '' && lonArg !== '';

  // Read-only discovery: the first venue map and a point outside every zone, 10 m from every edge.
  const discovery = await discover();
  const derived = safePublishPoint(discovery);
  const mapUuid = explicit ? mapArg : discovery.mapUuid;
  const point = explicit ? { lat: Number(latArg), lng: Number(lonArg) } : derived;
  log(
    `publish point: ${point === null ? 'null (no safe publish point)' : `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`}`
  );

  const kinds = new Map<string, number>();
  const ws = client.createWebSocket({
    mapUuid,
    reconnect: { maxAttempts: 2, initialDelayMs: 1_000 },
  });
  for (const kind of [
    'POSITIONS',
    'ZONES_ENTRIES_EVENTS',
    'ZONE_STATS_EVENTS',
    'ALERTS',
    'ASSETS',
    'TAG_LOST',
    'ALERT_RULES_CHANGED',
    'ASSETS_LIBRARY_CHANGED',
    'DATA_MODELS_CHANGED',
    'SETTINGS_CHANGED',
    'MAP_DATA_CHANGED',
  ] as const) {
    ws.on(kind, () => kinds.set(kind, (kinds.get(kind) ?? 0) + 1));
  }
  ws.on('publisher:connected', () => log('event publisher:connected'));
  ws.on('publisher:disconnected', (d) => log(`event publisher:disconnected (code ${d.code})`));
  ws.on('publisher:error', (e) => log(`event publisher:error (${e.error.name})`));
  ws.on('reconnected', () => log('reconnected: resync current state through REST'));

  try {
    await ws.connect();
    log(
      `connected: subscriber ${ws.isSubscriberConnected()}, publisher ${ws.isPublisherConnected()}`
    );
    const result = await ws.subscribe('ALL');
    log(`subscribed: ${result.types === 'ALL' ? 'ALL' : result.types.join(',')}`);
    await waitSeconds(seconds, signal);
    for (const [kind, n] of [...kinds.entries()].sort((a, b) => b[1] - a[1])) {
      log(`  ${kind.padEnd(24)} ${String(n).padStart(6)}`);
    }

    if (!config.write || verdicts === null) {
      log('read-only: no position sent (start with --write to publish one test position)');
      return;
    }
    // Write-section guards 2 and 3.
    if (!preflightAllows(verdicts, 'publish'))
      skip('preflight', 'an enabled alert rule may match a zone-0 test position');
    if (point === null) skip('no-fixture', 'no safe publish point');

    const mac = testMac(77);
    await ws.setTagFilter([mac]);
    const back: PositionMessage[] = [];
    ws.on('POSITIONS', (p) => {
      if (p.user_uuid === mac) back.push(p);
    });
    const sent = await ws.sendPosition({
      macAddress: mac,
      latitude: point.lat,
      longitude: point.lng,
      mapUuid,
    });
    reportBudget({ positions: 1 });
    if (!sent.success) throw new Error(`publish failed: ${sent.error ?? 'unknown'}`);
    const deadline = Date.now() + 10_000;
    while (back.length === 0 && Date.now() < deadline && !signal.aborted) {
      await waitSeconds(0.2, signal);
    }
    if (back.length === 0) throw new Error('the published position did not come back within 10 s');
    log(
      `position for ${mac} came back: zone ${back[0]?.zone.id}, origin ${back[0]?.origin ?? '-'}`
    );
  } finally {
    await ws.disconnect();
  }
});
