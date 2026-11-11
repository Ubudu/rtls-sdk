// Protocol-faithful fake of the RTLS broker (P8 §8.1, models §5.2–§5.5). Sockets are the fakes of
// fake-websocket.ts, injected through `config.WebSocket`. Events are delivered on microtasks (not timers), so
// fake timers do not hold them back. This file imports nothing from src (regression-proof tree).
import { expect, vi } from 'vitest';
import {
  FakeBrowserWebSocket,
  FakeNodeWebSocket,
  FakeSocket,
  setActiveServer,
  type FakeServerLink,
} from './fake-websocket';

export { FakeBrowserWebSocket, FakeNodeWebSocket, FakeSocket };

/** How the server answers an upgrade. */
export type UpgradeMode = 'ok' | 'auth401' | 'auth403' | 'bun401' | 'error' | 'hang';

/** The five filter values the broker recognises. */
export const FILTER_TYPES = [
  'POSITIONS',
  'ZONES_ENTRIES_EVENTS',
  'ZONE_STATS_EVENTS',
  'ALERTS',
  'ASSETS',
] as const;

/** Kinds `emit()` knows; the extra ones are delivered only under the full mask. */
export type FakeKind =
  | (typeof FILTER_TYPES)[number]
  | 'TAG_LOST'
  | 'ALERT_RULES_CHANGED'
  | 'ASSETS_LIBRARY_CHANGED'
  | 'DATA_MODELS_CHANGED'
  | 'SETTINGS_CHANGED'
  | 'MAP_DATA_CHANGED'
  | 'UNKNOWN';

interface Registration {
  namespace: string;
  /** `null` = full mask (no filter). */
  mask: Set<string> | null;
  uuids: string[] | null;
}

/** A frame a client sent, parsed. */
export interface ReceivedFrame {
  socket: FakeSocket;
  role: 'subscriber' | 'publisher';
  frame: unknown;
}

const UPGRADE_ERRORS: Partial<Record<UpgradeMode, string | undefined>> = {
  auth401: 'Unexpected server response: 401',
  auth403: 'Unexpected server response: 403',
  bun401: 'WebSocket connection failed: Expected 101 status code, got 401',
  error: undefined,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `uuids` as the broker reads it: absent/null → null; a malformed value → 'malformed'. */
function readUuids(value: unknown): string[] | null | 'malformed' {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) return 'malformed';
  return value.length === 0 ? null : [...(value as string[])];
}

export class FakeRtServer implements FakeServerLink {
  /** Default upgrade mode. */
  mode: UpgradeMode = 'ok';
  /** Upgrade modes used first, one per new socket (then `mode`). */
  readonly upgrades: UpgradeMode[] = [];
  /** Deliver regardless of mask and registration (client-side guard tests). */
  misbehave = false;
  /** Do not answer pings. */
  noPong = false;
  /** A client `close()` gets no close event (only `terminate()` closes). */
  noCloseEcho = false;
  /** Do not confirm SUBSCRIBE. */
  noConfirm = false;
  /** Every socket ever accepted. */
  readonly sockets: FakeSocket[] = [];
  private readonly frames: ReceivedFrame[] = [];
  private readonly registrations = new Map<FakeSocket, Registration>();

  constructor() {
    setActiveServer(this);
  }

  /** Detaches the server; later constructions throw. */
  stop(): void {
    setActiveServer(null);
  }

  // ─── Inspection ─────────────────────────────────────────────────────────────

  /** Parsed frames sent by clients (all, or of one role). */
  received(role?: 'subscriber' | 'publisher'): unknown[] {
    return this.frames.filter((f) => role === undefined || f.role === role).map((f) => f.frame);
  }

  /** The `type` of every subscriber frame, in order (`'S'`, `'U'`, `'F'` short forms). */
  commands(): string[] {
    const short: Record<string, string> = { SUBSCRIBE: 'S', UNSUBSCRIBE: 'U', FILTER_MGT: 'F' };
    return this.received('subscriber').map((frame) =>
      isRecord(frame) && typeof frame.type === 'string' ? (short[frame.type] ?? frame.type) : '?'
    );
  }

  /** Forget the recorded frames. */
  clearReceived(): void {
    this.frames.length = 0;
  }

  /** The broker registration of a socket (or the last socket). */
  registration(socket: FakeSocket | undefined = this.last()): Registration | undefined {
    return socket === undefined ? undefined : this.registrations.get(socket);
  }

