// Connection lifecycle (P8-T4, §8.2 C1–C22), exercised through the subscriber and the publisher.
// Runtime imports come from the websocket barrel only (names that exist in the 0.2.0 tree too): this file holds
// named regression tests that the §13 recipe runs against the 0.2.0 sources.
import {
  RtlsWebSocketPublisher,
  RtlsWebSocketSubscriber,
  WEBSOCKET_URLS,
  WebSocketAuthenticationError,
  WebSocketConnectionError,
  WebSocketError,
  WebSocketSendError,
  WebSocketSubscriptionError,
} from '../../src/websocket';
import type { WebSocketSubscriberConfig } from '../../src/websocket';
import {
  FakeBrowserWebSocket,
  FakeNodeWebSocket,
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
const KEY = 'key-123';
const SUB_URL = 'ws://127.0.0.1:1/api/ws/subscriber';
const PUB_URL = 'ws://127.0.0.1:1/api/ws/publisher';
const LIFECYCLE = [
  'connected',
  'disconnected',
  'reconnecting',
  'reconnected',
  'reconnect_failed',
  'error',
] as const;

let server: FakeRtServer;
const rejections = trackUnhandledRejections();
const created: RtlsWebSocketSubscriber[] = [];

function subscriber(overrides: Partial<WebSocketSubscriberConfig> = {}): RtlsWebSocketSubscriber {
  const sub = new RtlsWebSocketSubscriber({
    namespace: NS,
    apiKey: KEY,
    subscriberUrl: SUB_URL,
    WebSocket: FakeBrowserWebSocket,
    ...overrides,
  });
  created.push(sub);
  return sub;
}

function errorOf(log: ReturnType<typeof recordEvents>): unknown[] {
  return log.filter((e) => e.event === 'error').map((e) => (e.data as { error: unknown }).error);
}

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

describe('authentication and URLs', () => {
  it('C1: query auth puts apiKey in the URL; a token wins and is sent alone (D11)', async () => {
    await subscriber().connect();
    await subscriber({ token: 'tok-1' }).connect();
    expect(server.sockets.map((s) => s.url)).toStrictEqual([
      `${SUB_URL}?apiKey=${KEY}`,
      `${SUB_URL}?token=tok-1`,
    ]);
  });

  it('C2: providers are called once per attempt; a rejecting provider rejects connect()', async () => {
    const provider = vi.fn(async () => 'provided-key');
    const sub = subscriber({
      apiKey: provider,
      reconnect: { jitter: 'none', initialDelayMs: 100 },
    });
    await sub.connect();
    expect(provider).toHaveBeenCalledTimes(1);
    server.dropAbruptly();
    await vi.advanceTimersByTimeAsync(100);
    await flush();
    expect(provider).toHaveBeenCalledTimes(2);
    expect(server.sockets.map((s) => s.url)).toStrictEqual([
      `${SUB_URL}?apiKey=provided-key`,
      `${SUB_URL}?apiKey=provided-key`,
    ]);

    const failing = subscriber({
      apiKey: () => Promise.reject(new Error('vault down')),
      reconnect: { retryInitialConnect: true },
    });
    await expect(failing.connect()).rejects.toSatisfy(
      (e) => e instanceof WebSocketAuthenticationError && e.status === 0
    );
    expect(server.sockets).toHaveLength(2);
    expect(failing.getState()).toBe('DISCONNECTED');
  });

  it('C2: a provider failure in a reconnect cycle is one failed attempt; the cycle goes on', async () => {
    let calls = 0;
    const flaky = subscriber({
      apiKey: () => {
        calls += 1;
        if (calls === 2) throw new Error('vault down');
        return 'provided-key';
      },
      reconnect: { jitter: 'none', initialDelayMs: 100, maxAttempts: 3 },
    });
    const log = recordEvents(flaky, LIFECYCLE);
    await flaky.connect();
    server.dropAbruptly(server.last());
    await vi.advanceTimersByTimeAsync(100);
    await flush();
    await vi.advanceTimersByTimeAsync(200);
    await flush();
    expect(eventNamesOf(log)).toStrictEqual([
      'connected',
      'disconnected',
      'reconnecting',
      'error',
      'reconnecting',
      'connected',
      'reconnected',
    ]);
    expect(errorOf(log)[0]).toSatisfy(
      (e) => e instanceof WebSocketAuthenticationError && e.status === 0
    );
    expect([calls, server.sockets.length, flaky.isConnected()]).toStrictEqual([3, 2, true]);

    const down = subscriber({
      apiKey: vi
        .fn()
        .mockReturnValueOnce('provided-key')
        .mockRejectedValue(new Error('vault down')),
      reconnect: { jitter: 'none', initialDelayMs: 100, maxAttempts: 2 },
    });
    const downLog = recordEvents(down, ['reconnecting', 'reconnect_failed']);
    await down.connect();
    server.dropAbruptly(server.last());
    await vi.advanceTimersByTimeAsync(400);
    await flush();
    expect(eventNamesOf(downLog)).toStrictEqual([
      'reconnecting',
      'reconnecting',
      'reconnect_failed',
    ]);
    expect(downLog[2]?.data).toMatchObject({ attempts: 2 });
    expect(down.getState()).toBe('DISCONNECTED');
  });

  it('C3: header auth sends X-API-Key / Bearer with no query; a non-ws implementation is refused', async () => {
    await subscriber({ authTransport: 'header', WebSocket: FakeNodeWebSocket }).connect();
    await subscriber({
      authTransport: 'header',
      WebSocket: FakeNodeWebSocket,
      token: 'tok-1',
    }).connect();
    const [byKey, byToken] = server.sockets as FakeNodeWebSocket[];
    expect([byKey?.url, byKey?.headers()]).toStrictEqual([SUB_URL, { 'X-API-Key': KEY }]);
    expect([byToken?.url, byToken?.headers()]).toStrictEqual([
      SUB_URL,
      { Authorization: 'Bearer tok-1' },
    ]);

    const browser = subscriber({ authTransport: 'header' });
    await expect(browser.connect()).rejects.toSatisfy(
      (e) => e instanceof WebSocketConnectionError && /authTransport "header"/.test(e.message)
    );
    expect(server.sockets).toHaveLength(2);
  });

  it('C4: default URLs; overrides; an existing query is kept and the credential set', async () => {
    const sub = new RtlsWebSocketSubscriber({
      namespace: NS,
      apiKey: KEY,
      WebSocket: FakeBrowserWebSocket,
    });
    created.push(sub);
    await sub.connect();
    const pub = new RtlsWebSocketPublisher({
      namespace: NS,
      apiKey: KEY,
      mapUuid: 'map-1',
      WebSocket: FakeBrowserWebSocket,
    });
    await pub.connect();
    await subscriber({ subscriberUrl: `${SUB_URL}?region=eu&apiKey=old` }).connect();
    const pubOverride = new RtlsWebSocketPublisher({
      namespace: NS,
      apiKey: KEY,
      mapUuid: 'map-1',
      publisherUrl: PUB_URL,
      WebSocket: FakeBrowserWebSocket,
    });
    await pubOverride.connect();
    expect(server.sockets.map((s) => s.url)).toStrictEqual([
      `${WEBSOCKET_URLS.SUBSCRIBER}?apiKey=${KEY}`,
      `${WEBSOCKET_URLS.PUBLISHER}?apiKey=${KEY}`,
      `${SUB_URL}?region=eu&apiKey=${KEY}`,
      `${PUB_URL}?apiKey=${KEY}`,
    ]);
    await pub.disconnect();
    await pubOverride.disconnect();
  });
});

describe('connect()', () => {
  it('regression B5: works with no global WebSocket when an implementation is injected', async () => {
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
    Reflect.deleteProperty(globalThis, 'WebSocket');
    try {
      const sub = subscriber();
      const state = await settledState(sub.connect());
      expect(state).toBe('resolved');
      expect(sub.isConnected()).toBe(true);
      await expect(sub.subscribe()).resolves.toMatchObject({ success: true });
      await sub.disconnect();
      expect(sub.isConnected()).toBe(false);
      expect(server.sockets).toHaveLength(1);
    } finally {
      if (saved) Object.defineProperty(globalThis, 'WebSocket', saved);
    }
  });

  it('C6: idempotent while open; concurrent calls share one socket', async () => {
    const sub = subscriber();
    await Promise.all([sub.connect(), sub.connect()]);
    await sub.connect();
    expect(server.sockets).toHaveLength(1);
    expect(sub.getState()).toBe('CONNECTED');
  });

  it('C7: no open within connectionTimeout → "Connection timeout"; socket closed; no disconnected', async () => {
    server.mode = 'hang';
    const sub = subscriber({ connectionTimeout: 500 });
    const log = recordEvents(sub, LIFECYCLE);
    const pending = sub.connect();
    void Promise.allSettled([pending]);
    await vi.advanceTimersByTimeAsync(500);
    await expect(pending).rejects.toSatisfy(
      (e) => e instanceof WebSocketConnectionError && e.message === 'Connection timeout'
    );
    await flush();
    expect(server.sockets[0]?.readyState).toBe(3);
    expect(eventNamesOf(log)).toStrictEqual(['error']);
    expect(sub.getState()).toBe('DISCONNECTED');
  });

  it('C8: error before open → WebSocketConnectionError, status 0; no disconnected', async () => {
    server.mode = 'error';
    const sub = subscriber();
    const log = recordEvents(sub, LIFECYCLE);
    await expect(sub.connect()).rejects.toSatisfy(
      (e) =>
        e instanceof WebSocketConnectionError &&
        e.message === 'WebSocket connection error' &&
        e.status === 0
    );
    expect(eventNamesOf(log)).toStrictEqual(['error']);
  });

  it.each([
    ['auth401', 401],
    ['auth403', 403],
    ['bun401', 401],
  ] as const)(
    'regression B8: %s → WebSocketAuthenticationError %i, error emitted, no retry',
    async (mode, status) => {
      legacyGlobalFallback(RtlsWebSocketSubscriber.prototype);
      server.mode = mode;
      const sub = subscriber({ reconnect: { retryInitialConnect: true } });
      const log = recordEvents(sub, LIFECYCLE);
      await expect(sub.connect()).rejects.toSatisfy(
        (e) =>
          e instanceof WebSocketAuthenticationError && (e as { status?: number }).status === status
      );
      await vi.advanceTimersByTimeAsync(60_000);
      expect(eventNamesOf(log)).toStrictEqual(['error']);
      expect(server.sockets).toHaveLength(1);
    }
  );

  it('C10: an auth failure during a reconnect cycle stops every further attempt', async () => {
    const sub = subscriber({ reconnect: { jitter: 'none', initialDelayMs: 100 } });
    const log = recordEvents(sub, LIFECYCLE);
    await sub.connect();
    server.mode = 'auth401';
    server.dropAbruptly();
    await vi.advanceTimersByTimeAsync(100);
    await flush();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(eventNamesOf(log)).toStrictEqual([
      'connected',
      'disconnected',
      'reconnecting',
      'error',
      'reconnect_failed',
    ]);
    expect(errorOf(log)[0]).toBeInstanceOf(WebSocketAuthenticationError);
    // the cycle ended on the refusal: reconnect_failed carries the attempts made and the auth error itself
    expect(log[4]?.data).toMatchObject({ attempts: 1 });
    expect((log[4]?.data as { error: unknown }).error).toBe(errorOf(log)[0]);
    expect(server.sockets).toHaveLength(2);
    expect(sub.getState()).toBe('DISCONNECTED');
  });

  it('regression B4: disconnect() while CONNECTING rejects the pending connect(); a new connect() works', async () => {
    legacyGlobalFallback(RtlsWebSocketSubscriber.prototype);
    server.mode = 'hang';
    const sub = subscriber();
    const pending = sub.connect();
    await flush();
    await sub.disconnect();
    expect(await settledState(pending)).toBe('rejected');
    await expect(pending).rejects.toThrow('Connection aborted by disconnect()');
    server.mode = 'ok';
    await sub.connect();
    expect(sub.isConnected()).toBe(true);
  });

  it('C12: disconnect() while RECONNECTING clears the timer; no socket afterwards', async () => {
    const sub = subscriber();
    await sub.connect();
    server.dropAbruptly();
    expect(sub.getState()).toBe('RECONNECTING');
    await sub.disconnect();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(server.sockets).toHaveLength(1);
    expect(sub.getState()).toBe('DISCONNECTED');
  });
});

describe('reconnection', () => {
  it('regression B9: a server close 1000 after open reconnects', async () => {
    legacyGlobalFallback(RtlsWebSocketSubscriber.prototype);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const sub = subscriber();
    const log = recordEvents(sub, LIFECYCLE);
    await sub.connect();
    server.closeNormal(1000);
    await vi.advanceTimersByTimeAsync(30_000);
    await flush();
    expect(eventNamesOf(log)).toStrictEqual([
      'connected',
      'disconnected',
      'reconnecting',
      'connected',
      'reconnected',
    ]);
    expect(sub.isConnected()).toBe(true);
  });

  it('C13: disconnect() and reconnect:false do not reconnect; noCloseEcho → terminate() after 3 s', async () => {
    const sub = subscriber();
    const log = recordEvents(sub, LIFECYCLE);
    await sub.connect();
    await sub.disconnect();
    expect(log[1]?.data).toMatchObject({
      code: 1000,
      reason: 'Client disconnect',
      willReconnect: false,
    });

    const noRetry = subscriber({ reconnect: false });
    const noRetryLog = recordEvents(noRetry, LIFECYCLE);
    await noRetry.connect();
    server.closeNormal(1000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(eventNamesOf(noRetryLog)).toStrictEqual(['connected', 'disconnected']);
    expect(noRetryLog[1]?.data).toMatchObject({ code: 1000, willReconnect: false });
    expect(noRetry.getState()).toBe('DISCONNECTED');

    server.noCloseEcho = true;
    const node = subscriber({ WebSocket: FakeNodeWebSocket, keepAliveIntervalMs: 0 });
    const nodeLog = recordEvents(node, LIFECYCLE);
    await node.connect();
    const closing = node.disconnect();
    expect(node.getState()).toBe('CLOSING');
    await vi.advanceTimersByTimeAsync(2_999);
    const socket = server.last() as FakeNodeWebSocket;
    expect(socket.terminates).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    await closing;
    expect(socket.terminates).toBe(1);
    expect(nodeLog[1]?.data).toMatchObject({ willReconnect: false });
    expect(server.sockets).toHaveLength(3);
  });

  it('C14: full jitter with random 0.5, then jitter none', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const delaysOf = async (overrides: Partial<WebSocketSubscriberConfig>): Promise<number[]> => {
      server.mode = 'ok';
      const sub = subscriber(overrides);
      const log = recordEvents(sub, ['reconnecting']);
      await sub.connect();
      server.mode = 'error';
      server.dropAbruptly();
      for (let i = 0; i < 4; i += 1) {
        const { delay } = log[log.length - 1]?.data as { delay: number };
        await vi.advanceTimersByTimeAsync(delay);
        await flush();
      }
      await sub.disconnect();
      return log.map((e) => (e.data as { delay: number }).delay);
    };
    expect(await delaysOf({})).toStrictEqual([2500, 5000, 10000, 15000, 15000]);
    expect(await delaysOf({ reconnect: { jitter: 'none' } })).toStrictEqual([
      5000, 10000, 20000, 30000, 30000,
    ]);
  });

  it('C15: deprecated options are mapped, reconnect.* wins, one debug warn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const firstDelay = async (overrides: Partial<WebSocketSubscriberConfig>): Promise<unknown> => {
      server.mode = 'ok';
      const sub = subscriber(overrides);
      const log = recordEvents(sub, ['reconnecting']);
      await sub.connect();
      server.mode = 'error';
      server.dropAbruptly();
      await sub.disconnect();
      return log[0]?.data;
    };
    const legacy = { reconnectInterval: 1000, maxReconnectAttempts: 1, debug: true };
    expect(await firstDelay({ ...legacy, reconnect: { jitter: 'none' } })).toMatchObject({
      delay: 1000,
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/reconnectInterval, maxReconnectAttempts/);
    expect(
      await firstDelay({ ...legacy, reconnect: { jitter: 'none', initialDelayMs: 2000 } })
    ).toMatchObject({ delay: 2000 });
    expect(
      await firstDelay({ reconnectInterval: 700, reconnect: { jitter: 'none' } })
    ).toMatchObject({
      delay: 700,
    });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('C16 / C17: maxAttempts 2 → two reconnecting, one reconnect_failed; no disconnected per attempt', async () => {
    const sub = subscriber({ reconnect: { maxAttempts: 2, jitter: 'none', initialDelayMs: 100 } });
    const log = recordEvents(sub, LIFECYCLE);
    await sub.connect();
    server.mode = 'error';
    server.dropAbruptly();
    await vi.advanceTimersByTimeAsync(100);
    await flush();
    expect(sub.getState()).toBe('RECONNECTING');
    await vi.advanceTimersByTimeAsync(200);
    await flush();
    expect(eventNamesOf(log)).toStrictEqual([
      'connected',
      'disconnected',
      'reconnecting',
      'error',
      'reconnecting',
      'error',
      'reconnect_failed',
    ]);
    expect(log[6]?.data).toMatchObject({ attempts: 2 });
    expect((log[6]?.data as { error: Error }).error.message).toBe(
      'Max reconnection attempts (2) reached'
    );
    expect(sub.getState()).toBe('DISCONNECTED');

    // no attempt left at the drop: willReconnect is false and reconnect_failed follows at once
    server.mode = 'ok';
    const none = subscriber({ reconnect: { maxAttempts: 0 } });
    const noneLog = recordEvents(none, LIFECYCLE);
    await none.connect();
    server.dropAbruptly(server.last());
    expect(eventNamesOf(noneLog)).toStrictEqual(['connected', 'disconnected', 'reconnect_failed']);
    expect(noneLog[1]?.data).toMatchObject({ willReconnect: false });
    expect(none.getState()).toBe('DISCONNECTED');
  });

  it('regression B12: a manual connect() during RECONNECTING opens one socket and replays once', async () => {
    legacyGlobalFallback(RtlsWebSocketSubscriber.prototype);
    const sub = subscriber();
    await sub.connect();
    await sub.subscribe();
    server.dropAbruptly();
    server.clearReceived();
    await sub.connect();
    await flush();
    expect(vi.getTimerCount()).toBe(0);
    expect(server.received()).toStrictEqual([{ type: 'SUBSCRIBE', app_namespace: NS }]);
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(server.sockets).toHaveLength(2);
    expect(server.received()).toStrictEqual([{ type: 'SUBSCRIBE', app_namespace: NS }]);
  });

  it('C19: retryInitialConnect retries a failing first connect(); default rejects at once (B22)', async () => {
    server.upgrades.push('hang');
    const sub = subscriber({
      connectionTimeout: 200,
      reconnect: { retryInitialConnect: true, jitter: 'none', initialDelayMs: 100 },
    });
    const log = recordEvents(sub, LIFECYCLE);
    const pending = sub.connect();
    await vi.advanceTimersByTimeAsync(200);
    expect(sub.getState()).toBe('RECONNECTING');
    await vi.advanceTimersByTimeAsync(100);
    await pending;
    expect(eventNamesOf(log)).toStrictEqual(['error', 'reconnecting', 'connected']);

    server.mode = 'error';
    const once = subscriber();
    await expect(once.connect()).rejects.toBeInstanceOf(WebSocketConnectionError);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('keepalive and frames', () => {
  it('C20: ping every interval; a pong sets lastPongAt; no pong → Keepalive timeout, terminate, reconnect', async () => {
    const sub = subscriber({
      WebSocket: FakeNodeWebSocket,
      keepAliveIntervalMs: 1000,
      pongTimeoutMs: 300,
    });
    const log = recordEvents(sub, LIFECYCLE);
    await sub.connect();
    const socket = server.last() as FakeNodeWebSocket;
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(socket.pings).toBe(1);
    expect(sub.getConnectionStatus().lastPongAt).toBeInstanceOf(Date);
    server.noPong = true;
    await vi.advanceTimersByTimeAsync(1300);
    expect(socket.pings).toBe(2);
    expect(socket.terminates).toBe(1);
    const [timeout] = errorOf(log);
    expect(timeout).toSatisfy(
      (e) =>
        e instanceof WebSocketConnectionError &&
        e.message === 'Keepalive timeout' &&
        e.reason === 'idle_timeout'
    );
    expect(eventNamesOf(log).slice(0, 4)).toStrictEqual([
      'connected',
      'error',
      'disconnected',
      'reconnecting',
    ]);
    expect(log[2]?.data).toMatchObject({
      code: 1006,
      reason: 'Keepalive timeout',
      willReconnect: true,
    });
  });

  it('C20: keepAliveIntervalMs 0 and a browser socket never ping', async () => {
    const off = subscriber({ WebSocket: FakeNodeWebSocket, keepAliveIntervalMs: 0 });
    await off.connect();
    const browser = subscriber();
    await browser.connect();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(120_000);
    expect((server.sockets[0] as FakeNodeWebSocket).pings).toBe(0);
  });

  it('C21: string, ArrayBuffer and Uint8Array frames are decoded; invalid JSON is logged and dropped', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const sub = subscriber();
    const messages: unknown[] = [];
    sub.on('message', (m) => messages.push(m));
    await sub.connect();
    expect(sub.getConnectionStatus().lastMessageAt).toBeUndefined();
    const bytes = new TextEncoder().encode('{"n":2}');
    server.sendRaw('{"n":1}');
    server.sendRaw(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    server.sendRaw(new TextEncoder().encode('{"n":3}'));
    expect(() => server.sendRaw('not json')).not.toThrow();
    server.sendRaw('[1,2]');
    expect(messages).toStrictEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
    expect(consoleError).toHaveBeenCalledTimes(2);
    expect(sub.getConnectionStatus().lastMessageAt).toBeInstanceOf(Date);
  });
});

describe('errors and redaction', () => {
  it('C22: constructor checks', () => {
    expect(
      () =>
        new RtlsWebSocketSubscriber({ namespace: '', apiKey: KEY, WebSocket: FakeBrowserWebSocket })
    ).toThrow(expect.objectContaining({ name: 'ContextError', field: 'Namespace', status: 0 }));
    expect(
      () => new RtlsWebSocketSubscriber({ namespace: NS, WebSocket: FakeBrowserWebSocket })
    ).toThrow(expect.objectContaining({ name: 'WebSocketAuthenticationError', status: 0 }));
  });

  it('C22: the 5 classes are StreamError / RtlsError with their code, reason and status', async () => {
    const { RtlsError, StreamError } = await import('../../src/errors');
    const cases: [WebSocketError, string, string][] = [
      [new WebSocketError('x'), 'WEBSOCKET_ERROR', 'network'],
      [new WebSocketConnectionError('x'), 'WEBSOCKET_CONNECTION_ERROR', 'network'],
      [
        new WebSocketConnectionError('Keepalive timeout'),
        'WEBSOCKET_CONNECTION_ERROR',
        'idle_timeout',
      ],
      [new WebSocketAuthenticationError(), 'WEBSOCKET_AUTHENTICATION_ERROR', 'protocol'],
      [
        new WebSocketSubscriptionError('x', ['POSITIONS']),
        'WEBSOCKET_SUBSCRIPTION_ERROR',
        'protocol',
      ],
      [new WebSocketSendError('x', { a: 1 }), 'WEBSOCKET_SEND_ERROR', 'network'],
    ];
    for (const [error, code, reason] of cases) {
      expect(error).toBeInstanceOf(StreamError);
      expect(error).toBeInstanceOf(RtlsError);
      expect(RtlsError.is(error)).toBe(true);
      expect([error.code, error.reason, error.status]).toStrictEqual([code, reason, 0]);
    }
    expect(new WebSocketAuthenticationError('denied', 403).status).toBe(403);
    expect(new WebSocketConnectionError('x', undefined, 502).status).toBe(502);
    expect(new WebSocketError('x', { closeCode: 1006, closeReason: 'gone' })).toMatchObject({
      closeCode: 1006,
      closeReason: 'gone',
    });
    expect(new WebSocketSubscriptionError('x', 'ALL').subscriptionTypes).toBe('ALL');
    expect(new WebSocketSendError('x', { a: 1 }).payload).toStrictEqual({ a: 1 });
  });

  it('C22: debug logging never prints the credential; error messages are masked', async () => {
    const calls: unknown[][] = [];
    for (const method of ['log', 'warn', 'error'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        calls.push(args);
      });
    }
    const secret = 'secret-key-42';
    const sub = subscriber({
      apiKey: secret,
      debug: true,
      reconnect: { jitter: 'none', initialDelayMs: 50 },
    });
    await sub.connect();
    await sub.subscribe();
    server.sendRaw(`not json ${secret}`);
    server.mode = 'auth401';
    server.dropAbruptly();
    await vi.advanceTimersByTimeAsync(50);
    await flush();
    const failing = subscriber({
      apiKey: () => {
        throw new Error(`lookup failed for wss://h/ws?apiKey=${secret}`);
      },
      debug: true,
    });
    await expect(failing.connect()).rejects.toSatisfy(
      (e) =>
        e instanceof WebSocketAuthenticationError &&
        e.message.startsWith('Credential provider failed: lookup failed for <url>') &&
        !e.message.includes(secret)
    );
    expect(calls.length).toBeGreaterThan(3);
    expect(JSON.stringify(calls.map((args) => args.map(String)))).not.toContain(secret);
    expect(JSON.stringify(calls.map((args) => args.map(String)))).not.toMatch(/apiKey=(?!\*\*\*)/);
  });
});
