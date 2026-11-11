// Dist smoke of the WebSocket client, CommonJS build (spec P8 §8.2 "Smoke scripts", P8-T13; run by
// `npm run test:pack` after the build). Proves B5 and B7 fixed on the built artefact: without a global
// WebSocket, dist/index.cjs resolves `ws`, connects to a loopback `ws` server, subscribes (the server confirms
// SUBSCRIBE exactly as the broker does) and disconnects. Exit 0 on success, 1 on any error. Loopback only.
'use strict';
const path = require('node:path');
const { WebSocketServer } = require('ws');

const NAMESPACE = 'test_namespace';
const DEADLINE_MS = 10_000;

let server;
const deadline = setTimeout(
  () => fail(new Error(`no result within ${DEADLINE_MS / 1000} s`)),
  DEADLINE_MS
);

function done(code, line) {
  clearTimeout(deadline);
  process.stdout.write(`${line}\n`);
  if (server) server.close();
  process.exitCode = code;
  setTimeout(() => process.exit(code), 50).unref();
}

function fail(err) {
  done(1, `dist-smoke-cjs: FAIL ${err?.name ?? 'Error'}: ${err?.message ?? String(err)}`);
}

async function main() {
  Reflect.deleteProperty(globalThis, 'WebSocket');
  if (typeof Reflect.get(globalThis, 'WebSocket') !== 'undefined')
    throw new Error('globalThis.WebSocket could not be removed');

  server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  const frames = [];
  server.on('connection', (socket) => {
    socket.on('message', (data) => {
      const frame = JSON.parse(String(data));
      frames.push(frame.type);
      if (frame.type === 'SUBSCRIBE' && frame.app_namespace === NAMESPACE)
        socket.send(JSON.stringify({ app_namespace: NAMESPACE, action: 'subscribeEvent' }));
    });
  });

  const sdk = require(path.join(__dirname, '..', '..', '..', 'dist', 'index.cjs'));
  const subscriber = new sdk.RtlsWebSocketSubscriber({
    namespace: NAMESPACE,
    apiKey: 'sdk-test-dummy-key',
    subscriberUrl: `ws://127.0.0.1:${port}/api/ws/subscriber`,
    reconnect: false,
    connectionTimeout: 5_000,
  });
  await subscriber.connect();
  const result = await subscriber.subscribe('ALL');
  if (result?.success !== true || result.types !== 'ALL')
    throw new Error('subscription not confirmed');
  await subscriber.disconnect();
  if (subscriber.getState() !== 'DISCONNECTED') throw new Error('not disconnected');
  if (frames.join(',') !== 'SUBSCRIBE') throw new Error(`unexpected frames: ${frames.join(',')}`);
  done(0, 'dist-smoke-cjs: OK');
}

main().catch(fail);
