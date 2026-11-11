// Publisher (P8-T5, §8.2 P1–P13): the frame, validation before connect, and the result shapes. Runtime imports
// come from the websocket barrel only (names that exist in the 0.2.0 tree): regression B6 runs against 0.2.0.
import { RtlsWebSocketPublisher, RtlsWebSocketSubscriber } from '../../src/websocket';
import type { WebSocketPublisherConfig, WebSocketPublishPositionData } from '../../src/websocket';
import {
  FakeBrowserWebSocket,
  FakeRtServer,
  assertWsClean,
  legacyGlobalFallback,
  trackUnhandledRejections,
} from './support/fake-server';

const NS = 'test_namespace';
const URL = 'ws://127.0.0.1:1/api/ws/publisher';
const MAC = '025d4b000001';
const NOW = Date.UTC(2026, 0, 2, 3, 4, 5, 678);
const NOW_ISO = '2026-01-02T03:04:05.678Z';
const MINIMAL: WebSocketPublishPositionData = { macAddress: MAC, latitude: 48.85, longitude: 2.35 };

let server: FakeRtServer;
const rejections = trackUnhandledRejections();
const created: RtlsWebSocketPublisher[] = [];

function publisher(overrides: Partial<WebSocketPublisherConfig> = {}): RtlsWebSocketPublisher {
  const pub = new RtlsWebSocketPublisher({
    namespace: NS,
    apiKey: 'key-123',
    mapUuid: 'map-1',
    publisherUrl: URL,
    WebSocket: FakeBrowserWebSocket,
    ...overrides,
  });
  created.push(pub);
  return pub;
}

const frames = (): Record<string, unknown>[] =>
  server.received('publisher') as Record<string, unknown>[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  server = new FakeRtServer();
});

afterEach(async () => {
  for (const pub of created.splice(0)) await pub.disconnect();
  server.stop();
  vi.unstubAllGlobals();
  assertWsClean(rejections.list);
  vi.useRealTimers();
});
afterAll(() => rejections.stop());

