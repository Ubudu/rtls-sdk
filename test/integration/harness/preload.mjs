// @ts-check
// Guard entry point for processes outside vitest (P0 §6.2 `preload.mjs`, P9 H-P0-9; LIVE-TESTING §2.1):
//
//   node --import <abs>/test/integration/harness/preload.mjs <file.js> [--write] [args…]
//   npx tsx --import <abs>/test/integration/harness/preload.mjs <file.ts> [--write] [args…]
//
// Registers tsx only when TypeScript imports are not already supported (under `npx tsx` they are), registers
// ws-hook.mjs (ESM resolve hook and CommonJS resolver hook: `ws` → the guarded class), then loads preload.ts, which
// installs the guards in example mode and, in a `--write` process, computes the run's preflight before the
// example's own code runs (top-level await).
import { register } from 'node:module';
import { installCjsWsHook } from './ws-hook.mjs';

/**
 * True when an extensionless import of a harness TypeScript module resolves to its `.ts` file (tsx is active).
 * Node's own type stripping is not enough: the harness uses extensionless imports and parameter properties.
 *
 * @returns {boolean}
 */
function typeScriptImportsSupported() {
  try {
    return import.meta.resolve('./active').endsWith('.ts');
  } catch {
    return false;
  }
}

if (!typeScriptImportsSupported()) {
  const { register: registerTsx } = await import('tsx/esm/api');
  registerTsx();
}
register('./ws-hook.mjs', import.meta.url);
installCjsWsHook();
// Computed specifier: the TypeScript module is loaded at run time only (not by the scripts typecheck project).
await import(new URL('./preload.ts', import.meta.url).href);
