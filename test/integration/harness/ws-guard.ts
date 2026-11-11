// WebSocket guard (P0 §5.3 G16). `guardWebSocket(impl)` returns a class that extends `impl` (the global
// WebSocket or the `ws` class): it keeps `ping()`, `terminate()` and `on('pong')`, accepts
// `new Guarded(url, { headers })`, and a subclass of it still sends every connect and frame through the
// guard. Connect: G1 host, path `<base>/ws/subscriber` or `<base>/ws/publisher`, `app_namespace` query =
// APP_NAMESPACE. A foreign credential may connect (negative auth test) but never send. Frames: JSON object
// with `app_namespace === APP_NAMESPACE` and no `targetApplications` entry naming another namespace, no
// `patch_asset_data` / `declared_location` / `network_uuid`, no `CLEAR_DATA` / `UPDATE_MAP_DATA`; subscriber
// types SUBSCRIBE / UNSUBSCRIBE / FILTER_MGT; publisher frames only in tier S, with a test-MAC `user_uuid`,
// counted as positions before the frame leaves (G7 recording), and refused by G18 when the preflight is unsafe
// (a time-limited verdict past its end included) or when a test MAC of the frame is outside this run's range.
// Hard socket lifetime 120 s. Never logs the URL or headers.
import { activeHarness } from './active';
import type { Harness, SocketRecord, WebSocketLike } from './context';
import { raiseViolation } from './guard';
import { isRunTestMac, isTestMac, normalizeMacLike } from './names';
import {
  DUMMY_API_KEY,
  failedVerdicts,
  httpOrigin,
  isPlainObject,
  looksLikeMac,
  LOOPBACK_HOSTS,
  MAC_KEYS,
  NAMESPACE_LIST_KEYS,
  namespaceListOk,
  SOCKET_LIFETIME_MS,
  unreachableTarget,
} from './policy';

export type { SocketRecord, WebSocketLike };

type SocketKind = 'subscriber' | 'publisher' | 'unreachable' | 'local';

interface SocketState {
  harness: Harness;
  kind: SocketKind;
  configured: boolean;
  template: string | null;
  record: SocketRecord;
  timer?: ReturnType<typeof setTimeout>;
}

const SUBSCRIBER_TYPES = new Set(['SUBSCRIBE', 'UNSUBSCRIBE', 'FILTER_MGT']);
const FORBIDDEN_TYPES = new Set(['CLEAR_DATA', 'UPDATE_MAP_DATA']);
const FORBIDDEN_KEYS = ['patch_asset_data', 'declared_location', 'network_uuid'];
const states = new WeakMap<object, SocketState>();

function optionsOf(second: unknown, third: unknown): Record<string, unknown> | undefined {
  if (isPlainObject(second)) return second;
  if (isPlainObject(third)) return third;
  return undefined;
}

function headersOf(options: Record<string, unknown> | undefined): Record<string, string> {
  const headers = options?.headers;
  if (!isPlainObject(headers)) return {};
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === 'string') out[name.toLowerCase()] = value;
  }
  return out;
}

function credentialsOf(url: URL, headers: Record<string, string>): string[] {
  const values = [...url.searchParams.getAll('apiKey'), ...url.searchParams.getAll('token')];
  if (headers['x-api-key'] !== undefined) values.push(headers['x-api-key']);
  if (headers.authorization !== undefined)
    values.push(headers.authorization.replace(/^Bearer\s+/i, ''));
  return values;
}

function redact(url: URL): string {
  const copy = new URL(url.href);
  for (const name of ['apiKey', 'token']) {
    if (copy.searchParams.has(name)) copy.searchParams.set(name, '<redacted>');
  }
  return copy.href;
}

interface PreparedSocket {
  kind: SocketKind;
  configured: boolean;
  template: string | null;
  url: string;
  headerNames: string[];
}