describe('frame', () => {
  it('P1: a minimal input gives exactly the six required keys, in order', async () => {
    await expect(publisher().sendPosition(MINIMAL)).resolves.toStrictEqual({ success: true });
    expect(frames()).toStrictEqual([
      {
        app_namespace: NS,
        user_uuid: MAC,
        lat: 48.85,
        lon: 2.35,
        map_uuid: 'map-1',
        timestamp: NOW_ISO,
      },
    ]);
    expect(Object.keys(frames()[0] ?? {})).toStrictEqual([
      'app_namespace',
      'user_uuid',
      'lat',
      'lon',
      'map_uuid',
      'timestamp',
    ]);
  });

  it('regression B6: no default model, color, user_name, device_info, origin or data is sent', async () => {
    legacyGlobalFallback(RtlsWebSocketSubscriber.prototype);
    const pub = publisher();
    await pub.sendPosition({ macAddress: MAC, latitude: 48.85, longitude: 2.35 });
    const sent = frames()[0] ?? {};
    const injected = ['model', 'color', 'user_name', 'device_info', 'origin', 'data'].filter(
      (k) => k in sent
    );
    expect(injected).toStrictEqual([]);
  });

  it('P3: every optional field in the specified order; extra keys last', async () => {
    await publisher().sendPosition({
      ...MINIMAL,
      extra: { level: 2, battery_percent: 80 },
      data: { k: 'v' },
      origin: 4,
      color: '#fff',
      model: 'Forklift',
      name: 'Asset-001',
    });
    expect(Object.keys(frames()[0] ?? {})).toStrictEqual([
      'app_namespace',
      'user_uuid',
      'lat',
      'lon',
      'map_uuid',
      'timestamp',
      'user_name',
      'model',
      'color',
      'origin',
      'data',
      'level',
      'battery_percent',
    ]);
    expect(frames()[0]).toMatchObject({
      user_name: 'Asset-001',
      origin: 4,
      data: { k: 'v' },
      level: 2,
    });
  });

  it('P4: MACs are normalised; an invalid MAC fails without a frame', async () => {
    const pub = publisher();
    for (const macAddress of ['02:5D:4B:00:00:01', '02-5d-4b-00-00-01', '025D4B000001']) {
      await pub.sendPosition({ ...MINIMAL, macAddress });
    }
    expect(frames().map((f) => f.user_uuid)).toStrictEqual([MAC, MAC, MAC]);
    await expect(pub.sendPosition({ ...MINIMAL, macAddress: 'not-a-mac' })).resolves.toStrictEqual({
      success: false,
      error: expect.stringMatching(/Invalid MAC/),
    });
    expect(frames()).toHaveLength(3);
  });

  it('P5: non-finite or out-of-range coordinates fail; the boundaries pass', async () => {
    const pub = publisher();
    const invalid: Partial<WebSocketPublishPositionData>[] = [
      { latitude: NaN },
      { latitude: Infinity },
      { longitude: -Infinity },
      { latitude: 90.0001 },
      { longitude: -180.0001 },
      { latitude: '1' as unknown as number },
    ];
    for (const patch of invalid) {
      await expect(pub.sendPosition({ ...MINIMAL, ...patch })).resolves.toMatchObject({
        success: false,
      });
    }
    expect(server.sockets).toHaveLength(0);
    for (const [latitude, longitude] of [
      [90, 180],
      [-90, -180],
    ] as const) {
      await expect(pub.sendPosition({ ...MINIMAL, latitude, longitude })).resolves.toStrictEqual({
        success: true,
      });
    }
    expect(frames()).toHaveLength(2);
  });

  it('P6: an empty mapUuid override fails; an empty config mapUuid throws ContextError', async () => {
    await expect(publisher().sendPosition({ ...MINIMAL, mapUuid: '' })).resolves.toStrictEqual({
      success: false,
      error: expect.stringMatching(/mapUuid/),
    });
    expect(frames()).toStrictEqual([]);
    expect(() => publisher({ mapUuid: '' })).toThrow(
      expect.objectContaining({ name: 'ContextError', field: 'mapUuid', status: 0 })
    );
  });

  it('P7: Date, epoch ms and ISO string give the same ISO timestamp; default = now; invalid fails', async () => {
    const pub = publisher();
    const at = Date.UTC(2025, 5, 21, 15, 16, 50);
    for (const timestamp of [new Date(at), at, '2025-06-21T15:16:50Z']) {
      await pub.sendPosition({ ...MINIMAL, timestamp });
    }
    await pub.sendPosition(MINIMAL);
    expect(frames().map((f) => f.timestamp)).toStrictEqual([
      '2025-06-21T15:16:50.000Z',
      '2025-06-21T15:16:50.000Z',
      '2025-06-21T15:16:50.000Z',
      NOW_ISO,
    ]);
    for (const timestamp of ['not a date', 8.64e15 + 1]) {
      await expect(pub.sendPosition({ ...MINIMAL, timestamp })).resolves.toStrictEqual({
        success: false,
        error: expect.stringMatching(/Invalid timestamp/),
      });
    }
  });

  it('P8: each forbidden extra key fails naming it; an allowed key passes through', async () => {
    const pub = publisher();
    const forbidden = [
      'app_namespace',
      'user_uuid',
      'lat',
      'lon',
      'map_uuid',
      'timestamp',
      'user_name',
      'model',
      'color',
      'origin',
      'data',
      'patch_asset_data',
      'declared_location',
      'network_uuid',
      'action',
      'type',
      'event_type',
    ];
    for (const key of forbidden) {
      await expect(pub.sendPosition({ ...MINIMAL, extra: { [key]: 1 } })).resolves.toStrictEqual({
        success: false,
        error: expect.stringContaining(key),
      });
    }
    await expect(
      pub.sendPosition({ ...MINIMAL, extra: [] as unknown as Record<string, unknown> })
    ).resolves.toMatchObject({
      success: false,
    });
    expect(server.sockets).toHaveLength(0);
    await pub.sendPosition({ ...MINIMAL, extra: { level: 3 } });
    expect(frames()).toStrictEqual([expect.objectContaining({ level: 3 })]);
  });

  it('P9: appNamespace overrides app_namespace; an empty one fails', async () => {
    const pub = publisher();
    await pub.sendPosition({ ...MINIMAL, appNamespace: 'other_ns' });
    await expect(pub.sendPosition({ ...MINIMAL, appNamespace: '' })).resolves.toMatchObject({
      success: false,
    });
    await expect(
      pub.sendPosition(null as unknown as WebSocketPublishPositionData)
    ).resolves.toMatchObject({
      success: false,
    });
    expect(frames().map((f) => f.app_namespace)).toStrictEqual(['other_ns']);
  });
});

