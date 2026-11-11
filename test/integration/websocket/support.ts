// Live support of the WebSocket suites (spec P8 §9.1, P8-T14). Discovery and the safe publish point come from
// the harness (`discover`, `safePublishPoint`); this file adds the URL builder, the traffic probe, the
// recording-only subclasses of the guarded `ws` class, and the per-test socket cleanup. No test output carries a
// payload value: helpers return kinds, counts and key sets.
import { afterEach } from 'vitest';
import WebSocket from 'ws';
import { liveEnv, rawRequest, socketRecords, type SocketRecord } from '../harness';
import { toEpochMs } from '../../../src/utils/time';

export { discover, safePublishPoint } from '../harness';

/** The `ws` class of the integration run: the integration setup's `vi.mock('ws')` makes it the guarded class. */
export const GuardedWs = WebSocket;
export type GuardedWsClass = typeof WebSocket;

/** `wss://<host><base>/ws/subscriber|publisher` derived from the configured REST base URL (spec P8 §5.1). */
export function wsUrl(kind: 'subscriber' | 'publisher'): string {
  const base = liveEnv()
    .baseUrl.replace(/^https:/, 'wss:')
    .replace(/^http:/, 'ws:')
    .replace(/\/+$/, '');
  return `${base}/ws/${kind}`;
}

/** Namespace and credential of the standalone classes (no RtlsClient), from the harness env only. */
export function standaloneConfig(): {
  namespace: string;
  apiKey: string;
  subscriberUrl: string;
  publisherUrl: string;
} {
  const env = liveEnv();
  return {
    namespace: env.namespace,
    apiKey: env.apiKey,
    subscriberUrl: wsUrl('subscriber'),
    publisherUrl: wsUrl('publisher'),
  };
}

// ---------------------------------------------------------------------------------------------------------
// Recording-only subclasses of the guarded class (spec P8 §9.1 step 5, §9.2). None guards anything itself.

/** A subclass of the guarded class that counts `ping()` calls (P0's records do not hold pings). */
export function pingCounting(base: GuardedWsClass = GuardedWs): {
  Impl: GuardedWsClass;
  pings: () => number;
} {
  let pings = 0;
  class PingCountingWebSocket extends base {
    override ping(...args: Parameters<WebSocket['ping']>): void {
      pings += 1;
      super.ping(...args);
    }
  }
  return { Impl: PingCountingWebSocket, pings: () => pings };
}

/** A subclass whose `send()` always throws, so no frame can leave (tier-R publisher and send-failure paths). */
export function refuseSend(base: GuardedWsClass = GuardedWs): GuardedWsClass {
  class RefuseSendWebSocket extends base {
    override send(): void {
      throw new Error('sdk-test: send refused');
    }
  }
  return RefuseSendWebSocket;
}

/** A subclass whose first `send()` goes through and whose later sends throw (send failure on a registered socket). */
export function sendOnce(base: GuardedWsClass = GuardedWs): GuardedWsClass {
  class SendOnceWebSocket extends base {
    private sends = 0;
    override send(...args: unknown[]): void {
      this.sends += 1;
      if (this.sends > 1) throw new Error('sdk-test: send refused');
      (super.send as (...a: unknown[]) => void).apply(this, args);
    }
  }
  return SendOnceWebSocket;
}

/**
 * A subclass that aborts its own opening handshake (`terminate()` while CONNECTING, one microtask after
 * construction): the SDK sees an error and a close before open, with no HTTP status.
 */
export function abortHandshake(base: GuardedWsClass = GuardedWs): GuardedWsClass {
  class AbortHandshakeWebSocket extends base {
    constructor(...args: ConstructorParameters<GuardedWsClass>) {
      super(...args);
      queueMicrotask(() => this.terminate());
    }
  }
  // the narrowed constructor signature differs from the overloaded `ws` one; the instances are the same
  return AbortHandshakeWebSocket as unknown as GuardedWsClass;
}

/** A subclass whose `close()` sends nothing (no close echo) and that counts `terminate()` calls. */
export function noCloseEcho(base: GuardedWsClass = GuardedWs): {
  Impl: GuardedWsClass;
  terminations: () => number;
} {
  let terminations = 0;
  class NoCloseEchoWebSocket extends base {
    override close(): void {
      // intentionally nothing: the client close never reaches the server, so no close event arrives
    }
    override terminate(): void {
      terminations += 1;
      super.terminate();
    }
  }
  return { Impl: NoCloseEchoWebSocket, terminations: () => terminations };
}

// ---------------------------------------------------------------------------------------------------------
// Socket records and frames.

/** Number of guarded sockets constructed so far in this process. */
export function socketMark(): number {
  return socketRecords().length;
}

/** The guarded sockets constructed since `mark`. */
export function socketsSince(mark: number): readonly SocketRecord[] {
  return socketRecords().slice(mark);
}