  /** The most recent socket. */
  last(): FakeSocket | undefined {
    return this.sockets[this.sockets.length - 1];
  }

  /** Open sockets. */
  openSockets(): FakeSocket[] {
    return this.sockets.filter((s) => s.readyState === 1);
  }

  // ─── Delivery ───────────────────────────────────────────────────────────────

  /** Delivers `payload` of `kind` to every registered subscriber whose mask (and tag filter) admits it. */
  emit(kind: FakeKind, payload: unknown): number {
    let delivered = 0;
    for (const socket of this.openSockets()) {
      if (this.roleOf(socket) !== 'subscriber') continue;
      if (!this.misbehave && !this.admits(this.registrations.get(socket), kind, payload)) continue;
      socket.fireMessage(payload);
      delivered += 1;
    }
    return delivered;
  }

  /** Sends raw data to one socket (default: the last one). */
  sendRaw(data: unknown, socket: FakeSocket | undefined = this.last()): void {
    socket?.fireMessage(data);
  }

  /** Answers every ping with a pong unless `noPong`. */
  clientPing(socket: FakeSocket): void {
    if (this.noPong) return;
    queueMicrotask(() => {
      if (socket instanceof FakeNodeWebSocket && socket.readyState === 1) socket.firePong();
    });
  }

  // ─── Closing ────────────────────────────────────────────────────────────────

  /** TCP drop: close 1006, `wasClean: false`, on every open socket (or one). */
  dropAbruptly(socket?: FakeSocket): void {
    for (const s of socket === undefined ? this.openSockets() : [socket]) {
      this.registrations.delete(s);
      s.fireClose(1006, '', false);
    }
  }

  /** Server-initiated normal close. */
  closeNormal(code = 1000, socket?: FakeSocket): void {
    for (const s of socket === undefined ? this.openSockets() : [socket]) {
      this.registrations.delete(s);
      s.fireClose(code, '', true);
    }
  }

  // ─── FakeServerLink ─────────────────────────────────────────────────────────

  accept(socket: FakeSocket): void {
    this.sockets.push(socket);
    const mode = this.upgrades.shift() ?? this.mode;
    if (mode === 'hang') return;
    queueMicrotask(() => {
      if (socket.readyState !== 0) return;
      if (mode === 'ok') {
        socket.fireOpen();
        return;
      }
      socket.fireError(UPGRADE_ERRORS[mode]);
      socket.fireClose(1006, '', false);
    });
  }

  receive(socket: FakeSocket, data: string): void {
    let frame: unknown;
    try {
      frame = JSON.parse(data);
    } catch {
      return; // invalid JSON is ignored without closing
    }
    const role = this.roleOf(socket);
    this.frames.push({ socket, role, frame });
    if (role === 'publisher' || !isRecord(frame)) return; // publisher: recorded, never answered; arrays ignored
    if (typeof frame.type !== 'string' || typeof frame.app_namespace !== 'string') return;
    const namespace = frame.app_namespace;
    if (frame.type === 'SUBSCRIBE') this.subscribe(socket, namespace, frame);
    else if (frame.type === 'UNSUBSCRIBE') this.registrations.delete(socket);
    else if (frame.type === 'FILTER_MGT') this.filter(socket, frame);
  }

  clientClose(socket: FakeSocket, code: number | undefined, reason: string | undefined): void {
    const wasConnecting = socket.readyState === 0;
    socket.readyState = 2;
    this.registrations.delete(socket);
    if (this.noCloseEcho && !wasConnecting) return;
    queueMicrotask(() => {
      if (wasConnecting) socket.fireError();
      socket.fireClose(wasConnecting ? 1006 : (code ?? 1005), wasConnecting ? '' : (reason ?? ''));
    });
  }

  clientTerminate(socket: FakeSocket): void {
    const wasConnecting = socket.readyState === 0;
    socket.readyState = 2;
    this.registrations.delete(socket);
    queueMicrotask(() => {
      if (wasConnecting)
        socket.fireError('WebSocket was closed before the connection was established');
      socket.fireClose(1006, '', false);
    });
  }

  // ─── Protocol ───────────────────────────────────────────────────────────────

  private roleOf(socket: FakeSocket): 'subscriber' | 'publisher' {
    return socket.url.includes('/ws/publisher') ? 'publisher' : 'subscriber';
  }

