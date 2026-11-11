// Self-tests of the fake broker (P8-T1, §8.1): the protocol rules of §5.2–§5.5 that the SDK tests rely on.
import {
  FakeBrowserWebSocket,
  FakeNodeWebSocket,
  FakeRtServer,
  assertWsClean,
  flush,
  trackUnhandledRejections,
  type FakeSocket,
} from './support/fake-server';

const SUB = 'ws://fake.test/api/ws/subscriber';
const PUB = 'ws://fake.test/api/ws/publisher';
const NS = 'test_namespace';
const POSITION = { app_namespace: NS, user_uuid: '025d4b000001', lat: 1, lon: 2, map_uuid: 'm' };
const ALERT = { app_namespace: NS, action: 'notifyEvent', event_type: 'NOTIFICATION' };
const HINT = { app_namespace: NS, action: 'updateSettingsEvent' };

interface Probe {
  socket: FakeSocket;
  messages: unknown[];
  closes: { code: number; wasClean: boolean }[];
  errors: unknown[];
  opened: boolean;
}

function probe(socket: FakeSocket): Probe {
  const p: Probe = { socket, messages: [], closes: [], errors: [], opened: false };
  socket.onopen = () => {
    p.opened = true;
  };
  socket.onmessage = (event) => p.messages.push(JSON.parse(String(event.data)));
  socket.onclose = (event) => p.closes.push({ code: event.code, wasClean: event.wasClean });
  socket.onerror = (event) => p.errors.push(event);
  return p;
}

async function connected(
  url = SUB,
  Impl: typeof FakeBrowserWebSocket = FakeBrowserWebSocket
): Promise<Probe> {
  const p = probe(new Impl(url));
  await flush();
  return p;
}

async function send(p: Probe, frame: unknown): Promise<void> {
  p.socket.send(JSON.stringify(frame));
  await flush();
}

const confirmation = { app_namespace: NS, action: 'subscribeEvent' };
let server: FakeRtServer;
const rejections = trackUnhandledRejections();

beforeEach(() => {
  server = new FakeRtServer();
});
afterEach(() => {
  server.stop();
  assertWsClean(rejections.list);
});
afterAll(() => rejections.stop());

describe('upgrade modes', () => {
  it('ok opens on the next microtask', async () => {
    const p = probe(new FakeBrowserWebSocket(SUB));
    expect(p.socket.readyState).toBe(0);
    await flush();
    expect(p.opened).toBe(true);
    expect(p.socket.readyState).toBe(1);
  });

  it.each([
    ['auth401', 'Unexpected server response: 401'],
    ['auth403', 'Unexpected server response: 403'],
    ['bun401', 'WebSocket connection failed: Expected 101 status code, got 401'],
  ] as const)('%s fires error with the runtime message, then close 1006', async (mode, message) => {
    server.mode = mode;
    const p = await connected();
    expect(p.opened).toBe(false);
    expect(p.errors).toStrictEqual([expect.objectContaining({ message })]);
    expect(p.closes).toStrictEqual([{ code: 1006, wasClean: false }]);
  });

  it('error fires error without a status, then close 1006', async () => {
    server.mode = 'error';
    const p = await connected();
    expect(p.errors).toStrictEqual([{ type: 'error' }]);
    expect(p.closes).toStrictEqual([{ code: 1006, wasClean: false }]);
  });

  it('hang never opens nor errors; upgrades[] applies per socket', async () => {
    server.upgrades.push('hang');
    const hung = await connected();
    const next = await connected();
    expect([hung.opened, hung.errors.length, hung.closes.length]).toStrictEqual([false, 0, 0]);
    expect(next.opened).toBe(true);
    hung.socket.close();
    await flush();
    expect(hung.closes).toStrictEqual([{ code: 1006, wasClean: false }]);
  });
});

