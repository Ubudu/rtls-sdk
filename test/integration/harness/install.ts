// installGuards (P0 §6.2): wraps `globalThis.fetch` with the guarded fetch and `globalThis.WebSocket`
// (when present) with the guarded class. The replaced fetch is kept: the live context sends through it.
//
// The integration run uses one forked worker for every test file (`singleFork`), and vitest evaluates the
// harness modules afresh for each file while `globalThis` persists. The true originals are therefore kept once
// per process under a global symbol: a later module instance installs its own guarded fetch over them instead
// of wrapping the guarded fetch of an earlier file (one guard layer, the current file's context).
import { originalFetch, setOriginalFetch } from './active';
import { guardedFetch } from './guard';
import { guardWebSocket } from './ws-guard';

const ORIGINALS = Symbol.for('ubudu-rtls-sdk.harness.originals');

interface ProcessOriginals {
  fetch: typeof fetch;
  WebSocket: (new (...a: never[]) => { send(d: string): void; close(): void }) | null;
}

type GlobalSlots = Record<PropertyKey, unknown> & { WebSocket?: unknown };

/** The fetch and WebSocket this process had before any harness module installed its guards, or null. */
export function processOriginals(): Readonly<ProcessOriginals> | null {
  return ((globalThis as GlobalSlots)[ORIGINALS] as ProcessOriginals | undefined) ?? null;
}

export function installGuards(): void {
  if (originalFetch() !== null) return;
  const g = globalThis as GlobalSlots;
  let originals = g[ORIGINALS] as ProcessOriginals | undefined;
  if (!originals) {
    originals = {
      fetch: globalThis.fetch,
      WebSocket:
        typeof g.WebSocket === 'function' ? (g.WebSocket as ProcessOriginals['WebSocket']) : null,
    };
    g[ORIGINALS] = originals;
  }
  setOriginalFetch(originals.fetch);
  globalThis.fetch = guardedFetch;
  if (originals.WebSocket) g.WebSocket = guardWebSocket(originals.WebSocket);
}

/** @internal restores what installGuards replaced (harness unit tests). */
export function uninstallGuards(): void {
  if (originalFetch() === null) return;
  const g = globalThis as GlobalSlots;
  const originals = g[ORIGINALS] as ProcessOriginals | undefined;
  setOriginalFetch(null);
  if (!originals) return;
  globalThis.fetch = originals.fetch;
  if (originals.WebSocket) g.WebSocket = originals.WebSocket;
  delete g[ORIGINALS];
}
