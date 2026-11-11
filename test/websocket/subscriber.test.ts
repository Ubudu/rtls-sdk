// Subscriber (P8-T7, §8.2 S1–S19) against the protocol-faithful fake broker. Runtime imports come from the
// websocket barrel only (names that exist in the 0.2.0 tree): the named regression tests run against 0.2.0 (§13).
import {
  RtlsWebSocketSubscriber,
  SubscriptionType,
  WebSocketSubscriptionError,
} from '../../src/websocket';
import type { WebSocketSubscriberConfig } from '../../src/websocket';
import {
  FakeBrowserWebSocket,
  FakeRtServer,
  assertWsClean,
  eventNamesOf,
  flush,
  legacyGlobalFallback,
  recordEvents,
  settledState,
  trackUnhandledRejections,
} from './support/fake-server';

const NS = 'test_namespace';
const URL = 'ws://127.0.0.1:1/api/ws/subscriber';
const { POSITIONS, ALERTS, ASSETS, ZONES_ENTRIES_EVENTS, ZONE_STATS_EVENTS } = SubscriptionType;
const POSITION = {
  app_namespace: NS,
  user_uuid: '025d4b000001',
  user_udid: '025d4b000001',
  lat: 1,
  lon: 2,
  map_uuid: 'map-1',
  timestamp: 1,
  zone: { id: 0, name: 'OUTSIDE_ALL_ZONES', tags: [], color: null },
};
const ALERT = {
  app_namespace: NS,
  action: 'notifyEvent',
  event_type: 'NOTIFICATION',
  map_uuid: 'map-1',
};
const ZONE_EVENT = {
  app_namespace: NS,
  action: 'notifyEvent',
  event_type: 'ENTER_ZONE',
  user_udid: '025d4b000001',
  zone: null,
  map_uuid: 'map-1',
};
const ASSET = { type: 'assets', action: 'update', app_namespace: NS, mac_address: '025d4b000001' };
const TAG_LOST = {
  app_namespace: NS,
  action: 'notifyEvent',
  event_type: 'USR_EXIT',
  user_udid: '025d4b000001',
};
const HINT = { app_namespace: NS, action: 'updateSettingsEvent' };
const TYPED = [
  'POSITIONS',
  'ZONES_ENTRIES_EVENTS',
  'ZONE_STATS_EVENTS',
  'ALERTS',
  'ASSETS',
  'TAG_LOST',
  'ALERT_RULES_CHANGED',
  'ASSETS_LIBRARY_CHANGED',
  'DATA_MODELS_CHANGED',
  'SETTINGS_CHANGED',
  'MAP_DATA_CHANGED',
  'unknown',
] as const;

let server: FakeRtServer;
const rejections = trackUnhandledRejections();
const created: RtlsWebSocketSubscriber[] = [];

function subscriber(overrides: Partial<WebSocketSubscriberConfig> = {}): RtlsWebSocketSubscriber {
  const sub = new RtlsWebSocketSubscriber({
    namespace: NS,
    apiKey: 'key-123',
    subscriberUrl: URL,
    WebSocket: FakeBrowserWebSocket,
    ...overrides,
  });
  created.push(sub);
  return sub;
}

async function connected(
  overrides: Partial<WebSocketSubscriberConfig> = {}
): Promise<RtlsWebSocketSubscriber> {
  const sub = subscriber(overrides);
  await sub.connect();
  return sub;
}

const S = (extra: Record<string, unknown> = {}) => ({
  type: 'SUBSCRIBE',
  app_namespace: NS,
  ...extra,
});
const U = { type: 'UNSUBSCRIBE', app_namespace: NS };
const F = (uuids: string[]) => ({ type: 'FILTER_MGT', app_namespace: NS, uuids });

beforeEach(() => {
  vi.useFakeTimers();
  server = new FakeRtServer();
});

afterEach(async () => {
  for (const sub of created.splice(0)) await sub.disconnect();
  server.stop();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  assertWsClean(rejections.list);
  vi.useRealTimers();
});
afterAll(() => rejections.stop());