  private subscribe(socket: FakeSocket, namespace: string, frame: Record<string, unknown>): void {
    const filter = frame.data_type_filter;
    if (
      filter !== undefined &&
      (!Array.isArray(filter) || filter.some((t) => typeof t !== 'string'))
    ) {
      this.abrupt(socket);
      return;
    }
    const uuids = readUuids(frame.uuids);
    if (uuids === 'malformed') {
      this.abrupt(socket);
      return;
    }
    const existing = this.registrations.get(socket);
    if (existing !== undefined) {
      // re-SUBSCRIBE: the first mask stays, uuids are replaced; another namespace gets no confirmation
      existing.uuids = uuids;
      if (namespace === existing.namespace) this.confirm(socket, existing.namespace);
      return;
    }
    const mask =
      filter === undefined
        ? null
        : new Set(
            (filter as string[]).filter((t) => (FILTER_TYPES as readonly string[]).includes(t))
          );
    this.registrations.set(socket, { namespace, mask, uuids });
    this.confirm(socket, namespace);
  }

  private filter(socket: FakeSocket, frame: Record<string, unknown>): void {
    const registration = this.registrations.get(socket);
    if (registration === undefined) return; // not registered: nothing
    const uuids = readUuids(frame.uuids);
    if (uuids === 'malformed') {
      this.abrupt(socket);
      return;
    }
    registration.uuids = uuids;
  }

  private confirm(socket: FakeSocket, namespace: string): void {
    if (this.noConfirm) return;
    queueMicrotask(() => {
      if (socket.readyState === 1)
        socket.fireMessage({ app_namespace: namespace, action: 'subscribeEvent' });
    });
  }

  private abrupt(socket: FakeSocket): void {
    this.registrations.delete(socket);
    queueMicrotask(() => socket.fireClose(1006, '', false));
  }

  private admits(
    registration: Registration | undefined,
    kind: FakeKind,
    payload: unknown
  ): boolean {
    if (registration === undefined) return false;
    const inMask =
      registration.mask === null ||
      ((FILTER_TYPES as readonly string[]).includes(kind) && registration.mask.has(kind));
    if (!inMask) return false;
    if (kind !== 'POSITIONS' || registration.uuids === null) return true;
    return isRecord(payload) && registration.uuids.includes(String(payload.user_uuid));
  }
}

/** Flushes pending microtasks (fake-server events) without advancing timers. */
export async function flush(rounds = 10): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await Promise.resolve();
}

/**
 * Regression-proof fallback (§13): the 0.2.0 sources ignore `config.WebSocket`; for them only, the named
 * regression tests install the fake as the global. Detected by a 0.3.0-only method on the prototype.
 */
export function legacyGlobalFallback(prototype: object): boolean {
  if (typeof (prototype as { setTagFilter?: unknown }).setTagFilter === 'function') return false;
  vi.stubGlobal('WebSocket', FakeBrowserWebSocket);
  return true;
}

/** Collects unhandled rejections for the end-of-test check. */
export function trackUnhandledRejections(): { list: unknown[]; stop: () => void } {
  const list: unknown[] = [];
  const onRejection = (reason: unknown): void => {
    list.push(reason);
  };
  process.on('unhandledRejection', onRejection);
  return { list, stop: () => process.off('unhandledRejection', onRejection) };
}

/** End-of-test check: no unhandled rejection, and (under fake timers) no timer left. */
export function assertWsClean(rejections: readonly unknown[]): void {
  expect(rejections).toStrictEqual([]);
  if (vi.isFakeTimers()) expect(vi.getTimerCount()).toBe(0);
}

/** State of a promise after the pending microtasks ran (marks it handled). */
export async function settledState(
  promise: Promise<unknown>
): Promise<'pending' | 'resolved' | 'rejected'> {
  let state: 'pending' | 'resolved' | 'rejected' = 'pending';
  promise.then(
    () => {
      state = 'resolved';
    },
    () => {
      state = 'rejected';
    }
  );
  await flush();
  return state;
}

/** One recorded event. */
export interface RecordedEvent {
  event: string;
  data: unknown;
}

/** Records the given events of an SDK emitter, in order. */
export function recordEvents(emitter: object, names: readonly string[]): RecordedEvent[] {
  const log: RecordedEvent[] = [];
  const target = emitter as { on(event: string, handler: (data: unknown) => void): unknown };
  for (const event of names) target.on(event, (data) => log.push({ event, data }));
  return log;
}

/** Names of the recorded events. */
export function eventNamesOf(log: readonly RecordedEvent[]): string[] {
  return log.map((entry) => entry.event);
}