/** The admitted outbound frames of the sockets constructed since `mark`, in socket order. */
export function framesSince(mark: number): Record<string, unknown>[] {
  return socketsSince(mark).flatMap((r) => r.frames as Record<string, unknown>[]);
}

/** The `type` of each frame (SUBSCRIBE, UNSUBSCRIBE, FILTER_MGT; undefined for publisher frames). */
export function frameTypes(frames: readonly Record<string, unknown>[]): unknown[] {
  return frames.map((f) => f.type);
}

/** The redacted URL of a socket record, parsed. */
export function recordUrl(record: SocketRecord): URL {
  return new URL(record.url);
}

// ---------------------------------------------------------------------------------------------------------
// Traffic probe (spec P8 §9.1 step 4).

export interface TrafficProbe {
  /** distinct `user_uuid` of cached positions with a timestamp in the last 120 s */
  freshTags: string[];
}

export async function trafficProbe(now: number = Date.now()): Promise<TrafficProbe> {
  const r = await rawRequest('GET', '/cache/{ns}/positions');
  const list: unknown[] = Array.isArray(r.json)
    ? r.json
    : r.json !== null && typeof r.json === 'object'
      ? Object.values(r.json)
      : [];
  const fresh = new Set<string>();
  for (const p of list) {
    if (p === null || typeof p !== 'object') continue;
    const { user_uuid: tag, timestamp } = p as { user_uuid?: unknown; timestamp?: unknown };
    if (typeof tag !== 'string') continue;
    let at: number;
    try {
      at = toEpochMs(timestamp as string | number);
    } catch {
      continue;
    }
    if (now - at <= 120_000) fresh.add(tag);
  }
  return { freshTags: [...fresh] };
}

// ---------------------------------------------------------------------------------------------------------
// Waiting and collecting.

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** `JSON.parse` of a text frame; undefined for a frame that is not JSON (never thrown). */
export function parseJson(data: unknown): unknown {
  try {
    return JSON.parse(String(data));
  } catch {
    return undefined;
  }
}

/**
 * Skips the running test at run time with the reason the spec gives for that case (a missing runtime global, a
 * key format, a failed precondition of the tier-S file); the reason appears in the title and the run report.
 */
export function skipTest(ctx: { skip: (note?: string) => void }, reason: string): void {
  ctx.skip(reason);
}

/** Polls `predicate` every 50 ms until it is true (resolves true) or `timeoutMs` passes (resolves false). */
export async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (predicate()) return true;
    await sleep(50);
  }
  return predicate();
}

/** Records every emission of the named events, with its arrival time, until `stop()`. */
export function recorder(
  emitter: object,
  events: readonly string[]
): {
  of: (event: string) => { at: number; data: unknown }[];
  count: (event: string) => number;
  stop: () => void;
} {
  const seen = new Map<string, { at: number; data: unknown }[]>();
  const offs = events.map((event) => {
    seen.set(event, []);
    const on = (emitter as { on: unknown }).on as (
      e: string,
      h: (d: unknown) => void
    ) => () => void;
    return on.call(emitter, event, (data: unknown) => {
      seen.get(event)?.push({ at: Date.now(), data });
    });
  });
  return {
    of: (event) => seen.get(event) ?? [],
    count: (event) => seen.get(event)?.length ?? 0,
    stop: () => {
      for (const off of offs) off();
    },
  };
}

/** A kinds histogram (`kind → count`) of the classified messages. */
export function histogram(kinds: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of kinds) out[k] = (out[k] ?? 0) + 1;
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Cleanup (spec P8 §9: afterEach disconnects every SDK client, then terminates any raw socket still open 5 s
// later).

interface Disconnectable {
  disconnect(): Promise<void>;
}

const clients = new Set<Disconnectable>();

/** Registers an SDK client for the afterEach cleanup and returns it. */
export function track<T extends Disconnectable>(client: T): T {
  clients.add(client);
  return client;
}

function readyState(record: SocketRecord): number | undefined {
  return (record.socket as unknown as { readyState?: number }).readyState;
}

/** Disconnects every tracked client; raw sockets still not CLOSED 5 s later are terminated (or closed). */
export async function cleanupSockets(): Promise<void> {
  const pending = [...clients];
  clients.clear();
  await Promise.allSettled(pending.map((c) => c.disconnect()));
  const open = (): SocketRecord[] => socketRecords().filter((r) => readyState(r) !== 3);
  if (open().length === 0) return;
  await waitFor(() => open().length === 0, 5_000);
  for (const record of open()) {
    const socket = record.socket as unknown as { terminate?: () => void; close: () => void };
    if (typeof socket.terminate === 'function') socket.terminate();
    else socket.close();
  }
}

/** Installs the afterEach cleanup in the calling file. */
export function installSocketCleanup(): void {
  afterEach(async () => {
    await cleanupSockets();
  }, 15_000);
}
