/**
 * Runtime helpers of the WebSocket client: readyState constants, implementation resolution, handshake
 * status parsing, redaction and frame decoding. Nothing here touches a global `WebSocket` constant.
 *
 * @module websocket/runtime
 * @internal
 */
import { WebSocketConnectionError } from './errors';
import type { WebSocketConstructorLike, WebSocketLike } from './types';

/** WebSocket readyState values (identical in every implementation). */
export const READY_STATE = { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 } as const;

/** Injectable environment of {@link resolveWebSocketImpl} (tests). */
export interface WsRuntimeDeps {
  /** Node (not Bun, not Deno). */
  isNode: boolean;
  /** Loads the `ws` module; resolves `undefined` when it is not installed. */
  importWs: () => Promise<unknown>;
  /** The global `WebSocket`, if any. */
  globalWebSocket: unknown;
}

const NO_IMPLEMENTATION =
  'No WebSocket implementation available: install "ws" (Node) or pass config.WebSocket';

/** Imports the optional `ws` package (resolved at run time, never bundled). */
function importWsModule(): Promise<unknown> {
  const WS_MODULE = 'ws';
  return import(/* webpackIgnore: true */ /* @vite-ignore */ WS_MODULE);
}

function runtimeDeps(): WsRuntimeDeps {
  const scope = globalThis as {
    process?: { versions?: Record<string, string | undefined> };
    Deno?: unknown;
    WebSocket?: unknown;
  };
  const versions = scope.process?.versions;
  return {
    isNode: Boolean(versions?.node) && !versions?.bun && scope.Deno === undefined,
    importWs: importWsModule,
    globalWebSocket: scope.WebSocket,
  };
}

/** The loaded module of each `importWs` function: one import per process; `undefined` on any failure. */
const loaded = new WeakMap<WsRuntimeDeps['importWs'], Promise<unknown>>();

async function loadWith(importWs: WsRuntimeDeps['importWs']): Promise<unknown> {
  try {
    return await importWs();
  } catch {
    return undefined;
  }
}

function load(importWs: WsRuntimeDeps['importWs']): Promise<unknown> {
  let module = loaded.get(importWs);
  if (module === undefined) {
    module = loadWith(importWs);
    loaded.set(importWs, module);
  }
  return module;
}

function wsClassOf(module: unknown): unknown {
  if (typeof module !== 'object' && typeof module !== 'function') return undefined;
  if (module === null) return undefined;
  const { WebSocket, default: fallback } = module as { WebSocket?: unknown; default?: unknown };
  return WebSocket ?? fallback;
}

/**
 * The implementation to construct: the injected one; else on Node the `ws` package (`module.WebSocket ??
 * module.default`), which gives protocol keepalive, the handshake status and header auth; else the global
 * `WebSocket`.
 *
 * @throws {WebSocketConnectionError} when none is available
 */
export async function resolveWebSocketImpl(
  injected?: WebSocketConstructorLike,
  deps: WsRuntimeDeps = runtimeDeps()
): Promise<WebSocketConstructorLike> {
  if (injected !== undefined) return injected;
  if (deps.isNode) {
    const impl = wsClassOf(await load(deps.importWs));
    if (typeof impl === 'function') return impl as WebSocketConstructorLike;
  }
  if (typeof deps.globalWebSocket === 'function') {
    return deps.globalWebSocket as WebSocketConstructorLike;
  }
  throw new WebSocketConnectionError(NO_IMPLEMENTATION);
}

/** A constructor that accepts `new Impl(url, { headers })`. */
export type WsHeaderConstructor = WebSocketConstructorLike &
  (new (url: string, options?: { headers?: Record<string, string> }) => WebSocketLike);

/** `true` for a ws-like implementation (its prototype has `ping`), which accepts `{ headers }`. */
export function isWsLike(impl: unknown): impl is WsHeaderConstructor {
  if (typeof impl !== 'function') return false;
  const prototype: unknown = impl.prototype;
  return (
    typeof prototype === 'object' &&
    prototype !== null &&
    typeof (prototype as { ping?: unknown }).ping === 'function'
  );
}

const HANDSHAKE_STATUS = /(?:Unexpected server response|Expected 101 status code)\D*(\d{3})/;

function messagesOf(event: unknown): string[] {
  if (typeof event === 'string') return [event];
  if (typeof event !== 'object' || event === null) return [];
  const { message, error } = event as { message?: unknown; error?: unknown };
  const found = typeof message === 'string' ? [message] : [];
  if (typeof error === 'string') found.push(error);
  else if (typeof error === 'object' && error !== null) {
    const nested = (error as { message?: unknown }).message;
    if (typeof nested === 'string') found.push(nested);
  }
  return found;
}

/** The HTTP status of a failed handshake, read from an error event (`ws`, Bun); `undefined` when unknown. */
export function handshakeStatus(event: unknown): number | undefined {
  for (const text of messagesOf(event)) {
    const match = HANDSHAKE_STATUS.exec(text);
    if (match?.[1] !== undefined) return Number(match[1]);
  }
  return undefined;
}

/** Origin and path of a URL, without query, fragment or user info. */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.replace(/[?#].*$/s, '');
  }
}

const CREDENTIAL_PARAM = /([?&](?:apiKey|token)=)[^&\s"']+/g;

/** Masks `apiKey=` / `token=` query values and every literal secret in `text`. */
export function redactSecrets(text: string, secrets: readonly string[] = []): string {
  let out = text.replace(CREDENTIAL_PARAM, '$1***');
  for (const secret of secrets) {
    if (secret.length > 0) out = out.split(secret).join('***');
  }
  return out;
}

const decoder = new TextDecoder();

/** A text frame as a string: strings as they are, `ArrayBuffer` and views decoded as UTF-8; else `undefined`. */
export function decodeFrame(data: unknown): string | undefined {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return decoder.decode(new Uint8Array(data));
  if (ArrayBuffer.isView(data)) {
    return decoder.decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  }
  return undefined;
}