describe('subscribe()', () => {
  it('S1: subscribe(), "ALL" and [] send no data_type_filter and no map_uuid', async () => {
    const sub = await connected({ mapUuid: 'map-1' });
    const results = [await sub.subscribe(), await sub.subscribe('ALL'), await sub.subscribe([])];
    expect(server.received()).toStrictEqual([S(), U, S(), U, S()]);
    expect(results).toStrictEqual(Array(3).fill({ success: true, types: 'ALL', uuids: null }));
  });

  it('S2: a type or a list → exact data_type_filter (deduplicated, input order); an invalid string sends nothing', async () => {
    const sub = await connected();
    await sub.subscribe(POSITIONS);
    await sub.subscribe([ALERTS, POSITIONS, ALERTS]);
    await expect(sub.subscribe('FOO' as SubscriptionType)).rejects.toBeInstanceOf(
      WebSocketSubscriptionError
    );
    await expect(sub.subscribe([POSITIONS, 'BAR' as SubscriptionType])).rejects.toThrow(
      /Invalid subscription type/
    );
    expect(server.received()).toStrictEqual([
      S({ data_type_filter: ['POSITIONS'] }),
      U,
      S({ data_type_filter: ['ALERTS', 'POSITIONS'] }),
    ]);
  });

  it('regression B14: the result echoes the requested types', async () => {
    const sub = subscriber();
    legacyGlobalFallback(RtlsWebSocketSubscriber.prototype);
    await sub.connect();
    const result = await sub.subscribe([POSITIONS, ALERTS]);
    expect(result.types).toStrictEqual(['POSITIONS', 'ALERTS']);
  });

  it('S3: { types, uuids } normalises MAC-shaped uuids; invalid entries send nothing', async () => {
    const sub = await connected();
    const result = await sub.subscribe({
      types: [POSITIONS],
      uuids: ['AA:BB:CC:DD:EE:FF', 'tag-7', 'aabbccddeeff'],
    });
    expect(result).toStrictEqual({
      success: true,
      types: ['POSITIONS'],
      uuids: ['aabbccddeeff', 'tag-7'],
    });
    await expect(sub.subscribe({ uuids: [''] })).rejects.toBeInstanceOf(WebSocketSubscriptionError);
    await expect(sub.subscribe({ uuids: [1 as unknown as string] })).rejects.toBeInstanceOf(
      WebSocketSubscriptionError
    );
    await expect(sub.subscribe({ uuids: 'x' as unknown as string[] })).rejects.toBeInstanceOf(
      WebSocketSubscriptionError
    );
    await expect(sub.subscribe(42 as unknown as SubscriptionType)).rejects.toBeInstanceOf(
      WebSocketSubscriptionError
    );
    expect(server.received()).toStrictEqual([
      S({ data_type_filter: ['POSITIONS'], uuids: ['aabbccddeeff', 'tag-7'] }),
    ]);
  });

  it('S3: the object form: types absent → ALL; uuids absent keeps the filter, null clears it', async () => {
    const sub = await connected();
    await sub.subscribe({ uuids: ['tag-1'] });
    await sub.subscribe({ types: [ALERTS] });
    await sub.subscribe({ types: 'ALL', uuids: null });
    expect(server.received()).toStrictEqual([
      S({ uuids: ['tag-1'] }),
      U,
      S({ data_type_filter: ['ALERTS'], uuids: ['tag-1'] }),
      U,
      S(),
    ]);
  });

  it('S4: a confirmation for another namespace is ignored → timeout', async () => {
    const sub = await connected();
    server.noConfirm = true;
    const pending = sub.subscribe();
    void Promise.allSettled([pending]);
    await flush();
    server.sendRaw({ app_namespace: 'other_namespace', action: 'subscribeEvent' });
    server.sendRaw({ app_namespace: NS, type: 'subscribeEvent' });
    expect(await settledState(pending)).toBe('pending');
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).rejects.toThrow('Subscription confirmation timeout');
  });

  it('S5: subscriptionTimeoutMs rejects; a late confirmation is ignored', async () => {
    const sub = await connected({ subscriptionTimeoutMs: 50 });
    server.noConfirm = true;
    const pending = sub.subscribe([POSITIONS]);
    void Promise.allSettled([pending]);
    await vi.advanceTimersByTimeAsync(50);
    await expect(pending).rejects.toSatisfy(
      (e) =>
        e instanceof WebSocketSubscriptionError &&
        JSON.stringify((e as { subscriptionTypes?: unknown }).subscriptionTypes) === '["POSITIONS"]'
    );
    server.sendRaw({ app_namespace: NS, action: 'subscribeEvent' });
    await flush();
    // The SUBSCRIBE was sent: the requested state is stored for replay (LT-R6 d).
    expect(sub.getSubscription()).toStrictEqual({
      types: ['POSITIONS'],
      uuids: null,
      active: true,
    });
  });

  it('S5: after a timeout, a drop replays the stored state; replay timeouts end in reconnect_failed', async () => {
    const sub = await connected({
      subscriptionTimeoutMs: 50,
      reconnect: { maxAttempts: 2, initialDelayMs: 250, jitter: 'none' },
    });
    server.noConfirm = true;
    const pending = sub.subscribe({ types: [POSITIONS], uuids: ['tag-1'] });
    void Promise.allSettled([pending]);
    await vi.advanceTimersByTimeAsync(50);
    await expect(pending).rejects.toThrow('Subscription confirmation timeout');
    const log = recordEvents(sub, ['error', 'reconnect_failed']);
    const drops = recordEvents(sub, ['disconnected']);
    server.clearReceived();
    server.dropAbruptly();
    await vi.advanceTimersByTimeAsync(2_000);
    await flush();
    expect(server.received()).toStrictEqual([
      S({ data_type_filter: ['POSITIONS'], uuids: ['tag-1'] }),
      S({ data_type_filter: ['POSITIONS'], uuids: ['tag-1'] }),
    ]);
    expect(eventNamesOf(log)).toStrictEqual(['error', 'error', 'reconnect_failed']);
    expect((log[0]?.data as { error: unknown }).error).toBeInstanceOf(WebSocketSubscriptionError);
    expect(log[2]?.data).toMatchObject({ attempts: 2 });
    // the last drop has no attempt left: willReconnect false, then reconnect_failed
    expect(drops.map((e) => (e.data as { willReconnect: boolean }).willReconnect)).toStrictEqual([
      true,
      true,
      false,
    ]);
    expect(sub.getState()).toBe('DISCONNECTED');
    expect(server.sockets).toHaveLength(3);
  });

  it('S5: a send failure stores no state', async () => {
    const sub = await connected();
    const socket = server.last();
    if (socket) socket.failNextSend = new Error('socket closed');
    await expect(sub.subscribe([POSITIONS])).rejects.toBeInstanceOf(WebSocketSubscriptionError);
    expect(sub.getSubscription()).toBeNull();
  });

  it('S6: a change on a registered socket is UNSUBSCRIBE then SUBSCRIBE; only the new kinds arrive', async () => {
    const sub = await connected();
    const log = recordEvents(sub, TYPED);
    await sub.subscribe([POSITIONS]);
    await sub.subscribe([ALERTS]);
    expect(server.received()).toStrictEqual([
      S({ data_type_filter: ['POSITIONS'] }),
      U,
      S({ data_type_filter: ['ALERTS'] }),
    ]);
    server.emit('POSITIONS', POSITION);
    server.emit('ALERTS', ALERT);
    expect(eventNamesOf(log)).toStrictEqual(['ALERTS']);
  });

  it('regression B3: overlapping subscribe() calls run in order (S, U, S) and both resolve', async () => {
    const sub = subscriber();
    legacyGlobalFallback(RtlsWebSocketSubscriber.prototype);
    await sub.connect();
    const order: string[] = [];
    const first = sub.subscribe([POSITIONS]).then(() => order.push('first'));
    const second = sub.subscribe([ALERTS]).then(() => order.push('second'));
    await flush(30);
    expect(await settledState(first)).toBe('resolved');
    expect(await settledState(second)).toBe('resolved');
    expect(order).toStrictEqual(['first', 'second']);
    expect(server.received()).toStrictEqual([
      S({ data_type_filter: ['POSITIONS'] }),
      U,
      S({ data_type_filter: ['ALERTS'] }),
    ]);
  });

  it('regression B13: a send failure rejects at once and leaves no timer', async () => {
    const sub = subscriber();
    legacyGlobalFallback(RtlsWebSocketSubscriber.prototype);
    await sub.connect();
    const timers = vi.getTimerCount();
    const socket = server.last();
    if (socket) socket.failNextSend = new Error('socket closed');
    const pending = sub.subscribe();
    expect(await settledState(pending)).toBe('rejected');
    await expect(pending).rejects.toSatisfy(
      (e) => e instanceof WebSocketSubscriptionError && (e as Error).cause instanceof Error
    );
    expect(vi.getTimerCount()).toBe(timers);
  });

  it('S18: disconnect() with a pending confirmation rejects "Disconnected before confirmation"', async () => {
    const sub = await connected();
    server.noConfirm = true;
    const pending = sub.subscribe();
    void Promise.allSettled([pending]);
    await flush();
    await sub.disconnect();
    await expect(pending).rejects.toThrow('Disconnected before confirmation');
  });

  it('S18: a close before the confirmation rejects; queued operations then fail "not connected"', async () => {
    const sub = await connected({ reconnect: false });
    server.noConfirm = true;
    const first = sub.subscribe();
    const second = sub.subscribe([ALERTS]);
    void Promise.allSettled([first, second]);
    await flush();
    server.dropAbruptly();
    await expect(first).rejects.toThrow('Connection closed before confirmation');
    await expect(second).rejects.toThrow(/not connected/);
  });

  it('S19: subscribe() before connect() rejects WebSocketSubscriptionError', async () => {
    const sub = subscriber();
    await expect(sub.subscribe()).rejects.toSatisfy(
      (e) => e instanceof WebSocketSubscriptionError && /not connected/.test((e as Error).message)
    );
    expect(server.sockets).toHaveLength(0);
  });
});

