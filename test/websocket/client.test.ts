// Unified client (P8-T9, §8.2 U1–U8) and the createWebSocket() compatibility check (P8-T10, U9).
import { RtlsClient } from '../../src/client';
import {
  RtlsWebSocketClient,
  RtlsWebSocketPublisher,
  RtlsWebSocketSubscriber,
  SubscriptionType,
  WebSocketAuthenticationError,
} from '../../src/websocket';
import type { WebSocketClientConfig } from '../../src/websocket';
import {
  FakeBrowserWebSocket,
  FakeNodeWebSocket,
  FakeRtServer,
  assertWsClean,
  eventNamesOf,
  flush,
  recordEvents,
  trackUnhandledRejections,
} from './support/fake-server';

const NS = 'test_namespace';
const SUB_URL = 'ws://127.0.0.1:1/api/ws/subscriber';
const PUB_URL = 'ws://127.0.0.1:1/api/ws/publisher';
const POSITION = {
  app_namespace: NS,
  user_uuid: '025d4b000001',
  user_udid: '025d4b000001',
  lat: 1,
  lon: 2,
  map_uuid: 'map-2',
  timestamp: 1,
  zone: { id: 0, name: 'OUTSIDE_ALL_ZONES', tags: [], color: null },
};
const MINIMAL = { macAddress: '025d4b000001', latitude: 1, longitude: 2 };

let server: FakeRtServer;
const rejections = trackUnhandledRejections();
const created: RtlsWebSocketClient[] = [];

function client(overrides: Partial<WebSocketClientConfig> = {}): RtlsWebSocketClient {
  const ws = new RtlsWebSocketClient({
    namespace: NS,
    apiKey: 'key-123',
    subscriberUrl: SUB_URL,
    publisherUrl: PUB_URL,
    mapUuid: 'map-1',
    WebSocket: FakeBrowserWebSocket,
    ...overrides,
  });
  created.push(ws);
  return ws;
}

beforeEach(() => {
  vi.useFakeTimers();
  server = new FakeRtServer();
});

afterEach(async () => {
  for (const ws of created.splice(0)) await ws.disconnect();
  server.stop();
  assertWsClean(rejections.list);
  vi.useRealTimers();
});
afterAll(() => rejections.stop());

