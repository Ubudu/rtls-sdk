// Pack-smoke check `ws-no-global-esm` (P0 §5.9 step 4). Run from .cache/pack/consumer/ by
// scripts/pack-smoke.mjs. Removes the global WebSocket (as on Node 20), starts a `ws` server on 127.0.0.1:0,
// connects the packed RtlsWebSocketSubscriber to it through `subscriberUrl` and expects a SUBSCRIBE frame,
// which the server answers with { app_namespace, action: 'subscribeEvent' }. The subscription must be
// confirmed within 10 s. Prints one line `PACK-SMOKE <json>`; exit 0 on success, 1 otherwise. Loopback only.
import { WebSocketServer } from 'ws';

const PACKAGE = 'ubudu-rtls-sdk';
const DEADLINE_MS = 10_000;
const NAMESPACE = 'pack-smoke-ns';

Reflect.deleteProperty(globalThis, 'WebSocket');
const globalRemoved = typeof Reflect.get(globalThis, 'WebSocket') === 'undefined';

/** @type {string[]} */
const frames = [];
/** @type {WebSocketServer | undefined} */
let server;
let done = false;

/**
 * @param {Record<string, unknown>} result
 */
function finish(result) {
  if (done) return;
  done = true;
  clearTimeout(deadline);
  console.log(
    `PACK-SMOKE ${JSON.stringify({ kind: 'ws-no-global-esm', globalRemoved, frames, ...result })}`
  );
  const code = result.ok === true ? 0 : 1;
  if (server) server.close();
  // Reconnect timers of a failed client must not keep the process alive.
  setTimeout(() => process.exit(code), 50).unref();
  process.exitCode = code;
}

const deadline = setTimeout(
  () => finish({ ok: false, error: `no subscription confirmation within ${DEADLINE_MS / 1000} s` }),
  DEADLINE_MS
);

try {
  if (!globalRemoved) throw new Error('globalThis.WebSocket could not be removed');
  server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  const listening = server;
  await new Promise((resolve) => listening.once('listening', resolve));
  const address = listening.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  listening.on('connection', (socket) => {
    socket.on('message', (data) => {
      /** @type {{ type?: unknown; app_namespace?: unknown } | null} */
      let message;
      try {
        message = JSON.parse(String(data));
      } catch {
        frames.push('<not json>');
        return;
      }
      frames.push(String(message?.type));
      if (message?.type === 'SUBSCRIBE') {
        socket.send(
          JSON.stringify({ app_namespace: message.app_namespace, action: 'subscribeEvent' })
        );
      }
    });
  });

  /** @type {Record<string, any>} */
  const sdk = await import(PACKAGE);
  const subscriber = new sdk.RtlsWebSocketSubscriber({
    namespace: NAMESPACE,
    apiKey: 'sdk-test-dummy-key',
    subscriberUrl: `ws://127.0.0.1:${port}/api/ws/subscriber`,
    maxReconnectAttempts: 0,
    connectionTimeout: 5000,
  });
  await subscriber.connect();
  await subscriber.subscribe([]);
  await subscriber.disconnect();
  finish({ ok: frames.includes('SUBSCRIBE'), confirmed: true });
} catch (err) {
  const e = /** @type {Error & { cause?: Error }} */ (err);
  const cause = e?.cause?.message ? ` (cause: ${e.cause.message})` : '';
  finish({ ok: false, error: `${e?.name ?? 'Error'}: ${e?.message ?? String(err)}${cause}` });
}