describe('unsubscribe() and setTagFilter()', () => {
  it('regression B1: unsubscribe() of the last type sends UNSUBSCRIBE and typed delivery stops', async () => {
    const sub = subscriber();
    legacyGlobalFallback(RtlsWebSocketSubscriber.prototype);
    await sub.connect();
    const positions: unknown[] = [];
    sub.on('POSITIONS', (p) => positions.push(p));
    await sub.subscribe([POSITIONS]);
    await sub.unsubscribe([POSITIONS]);
    server.misbehave = true;
    server.emit('POSITIONS', POSITION);
    expect(server.received()).toStrictEqual([S({ data_type_filter: ['POSITIONS'] }), U]);
    expect(positions).toStrictEqual([]);
  });

  it('S9: unsubscribe() → UNSUBSCRIBE only; inactive; message still fires; no replay after a drop', async () => {
    const sub = await connected({ reconnect: { jitter: 'none', initialDelayMs: 100 } });
    const log = recordEvents(sub, [...TYPED, 'message']);
    await sub.subscribe({ types: [POSITIONS], uuids: ['tag-1'] });
    await sub.unsubscribe();
    expect(sub.getSubscription()).toStrictEqual({
      types: ['POSITIONS'],
      uuids: ['tag-1'],
      active: false,
    });
    server.misbehave = true;
    server.emit('POSITIONS', POSITION);
    expect(eventNamesOf(log)).toStrictEqual(['message', 'message']);
    server.clearReceived();
    server.dropAbruptly();
    await vi.advanceTimersByTimeAsync(100);
    await flush();
    expect(sub.isConnected()).toBe(true);
    expect(server.received()).toStrictEqual([]);
  });

  it('S10: unsubscribe(types) re-subscribes the remainder; the last type → U only; from ALL → the other 4', async () => {
    const sub = await connected();
    await sub.subscribe([POSITIONS, ALERTS]);
    await sub.unsubscribe(ALERTS);
    await sub.unsubscribe([POSITIONS]);
    expect(server.received()).toStrictEqual([
      S({ data_type_filter: ['POSITIONS', 'ALERTS'] }),
      U,
      S({ data_type_filter: ['POSITIONS'] }),
      U,
    ]);
    server.clearReceived();
    await sub.subscribe('ALL');
    await sub.unsubscribe(POSITIONS);
    expect(server.received()).toStrictEqual([
      S(),
      U,
      S({ data_type_filter: [ZONES_ENTRIES_EVENTS, ZONE_STATS_EVENTS, ALERTS, ASSETS] }),
    ]);
    expect(sub.getActiveSubscriptions()).toStrictEqual([
      ZONES_ENTRIES_EVENTS,
      ZONE_STATS_EVENTS,
      ALERTS,
      ASSETS,
    ]);
    await expect(sub.unsubscribe('NOPE' as SubscriptionType)).rejects.toBeInstanceOf(
      WebSocketSubscriptionError
    );
  });

  it('S10: not connected → only the stored state changes', async () => {
    const sub = await connected();
    await sub.subscribe([POSITIONS, ALERTS]);
    await sub.disconnect();
    server.clearReceived();
    await sub.unsubscribe(POSITIONS);
    expect(sub.getSubscription()).toStrictEqual({ types: ['ALERTS'], uuids: null, active: true });
    await sub.unsubscribe();
    expect(sub.getSubscription()).toMatchObject({ active: false });
    const fresh = subscriber();
    await fresh.unsubscribe();
    expect(fresh.getSubscription()).toBeNull();
    expect(server.received()).toStrictEqual([]);
  });

  it('S10: a manual connect() replays the stored active subscription; an inactive one is not replayed', async () => {
    const sub = await connected({ reconnect: false });
    const log = recordEvents(sub, ['reconnected']);
    await sub.subscribe({ types: [POSITIONS, ALERTS], uuids: ['tag-1'] });
    await sub.disconnect();
    await sub.unsubscribe(ALERTS);
    server.clearReceived();
    await sub.connect();
    const replayed = S({ data_type_filter: ['POSITIONS'], uuids: ['tag-1'] });
    expect(server.received()).toStrictEqual([replayed]);
    expect(server.registration()?.mask).toStrictEqual(new Set(['POSITIONS']));
    expect(sub.getSubscription()).toStrictEqual({
      types: ['POSITIONS'],
      uuids: ['tag-1'],
      active: true,
    });
    // a drop without reconnect, then connect(): replayed again
    server.dropAbruptly(server.last());
    expect(sub.getState()).toBe('DISCONNECTED');
    await sub.connect();
    expect(server.received()).toStrictEqual([replayed, replayed]);
    expect(eventNamesOf(log)).toStrictEqual([]);
    // after unsubscribe() nothing is replayed
    await sub.unsubscribe();
    await sub.disconnect();
    server.clearReceived();
    await sub.connect();
    expect(server.received()).toStrictEqual([]);
    expect(server.registration()).toBeUndefined();
  });

  it('S11: setTagFilter → FILTER_MGT when active; null / [] clear; inactive → sent with the next SUBSCRIBE', async () => {
    const sub = await connected();
    await sub.setTagFilter(['AA-BB-CC-DD-EE-FF', 'tag-2', 'tag-2']);
    expect(server.received()).toStrictEqual([]);
    expect(sub.getSubscription()).toBeNull();
    await sub.subscribe([POSITIONS]);
    await sub.setTagFilter(['tag-3']);
    await sub.setTagFilter(null);
    await sub.setTagFilter([]);
    expect(server.received()).toStrictEqual([
      S({ data_type_filter: ['POSITIONS'], uuids: ['aabbccddeeff', 'tag-2'] }),
      F(['tag-3']),
      F([]),
      F([]),
    ]);
    expect(server.registration()?.uuids).toBeNull();
    await expect(sub.setTagFilter([''])).rejects.toBeInstanceOf(WebSocketSubscriptionError);
    await expect(sub.setTagFilter('x' as unknown as string[])).rejects.toBeInstanceOf(
      WebSocketSubscriptionError
    );
    expect(server.received()).toHaveLength(4);
  });

  it('S11: a FILTER_MGT send failure rejects with WebSocketSubscriptionError', async () => {
    const sub = await connected();
    await sub.subscribe();
    const socket = server.last();
    if (socket) socket.failNextSend = new Error('gone');
    await expect(sub.setTagFilter(['tag-1'])).rejects.toBeInstanceOf(WebSocketSubscriptionError);
    if (socket) socket.failNextSend = new Error('gone');
    await expect(sub.unsubscribe()).rejects.toBeInstanceOf(WebSocketSubscriptionError);
    expect(sub.getSubscription()).toMatchObject({ uuids: ['tag-1'], active: false });
  });
});

