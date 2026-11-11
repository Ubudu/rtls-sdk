// @ts-check
// `ws` guard of the example mode (LIVE-TESTING §2.1, P0 §6.2 `ws-hook.mjs`). preload.mjs registers this file as an
// ESM resolve hook (`module.register`) and calls `installCjsWsHook()` for the CommonJS resolver, so that
// `import('ws')`, `import 'ws'` and `require('ws')` from any module resolve to a guarded module: the real `ws`
// exports with `WebSocket` (also the default export) replaced by the guarded class (ws-guarded.mjs for ESM,
// ws-guarded.cjs for CommonJS). The guarded modules themselves load the real `ws` (their own imports pass
// through). The guarded class comes from the harness through a global the example-mode preload sets, so one class
// guards both module systems.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/** URL of the guarded ESM module. */
export const GUARDED_WS_ESM_URL = new URL('./ws-guarded.mjs', import.meta.url).href;
/** URL and path of the guarded CommonJS module. */
export const GUARDED_WS_CJS_URL = new URL('./ws-guarded.cjs', import.meta.url).href;
export const GUARDED_WS_CJS_PATH = fileURLToPath(GUARDED_WS_CJS_URL);
/** Global under which the preload publishes `guardedWsClass(RealWebSocket)`. */
export const WS_GUARD_GLOBAL = Symbol.for('ubudu.rtls-harness.guardedWsClass');

/**
 * @param {string | undefined} parent
 * @returns {boolean}
 */
function isGuardedModule(parent) {
  return parent === GUARDED_WS_ESM_URL || parent === GUARDED_WS_CJS_URL;
}

/**
 * ESM resolve hook: `ws` → the guarded module (the CommonJS one for a `require` resolution), except inside the
 * guarded modules themselves.
 *
 * @param {string} specifier
 * @param {{ conditions?: readonly string[]; parentURL?: string }} context
 * @param {(specifier: string, context?: object) => unknown} nextResolve
 * @returns {Promise<unknown>}
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'ws' && !isGuardedModule(context.parentURL)) {
    const required = (context.conditions ?? []).includes('require');
    return {
      url: required ? GUARDED_WS_CJS_URL : GUARDED_WS_ESM_URL,
      format: required ? 'commonjs' : 'module',
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}

const HOOKED = Symbol.for('ubudu.rtls-harness.cjsWsHook');

/**
 * Hooks `Module._resolveFilename` (main thread): `require('ws')` from any module but ws-guarded.cjs resolves to
 * ws-guarded.cjs. Idempotent.
 */
export function installCjsWsHook() {
  /** @type {any} */
  const Module = createRequire(import.meta.url)('node:module');
  if (Module[HOOKED]) return;
  const original = Module._resolveFilename;
  /**
   * @this {unknown}
   * @param {string} request
   * @param {{ filename?: string } | undefined} parent
   * @param {...unknown} rest
   */
  Module._resolveFilename = function resolveFilename(request, parent, ...rest) {
    if (request === 'ws' && parent?.filename !== GUARDED_WS_CJS_PATH) return GUARDED_WS_CJS_PATH;
    return original.call(this, request, parent, ...rest);
  };
  Module[HOOKED] = true;
}