function prepareConnect(
  h: Harness,
  rawUrl: unknown,
  second: unknown,
  third: unknown
): PreparedSocket {
  const fail = (template: string | null, reason: string): Error =>
    raiseViolation(h, 'G16', 'WS', template, reason);
  let url: URL;
  try {
    url = new URL(String(rawUrl));
  } catch {
    throw fail(null, 'not an absolute WebSocket URL');
  }
  const options = optionsOf(second, third);
  if (options?.followRedirects)
    throw fail(null, 'followRedirects is never enabled (a redirect would skip the guard)');
  const headers = headersOf(options);
  const credentials = credentialsOf(url, headers);
  const base = { url: redact(url), headerNames: Object.keys(headers) };
  if (unreachableTarget(url)) {
    if (credentials.some((c) => c !== DUMMY_API_KEY)) {
      throw fail(null, 'an unreachable URL carries a credential other than the dummy key');
    }
    return { ...base, kind: 'unreachable', configured: false, template: null };
  }
  const port = Number(url.port);
  if (
    LOOPBACK_HOSTS.has(url.hostname) &&
    h.localWebSocketPorts.has(port) &&
    httpOrigin(url) !== h.env.origin
  ) {
    return { ...base, kind: 'local', configured: false, template: null };
  }
  if (httpOrigin(url) !== h.env.origin)
    throw fail(null, 'host differs from the configured base URL');
  const path = url.pathname.replace(/\/+$/, '');
  let kind: SocketKind;
  if (path === `${h.env.basePath}/ws/subscriber`) kind = 'subscriber';
  else if (path === `${h.env.basePath}/ws/publisher`) kind = 'publisher';
  else throw fail(null, 'path is neither the subscriber nor the publisher endpoint');
  const template = `/ws/${kind}`;
  if (url.searchParams.getAll('app_namespace').some((ns) => ns !== h.env.namespace)) {
    throw fail(template, 'app_namespace differs from APP_NAMESPACE');
  }
  const configured = credentials.length > 0 && credentials.every((c) => c === h.env.apiKey);
  return { ...base, kind, configured, template };
}

/**
 * The constructor arguments with the `ws` options (second or third argument) forced to `followRedirects: false,
 * maxRedirects: 0` (G1/G16: the handshake never goes to a URL the guard did not check). Without an options object
 * `ws` follows no redirect, and the WHATWG WebSocket never follows one.
 */
function withoutRedirects(args: unknown[]): unknown[] {
  const out = [...args];
  const index = isPlainObject(out[1]) ? 1 : isPlainObject(out[2]) ? 2 : -1;
  if (index > 0)
    out[index] = { ...(out[index] as object), followRedirects: false, maxRedirects: 0 };
  return out;
}

function publisherTierOk(h: Harness): boolean {
  if (h.abortState()) return false;
  if (h.mode === 'example') return h.exampleWrite && h.enabledTiers().S;
  return h.currentBlock()?.tier === 'S' && h.env.tiers.S;
}

function foreignMacs(value: unknown, key: string | null, found: string[]): number {
  if (typeof value === 'string') {
    if (!((key !== null && MAC_KEYS.has(key)) || looksLikeMac(value))) return 0;
    if (isTestMac(value)) {
      found.push(normalizeMacLike(value));
      return 0;
    }
    return 1;
  }
  if (Array.isArray(value))
    return value.reduce<number>((n, v) => n + foreignMacs(v, key, found), 0);
  if (isPlainObject(value))
    return Object.entries(value).reduce<number>((n, [k, v]) => n + foreignMacs(v, k, found), 0);
  return 0;
}

/** Checks one outbound frame; throws GuardViolation (or BudgetExceeded) before it leaves. */
function admitFrame(state: SocketState, data: unknown): unknown {
  const h = state.harness;
  const fail = (rule: string, reason: string): Error =>
    raiseViolation(h, rule, 'WS', state.template, reason);
  if (state.kind === 'unreachable' || state.kind === 'local') {
    if (typeof data !== 'string') return data;
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }
  if (!state.configured) throw fail('G16', 'send on a socket opened with a foreign credential');
  let frame: unknown;
  try {
    frame = typeof data === 'string' ? JSON.parse(data) : undefined;
  } catch {
    frame = undefined;
  }
  if (!isPlainObject(frame)) throw fail('G16', 'frame is not a JSON object');
  if (frame.app_namespace !== h.env.namespace)
    throw fail('G16', 'frame app_namespace differs from APP_NAMESPACE');
  if (NAMESPACE_LIST_KEYS.some((k) => !namespaceListOk(frame[k], h.env.namespace)))
    throw fail('G16', 'frame targetApplications names another namespace');
  if (FORBIDDEN_KEYS.some((k) => Object.hasOwn(frame, k)))
    throw fail('G16', 'frame carries a forbidden key');
  if (typeof frame.type === 'string' && FORBIDDEN_TYPES.has(frame.type))
    throw fail('G16', 'destructive command');
  if (state.kind === 'subscriber') {
    if (typeof frame.type !== 'string' || !SUBSCRIBER_TYPES.has(frame.type)) {
      throw fail('G16', 'subscriber frame type not SUBSCRIBE, UNSUBSCRIBE or FILTER_MGT');
    }
    return frame;
  }
  if (!publisherTierOk(h)) throw fail('G16', 'publisher frames only in tier S');
  const failed = failedVerdicts(h.preflight(), 'publish');
  if (failed.length > 0) throw fail('G18', `preflight verdict false: ${failed.join(', ')}`);
  const macs: string[] = [];
  if (foreignMacs(frame, null, macs) > 0)
    throw fail('G16', 'publisher frame MAC outside the test range');
  // G18 (e): positions go only to this run's range (LIVE-TESTING §2.7).
  if (macs.some((mac) => !isRunTestMac(mac, h.runId)))
    throw fail('G18', 'a position on a test MAC outside this run’s range');
  const positions = typeof frame.user_uuid === 'string' ? 1 : 0;
  h.consume({ positions }, h.currentDomain());
  if (macs.length > 0) h.track([], [...new Set(macs)]);
  return frame;
}