describe('replay', () => {
  it('regression B2: ALL is replayed without data_type_filter after a drop', async () => {
    const sub = subscriber();
    legacyGlobalFallback(RtlsWebSocketSubscriber.prototype);
    await sub.connect();
    await sub.subscribe();
    server.clearReceived();
    server.dropAbruptly();
    await vi.advanceTimersByTimeAsync(30_000);
    await flush();
    expect(server.received()).toStrictEqual([S()]);
  });

  it('S12: explicit types and uuids are replayed exactly; reconnected fires after the confirmation', async () => {
    const sub = await connected({ reconnect: { jitter: 'none', initialDelayMs: 100 } });
    const log = recordEvents(sub, ['connected', 'reconnected']);
    await sub.subscribe({ types: [POSITIONS, ALERTS], uuids: ['tag-1'] });
    server.clearReceived();
    server.noConfirm = true;
    server.dropAbruptly();
    await vi.advanceTimersByTimeAsync(100);
    await flush();
    expect(server.received()).toStrictEqual([
      S({ data_type_filter: ['POSITIONS', 'ALERTS'], uuids: ['tag-1'] }),
    ]);
    expect(eventNamesOf(log)).toStrictEqual(['connected']);
    server.sendRaw({ app_namespace: NS, action: 'subscribeEvent' });
    await flush();
    expect(eventNamesOf(log)).toStrictEqual(['connected', 'reconnected']);
    expect(log[1]?.data).toMatchObject({ attempt: 1 });
  });

  it('S13: a replay timeout emits error and forces a reconnect', async () => {
    const sub = await connected({
      subscriptionTimeoutMs: 50,
      reconnect: { jitter: 'none', initialDelayMs: 100 },
    });
    await sub.subscribe();
    const log = recordEvents(sub, ['error', 'disconnected', 'reconnecting', 'reconnected']);
    server.noConfirm = true;
    server.dropAbruptly();
    await vi.advanceTimersByTimeAsync(100);
    await flush();
    await vi.advanceTimersByTimeAsync(50);
    expect(eventNamesOf(log)).toStrictEqual([
      'disconnected',
      'reconnecting',
      'error',
      'disconnected',
      'reconnecting',
    ]);
    expect((log[2]?.data as { error: unknown }).error).toBeInstanceOf(WebSocketSubscriptionError);
    expect(log[3]?.data).toMatchObject({
      code: 1006,
      reason: 'Subscription replay failed',
      willReconnect: true,
    });
    expect(log[4]?.data).toMatchObject({ attempt: 2 });
    server.noConfirm = false;
    await vi.advanceTimersByTimeAsync(200);
    await flush();
    expect(eventNamesOf(log).at(-1)).toBe('reconnected');
  });
});

