// Live tier-R suite of the WebSocket subscriber, unified client and publisher validation paths (spec P8 §9.2,
// LT-R1…R13 and LT-R15). 0 positions: no publisher frame leaves (refuseSend or validation failures only).
// Output carries kinds, counts and key sets only, never payload values.
import { inspect } from 'node:util';
import { beforeAll, expect, it, vi } from 'vitest';
import type WebSocket from 'ws';
import {
  classifyMessage,
  ContextError,
  isAlertMessage,
  isAssetMessage,
  isPositionMessage,
  isSubscriptionConfirmation,
  isValidMacAddress,
  isZoneEntryExitMessage,
  isZoneStatsMessage,
  normalizeMacAddress,
  RtlsWebSocketPublisher,
  RtlsWebSocketSubscriber,
  SubscriptionType,
  WebSocketAuthenticationError,
  WebSocketConnectionError,
  WebSocketSubscriptionError,
  type PositionMessage,
  type WebSocketSubscriberConfig,
} from '../../../src';
import { formatMac } from '../../../src/utils/mac';
import { resolveWebSocketImpl } from '../../../src/websocket/runtime';
import {
  createLiveClient,
  describeLive,
  expectKnownServerIssue,
  liveEnv,
  recordFact,
  runId,
  socketRecords,
  testMac,
} from '../harness';
import { keySet, validateMessage } from '../../websocket/support/validators';
import {
  abortHandshake,
  framesSince,
  frameTypes,
  GuardedWs,
  histogram,
  installSocketCleanup,
  noCloseEcho,
  parseJson,
  pingCounting,
  recorder,
  recordUrl,
  refuseSend,
  sendOnce,
  skipTest,
  sleep,
  socketMark,
  socketsSince,
  standaloneConfig,
  track,
  trafficProbe,
  waitFor,
  wsUrl,
  type TrafficProbe,
} from './support';

type WsImpl = NonNullable<WebSocketSubscriberConfig['WebSocket']>;
const asImpl = (impl: unknown): WsImpl => impl as WsImpl;
const SAFE_RECONNECT = { maxAttempts: 2, initialDelayMs: 250, jitter: 'none' } as const;
const NO_MAP = (): string => `sdk-test-${runId()}-no-map`;

/** A subscriber on the guarded `ws` with the harness credential, tracked for the afterEach cleanup. */
function subscriber(extra: Partial<WebSocketSubscriberConfig> = {}): RtlsWebSocketSubscriber {
  const { namespace, apiKey, subscriberUrl } = standaloneConfig();
  return track(
    new RtlsWebSocketSubscriber({
      namespace,
      apiKey,
      subscriberUrl,
      WebSocket: asImpl(GuardedWs),
      reconnect: SAFE_RECONNECT,
      ...extra,
    })
  );
}

/** Frames with the namespace and non-test tag ids replaced by placeholders (failure output carries no values). */
function shapes(frames: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  const ns = liveEnv().namespace;
  return frames.map((f) => {
    const out: Record<string, unknown> = { ...f };
    if ('app_namespace' in out) out.app_namespace = out.app_namespace === ns ? '<ns>' : '<other>';
    if (Array.isArray(out.uuids))
      out.uuids = out.uuids.map((u: unknown) =>
        typeof u === 'string' && u.startsWith('025d4b') ? u : '<tag>'
      );
    return out;
  });
}

/** Console spies that silence the output and return every call as text. */
function silenceConsole(): { texts: () => string[]; warns: () => string[]; restore: () => void } {
  const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;
  const spies = methods.map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
  const asText = (args: unknown[]): string =>
    args.map((a) => (typeof a === 'string' ? a : inspect(a, { depth: 4 }))).join(' ');
  return {
    texts: () => spies.flatMap((s) => s.mock.calls.map((c) => asText(c))),
    warns: () => (spies[2]?.mock.calls ?? []).map((c) => asText(c)),
    restore: () => {
      for (const s of spies) s.mockRestore();
    },
  };
}

/** Runs the content assertion of a *(traffic)* test only when the probe met the threshold (spec P8 §9.1 step 4). */
async function withTraffic(
  name: string,
  probe: TrafficProbe,
  threshold: number,
  assertion: () => void | Promise<void>
): Promise<void> {
  const met = probe.freshTags.length >= threshold;
  recordFact(`websocket.${name}.traffic`, met);
  if (met) await assertion();
}

const GUARDS = [
  isPositionMessage,
  isZoneEntryExitMessage,
  isZoneStatsMessage,
  isAlertMessage,
  isAssetMessage,
  isSubscriptionConfirmation,
] as const;

