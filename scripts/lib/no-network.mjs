// Offline proof preload (P0 §13). Load it into every Node process of a command with
//   NODE_OPTIONS="--import=$PWD/scripts/lib/no-network.mjs"
// It patches net.connect, net.createConnection, net.Socket.prototype.connect, tls.connect, dns.lookup
// and dns.promises.lookup so that any connection to a host other than 127.0.0.1, ::1 or localhost
// throws `no-network: <host>`. Unix-domain sockets and named pipes stay allowed. Because Node's fetch
// (undici) connects through net/tls, a fetch to a remote host fails too. It does not depend on proxy
// variables or on the Node version honouring them.
import dns from 'node:dns';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import tls from 'node:tls';

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);
const MARK = Symbol.for('rtls-sdk.no-network');

/**
 * @param {unknown} host
 * @returns {boolean}
 */
export function isLoopbackHost(host) {
  if (typeof host !== 'string') return false;
  const h = host
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/, '$1');
  return LOOPBACK.has(h);
}

/**
 * Error thrown for a blocked connection or lookup.
 *
 * @param {unknown} host
 * @returns {Error & { code: string }}
 */
function blocked(host) {
  const err = /** @type {Error & { code: string }} */ (new Error(`no-network: ${String(host)}`));
  err.code = 'ENONETWORK';
  return err;
}

/**
 * Target of a net/tls connect call, from any of its argument forms: `(options[, cb])`,
 * `(port[, host][, options][, cb])`, `(path[, cb])`, or the internal normalised `[options, cb]` array
 * that net.connect passes to Socket.prototype.connect.
 *
 * @param {unknown[]} args
 * @returns {{ ipc: true } | { ipc: false; host: string }}
 */
export function connectTarget(args) {
  let first = args[0];
  if (Array.isArray(first)) first = first[0];
  if (first !== null && typeof first === 'object') {
    const o = /** @type {{ path?: unknown; host?: unknown; hostname?: unknown }} */ (first);
    if (o.path !== undefined && o.path !== null) return { ipc: true };
    const host = o.host ?? o.hostname;
    return { ipc: false, host: typeof host === 'string' && host !== '' ? host : 'localhost' };
  }
  if (typeof first === 'string' && !/^\s*\d+\s*$/.test(first)) return { ipc: true };
  const second = args[1];
  if (typeof second === 'string' && second !== '') return { ipc: false, host: second };
  if (second !== null && typeof second === 'object') {
    const host = /** @type {{ host?: unknown }} */ (second).host;
    if (typeof host === 'string' && host !== '') return { ipc: false, host };
  }
  return { ipc: false, host: 'localhost' };
}

/**
 * @param {unknown[]} args
 */
function assertConnectAllowed(args) {
  const target = connectTarget(args);
  if (!target.ipc && !isLoopbackHost(target.host)) throw blocked(target.host);
}

/**
 * @template {(...a: any[]) => any} F
 * @param {F} original
 * @returns {F}
 */
function guardConnect(original) {
  if (/** @type {any} */ (original)[MARK]) return original;
  const wrapped = /** @type {F} */ (
    /** @type {unknown} */ (
      function (/** @type {unknown[]} */ ...args) {
        assertConnectAllowed(args);
        // @ts-ignore -- `this` is the socket for Socket.prototype.connect, undefined otherwise
        return original.apply(this, args);
      }
    )
  );
  Object.defineProperty(wrapped, MARK, { value: true });
  return wrapped;
}

if (!(/** @type {any} */ (globalThis)[MARK])) {
  Object.defineProperty(globalThis, MARK, { value: true });

  net.connect = guardConnect(net.connect);
  net.createConnection = guardConnect(net.createConnection);
  net.Socket.prototype.connect = guardConnect(net.Socket.prototype.connect);
  tls.connect = guardConnect(tls.connect);

  const lookup = dns.lookup;
  const guardedLookup = /** @type {typeof dns.lookup} */ (
    /** @type {unknown} */ (
      function (/** @type {unknown} */ hostname, /** @type {unknown[]} */ ...rest) {
        if (!isLoopbackHost(hostname)) throw blocked(hostname);
        // @ts-ignore -- forwarded unchanged
        return lookup.call(dns, hostname, ...rest);
      }
    )
  );
  dns.lookup = guardedLookup;

  const promiseLookup = dns.promises.lookup;
  dns.promises.lookup = /** @type {typeof dns.promises.lookup} */ (
    /** @type {unknown} */ (
      async function (/** @type {unknown} */ hostname, /** @type {unknown[]} */ ...rest) {
        if (!isLoopbackHost(hostname)) throw blocked(hostname);
        // @ts-ignore -- forwarded unchanged
        return promiseLookup.call(dns.promises, hostname, ...rest);
      }
    )
  );

  // Keep `import { connect } from 'node:net'` style named imports in sync with the patched objects.
  syncBuiltinESMExports();
}