describe('results and order of operations', () => {
  it('P10: sendBatch sends N frames in order; invalid items are counted; [] is a success', async () => {
    const pub = publisher();
    const result = await pub.sendBatch([
      MINIMAL,
      { ...MINIMAL, macAddress: 'bad-mac' },
      { ...MINIMAL, macAddress: '025d4b000002' },
    ]);
    expect(result).toStrictEqual({
      success: false,
      sent: 2,
      failed: 1,
      errors: [expect.stringMatching(/^bad-mac: Invalid MAC/)],
    });
    expect(frames().map((f) => f.user_uuid)).toStrictEqual([MAC, '025d4b000002']);
    await expect(pub.sendBatch([])).resolves.toStrictEqual({ success: true, sent: 0, failed: 0 });
    await expect(pub.sendBatch([MINIMAL])).resolves.toStrictEqual({
      success: true,
      sent: 1,
      failed: 0,
    });
  });

  it('P10: a send failure on one item is counted with its MAC', async () => {
    const pub = publisher();
    await pub.connect();
    const socket = server.last();
    if (socket) socket.failNextSend = new Error('buffer full');
    await expect(
      pub.sendBatch([MINIMAL, { ...MINIMAL, macAddress: '025d4b000002' }])
    ).resolves.toStrictEqual({
      success: false,
      sent: 1,
      failed: 1,
      errors: [`${MAC}: Send failed: buffer full`],
    });
    if (socket) socket.failNextSend = new Error('buffer full');
    await expect(pub.sendPosition(MINIMAL)).resolves.toStrictEqual({
      success: false,
      error: 'Send failed: buffer full',
    });
  });

  it('P11: auto-connect on send; a connection failure gives "Connection failed:" results', async () => {
    const pub = publisher({ connectionTimeout: 100 });
    await expect(pub.sendPosition(MINIMAL)).resolves.toStrictEqual({ success: true });
    expect(server.sockets).toHaveLength(1);
    await pub.disconnect();
    server.mode = 'hang';
    const single = pub.sendPosition(MINIMAL);
    await vi.advanceTimersByTimeAsync(100);
    await expect(single).resolves.toStrictEqual({
      success: false,
      error: 'Connection failed: Connection timeout',
    });
    const batch = pub.sendBatch([MINIMAL, MINIMAL]);
    await vi.advanceTimersByTimeAsync(100);
    await expect(batch).resolves.toStrictEqual({
      success: false,
      sent: 0,
      failed: 2,
      errors: [expect.stringMatching(/^Connection failed:/)],
    });
  });

  it('P12: an incoming frame fires message; getMapUuid()', async () => {
    const pub = publisher();
    const messages: unknown[] = [];
    pub.on('message', (m) => messages.push(m));
    await pub.connect();
    server.sendRaw({ hello: 'world' });
    expect(messages).toStrictEqual([{ hello: 'world' }]);
    expect(pub.getMapUuid()).toBe('map-1');
  });

  it('P13: invalid input never opens a socket; one valid item connects once and sends one frame', async () => {
    const pub = publisher();
    await pub.sendPosition({ ...MINIMAL, latitude: 200 });
    await pub.sendBatch([
      { ...MINIMAL, macAddress: 'x' },
      { ...MINIMAL, longitude: NaN },
    ]);
    await pub.sendBatch([]);
    expect(server.sockets).toHaveLength(0);
    const result = await pub.sendBatch([MINIMAL, { ...MINIMAL, macAddress: 'x' }]);
    expect(result).toMatchObject({ success: false, sent: 1, failed: 1 });
    expect(server.sockets).toHaveLength(1);
    expect(frames()).toHaveLength(1);
  });
});
