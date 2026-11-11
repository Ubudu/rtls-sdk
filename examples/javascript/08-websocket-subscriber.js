// Write section: tier none; budget positions=0 notifications=0 ble=0 etl=0; read skips none
/**
 * 08 — WebSocket subscriber (JavaScript twin of typescript/08-websocket-subscriber.ts).
 *
 * Opens the real-time stream with `client.createWebSocket()` (default context: namespace and credential of the
 * client, URLs derived from its base URL), subscribes to every kind (or `--types`, `--tag`) for `--seconds`
 * (default 20, at most 60), prints the connection and subscription state, drops ZONE_STATS_EVENTS with
 * `unsubscribe()` and prints a kinds histogram with one formatted line per kind. Read-only.
 *
 *   node javascript/08-websocket-subscriber.js [--seconds 20] [--types POSITIONS,ALERTS] [--tag <mac>]
 */
import { SubscriptionType } from 'ubudu-rtls-sdk';
import { getArg, isTestMac, runExample } from '../shared/config.js';

const MAX_SECONDS = 60;
/** @type {string[]} */
const VALID_TYPES = Object.values(SubscriptionType);

/**
 * @param {number} seconds
 * @param {AbortSignal} signal
 * @returns {Promise<void>}
 */
function waitSeconds(seconds, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, seconds * 1000);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * A tag id is printed only when it is a test MAC.
 *
 * @param {string | undefined} id
 */
const tagLabel = (id) => (id === undefined ? 'none' : isTestMac(id) ? id : '<tag id>');

runExample('08-websocket-subscriber', async ({ client, log, signal }) => {
  const seconds = Math.min(MAX_SECONDS, Math.max(1, Number(getArg('seconds', '20')) || 20));
  const types = getArg('types', '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const invalid = types.filter((t) => !VALID_TYPES.includes(t));
  if (invalid.length > 0) throw new Error(`unknown --types value(s): ${invalid.join(', ')}`);
  const tag = getArg('tag', '');

  /** @type {Map<string, number>} */
  const counts = new Map();
  /** @type {Map<string, string>} */
  const lines = new Map();
  /**
   * @param {string} kind
   * @param {string} line
   */
  const seen = (kind, line) => {
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
    if (!lines.has(kind)) lines.set(kind, line);
  };

  // No mapUuid: the unified client creates no publisher.
  const ws = client.createWebSocket({
    reconnect: { retryInitialConnect: true, maxAttempts: 3, initialDelayMs: 1_000 },
  });
  ws.on('POSITIONS', (p) =>
    seen(
      'POSITIONS',
      `zone ${p.zone.id} (${p.zone.id === 0 ? 'outside all zones' : 'zone'}), level ${p.level ?? '-'}, speed ${p.speed ?? '-'} m/s`
    )
  );
  ws.on('ZONES_ENTRIES_EVENTS', (e) =>
    seen(
      'ZONES_ENTRIES_EVENTS',
      `${e.event_type}, user_udid ${tagLabel(e.user_udid)}, zone ${e.zone === null ? 'outside all zones' : e.zone.properties.id}`
    )
  );
  ws.on('ZONE_STATS_EVENTS', (s) =>
    seen(
      'ZONE_STATS_EVENTS',
      `zone ${s.zone.properties.id}: total ${s.total}, total_tags ${s.total_tags}, avg_time ${s.avg_time} s`
    )
  );
  ws.on('ALERTS', (a) =>
    seen(
      'ALERTS',
      `style ${a.params?.style ?? '-'}, tag ${a.user_udid === undefined ? 'absent (zone-triggered rule)' : tagLabel(a.user_udid)}`
    )
  );
  ws.on('ASSETS', (a) =>
    seen('ASSETS', `action ${a.action}, data ${a.data ? 'present' : 'absent'}`)
  );
  ws.on('TAG_LOST', (t) => seen('TAG_LOST', `user_udid ${tagLabel(t.user_udid)}`));
  ws.on('ALERT_RULES_CHANGED', () => seen('ALERT_RULES_CHANGED', 'refetch the alert rules'));
  ws.on('ASSETS_LIBRARY_CHANGED', () =>
    seen('ASSETS_LIBRARY_CHANGED', 'refetch the asset library')
  );
  ws.on('DATA_MODELS_CHANGED', () => seen('DATA_MODELS_CHANGED', 'refetch the data models'));
  ws.on('SETTINGS_CHANGED', () => seen('SETTINGS_CHANGED', 'refetch the settings'));
  ws.on('MAP_DATA_CHANGED', () => seen('MAP_DATA_CHANGED', 'refetch the map data'));
  ws.on('unknown', () => seen('unknown', 'unrecognised message'));
  ws.on('reconnected', () =>
    log(
      'reconnected: delivery is at most once, so resync current state through REST (e.g. client.positions)'
    )
  );
  ws.on('error', (e) => log(`stream error: ${e.error.name}`));

  try {
    await ws.connect();
    /** @type {import('ubudu-rtls-sdk').SubscriptionRequest} */
    const request =
      types.length > 0 || tag !== ''
        ? {
            types:
              types.length > 0
                ? /** @type {import('ubudu-rtls-sdk').SubscriptionType[]} */ (types)
                : 'ALL',
            ...(tag !== '' ? { uuids: [tag] } : {}),
          }
        : 'ALL';
    // Rejects with WebSocketSubscriptionError when no confirmation arrives: the example then fails.
    const result = await ws.subscribe(request);
    log(
      `subscribed: types ${result.types === 'ALL' ? 'ALL' : result.types.join(',')}, tag filter ${result.uuids === null ? 'none' : `${result.uuids.length} id(s)`}`
    );
    log(`listening for ${seconds} s …`);
    await waitSeconds(seconds, signal);

    // The state of the stream, then a narrower subscription: unsubscribe() with types re-subscribes the rest.
    const status = ws.getConnectionStatus().subscriber;
    log(
      `state ${status.state}, reconnect attempts ${status.reconnectAttempts}, active kinds ${ws.getActiveSubscriptions().length}`
    );
    await ws.unsubscribe(['ZONE_STATS_EVENTS']);
    const stored = ws.getSubscription();
    log(
      `after unsubscribe(ZONE_STATS_EVENTS): ${stored === null ? 'no subscription' : `${stored.types === 'ALL' ? 'ALL' : stored.types.join(',') || 'none'}, active ${stored.active}`}`
    );
  } finally {
    await ws.disconnect();
  }

  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  log(`received ${total} message(s) in ${seconds} s`);
  for (const [kind, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    log(`  ${kind.padEnd(24)} ${String(n).padStart(6)}  e.g. ${lines.get(kind) ?? ''}`);
  }
});
