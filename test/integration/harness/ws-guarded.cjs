'use strict';
// The `ws` module as CommonJS examples see it in example mode (ws-hook.mjs maps `require('ws')` here): the guarded
// class (G16), which extends the real one, so the real statics (`Server`, `WebSocketServer`, `Receiver`, …) stay
// reachable and `WebSocket` names the guarded class. This file's own `require('ws')` loads the real module.
const real = require('ws');

const guarded = globalThis[Symbol.for('ubudu.rtls-harness.guardedWsClass')];
if (typeof guarded !== 'function') {
  throw new Error('ws: the example-mode guard is not installed (start with --import preload.mjs)');
}

module.exports = guarded(real);
