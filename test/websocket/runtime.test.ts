// Runtime helpers (P8-T2, §8.2 R1–R9): implementation resolution with injected dependencies, handshake status,
// ws-like detection, redaction and frame decoding.
import { WebSocketConnectionError, type WebSocketConstructorLike } from '../../src/websocket';
import {
  READY_STATE,
  decodeFrame,
  handshakeStatus,
  isWsLike,
  redactSecrets,
  redactUrl,
  resolveWebSocketImpl,
  type WsRuntimeDeps,
} from '../../src/websocket/runtime';
import { FakeBrowserWebSocket, FakeNodeWebSocket } from './support/fake-server';

const Global = FakeBrowserWebSocket as unknown as WebSocketConstructorLike;
const Ws = FakeNodeWebSocket as unknown as WebSocketConstructorLike;

function deps(overrides: Partial<WsRuntimeDeps>): WsRuntimeDeps {
  return {
    isNode: true,
    importWs: vi.fn(async () => ({ WebSocket: Ws })),
    globalWebSocket: Global,
    ...overrides,
  };
}

describe('resolveWebSocketImpl', () => {
  it('R1: the injected implementation wins', async () => {
    const d = deps({});
    await expect(resolveWebSocketImpl(Global, d)).resolves.toBe(Global);
    expect(d.importWs).not.toHaveBeenCalled();
  });

  it('R2: on Node the ws class (module.WebSocket ?? module.default)', async () => {
    await expect(resolveWebSocketImpl(undefined, deps({}))).resolves.toBe(Ws);
    await expect(
      resolveWebSocketImpl(undefined, deps({ importWs: async () => ({ default: Ws }) }))
    ).resolves.toBe(Ws);
  });

  it('R3: on Node without ws (undefined, a rejection, a throw, a module without a class) → the global', async () => {
    const failing: WsRuntimeDeps['importWs'][] = [
      async () => undefined,
      () => Promise.reject(new Error('Cannot find module')),
      () => {
        throw new Error('sync failure');
      },
      async () => ({ WebSocket: 'not a class' }),
      async () => null,
    ];
    for (const importWs of failing) {
      await expect(resolveWebSocketImpl(undefined, deps({ importWs }))).resolves.toBe(Global);
    }
  });

  it('R4: not Node → the global, ws never imported', async () => {
    const d = deps({ isNode: false });
    await expect(resolveWebSocketImpl(undefined, d)).resolves.toBe(Global);
    expect(d.importWs).not.toHaveBeenCalled();
  });

  it('R5: nothing available → WebSocketConnectionError with the specified message', async () => {
    await expect(
      resolveWebSocketImpl(undefined, deps({ isNode: false, globalWebSocket: undefined }))
    ).rejects.toSatisfy(
      (e) =>
        e instanceof WebSocketConnectionError &&
        e.message ===
          'No WebSocket implementation available: install "ws" (Node) or pass config.WebSocket'
    );
  });

  it('R6: importWs is called once across two resolutions', async () => {
    const d = deps({});
    await resolveWebSocketImpl(undefined, d);
    await resolveWebSocketImpl(undefined, d);
    expect(d.importWs).toHaveBeenCalledTimes(1);
  });

  it('R6: the default dependencies load the real ws package on Node (once)', async () => {
    const ws = await import('ws');
    const first = await resolveWebSocketImpl();
    await expect(resolveWebSocketImpl()).resolves.toBe(first);
    expect(first).toBe(ws.WebSocket ?? ws.default);
  });
});

describe('helpers', () => {
  it('READY_STATE', () => {
    expect(READY_STATE).toStrictEqual({ CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  });

  it('R7: handshakeStatus reads ws, Bun and nested messages; unrelated text → undefined', () => {
    expect(handshakeStatus({ message: 'Unexpected server response: 401' })).toBe(401);
    expect(handshakeStatus('Unexpected server response: 403')).toBe(403);
    expect(
      handshakeStatus({ message: 'WebSocket connection failed: Expected 101 status code, got 401' })
    ).toBe(401);
    expect(handshakeStatus({ error: new Error('Unexpected server response: 502') })).toBe(502);
    expect(handshakeStatus({ error: 'Expected 101 status code: 403' })).toBe(403);
    expect(handshakeStatus({ message: 'socket hang up' })).toBeUndefined();
    expect(handshakeStatus({ type: 'error' })).toBeUndefined();
    expect(handshakeStatus({ error: { code: 1 } })).toBeUndefined();
    expect(handshakeStatus(null)).toBeUndefined();
    expect(handshakeStatus(401)).toBeUndefined();
  });

  it('R8: isWsLike is true only for a class whose prototype has ping', () => {
    expect([isWsLike(FakeNodeWebSocket), isWsLike(FakeBrowserWebSocket)]).toStrictEqual([
      true,
      false,
    ]);
    expect([isWsLike(undefined), isWsLike({ prototype: { ping() {} } })]).toStrictEqual([
      false,
      false,
    ]);
    const noPrototype = (() => undefined) as unknown;
    expect(isWsLike(noPrototype)).toBe(false);
  });

  it('R9: redactUrl keeps origin and path; redactSecrets masks query values and literal secrets', () => {
    expect(redactUrl('wss://user:pw@h.example:8443/api/ws/subscriber?apiKey=k&x=1#f')).toBe(
      'wss://h.example:8443/api/ws/subscriber'
    );
    expect(redactUrl('not a url?apiKey=k')).toBe('not a url');
    expect(redactSecrets('GET /ws?apiKey=abc&token=def x')).toBe('GET /ws?apiKey=***&token=*** x');
    expect(redactSecrets('"k-1" and k-1 and k-2', ['k-1', ''])).toBe('"***" and *** and k-2');
  });

  it('decodeFrame: strings, ArrayBuffer and views; other data → undefined', () => {
    const bytes = new TextEncoder().encode('{"a":"é"}');
    const padded = new Uint8Array([32, ...bytes, 32]);
    expect(decodeFrame('x')).toBe('x');
    expect(decodeFrame(bytes.buffer.slice(0))).toBe('{"a":"é"}');
    expect(decodeFrame(new Uint8Array(padded.buffer, 1, bytes.length))).toBe('{"a":"é"}');
    expect(decodeFrame(new DataView(bytes.buffer))).toBe('{"a":"é"}');
    expect([decodeFrame(42), decodeFrame(null)]).toStrictEqual([undefined, undefined]);
  });
});
