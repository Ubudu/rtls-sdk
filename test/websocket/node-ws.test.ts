// Real sockets (P8-T13, §8.2 N1–N6): a `ws` WebSocketServer on 127.0.0.1:0 and the real `ws` client, injected.
// Real timers; every test has a 10 s deadline.
import { createServer, type Server, type Socket } from 'node:net';
import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import {
  RtlsWebSocketSubscriber,
  WebSocketAuthenticationError,
  WebSocketConnectionError,
  type WebSocketSubscriberConfig,
} from '../../src/websocket';
import { assertWsClean, trackUnhandledRejections } from './support/fake-server';

const NS = 'test_namespace';
const DEADLINE = 10_000;

interface Broker {
  wss: WebSocketServer;
  url: string;
  upgrades: { url: string; apiKey: string | undefined }[];
  frames: unknown[];
}

const rejections = trackUnhandledRejections();
const cleanups: (() => Promise<void> | void)[] = [];

async function broker(options: { verify401?: boolean; autoPong?: boolean } = {}): Promise<Broker> {
  const upgrades: Broker['upgrades'] = [];
  const frames: unknown[] = [];
  const wss = new WebSocketServer({
    host: '127.0.0.1',
    port: 0,
    autoPong: options.autoPong ?? true,
    verifyClient: (info, done) => {
      const header = info.req.headers['x-api-key'];
      upgrades.push({
        url: info.req.url ?? '',
        apiKey: typeof header === 'string' ? header : undefined,
      });
      if (options.verify401) done(false, 401, 'Unauthorized');
      else done(true);
    },
  });
  wss.on('connection', (socket) => {
    socket.on('message', (data) => {
      const frame: unknown = JSON.parse(String(data));
      frames.push(frame);
      const { type, app_namespace } = frame as { type?: unknown; app_namespace?: unknown };
      if (type === 'SUBSCRIBE')
        socket.send(JSON.stringify({ app_namespace, action: 'subscribeEvent' }));
    });
  });
  await new Promise<void>((resolve) => wss.once('listening', () => resolve()));
  const { port } = wss.address() as AddressInfo;
  cleanups.push(
    () =>
      new Promise<void>((resolve) => {
        for (const client of wss.clients) client.terminate();
        wss.close(() => resolve());
      })
  );
  return { wss, url: `ws://127.0.0.1:${port}/api/ws/subscriber`, upgrades, frames };
}

function subscriber(
  url: string,
  overrides: Partial<WebSocketSubscriberConfig> = {}
): RtlsWebSocketSubscriber {
  const sub = new RtlsWebSocketSubscriber({
    namespace: NS,
    apiKey: 'key-123',
    subscriberUrl: url,
    WebSocket: WebSocket,
    ...overrides,
  });
  cleanups.push(() => sub.disconnect());
  return sub;
}

function nextEvent(sub: RtlsWebSocketSubscriber, event: 'reconnected' | 'error'): Promise<unknown> {
  return new Promise((resolve) => {
    sub.once(event, resolve);
  });
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  assertWsClean(rejections.list);
});
afterAll(() => rejections.stop());