describe('RtlsWebSocketClient', () => {
  it('U1: empty namespace → ContextError; no credential → WebSocketAuthenticationError', () => {
    expect(() => new RtlsWebSocketClient({ namespace: '', apiKey: 'k' })).toThrow(
      expect.objectContaining({ name: 'ContextError', field: 'Namespace' })
    );
    expect(() => new RtlsWebSocketClient({ namespace: NS })).toThrow(WebSocketAuthenticationError);
    expect(
      () => new RtlsWebSocketClient({ namespace: NS, apiKey: 'k', mapUuid: 'm' })
    ).not.toThrow();
  });

  it('U2: connect() both, subscriberOnly, publisherOnly; no mapUuid → no publisher', async () => {
    const both = client();
    await both.connect();
    expect([
      both.isSubscriberConnected(),
      both.isPublisherConnected(),
      both.isConnected(),
    ]).toStrictEqual([true, true, true]);
    const subOnly = client();
    await subOnly.connect({ subscriberOnly: true });
    expect([
      subOnly.isSubscriberConnected(),
      subOnly.isPublisherConnected(),
      subOnly.isConnected(),
    ]).toStrictEqual([true, false, false]);
    const pubOnly = client();
    await pubOnly.connect({ publisherOnly: true });
    expect([pubOnly.isSubscriberConnected(), pubOnly.isPublisherConnected()]).toStrictEqual([
      false,
      true,
    ]);
    const noPublisher = client({ mapUuid: undefined });
    await noPublisher.connect();
    expect(noPublisher.getPublisher()).toBeNull();
    expect([noPublisher.isConnected(), noPublisher.isPublisherConnected()]).toStrictEqual([
      true,
      false,
    ]);
    expect(server.sockets.map((s) => s.url.split('?')[0])).toStrictEqual([
      SUB_URL,
      PUB_URL,
      SUB_URL,
      PUB_URL,
      SUB_URL,
    ]);
  });

  it('U3: subscriber events under their names, publisher lifecycle as publisher:*, once/off', async () => {
    const ws = client({ reconnect: { jitter: 'none', initialDelayMs: 100 } });
    const log = recordEvents(ws, [
      'connected',
      'disconnected',
      'message',
      'POSITIONS',
      'publisher:connected',
      'publisher:disconnected',
      'publisher:reconnecting',
      'publisher:reconnected',
      'publisher:error',
      'publisher:reconnect_failed',
    ]);
    const once = vi.fn();
    const offed = vi.fn();
    ws.once('POSITIONS', once);
    ws.on('POSITIONS', offed);
    ws.off('POSITIONS', offed);
    await ws.connect();
    await ws.subscribe();
    server.emit('POSITIONS', POSITION);
    server.emit('POSITIONS', POSITION);
    server.dropAbruptly(server.sockets[1]);
    await vi.advanceTimersByTimeAsync(100);
    await flush();
    expect(once).toHaveBeenCalledTimes(1);
    expect(offed).not.toHaveBeenCalled();
    expect(eventNamesOf(log)).toStrictEqual([
      'connected',
      'publisher:connected',
      'message',
      'message',
      'POSITIONS',
      'message',
      'POSITIONS',
      'publisher:disconnected',
      'publisher:reconnecting',
      'publisher:connected',
      'publisher:reconnected',
    ]);
  });

  it('U4: subscribe, unsubscribe, setTagFilter, getSubscription, getActiveSubscriptions delegate', async () => {
    const ws = client();
    await ws.connect();
    await expect(ws.subscribe([SubscriptionType.POSITIONS])).resolves.toMatchObject({
      types: ['POSITIONS'],
    });
    await ws.setTagFilter(['tag-1']);
    expect(ws.getSubscription()).toStrictEqual({
      types: ['POSITIONS'],
      uuids: ['tag-1'],
      active: true,
    });
    expect(ws.getActiveSubscriptions()).toStrictEqual(['POSITIONS']);
    await ws.unsubscribe();
    expect(ws.getSubscription()).toMatchObject({ active: false });
    expect(server.commands()).toStrictEqual(['S', 'F', 'U']);
  });

  it('U5: sendPosition / sendBatch without a publisher return "Publisher not configured" results', async () => {
    const ws = client({ mapUuid: undefined });
    await expect(ws.sendPosition(MINIMAL)).resolves.toStrictEqual({
      success: false,
      error: 'Publisher not configured. Provide mapUuid in config.',
    });
    await expect(ws.sendBatch([MINIMAL, MINIMAL])).resolves.toStrictEqual({
      success: false,
      sent: 0,
      failed: 2,
      errors: ['Publisher not configured. Provide mapUuid in config.'],
    });
    const withPublisher = client();
    await expect(withPublisher.sendPosition(MINIMAL)).resolves.toStrictEqual({ success: true });
    await expect(withPublisher.sendBatch([MINIMAL])).resolves.toStrictEqual({
      success: true,
      sent: 1,
      failed: 0,
    });
  });

  it('U6: mapUuid is not passed to the subscriber (a position of another map is still typed-emitted)', async () => {
    const ws = client({ mapUuid: 'map-1' });
    const positions: unknown[] = [];
    ws.on('POSITIONS', (p) => positions.push(p));
    await ws.connect({ subscriberOnly: true });
    await ws.subscribe();
    server.emit('POSITIONS', POSITION);
    expect(positions).toStrictEqual([POSITION]);
  });

  it('U7: status getters; disconnect() closes both', async () => {
    const ws = client();
    expect(ws.getConnectionStatus()).toStrictEqual({
      subscriber: { state: 'DISCONNECTED', reconnectAttempts: 0 },
      publisher: { state: 'DISCONNECTED', reconnectAttempts: 0 },
    });
    await ws.connect();
    expect(ws.getConnectionStatus()).toMatchObject({
      subscriber: { state: 'CONNECTED' },
      publisher: { state: 'CONNECTED' },
    });
    expect(ws.getSubscriber()).toBeInstanceOf(RtlsWebSocketSubscriber);
    expect(ws.getPublisher()).toBeInstanceOf(RtlsWebSocketPublisher);
    expect(ws.getNamespace()).toBe(NS);
    expect(ws.getConfig()).toMatchObject({ namespace: NS, mapUuid: 'map-1' });
    expect(ws.getConfig()).not.toBe(ws.getConfig());
    await ws.disconnect();
    expect(server.openSockets()).toStrictEqual([]);
    expect(ws.getConnectionStatus().publisher?.state).toBe('DISCONNECTED');
    expect(client({ mapUuid: undefined }).getConnectionStatus().publisher).toBeNull();
  });

  it('U8: WebSocket, credentials, keepalive and reconnect reach both; each URL only its socket', async () => {
    const ws = client({
      WebSocket: FakeNodeWebSocket,
      token: 'tok-1',
      authTransport: 'header',
      keepAliveIntervalMs: 1000,
      reconnect: false,
    });
    const log = recordEvents(ws, [
      'disconnected',
      'publisher:disconnected',
      'reconnecting',
      'publisher:reconnecting',
    ]);
    await ws.connect();
    const [sub, pub] = server.sockets as FakeNodeWebSocket[];
    expect([sub?.url, pub?.url]).toStrictEqual([SUB_URL, PUB_URL]);
    expect([sub?.headers(), pub?.headers()]).toStrictEqual([
      { Authorization: 'Bearer tok-1' },
      { Authorization: 'Bearer tok-1' },
    ]);
    await vi.advanceTimersByTimeAsync(1000);
    expect([sub?.pings, pub?.pings]).toStrictEqual([1, 1]);
    server.dropAbruptly();
    expect(eventNamesOf(log)).toStrictEqual(['disconnected', 'publisher:disconnected']);
  });
});

describe('RtlsClient.createWebSocket() (P1 code) builds a working P8 client', () => {
  it('U9: apiKey client → ?apiKey= on both URLs; connect() and subscribe() resolve; accessToken → ?token=', async () => {
    const rest = new RtlsClient({ apiKey: 'k', namespace: NS, baseUrl: 'http://127.0.0.1:1/api' });
    const ws = rest.createWebSocket({
      WebSocket: FakeNodeWebSocket,
      mapUuid: 'm',
      keepAliveIntervalMs: 0,
    });
    created.push(ws);
    await ws.connect();
    await expect(ws.subscribe()).resolves.toStrictEqual({
      success: true,
      types: 'ALL',
      uuids: null,
    });
    expect(server.sockets.map((s) => s.url)).toStrictEqual([
      'ws://127.0.0.1:1/api/ws/subscriber?apiKey=k',
      'ws://127.0.0.1:1/api/ws/publisher?apiKey=k',
    ]);

    const bearer = new RtlsClient({
      accessToken: 'jwt-1',
      namespace: NS,
      baseUrl: 'http://127.0.0.1:1/api',
    });
    const wsToken = bearer.createWebSocket({
      WebSocket: FakeNodeWebSocket,
      keepAliveIntervalMs: 0,
    });
    created.push(wsToken);
    await wsToken.connect();
    expect(server.sockets.map((s) => s.url).slice(2)).toStrictEqual([
      'ws://127.0.0.1:1/api/ws/subscriber?token=jwt-1',
    ]);
  });
});
