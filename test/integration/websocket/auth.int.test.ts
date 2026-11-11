// The single negative authentication test of the WebSocket suite (spec P8 §9.3, LT-R14). A wrong API key on
// the guarded `ws` class: no frame is ever sent, no other credential, endpoint or path is tried, and the test
// runs once per run. Any outcome other than the two of §9.3 fails with the fixed line and nothing else.
import { expect, it } from 'vitest';
import type WebSocket from 'ws';
import {
  RtlsWebSocketSubscriber,
  WebSocketAuthenticationError,
  WebSocketConnectionError,
  type WebSocketSubscriberConfig,
} from '../../../src';
import { describeLive, liveEnv } from '../harness';
import { installSocketCleanup, pingCounting, socketMark, socketsSince, wsUrl } from './support';

const UNEXPECTED = 'LT-R14: unexpected outcome (see P8 spec 9.3)';

describeLive('R', 'websocket auth', () => {
  installSocketCleanup();

  it('LT-R14 a wrong API key is refused at the upgrade', async () => {
    const mark = socketMark();
    const counted = pingCounting();
    const sub = new RtlsWebSocketSubscriber({
      namespace: liveEnv().namespace,
      subscriberUrl: wsUrl('subscriber'),
      apiKey: 'sdk-test-invalid-key',
      WebSocket: counted.Impl as unknown as NonNullable<WebSocketSubscriberConfig['WebSocket']>,
      reconnect: false,
      keepAliveIntervalMs: 0,
      connectionTimeout: 15_000,
    });

    const [settled] = await Promise.allSettled([sub.connect()]);
    const reason: unknown = settled.status === 'rejected' ? settled.reason : undefined;
    const pass = reason instanceof WebSocketAuthenticationError && reason.status === 401;
    const inconclusive =
      reason instanceof WebSocketConnectionError && reason.message === 'Connection timeout';
    const sockets = socketsSince(mark);

    if (!pass && !inconclusive) {
      for (const record of sockets) (record.socket as unknown as WebSocket).terminate();
      await Promise.allSettled([sub.disconnect()]);
      throw new Error(UNEXPECTED);
    }
    if (inconclusive) throw new Error('Connection timeout');

    expect({
      sockets: sockets.length,
      frames: sockets.reduce((n, r) => n + r.frames.length, 0),
      pings: counted.pings(),
    }).toEqual({ sockets: 1, frames: 0, pings: 0 });
    expect(sub.getState()).toBe('DISCONNECTED');
  }, 30_000);
});