describe('SUBSCRIBE masks (§5.2)', () => {
  it('no filter = every kind, extra kinds included', async () => {
    const p = await connected();
    await send(p, { type: 'SUBSCRIBE', app_namespace: NS });
    expect(p.messages).toStrictEqual([confirmation]);
    expect(server.emit('POSITIONS', POSITION)).toBe(1);
    expect(server.emit('ALERTS', ALERT)).toBe(1);
    expect(server.emit('SETTINGS_CHANGED', HINT)).toBe(1);
    expect(server.emit('TAG_LOST', ALERT)).toBe(1);
  });

  it('explicit filter delivers only its kinds; extra kinds never', async () => {
    const p = await connected();
    await send(p, { type: 'SUBSCRIBE', app_namespace: NS, data_type_filter: ['POSITIONS'] });
    expect(server.emit('POSITIONS', POSITION)).toBe(1);
    expect(server.emit('ALERTS', ALERT)).toBe(0);
    expect(server.emit('SETTINGS_CHANGED', HINT)).toBe(0);
  });

  it('[] delivers nothing but confirms', async () => {
    const p = await connected();
    await send(p, { type: 'SUBSCRIBE', app_namespace: NS, data_type_filter: [] });
    expect(p.messages).toStrictEqual([confirmation]);
    expect(server.emit('POSITIONS', POSITION)).toBe(0);
  });

  it('an unknown string is skipped silently', async () => {
    const p = await connected();
    await send(p, {
      type: 'SUBSCRIBE',
      app_namespace: NS,
      data_type_filter: ['TAG_LOST', 'ALERTS'],
    });
    expect(p.messages).toStrictEqual([confirmation]);
    expect(server.emit('ALERTS', ALERT)).toBe(1);
    expect(server.emit('TAG_LOST', ALERT)).toBe(0);
  });

  it('re-SUBSCRIBE keeps the first mask and confirms', async () => {
    const p = await connected();
    await send(p, { type: 'SUBSCRIBE', app_namespace: NS, data_type_filter: ['POSITIONS'] });
    await send(p, { type: 'SUBSCRIBE', app_namespace: NS, data_type_filter: ['ALERTS'] });
    expect(p.messages).toStrictEqual([confirmation, confirmation]);
    expect(server.emit('ALERTS', ALERT)).toBe(0);
    expect(server.emit('POSITIONS', POSITION)).toBe(1);
  });

  it('re-SUBSCRIBE with another namespace does not confirm but replaces uuids', async () => {
    const p = await connected();
    await send(p, { type: 'SUBSCRIBE', app_namespace: NS, uuids: ['025d4b000001'] });
    await send(p, { type: 'SUBSCRIBE', app_namespace: 'other', uuids: ['025d4b000002'] });
    expect(p.messages).toStrictEqual([confirmation]);
    expect(server.registration()?.uuids).toStrictEqual(['025d4b000002']);
  });

  it('a SUBSCRIBE without uuids clears the tag filter', async () => {
    const p = await connected();
    await send(p, { type: 'SUBSCRIBE', app_namespace: NS, uuids: ['025d4b000009'] });
    expect(server.emit('POSITIONS', POSITION)).toBe(0);
    await send(p, { type: 'SUBSCRIBE', app_namespace: NS });
    expect(server.registration()?.uuids).toBeNull();
    expect(server.emit('POSITIONS', POSITION)).toBe(1);
  });

  it('the tag filter applies to positions only', async () => {
    const p = await connected();
    await send(p, { type: 'SUBSCRIBE', app_namespace: NS, uuids: ['025d4b000009'] });
    expect(server.emit('POSITIONS', POSITION)).toBe(0);
    expect(server.emit('POSITIONS', { ...POSITION, user_uuid: '025d4b000009' })).toBe(1);
    expect(server.emit('ALERTS', ALERT)).toBe(1);
  });
});

describe('UNSUBSCRIBE and FILTER_MGT', () => {
  it('UNSUBSCRIBE unregisters without a reply; the socket stays open', async () => {
    const p = await connected();
    await send(p, { type: 'SUBSCRIBE', app_namespace: NS });
    await send(p, { type: 'UNSUBSCRIBE', app_namespace: NS });
    expect(p.messages).toStrictEqual([confirmation]);
    expect(server.registration()).toBeUndefined();
    expect(server.emit('POSITIONS', POSITION)).toBe(0);
    expect(p.socket.readyState).toBe(1);
  });

  it('FILTER_MGT replaces uuids; [] / null / missing clear them; no reply', async () => {
    const p = await connected();
    await send(p, { type: 'SUBSCRIBE', app_namespace: NS });
    await send(p, { type: 'FILTER_MGT', app_namespace: NS, uuids: ['025d4b000009'] });
    expect(server.registration()?.uuids).toStrictEqual(['025d4b000009']);
    for (const uuids of [[], null, undefined]) {
      await send(p, { type: 'FILTER_MGT', app_namespace: NS, uuids: ['x'] });
      await send(p, { type: 'FILTER_MGT', app_namespace: NS, uuids });
      expect(server.registration()?.uuids).toBeNull();
    }
    expect(p.messages).toStrictEqual([confirmation]);
  });

  it('FILTER_MGT on an unregistered socket does nothing', async () => {
    const p = await connected();
    await send(p, { type: 'FILTER_MGT', app_namespace: NS, uuids: ['025d4b000009'] });
    expect(server.registration()).toBeUndefined();
    expect(p.closes).toStrictEqual([]);
  });

  it('frames without a string type or app_namespace are ignored', async () => {
    const p = await connected();
    await send(p, { type: 'SUBSCRIBE' });
    await send(p, { type: 1, app_namespace: NS });
    p.socket.send('not json');
    await flush();
    expect(p.messages).toStrictEqual([]);
    expect(server.received()).toStrictEqual([
      { type: 'SUBSCRIBE' },
      { type: 1, app_namespace: NS },
    ]);
  });
});

