// @ts-check
// The `ws` module as examples see it in example mode (ws-hook.mjs maps `ws` here): the real exports, with
// `WebSocket` (also the default export) replaced by the class the harness guards (G16). This file's own `ws`
// import passes the hook and loads the real module.
import * as real from 'ws';

const guarded = /** @type {((Real: unknown) => typeof real.WebSocket) | undefined} */ (
  /** @type {Record<symbol, unknown>} */ (globalThis)[
    Symbol.for('ubudu.rtls-harness.guardedWsClass')
  ]
);
if (typeof guarded !== 'function') {
  throw new Error('ws: the example-mode guard is not installed (start with --import preload.mjs)');
}

/** The exports of ws/wrapper.mjs that @types/ws does not declare. */
const untyped = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (real));

export const WebSocket = guarded(real.WebSocket);
export const WebSocketServer = real.WebSocketServer;
export const createWebSocketStream = real.createWebSocketStream;
export const Receiver = untyped.Receiver;
export const Sender = untyped.Sender;
export const PerMessageDeflate = untyped.PerMessageDeflate;
export const extension = untyped.extension;
export const subprotocol = untyped.subprotocol;
export default WebSocket;