describeLive('R', 'websocket subscriber', () => {
  installSocketCleanup();
  let probe: TrafficProbe = { freshTags: [] };

  beforeAll(async () => {
    probe = await trafficProbe();
    recordFact('websocket.traffic.freshTags', probe.freshTags.length);
  });

  it('LT-R1 connect and subscribe ALL with a credential provider', async () => {
    const env = liveEnv();
    const logs = silenceConsole();
    try {
      let calls = 0;
      const sub = subscriber({
        apiKey: () => {
          calls += 1;
          return env.apiKey;
        },
        debug: true,
        reconnect: { retryInitialConnect: true, maxAttempts: 2 },
      });
      await expect(sub.subscribe()).rejects.toBeInstanceOf(WebSocketSubscriptionError);

      const throwing = vi.fn(() => {
        throw new Error('sdk-test handler failure');
      });
      const connected = vi.fn();
      sub.once('connected', throwing);
      sub.once('connected', connected);
      const messages: unknown[] = [];
      sub.on('message', (m) => messages.push(m));

      const started = Date.now();
      await sub.connect();
      expect(Date.now() - started).toBeLessThanOrEqual(15_000);
      expect(throwing).toHaveBeenCalledTimes(1);
      expect(connected).toHaveBeenCalledTimes(1);
      expect(sub.listenerCount('connected')).toBe(0);

      await expect(sub.subscribe()).resolves.toEqual({ success: true, types: 'ALL', uuids: null });
      await expectKnownServerIssue(
        'USI-P8-4',
        'the subscription confirmation carries only the namespace and the action',
        () => {
          expect(keySet(messages[0])).toEqual(['action', 'app_namespace']);
          expect((messages[0] as { app_namespace?: unknown }).app_namespace === env.namespace).toBe(
            true
          );
        }
      );

      expect(sub.getSubscription()).toEqual({ types: 'ALL', uuids: null, active: true });
      const status = sub.getConnectionStatus();
      expect(status.state).toBe('CONNECTED');
      expect(status.connectedAt).toBeInstanceOf(Date);
      expect(sub.isConnected()).toBe(true);
      expect(sub.listenerCount('message')).toBe(1);
      expect(sub.hasListeners('message')).toBe(true);
      expect(sub.eventNames()).toContain('message');

      const positions = vi.fn();
      sub.on('POSITIONS', positions);
      expect(sub.hasListeners('POSITIONS')).toBe(true);
      sub.off('POSITIONS', positions);
      expect(sub.hasListeners('POSITIONS')).toBe(false);
      sub.removeAllListeners('message');
      expect(sub.listenerCount('message')).toBe(0);
      const unsubscribe = sub.on('ALERTS', vi.fn());
      expect(sub.hasListeners('ALERTS')).toBe(true);
      unsubscribe();
      expect(sub.hasListeners('ALERTS')).toBe(false);
      sub.on('ALERTS', vi.fn());
      sub.removeAllListeners();
      expect(sub.eventNames()).toEqual([]);

      const disconnected = new Promise<unknown>((resolve) => sub.once('disconnected', resolve));
      await sub.disconnect();
      await expect(disconnected).resolves.toMatchObject({ code: 1000, willReconnect: false });
      expect(sub.getState()).toBe('DISCONNECTED');
      expect(calls).toBe(1);

      const leaked = logs.texts().filter((t) => t.includes(env.apiKey) || t.includes('apiKey='));
      expect(leaked).toHaveLength(0);
    } finally {
      logs.restore();
    }
  }, 30_000);

  it('LT-R2 explicit POSITIONS: classification, validation and the client-side mapUuid filter', async () => {
    const a = subscriber();
    const b = subscriber({ mapUuid: NO_MAP() });
    const aMessages: unknown[] = [];
    let bMessages = 0;
    let bTyped = 0;
    a.on('message', (m) => aMessages.push(m));
    b.on('message', () => {
      bMessages += 1;
    });
    b.on('POSITIONS', () => {
      bTyped += 1;
    });
    await Promise.all([a.connect(), b.connect()]);
    await expect(a.subscribe([SubscriptionType.POSITIONS])).resolves.toEqual({
      success: true,
      types: ['POSITIONS'],
      uuids: null,
    });
    await b.subscribe(SubscriptionType.POSITIONS);
    await sleep(20_000);
    await Promise.all([a.disconnect(), b.disconnect()]);

    const data = aMessages.filter((m) => classifyMessage(m) !== 'CONFIRMATION');
    const kinds = new Set(data.map((m) => classifyMessage(m)));
    expect([...kinds].filter((k) => k !== 'POSITIONS')).toEqual([]);
    const problems = new Set(data.flatMap((m) => validateMessage('POSITIONS', m)));
    expect([...problems]).toEqual([]);
    const guardCounts = new Set(aMessages.map((m) => GUARDS.filter((g) => g(m)).length));
    expect([...guardCounts].filter((n) => n !== 1)).toEqual([]);

    const typed = data as PositionMessage[];
    const typeOf = (key: 'dateCreated' | 'dateChanged' | 'timestamp', t: string): boolean =>
      typed.every((p) => p[key] === undefined || typeof p[key] === t);
    recordFact('websocket.types.dateCreated.number', typeOf('dateCreated', 'number'));
    recordFact('websocket.types.dateChanged.number', typeOf('dateChanged', 'number'));
    recordFact('websocket.types.timestamp.string', typeOf('timestamp', 'string'));
    recordFact('websocket.LT-R2.positions', data.length);

    await withTraffic('LT-R2', probe, 1, () => {
      expect(data.length).toBeGreaterThan(0);
      expect(bTyped).toBe(0);
      expect(bMessages).toBeGreaterThan(0);
    });
  }, 45_000);

  it('LT-R3 ALL contract window: every message classifies and validates', async () => {
    const sub = subscriber();
    const messages: unknown[] = [];
    sub.on('message', (m) => messages.push(m));
    await sub.connect();
    await sub.subscribe('ALL');
    await sleep(20_000);
    await sub.disconnect();

    const unknownKeySets = new Set(
      messages.filter((m) => classifyMessage(m) === 'UNKNOWN').map((m) => keySet(m).join(','))
    );
    expect([...unknownKeySets]).toEqual([]);
    const problems = new Set(
      messages.flatMap((m) => {
        const kind = classifyMessage(m);
        return validateMessage(kind, m).map((p) => `${kind} ${p}`);
      })
    );
    expect([...problems]).toEqual([]);
    const counts = histogram(messages.map((m) => classifyMessage(m)));
    for (const [kind, n] of Object.entries(counts)) recordFact(`websocket.kinds.${kind}`, n);
    await withTraffic('LT-R3', probe, 1, () => {
      expect(messages.length).toBeGreaterThan(1);
    });
  }, 45_000);

  it('LT-R4 subscription changes and unsubscribe on one socket', async () => {
    const ns = liveEnv().namespace;
    const mark = socketMark();
    const sub = subscriber();
    const seen: { at: number; kind: string }[] = [];
    sub.on('message', (m) => seen.push({ at: Date.now(), kind: classifyMessage(m) }));
    await sub.connect();
    const frames = (): Record<string, unknown>[] => shapes(framesSince(mark));
    expect(ns).not.toBe('');

    // (1) invalid tag filter: rejected, nothing sent
    await expect(sub.setTagFilter([''])).rejects.toBeInstanceOf(WebSocketSubscriptionError);
    expect(frames()).toEqual([]);
    // (2) ALL omits data_type_filter
    await sub.subscribe('ALL');
    expect(frames()).toEqual([{ type: 'SUBSCRIBE', app_namespace: '<ns>' }]);
    // (3) ALL minus ALERTS: UNSUBSCRIBE, then the explicit remainder
    await sub.unsubscribe(SubscriptionType.ALERTS);
    expect(frames().slice(1)).toEqual([
      { type: 'UNSUBSCRIBE', app_namespace: '<ns>' },
      {
        type: 'SUBSCRIBE',
        app_namespace: '<ns>',
        data_type_filter: ['POSITIONS', 'ZONES_ENTRIES_EVENTS', 'ZONE_STATS_EVENTS', 'ASSETS'],
      },
    ]);
    // (4) a change is UNSUBSCRIBE then SUBSCRIBE
    await sub.subscribe([SubscriptionType.ASSETS, SubscriptionType.POSITIONS]);
    expect(frames().slice(3)).toEqual([
      { type: 'UNSUBSCRIBE', app_namespace: '<ns>' },
      { type: 'SUBSCRIBE', app_namespace: '<ns>', data_type_filter: ['ASSETS', 'POSITIONS'] },
    ]);
    // (5) removing POSITIONS really stops positions (B1 live)
    await sub.unsubscribe(SubscriptionType.POSITIONS);
    const confirmedAt = Date.now();
    expect(frames().slice(5)).toEqual([
      { type: 'UNSUBSCRIBE', app_namespace: '<ns>' },
      { type: 'SUBSCRIBE', app_namespace: '<ns>', data_type_filter: ['ASSETS'] },
    ]);
    await sleep(11_000);
    const foreign = seen.filter(
      (e) =>
        e.at >= confirmedAt + 1_000 &&
        e.at <= confirmedAt + 11_000 &&
        e.kind !== 'ASSETS' &&
        e.kind !== 'CONFIRMATION'
    );
    // (6) unsubscribe() sends UNSUBSCRIBE only
    await sub.unsubscribe();
    expect(frames().slice(7)).toEqual([{ type: 'UNSUBSCRIBE', app_namespace: '<ns>' }]);
    expect(sub.getSubscription()?.active).toBe(false);
    expect(sub.getActiveSubscriptions()).toEqual([]);
    await sub.disconnect();
    await withTraffic('LT-R4', probe, 1, () => {
      expect(histogram(foreign.map((e) => e.kind))).toEqual({});
    });
  }, 45_000);

  it('LT-R5 tag filter on real traffic', async () => {
    const tagA = probe.freshTags[0] ?? testMac(59);
    const mark = socketMark();
    const sub = subscriber();
    const positions: { at: number; tag: string }[] = [];
    sub.on('POSITIONS', (p) => positions.push({ at: Date.now(), tag: p.user_uuid }));
    await sub.connect();
    await expect(
      sub.subscribe({ types: [SubscriptionType.POSITIONS], uuids: [tagA] })
    ).resolves.toMatchObject({ success: true, types: ['POSITIONS'] });
    await sleep(15_000);
    const filtered = positions.filter((p) => p.tag !== tagA).length;
    await sub.setTagFilter(null);
    const clearedAt = Date.now();
    expect(shapes(framesSince(mark)).at(-1)).toEqual({
      type: 'FILTER_MGT',
      app_namespace: '<ns>',
      uuids: [],
    });
    const other = await waitFor(
      () => positions.some((p) => p.at >= clearedAt && p.tag !== tagA),
      15_000
    );
    await sub.disconnect();
    expect(filtered).toBe(0);
    await withTraffic('LT-R5', probe, 2, () => {
      expect(other).toBe(true);
    });
  }, 45_000);

  it('LT-R6 drop, reconnect and replay', async () => {
    const env = liveEnv();
    const dropFirst = (mark: number): void => {
      const raw = socketsSince(mark)[0]?.socket as unknown as WebSocket;
      raw.close(4000, 'sdk-test drop');
    };

    // (a) ALL is replayed as ALL (B2 live); the provider runs once per attempt
    let calls = 0;
    let mark = socketMark();
    const a = subscriber({
      apiKey: () => {
        calls += 1;
        return env.apiKey;
      },
      reconnect: { initialDelayMs: 250, jitter: 'none' },
    });
    const aEvents = recorder(a, ['disconnected', 'reconnecting', 'reconnected']);
    await a.connect();
    await a.subscribe('ALL');
    dropFirst(mark);
    expect(await waitFor(() => aEvents.count('reconnected') === 1, 15_000)).toBe(true);
    expect(aEvents.of('disconnected')[0]?.data).toMatchObject({ willReconnect: true });
    expect(aEvents.count('reconnecting')).toBeGreaterThanOrEqual(1);
    expect(shapes(socketsSince(mark)[1]?.frames as Record<string, unknown>[])[0]).toEqual({
      type: 'SUBSCRIBE',
      app_namespace: '<ns>',
    });
    expect(calls).toBe(2);
    await a.disconnect();

    // (b) explicit types and the tag filter are replayed exactly
    mark = socketMark();
    const b = subscriber({ reconnect: { initialDelayMs: 250, jitter: 'none' } });
    const bEvents = recorder(b, ['reconnected']);
    await b.connect();
    await b.subscribe({ types: [SubscriptionType.POSITIONS], uuids: [testMac(59)] });
    dropFirst(mark);
    expect(await waitFor(() => bEvents.count('reconnected') === 1, 15_000)).toBe(true);
    expect(shapes(socketsSince(mark)[1]?.frames as Record<string, unknown>[])).toEqual([
      {
        type: 'SUBSCRIBE',
        app_namespace: '<ns>',
        data_type_filter: ['POSITIONS'],
        uuids: [testMac(59)],
      },
    ]);
    await b.disconnect();

    // (c) connect() while RECONNECTING: one new socket, one replay, no third socket (B12 live)
    mark = socketMark();
    const c = subscriber({ reconnect: { initialDelayMs: 5_000, jitter: 'none' } });
    const cEvents = recorder(c, ['disconnected', 'reconnected']);
    await c.connect();
    await c.subscribe('ALL');
    dropFirst(mark);
    expect(await waitFor(() => cEvents.count('disconnected') === 1, 10_000)).toBe(true);
    await c.connect();
    await sleep(6_000);
    expect(socketsSince(mark)).toHaveLength(2);
    expect(shapes(socketsSince(mark)[1]?.frames as Record<string, unknown>[])).toEqual([
      { type: 'SUBSCRIBE', app_namespace: '<ns>' },
    ]);
    expect(cEvents.count('reconnected')).toBe(1);
    await c.disconnect();

    // (d) subscription timeout, then replay timeouts end in reconnect_failed
    mark = socketMark();
    const d = subscriber({
      subscriptionTimeoutMs: 1,
      reconnect: { maxAttempts: 2, initialDelayMs: 250, jitter: 'none' },
    });
    const dEvents = recorder(d, ['error', 'reconnect_failed']);
    await d.connect();
    await expect(d.subscribe('ALL')).rejects.toBeInstanceOf(WebSocketSubscriptionError);
    await sleep(1_000);
    expect(d.getState()).toBe('CONNECTED');
    expect(dEvents.count('error')).toBe(0);
    dropFirst(mark);
    expect(await waitFor(() => dEvents.count('reconnect_failed') === 1, 15_000)).toBe(true);
    expect(dEvents.of('reconnect_failed')[0]?.data).toMatchObject({ attempts: 2 });
    const errors = dEvents.of('error').map((e) => (e.data as { error: unknown }).error);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.every((e) => e instanceof WebSocketSubscriptionError)).toBe(true);
    expect(d.getState()).toBe('DISCONNECTED');
    expect(socketsSince(mark)).toHaveLength(3);
  }, 60_000);

  it('LT-R7 keepalive pings and the keepalive timeout', async () => {
    const counted = pingCounting();
    const sub = subscriber({
      WebSocket: asImpl(counted.Impl),
      keepAliveIntervalMs: 1_000,
      pongTimeoutMs: 5_000,
    });
    await sub.connect();
    await sleep(4_500);
    expect(counted.pings()).toBeGreaterThanOrEqual(3);
    const lastPongAt = sub.getConnectionStatus().lastPongAt;
    expect(lastPongAt).toBeInstanceOf(Date);
    expect(Date.now() - (lastPongAt?.getTime() ?? 0)).toBeLessThanOrEqual(2_000);
    await sub.disconnect();

    const second = pingCounting();
    const failing = subscriber({
      WebSocket: asImpl(second.Impl),
      keepAliveIntervalMs: 1_000,
      pongTimeoutMs: 1,
      reconnect: { initialDelayMs: 250, jitter: 'none' },
    });
    const events = recorder(failing, ['error', 'disconnected', 'reconnected']);
    const started = Date.now();
    await failing.connect();
    expect(await waitFor(() => events.count('error') >= 1, 3_000)).toBe(true);
    const first = events.of('error')[0];
    expect((first?.data as { error: Error }).error).toBeInstanceOf(WebSocketConnectionError);
    expect((first?.data as { error: Error }).error.message).toBe('Keepalive timeout');
    expect((first?.at ?? Infinity) - started).toBeLessThanOrEqual(3_000);
    expect(await waitFor(() => events.count('reconnected') >= 1, 5_000)).toBe(true);
    await failing.disconnect();
    expect(events.of('disconnected')[0]?.data).toMatchObject({ willReconnect: true });
  }, 20_000);

  it('LT-R8 connection timeout, retry exhaustion and the deprecated options', async () => {
    // (a) the SDK's own timer
    const a = subscriber({ connectionTimeout: 1, reconnect: {} });
    const aEvents = recorder(a, ['disconnected']);
    await expect(a.connect()).rejects.toMatchObject({
      name: 'WebSocketConnectionError',
      message: 'Connection timeout',
    });
    expect(aEvents.count('disconnected')).toBe(0);

    // (b) retryInitialConnect with maxAttempts 2
    const b = subscriber({
      connectionTimeout: 1,
      reconnect: { retryInitialConnect: true, maxAttempts: 2, initialDelayMs: 250, jitter: 'none' },
    });
    const bEvents = recorder(b, ['reconnecting', 'reconnect_failed']);
    await expect(b.connect()).rejects.toThrow('Max reconnection attempts (2) reached');
    expect(bEvents.count('reconnecting')).toBe(2);
    expect(bEvents.of('reconnect_failed')[0]?.data).toMatchObject({ attempts: 2 });

    // (c) the deprecated keys map to the same policy, with one debug warning
    const env = liveEnv();
    const logs = silenceConsole();
    try {
      const c = subscriber({
        connectionTimeout: 1,
        reconnectInterval: 250,
        maxReconnectAttempts: 2,
        reconnect: { retryInitialConnect: true, jitter: 'none' },
        debug: true,
      });
      const cEvents = recorder(c, ['reconnecting', 'reconnect_failed']);
      await expect(c.connect()).rejects.toThrow('Max reconnection attempts (2) reached');
      expect(cEvents.count('reconnecting')).toBe(2);
      expect(cEvents.of('reconnect_failed')[0]?.data).toMatchObject({ attempts: 2 });
      const deprecated = logs
        .warns()
        .filter((t) => t.includes('reconnectInterval') || t.includes('maxReconnectAttempts'));
      expect(deprecated).toHaveLength(1);
      expect(deprecated[0]).toContain('reconnectInterval');
      expect(deprecated[0]).toContain('maxReconnectAttempts');
      expect(logs.texts().filter((t) => t.includes(env.apiKey))).toHaveLength(0);
    } finally {
      logs.restore();
    }
  }, 20_000);

  it('LT-R9 disconnect() during connect, and the close-wait expiry', async () => {
    // (a) B4 live
    const a = subscriber();
    const pending = a.connect();
    const disconnecting = a.disconnect();
    await expect(pending).rejects.toThrow('Connection aborted by disconnect()');
    await disconnecting;
    await a.connect();
    await expect(a.subscribe()).resolves.toMatchObject({ success: true, types: 'ALL' });
    await a.disconnect();

    // (b) no close echo: terminate() after 3 s
    const mark = socketMark();
    const quiet = noCloseEcho();
    const b = subscriber({ WebSocket: asImpl(quiet.Impl) });
    const events = recorder(b, ['disconnected']);
    await b.connect();
    const started = Date.now();
    await b.disconnect();
    expect(Date.now() - started).toBeGreaterThanOrEqual(3_000);
    expect(quiet.terminations()).toBe(1);
    expect(events.of('disconnected')[0]?.data).toMatchObject({ willReconnect: false });
    expect(b.getState()).toBe('DISCONNECTED');
    expect(framesSince(mark)).toEqual([]);
  }, 30_000);

  it('LT-R10 header authentication', async () => {
    const mark = socketMark();
    const sub = subscriber({ authTransport: 'header' });
    await sub.connect();
    await expect(sub.subscribe('ALL')).resolves.toMatchObject({ success: true });
    const record = socketsSince(mark)[0];
    expect(record).toBeDefined();
    expect(recordUrl(record as NonNullable<typeof record>).search).toBe('');
    expect(record?.headerNames).toContain('x-api-key');
    await sub.disconnect();

    let constructed = 0;
    class NoPingWebSocket {
      readyState = 0;
      onopen = null;
      onclose = null;
      onerror = null;
      onmessage = null;
      constructor() {
        constructed += 1;
      }
      send(): void {}
      close(): void {}
    }
    const before = socketMark();
    const refused = subscriber({ authTransport: 'header', WebSocket: asImpl(NoPingWebSocket) });
    await expect(refused.connect()).rejects.toBeInstanceOf(WebSocketConnectionError);
    expect(constructed).toBe(0);
    expect(socketMark()).toBe(before);
  }, 30_000);

  it('LT-R11a the runtime global WebSocket', async (ctx) => {
    if (typeof globalThis.WebSocket !== 'function')
      skipTest(ctx, 'no global WebSocket in this runtime (Node < 22)');
    const Global = globalThis.WebSocket as unknown as { prototype: { ping?: unknown } };
    const mark = socketMark();
    const sub = subscriber({ WebSocket: asImpl(Global), keepAliveIntervalMs: 1_000 });
    await sub.connect();
    await expect(sub.subscribe('ALL')).resolves.toMatchObject({ success: true, types: 'ALL' });
    await sleep(1_500);
    expect(typeof Global.prototype.ping).toBe('undefined');
    expect(sub.getConnectionStatus().lastPongAt).toBeUndefined();
    expect(socketsSince(mark)).toHaveLength(1);
    await sub.disconnect();

    // the SDK timer fires while the native socket (no terminate()) is CONNECTING: closed through close()
    const timedOut = subscriber({ WebSocket: asImpl(Global), connectionTimeout: 1 });
    await expect(timedOut.connect()).rejects.toThrow('Connection timeout');
    expect(timedOut.getState()).toBe('DISCONNECTED');
  }, 30_000);

  it('LT-R11b automatic resolution of the ws module', async (ctx) => {
    const resolved = await resolveWebSocketImpl(undefined);
    const guarded = (resolved as unknown) === GuardedWs;
    recordFact('websocket.autoResolution.guarded', guarded);
    if (!guarded) skipTest(ctx, 'ws mock not applied to dynamic import');
    const { namespace, apiKey, subscriberUrl } = standaloneConfig();
    const before = socketRecords().length;
    const sub = track(
      new RtlsWebSocketSubscriber({ namespace, apiKey, subscriberUrl, reconnect: false })
    );
    await sub.connect();
    await expect(sub.subscribe('ALL')).resolves.toMatchObject({ success: true });
    expect(socketRecords().length).toBe(before + 1);
    await sub.disconnect();
  }, 30_000);

  it('LT-R12 unified client, createWebSocket() and publisher paths without a position', async () => {
    const env = liveEnv();
    const mapUuid = NO_MAP();
    const mark = socketMark();
    const client = createLiveClient();
    const ws = track(
      client.createWebSocket({ WebSocket: asImpl(GuardedWs), mapUuid, reconnect: false })
    );
    const forwarded = recorder(ws, ['publisher:connected', 'publisher:disconnected']);
    await ws.connect({ subscriberOnly: true });
    expect(ws.isSubscriberConnected()).toBe(true);
    expect(ws.isPublisherConnected()).toBe(false);
    await ws.connect();
    expect(ws.isPublisherConnected()).toBe(true);
    expect(forwarded.count('publisher:connected')).toBe(1);
    await expect(ws.subscribe('ALL')).resolves.toMatchObject({ success: true, types: 'ALL' });

    const never = vi.fn();
    ws.once('message', never);
    ws.off('message', never);
    const seen = vi.fn();
    ws.once('message', seen);
    await waitFor(() => seen.mock.calls.length > 0, 5_000);
    expect(never).not.toHaveBeenCalled();
    expect(seen.mock.calls.length).toBeLessThanOrEqual(1);

    await expect(ws.sendPosition({ macAddress: 'zz', latitude: 0, longitude: 0 })).resolves.toEqual(
      {
        success: false,
        error: expect.stringMatching(/Invalid MAC/),
      }
    );
    await expect(ws.sendBatch([])).resolves.toEqual({ success: true, sent: 0, failed: 0 });
    await expect(
      ws.sendBatch([{ macAddress: testMac(57), latitude: 91, longitude: 0 }])
    ).resolves.toMatchObject({ success: false, sent: 0, failed: 1 });
    const publisherFrames = socketsSince(mark)
      .filter((r) => recordUrl(r).pathname.endsWith('/ws/publisher'))
      .flatMap((r) => r.frames);
    expect(publisherFrames).toHaveLength(0);

    const status = ws.getConnectionStatus();
    expect(status.subscriber.state).toBe('CONNECTED');
    expect(status.publisher?.state).toBe('CONNECTED');
    expect(ws.isConnected()).toBe(true);
    expect(ws.getConfig().mapUuid).toBe(mapUuid);
    expect(ws.getNamespace() === env.namespace).toBe(true);
    expect(ws.getSubscriber()).toBeInstanceOf(RtlsWebSocketSubscriber);
    expect(ws.getPublisher()).toBeInstanceOf(RtlsWebSocketPublisher);
    expect(ws.getSubscription()).toEqual({ types: 'ALL', uuids: null, active: true });

    // the unified client's subscription delegates on its live subscriber socket (subscriber frames only)
    const allTypes = Object.values(SubscriptionType);
    const remainder = allTypes.filter((t) => t !== SubscriptionType.ALERTS);
    const subscriberFrames = (): Record<string, unknown>[] =>
      shapes(
        socketsSince(mark)
          .filter((r) => recordUrl(r).pathname.endsWith('/ws/subscriber'))
          .flatMap((r) => r.frames as Record<string, unknown>[])
      );
    const framesBefore = subscriberFrames().length;
    expect(ws.getActiveSubscriptions()).toEqual(allTypes);
    await ws.setTagFilter([testMac(57)]);
    await ws.unsubscribe(SubscriptionType.ALERTS);
    expect(ws.getActiveSubscriptions()).toEqual(remainder);
    await ws.unsubscribe();
    expect(ws.getActiveSubscriptions()).toEqual([]);
    expect(subscriberFrames().slice(framesBefore)).toEqual([
      { type: 'FILTER_MGT', app_namespace: '<ns>', uuids: [testMac(57)] },
      { type: 'UNSUBSCRIBE', app_namespace: '<ns>' },
      {
        type: 'SUBSCRIBE',
        app_namespace: '<ns>',
        data_type_filter: remainder,
        uuids: [testMac(57)],
      },
      { type: 'UNSUBSCRIBE', app_namespace: '<ns>' },
    ]);
    await ws.disconnect();
    expect(forwarded.count('publisher:disconnected')).toBe(1);

    // without mapUuid: no publisher
    const bare = track(client.createWebSocket({ WebSocket: asImpl(GuardedWs), reconnect: false }));
    const valid = { macAddress: testMac(57), latitude: 48.85, longitude: 2.35 };
    const notConfigured = 'Publisher not configured. Provide mapUuid in config.';
    expect(bare.getPublisher()).toBeNull();
    await expect(bare.sendPosition(valid)).resolves.toEqual({
      success: false,
      error: notConfigured,
    });
    await expect(bare.sendBatch([valid])).resolves.toEqual({
      success: false,
      sent: 0,
      failed: 1,
      errors: [notConfigured],
    });

    // connection failure results (connect cannot succeed in 1 ms; send would throw anyway)
    const { namespace, apiKey, publisherUrl, subscriberUrl } = standaloneConfig();
    const failing = track(
      new RtlsWebSocketPublisher({
        namespace,
        apiKey,
        publisherUrl,
        mapUuid,
        connectionTimeout: 1,
        reconnect: false,
        WebSocket: asImpl(refuseSend()),
      })
    );
    expect(failing.getMapUuid()).toBe(mapUuid);
    await expect(failing.sendPosition(valid)).resolves.toEqual({
      success: false,
      error: expect.stringMatching(/^Connection failed:/),
    });
    await expect(
      failing.sendBatch([valid, { ...valid, macAddress: testMac(58) }])
    ).resolves.toEqual({
      success: false,
      sent: 0,
      failed: 2,
      errors: [expect.stringMatching(/^Connection failed:/)],
    });

    // send failures on real connections, with no frame leaving (B13 live)
    const sendMark = socketMark();
    const publisher = track(
      new RtlsWebSocketPublisher({
        namespace,
        apiKey,
        publisherUrl,
        mapUuid,
        reconnect: false,
        WebSocket: asImpl(refuseSend()),
      })
    );
    const sub = track(
      new RtlsWebSocketSubscriber({
        namespace,
        apiKey,
        subscriberUrl,
        reconnect: false,
        WebSocket: asImpl(refuseSend()),
      })
    );
    await expect(publisher.sendPosition(valid)).resolves.toMatchObject({ success: false });
    await expect(publisher.sendBatch([valid])).resolves.toMatchObject({
      success: false,
      sent: 0,
      failed: 1,
    });
    await sub.connect();
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const started = Date.now();
      const [settled] = await Promise.allSettled([sub.subscribe('ALL')]);
      expect(Date.now() - started).toBeLessThan(2_000);
      expect(settled.status).toBe('rejected');
      const reason = settled.status === 'rejected' ? (settled.reason as Error) : undefined;
      expect(reason).toBeInstanceOf(WebSocketSubscriptionError);
      expect(reason?.cause).toBeDefined();
      await sleep(2_000);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
    expect(framesSince(sendMark)).toEqual([]);
    await Promise.all([publisher.disconnect(), sub.disconnect()]);

    const m = testMac(57);
    expect(normalizeMacAddress(formatMac(m))).toBe(m);
    expect(isValidMacAddress('zz')).toBe(false);
  }, 45_000);

  it('LT-R12b error rows without a position: constructors, provider, validation, pending confirmation, drops', async () => {
    const { namespace, apiKey, subscriberUrl, publisherUrl } = standaloneConfig();
    const mapUuid = NO_MAP();
    // constructors and the credential provider: no socket constructed, no frame
    const before = socketMark();
    expect(() => new RtlsWebSocketSubscriber({ namespace: '', apiKey, subscriberUrl })).toThrow(
      ContextError
    );
    expect(() => new RtlsWebSocketSubscriber({ namespace, subscriberUrl })).toThrow(
      WebSocketAuthenticationError
    );
    expect(
      () => new RtlsWebSocketPublisher({ namespace, apiKey, publisherUrl, mapUuid: '' })
    ).toThrow(ContextError);
    const providerFails = subscriber({
      apiKey: () => {
        throw new Error('sdk-test provider failure');
      },
    });
    await expect(providerFails.connect()).rejects.toSatisfy(
      (e) => e instanceof WebSocketAuthenticationError && e.status === 0
    );
    expect(providerFails.getState()).toBe('DISCONNECTED');

    // invalid subscription input is refused before anything is sent
    for (const request of ['NOPE', { uuids: 'x' }, 42]) {
      await expect(
        providerFails.subscribe(request as unknown as SubscriptionType)
      ).rejects.toBeInstanceOf(WebSocketSubscriptionError);
    }

    // publisher validation: result objects, no socket
    const publisher = track(
      new RtlsWebSocketPublisher({
        namespace,
        apiKey,
        publisherUrl,
        mapUuid,
        reconnect: false,
        WebSocket: asImpl(refuseSend()),
      })
    );
    const valid = { macAddress: testMac(57), latitude: 48.85, longitude: 2.35 };
    const invalid = [
      [{ ...valid, longitude: 181 }, /^Invalid longitude/],
      [{ ...valid, mapUuid: '' }, /^Invalid mapUuid/],
      [{ ...valid, appNamespace: '' }, /^Invalid appNamespace/],
      [{ ...valid, timestamp: 'sdk-test not a date' }, /^Invalid timestamp/],
      [{ ...valid, extra: { origin: 100 } }, /^Invalid extra key\(s\): origin$/],
    ] as const;
    for (const [position, reason] of invalid) {
      await expect(publisher.sendPosition(position)).resolves.toEqual({
        success: false,
        error: expect.stringMatching(reason),
      });
    }
    expect(socketMark()).toBe(before);

    // a close before open with no HTTP status (the handshake aborted by a test-local subclass)
    const aborted = subscriber({ WebSocket: asImpl(abortHandshake()) });
    const abortedEvents = recorder(aborted, ['error', 'disconnected']);
    await expect(aborted.connect()).rejects.toSatisfy(
      (e) => e instanceof WebSocketConnectionError && e.message === 'WebSocket connection error'
    );
    expect([abortedEvents.count('error'), abortedEvents.count('disconnected')]).toEqual([1, 0]);
    expect(socketMark()).toBe(before + 1);

    // disconnect() with a confirmation pending: only microtasks run between the SUBSCRIBE and the disconnect,
    // so no broker frame can be processed in between
    let mark = socketMark();
    const pendingSub = subscriber();
    await pendingSub.connect();
    const pending = pendingSub.subscribe('ALL');
    void Promise.allSettled([pending]);
    for (let i = 0; i < 100 && framesSince(mark).length === 0; i += 1) await Promise.resolve();
    expect(frameTypes(framesSince(mark))).toEqual(['SUBSCRIBE']);
    await pendingSub.disconnect();
    await expect(pending).rejects.toThrow('Disconnected before confirmation');

    // a send failure on a registered socket (the first send goes through, the next one throws)
    mark = socketMark();
    const once = subscriber({ WebSocket: asImpl(sendOnce()) });
    await once.connect();
    await expect(
      once.subscribe({ types: [SubscriptionType.POSITIONS], uuids: [testMac(59)] })
    ).resolves.toMatchObject({ success: true });
    await expect(once.setTagFilter([testMac(58)])).rejects.toSatisfy(
      (e) =>
        e instanceof WebSocketSubscriptionError && /^Subscription change failed/.test(e.message)
    );
    expect(frameTypes(framesSince(mark))).toEqual(['SUBSCRIBE']);
    await once.disconnect();

    // a drop with reconnect:false: disconnected {willReconnect:false}, no reconnect
    mark = socketMark();
    const noRetry = subscriber({ reconnect: false });
    const noRetryEvents = recorder(noRetry, ['disconnected', 'reconnecting']);
    await noRetry.connect();
    (socketsSince(mark)[0]?.socket as unknown as WebSocket).close(4000, 'sdk-test drop');
    expect(await waitFor(() => noRetryEvents.count('disconnected') === 1, 10_000)).toBe(true);
    expect(noRetryEvents.of('disconnected')[0]?.data).toMatchObject({ willReconnect: false });
    await sleep(500);
    expect(noRetryEvents.count('reconnecting')).toBe(0);
    expect(noRetry.getState()).toBe('DISCONNECTED');
    expect(socketsSince(mark)).toHaveLength(1);
  }, 45_000);

  it('LT-R13 known issues on raw frames', async () => {
    const env = liveEnv();
    // (a) USI-P8-1: a re-SUBSCRIBE keeps the type mask but confirms
    const mark = socketMark();
    const sub = subscriber();
    const seen: { at: number; kind: string }[] = [];
    sub.on('message', (m) => seen.push({ at: Date.now(), kind: classifyMessage(m) }));
    await sub.connect();
    await sub.subscribe('ALL');
    const raw = socketsSince(mark)[0]?.socket as unknown as WebSocket;
    const sentAt = Date.now();
    raw.send(
      JSON.stringify({
        type: 'SUBSCRIBE',
        app_namespace: env.namespace,
        data_type_filter: ['ASSETS'],
      })
    );
    const confirmed = await waitFor(
      () => seen.some((e) => e.at >= sentAt && e.kind === 'CONFIRMATION'),
      10_000
    );
    await sleep(10_000);
    await sub.disconnect();
    const positionsAfter = seen.filter((e) => e.at >= sentAt + 1_000 && e.kind === 'POSITIONS');
    await withTraffic('LT-R13a', probe, 1, () =>
      expectKnownServerIssue(
        'USI-P8-1',
        'a re-SUBSCRIBE on a subscribed connection ignores the new data_type_filter but confirms',
        () => {
          expect(confirmed).toBe(true);
          expect(positionsAfter.length).toBeGreaterThan(0);
        }
      )
    );
    expect(confirmed).toBe(true);

    // (b) USI-P8-2: map_uuid in SUBSCRIBE is ignored
    const socket = new GuardedWs(wsUrl('subscriber'), { headers: { 'X-API-Key': env.apiKey } });
    let positions = 0;
    let confirmations = 0;
    try {
      socket.on('message', (data) => {
        const msg = parseJson(data);
        const kind = classifyMessage(msg);
        if (kind === 'POSITIONS') positions += 1;
        if (kind === 'CONFIRMATION') confirmations += 1;
      });
      await new Promise<void>((resolve, reject) => {
        socket.once('open', () => resolve());
        socket.once('error', reject);
      });
      socket.send(
        JSON.stringify({ type: 'SUBSCRIBE', app_namespace: env.namespace, map_uuid: NO_MAP() })
      );
      await waitFor(() => positions > 0, 10_000);
    } finally {
      socket.close(1000);
    }
    expect(confirmations).toBe(1);
    await withTraffic('LT-R13b', probe, 1, () =>
      expectKnownServerIssue('USI-P8-2', 'map_uuid in SUBSCRIBE is ignored', () => {
        expect(positions).toBeGreaterThan(0);
      })
    );
  }, 45_000);

  it('LT-R15 the API key as a token, in the query and in the header', async (ctx) => {
    const env = liveEnv();
    const hex32 = /^[0-9a-f]{32}$/i.test(env.apiKey);
    recordFact('websocket.token.keyIsHex32', hex32);
    if (!hex32) skipTest(ctx, 'API key is not 32 hex; the token branch stays on the 9.5 allowlist');
    const { namespace, subscriberUrl } = standaloneConfig();

    // (a) query form
    let mark = socketMark();
    const query = track(
      new RtlsWebSocketSubscriber({
        namespace,
        subscriberUrl,
        token: env.apiKey,
        WebSocket: asImpl(GuardedWs),
        reconnect: false,
      })
    );
    await query.connect();
    await expect(query.subscribe('ALL')).resolves.toMatchObject({ success: true });
    const queryUrl = recordUrl(
      socketsSince(mark)[0] as NonNullable<ReturnType<typeof socketsSince>[0]>
    );
    expect(queryUrl.searchParams.has('token')).toBe(true);
    expect(queryUrl.searchParams.has('apiKey')).toBe(false);
    await query.disconnect();

    // (b) header form
    mark = socketMark();
    const header = track(
      new RtlsWebSocketSubscriber({
        namespace,
        subscriberUrl,
        token: env.apiKey,
        authTransport: 'header',
        WebSocket: asImpl(GuardedWs),
        reconnect: false,
      })
    );
    await header.connect();
    await expect(header.subscribe('ALL')).resolves.toMatchObject({ success: true });
    const record = socketsSince(mark)[0];
    expect(recordUrl(record as NonNullable<typeof record>).search).toBe('');
    expect(record?.headerNames).toContain('authorization');
    expect(record?.headerNames).not.toContain('x-api-key');
    await header.disconnect();
    recordFact('websocket.token.upgradeAccepted', true);
  }, 30_000);
});