function readyStateOf(socket: object): number | undefined {
  return (socket as { readyState?: number }).readyState;
}

/**
 * Wraps a WebSocket class (global `WebSocket` or `ws`) so that every connect and outbound frame passes G16.
 */
export function guardWebSocket<T extends new (...a: never[]) => WebSocketLike>(impl: T): T {
  type Ctor = new (...args: unknown[]) => WebSocketLike;
  const Base = impl as unknown as Ctor;
  const proto = Base.prototype as Record<string, unknown>;
  const nativeSend = proto.send as (this: unknown, ...args: unknown[]) => void;
  const nativeClose = proto.close as ((this: unknown, ...args: unknown[]) => void) | undefined;
  const nativeTerminate = proto.terminate as ((this: unknown) => void) | undefined;

  const expire = (socket: object, state: SocketState): void => {
    const rs = readyStateOf(socket);
    if (rs === 3) return;
    raiseViolation(state.harness, 'G16', 'WS', state.template, 'socket lifetime of 120 s exceeded');
    nativeClose?.call(socket);
    const after = readyStateOf(socket);
    if (after !== 3 && nativeTerminate) nativeTerminate.call(socket);
  };

  class GuardedWebSocket extends Base {
    constructor(...args: unknown[]) {
      const h = activeHarness();
      const prepared = prepareConnect(h, args[0], args[1], args[2]);
      super(...withoutRedirects(args));
      const record: SocketRecord = {
        url: prepared.url,
        headerNames: prepared.headerNames,
        frames: [],
        socket: this,
      };
      const state: SocketState = {
        harness: h,
        kind: prepared.kind,
        configured: prepared.configured,
        template: prepared.template,
        record,
      };
      states.set(this, state);
      h.sockets.push(record);
      const timer = setTimeout(() => expire(this, state), SOCKET_LIFETIME_MS);
      (timer as { unref?: () => void }).unref?.();
      state.timer = timer;
      const onClose = (): void => clearTimeout(timer);
      const target = this as unknown as {
        addEventListener?: (type: string, fn: () => void) => void;
        on?: (type: string, fn: () => void) => void;
      };
      if (typeof target.addEventListener === 'function') target.addEventListener('close', onClose);
      else if (typeof target.on === 'function') target.on('close', onClose);
    }

    send(data: string, ...rest: unknown[]): void {
      const state = states.get(this);
      if (!state) throw new Error('guarded WebSocket without state');
      const frame = admitFrame(state, data);
      state.record.frames.push(frame);
      nativeSend.call(this, data, ...rest);
    }
  }
  Object.defineProperty(GuardedWebSocket, 'name', { value: impl.name || 'GuardedWebSocket' });
  return GuardedWebSocket as unknown as T;
}

/** Sockets opened through the guard in this process (URL credentials redacted). */
export function socketRecords(): readonly SocketRecord[] {
  return activeHarness().sockets;
}

/** Admits a loopback WebSocket server the test started itself (G1). */
export function allowLocalWebSocketServer(port: number): void {
  activeHarness().localWebSocketPorts.add(port);
}

/**
 * `vi.mock('ws', guardedWsModule)` factory: the real `ws` exports with `WebSocket` (also the default export)
 * replaced by the guarded class.
 */
export async function guardedWsModule(
  importOriginal: () => Promise<unknown>
): Promise<Record<string, unknown>> {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const Original = (actual.WebSocket ?? actual.default) as new (...a: never[]) => WebSocketLike;
  const Guarded = guardWebSocket(Original);
  return { ...actual, WebSocket: Guarded, default: Guarded };
}