describe('malformed subscription filters (USI-P8-5)', () => {
  it.each([
    ['non-string data_type_filter element', { data_type_filter: ['POSITIONS', 1] }],
    ['non-array uuids', { uuids: '025d4b000001' }],
    ['non-string uuids element', { uuids: [1] }],
  ])('SUBSCRIBE with a %s', async (_label, extra) => {
    const p = await connected();
    await send(p, { type: 'SUBSCRIBE', app_namespace: NS, ...extra });
    expect(p.closes).toStrictEqual([{ code: 1006, wasClean: false }]);
    expect(p.messages).toStrictEqual([]);
  });

  it('FILTER_MGT with malformed uuids on a registered socket', async () => {
    const p = await connected();
    await send(p, { type: 'SUBSCRIBE', app_namespace: NS });
    await send(p, { type: 'FILTER_MGT', app_namespace: NS, uuids: [null] });
    expect(p.closes).toStrictEqual([{ code: 1006, wasClean: false }]);
  });
});

describe('delivery, publisher, keepalive, closing', () => {
  it('misbehave delivers regardless of mask and registration', async () => {
    await connected();
    server.misbehave = true;
    expect(server.emit('ALERTS', ALERT)).toBe(1);
  });

  it('publisher frames are recorded, arrays ignored, nothing replied', async () => {
    const p = await connected(PUB);
    await send(p, { app_namespace: NS, user_uuid: 'aabbccddeeff' });
    await send(p, [{ app_namespace: NS }]);
    await send(p, { type: 'SUBSCRIBE', app_namespace: NS });
    expect(p.messages).toStrictEqual([]);
    expect(server.received('publisher')).toHaveLength(3);
    expect(server.emit('POSITIONS', POSITION)).toBe(0);
  });

  it('pings are answered with pongs unless noPong', async () => {
    const socket = new FakeNodeWebSocket(SUB, { headers: { 'X-API-Key': 'k' } });
    let pongs = 0;
    socket.on('pong', () => {
      pongs += 1;
    });
    await flush();
    socket.ping();
    await flush();
    server.noPong = true;
    socket.ping();
    await flush();
    expect([socket.pings, pongs]).toStrictEqual([2, 1]);
    expect(socket.headers()).toStrictEqual({ 'X-API-Key': 'k' });
  });

  it('dropAbruptly → 1006 not clean; closeNormal → 1000 clean', async () => {
    const a = await connected();
    server.dropAbruptly();
    const b = await connected();
    server.closeNormal(1000);
    expect(a.closes).toStrictEqual([{ code: 1006, wasClean: false }]);
    expect(b.closes).toStrictEqual([{ code: 1000, wasClean: true }]);
  });

  it('a client close is echoed; noCloseEcho: only terminate() closes', async () => {
    const echoed = await connected();
    echoed.socket.close(1000, 'bye');
    await flush();
    server.noCloseEcho = true;
    const silent = probe(new FakeNodeWebSocket(SUB));
    await flush();
    silent.socket.close(1000, 'bye');
    await flush();
    expect(echoed.closes).toStrictEqual([{ code: 1000, wasClean: true }]);
    expect(silent.closes).toStrictEqual([]);
    (silent.socket as FakeNodeWebSocket).terminate();
    await flush();
    expect(silent.closes).toStrictEqual([{ code: 1006, wasClean: false }]);
  });

  it('send on a closed socket throws; failNextSend throws once', async () => {
    const p = await connected();
    p.socket.failNextSend = new Error('boom');
    expect(() => p.socket.send('{}')).toThrow('boom');
    p.socket.send('{}');
    server.dropAbruptly();
    expect(() => p.socket.send('{}')).toThrow(/not open/);
  });
});
