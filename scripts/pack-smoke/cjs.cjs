// Pack-smoke consumer, CommonJS (P0 §5.9 step 3). scripts/pack-smoke.mjs copies this file into
// .cache/pack/consumer/ and runs it there, so `require('ubudu-rtls-sdk')` resolves to the packed build. It
// creates a client with a fake `fetch` that answers /health with {"status":"OK"}, awaits client.health() and
// prints one line `PACK-SMOKE <json>` with the sorted export keys. Exit 0 on success, 1 otherwise. No network.
'use strict';

// The specifier is held in a constant so that the scripts typecheck project (which runs before the build)
// does not try to resolve the package; Node resolves it exactly as a literal require would.
const PACKAGE = 'ubudu-rtls-sdk';

/** @type {string[]} */
const requests = [];

/**
 * @param {unknown} input
 * @param {RequestInit} [init]
 * @returns {Promise<Response>}
 */
async function fakeFetch(input, init) {
  const request = input instanceof Request ? input : new Request(String(input), init);
  const url = new URL(request.url);
  requests.push(`${request.method} ${url.pathname}`);
  if (url.pathname.endsWith('/health')) {
    return new Response('{"status":"OK"}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response('{"error":"not found"}', {
    status: 404,
    headers: { 'content-type': 'application/json' },
  });
}

/** @param {Record<string, unknown>} result */
function report(result) {
  console.log(`PACK-SMOKE ${JSON.stringify({ kind: 'cjs', ...result })}`);
}

async function main() {
  /** @type {Record<string, any>} */
  const sdk = require(PACKAGE);
  const client = sdk.createRtlsClient({
    apiKey: 'sdk-test-dummy-key',
    baseUrl: 'http://pack-smoke.invalid/api',
    fetch: fakeFetch,
  });
  const health = await client.health();
  const ok = health !== null && typeof health === 'object' && health.status === 'OK';
  report({ ok, health, requests, exports: Object.keys(sdk).sort() });
  return ok ? 0 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    const e = /** @type {Error} */ (err);
    report({ ok: false, error: `${e?.name ?? 'Error'}: ${e?.message ?? String(err)}`, requests });
    process.exitCode = 1;
  }
);