describe('real ws sockets', () => {
  it(
    'N1: a 401 from verifyClient → WebSocketAuthenticationError 401, no retry',
    async () => {
      const b = await broker({ verify401: true });
      const sub = subscriber(b.url, {
        reconnect: { retryInitialConnect: true, initialDelayMs: 50 },
      });
      await expect(sub.connect()).rejects.toSatisfy(
        (e) => e instanceof WebSocketAuthenticationError && e.status === 401
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(b.upgrades).toHaveLength(1);
      expect(sub.getState()).toBe('DISCONNECTED');
    },
    DEADLINE
  );

  it(
    'N2: header auth sends x-api-key and no query',
    async () => {
      const b = await broker();
      const sub = subscriber(b.url, { authTransport: 'header' });
      await sub.connect();
      expect(b.upgrades).toStrictEqual([{ url: '/api/ws/subscriber', apiKey: 'key-123' }]);
      await expect(sub.subscribe()).resolves.toStrictEqual({
        success: true,
        types: 'ALL',
        uuids: null,
      });
    },
    DEADLINE
  );

  it(
    'N3: an upgrade that never gets an answer → "Connection timeout" from the SDK timer, then a retry',
    async () => {
      const held: Socket[] = [];
      const raw: Server = createServer((socket) => {
        held.push(socket);
      });
      await new Promise<void>((resolve) => raw.listen(0, '127.0.0.1', () => resolve()));
      cleanups.push(
        () =>
          new Promise<void>((resolve) => {
            for (const socket of held) socket.destroy();
            raw.close(() => resolve());
          })
      );
      const { port } = raw.address() as AddressInfo;
      const sub = subscriber(`ws://127.0.0.1:${port}/api/ws/subscriber`, {
        connectionTimeout: 300,
        reconnect: {
          retryInitialConnect: true,
          maxAttempts: 1,
          initialDelayMs: 50,
          jitter: 'none',
        },
      });
      const errors: unknown[] = [];
      sub.on('error', ({ error }) => errors.push(error));
      await expect(sub.connect()).rejects.toThrow('Max reconnection attempts (1) reached');
      expect(errors.slice(0, 2)).toStrictEqual([
        expect.objectContaining({ message: 'Connection timeout' }),
        expect.objectContaining({ message: 'Connection timeout' }),
      ]);
      expect(errors[0]).toBeInstanceOf(WebSocketConnectionError);
      expect(held).toHaveLength(2);
    },
    DEADLINE
  );

  it(
    'N4: no pong (autoPong false) → Keepalive timeout, reconnect, replayed SUBSCRIBE',
    async () => {
      const b = await broker({ autoPong: false });
      const sub = subscriber(b.url, {
        keepAliveIntervalMs: 150,
        pongTimeoutMs: 150,
        reconnect: { initialDelayMs: 50, jitter: 'none' },
      });
      await sub.connect();
      await sub.subscribe({ types: ['POSITIONS'], uuids: ['tag-1'] });
      const timeout = nextEvent(sub, 'error');
      const reconnected = nextEvent(sub, 'reconnected');
      await expect(timeout).resolves.toMatchObject({
        error: expect.objectContaining({ message: 'Keepalive timeout', reason: 'idle_timeout' }),
      });
      await reconnected;
      expect(b.frames).toStrictEqual([
        { type: 'SUBSCRIBE', app_namespace: NS, data_type_filter: ['POSITIONS'], uuids: ['tag-1'] },
        { type: 'SUBSCRIBE', app_namespace: NS, data_type_filter: ['POSITIONS'], uuids: ['tag-1'] },
      ]);
    },
    DEADLINE
  );

  it(
    'N5: the server terminates the client socket → reconnect and replay',
    async () => {
      const b = await broker();
      const sub = subscriber(b.url, { reconnect: { initialDelayMs: 50, jitter: 'none' } });
      await sub.connect();
      await sub.subscribe();
      const reconnected = nextEvent(sub, 'reconnected');
      for (const client of b.wss.clients) client.terminate();
      await expect(reconnected).resolves.toMatchObject({ attempt: 1 });
      expect(b.frames).toStrictEqual([
        { type: 'SUBSCRIBE', app_namespace: NS },
        { type: 'SUBSCRIBE', app_namespace: NS },
      ]);
      expect(sub.isConnected()).toBe(true);
    },
    DEADLINE
  );

  it(
    'N6: text frames arrive as strings on onmessage and are parsed by the subscriber',
    async () => {
      const b = await broker();
      b.wss.on('connection', (socket) => socket.send('{"hello":"world"}'));
      const raw = new WebSocket(b.url);
      const data = await new Promise<unknown>((resolve) => {
        raw.onmessage = (event) => resolve(event.data);
      });
      raw.terminate();
      expect(data).toBe('{"hello":"world"}');
      const sub = subscriber(b.url);
      const message = new Promise((resolve) => sub.once('message', resolve));
      await sub.connect();
      await expect(message).resolves.toStrictEqual({ hello: 'world' });
    },
    DEADLINE
  );
});