describe('delivery', () => {
  it('S14: with misbehave, explicit types still gate typed events; extra kinds only under ALL', async () => {
    const sub = await connected();
    const log = recordEvents(sub, [...TYPED, 'message']);
    await sub.subscribe([POSITIONS]);
    server.misbehave = true;
    server.emit('ALERTS', ALERT);
    server.emit('TAG_LOST', TAG_LOST);
    server.emit('SETTINGS_CHANGED', HINT);
    server.emit('POSITIONS', POSITION);
    expect(eventNamesOf(log)).toStrictEqual([
      'message',
      'message',
      'message',
      'message',
      'message',
      'POSITIONS',
    ]);
  });

  it('S15: mapUuid drops typed events of another map; message still fires; ASSETS and hints pass', async () => {
    const sub = await connected({ mapUuid: 'map-1' });
    const log = recordEvents(sub, TYPED);
    const messages = recordEvents(sub, ['message']);
    await sub.subscribe();
    for (const payload of [POSITION, ZONE_EVENT, ALERT]) {
      server.sendRaw({ ...payload, map_uuid: 'map-2' });
    }
    server.sendRaw(ASSET);
    server.sendRaw(HINT);
    server.sendRaw(POSITION);
    expect(eventNamesOf(log)).toStrictEqual(['ASSETS', 'SETTINGS_CHANGED', 'POSITIONS']);
    expect(messages).toHaveLength(7);
  });

  it('S16: every fixture kind routes to its typed event; the confirmation is never typed-emitted', async () => {
    const { WS_FIXTURES, loadWsFixture } = await import('./support/validators');
    const sub = await connected();
    await sub.subscribe('ALL');
    for (const { file, kind } of WS_FIXTURES) {
      const log = recordEvents(sub, [...TYPED, 'CONFIRMATION']);
      server.sendRaw(loadWsFixture(file).body);
      const expected = kind === 'CONFIRMATION' ? [] : [kind === 'UNKNOWN' ? 'unknown' : kind];
      expect({ file, events: eventNamesOf(log) }).toStrictEqual({ file, events: expected });
      sub.removeAllListeners();
    }
  });

  it('S17: getActiveSubscriptions() and getSubscription() before and after', async () => {
    const sub = await connected();
    expect([sub.getActiveSubscriptions(), sub.getSubscription()]).toStrictEqual([[], null]);
    await sub.subscribe();
    expect(sub.getActiveSubscriptions()).toStrictEqual([
      POSITIONS,
      ZONES_ENTRIES_EVENTS,
      ZONE_STATS_EVENTS,
      ALERTS,
      ASSETS,
    ]);
    expect(sub.getSubscription()).toStrictEqual({ types: 'ALL', uuids: null, active: true });
    await sub.subscribe([ASSETS]);
    expect(sub.getActiveSubscriptions()).toStrictEqual([ASSETS]);
    await sub.unsubscribe();
    expect(sub.getActiveSubscriptions()).toStrictEqual([]);
  });
});
