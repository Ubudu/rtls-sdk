import { afterEach, describe, expect, it, vi } from 'vitest';
import { setActiveHarness } from './active';
import type { Harness } from './context';
import { expectGuardViolation } from './guard';
import { DUMMY_API_KEY, UNREACHABLE_BASE_URLS } from './policy';
import {
  FOREIGN_MAC,
  inBlock,
  makeHarness,
  SAFE_PREFLIGHT,
  TEST_KEY,
  TEST_MAC,
  TEST_NS,
} from './unit-support';
import {
  allowLocalWebSocketServer,
  guardedWsModule,
  guardWebSocket,
  socketRecords,
} from './ws-guard';

/** Node-`ws`-like fake: ping/terminate/on, constructor (url, protocols?, options?). */
class FakeSocket {
  readyState = 1;
  readonly url: string;
  readonly sent: unknown[] = [];
  terminated = 0;
  closes = 0;
  private readonly handlers = new Map<string, (() => void)[]>();
  constructor(url: string | URL, _protocols?: unknown, _options?: unknown) {
    this.url = String(url);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closes += 1;
    this.readyState = 3;
    this.emit('close');
  }
  terminate(): void {
    this.terminated += 1;
    this.readyState = 3;
    this.emit('close');
  }
  ping(): void {
    this.emit('pong');
  }
  on(type: string, fn: () => void): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]);
  }
  emit(type: string): void {
    for (const fn of this.handlers.get(type) ?? []) fn();
  }
}

/** A fake whose native close only starts the closing handshake (readyState 2). */
class SlowCloseSocket extends FakeSocket {
  close(): void {
    this.closes += 1;
    this.readyState = 2;
  }
}

const Guarded = guardWebSocket(FakeSocket);
const SUB = `wss://rtls.test/api/ws/subscriber?apiKey=${TEST_KEY}&app_namespace=${TEST_NS}`;
const PUB = `wss://rtls.test/api/ws/publisher?apiKey=${TEST_KEY}`;
const frame = (extra: Record<string, unknown>): string =>
  JSON.stringify({ app_namespace: TEST_NS, ...extra });
const subscribe = frame({ type: 'SUBSCRIBE' });

afterEach(() => {
  setActiveHarness(null);
  vi.useRealTimers();
});

function positionsUsed(h: Harness): number {
  return h.budgetReport().positions.used;
}

describe('guardWebSocket connect (G16)', () => {
  it('rejects a foreign host, a wrong path, a foreign app_namespace and the real key to an unreachable URL', async () => {
    makeHarness();
    await expectGuardViolation(
      'G16',
      async () => new Guarded(`wss://evil.test/api/ws/subscriber?apiKey=${TEST_KEY}`)
    );
    await expectGuardViolation(
      'G16',
      async () => new Guarded(`wss://rtls.test/api/ws/other?apiKey=${TEST_KEY}`)
    );
    await expectGuardViolation(
      'G16',
      async () => new Guarded(`wss://rtls.test/ws/subscriber?apiKey=${TEST_KEY}`)
    );
    await expectGuardViolation(
      'G16',
      async () =>
        new Guarded(`wss://rtls.test/api/ws/subscriber?apiKey=${TEST_KEY}&app_namespace=other-ns`)
    );
    await expectGuardViolation(
      'G16',
      async () => new Guarded(`ws://127.0.0.1:9/api/ws/subscriber?apiKey=${TEST_KEY}`)
    );
    expect(socketRecords()).toHaveLength(0);
    const ok = new Guarded(SUB);
    expect(ok).toBeInstanceOf(FakeSocket);
    expect(socketRecords()).toHaveLength(1);
  });

  it('admits an unreachable URL with the dummy key and a loopback server the test registered', () => {
    makeHarness();
    const unreachable = new Guarded(`ws://127.0.0.1:9/api/ws/subscriber?apiKey=${DUMMY_API_KEY}`);
    unreachable.send(JSON.stringify({ type: 'SUBSCRIBE' }));
    expect(new URL(UNREACHABLE_BASE_URLS.blackhole).hostname).toBe('192.0.2.1');
    allowLocalWebSocketServer(45678);
    const local = new Guarded('ws://127.0.0.1:45678/anything');
    local.send('not json');
    expect([unreachable.sent, local.sent]).toEqual([
      [JSON.stringify({ type: 'SUBSCRIBE' })],
      ['not json'],
    ]);
  });

  it('keeps ping, terminate and on of the wrapped class and accepts { headers }', () => {
    makeHarness();
    const socket = new Guarded('wss://rtls.test/api/ws/subscriber', {
      headers: { 'X-API-Key': TEST_KEY },
    });
    const pongs = vi.fn();
    socket.on('pong', pongs);
    socket.ping();
    expect(pongs).toHaveBeenCalledTimes(1);
    socket.send(subscribe);
    expect(socket.sent).toEqual([subscribe]);
    socket.terminate();
    expect(socket.terminated).toBe(1);
  });

  it('socketRecords() redacts apiKey and token values and lists header names only', () => {
    makeHarness();
    new Guarded(SUB);
    new Guarded(`wss://rtls.test/api/ws/subscriber?token=${TEST_KEY}`);
    new Guarded('wss://rtls.test/api/ws/publisher', undefined, {
      headers: { Authorization: `Bearer ${TEST_KEY}` },
    });
    const records = socketRecords();
    expect(records.map((r) => r.url)).toEqual([
      `wss://rtls.test/api/ws/subscriber?apiKey=%3Credacted%3E&app_namespace=${TEST_NS}`,
      'wss://rtls.test/api/ws/subscriber?token=%3Credacted%3E',
      'wss://rtls.test/api/ws/publisher',
    ]);
    expect(records[2]?.headerNames).toEqual(['authorization']);
    expect(JSON.stringify(records.map((r) => [r.url, r.headerNames]))).not.toContain(TEST_KEY);
  });
});

describe('guardWebSocket frames (G16)', () => {
  it('rejects destructive commands and forbidden keys; admits SUBSCRIBE, rejects FOO', async () => {
    makeHarness();
    const socket = new Guarded(SUB);
    for (const bad of [
      frame({ type: 'CLEAR_DATA' }),
      frame({ type: 'UPDATE_MAP_DATA' }),
      frame({ type: 'SUBSCRIBE', patch_asset_data: true }),
      frame({ type: 'SUBSCRIBE', declared_location: { lat: 1 } }),
      frame({ type: 'SUBSCRIBE', network_uuid: 'n' }),
      frame({ type: 'FOO' }),
      JSON.stringify({ type: 'SUBSCRIBE', app_namespace: 'other-ns' }),
      JSON.stringify({ type: 'SUBSCRIBE' }),
      '[1,2]',
      'not json',
    ]) {
      await expectGuardViolation('G16', async () => socket.send(bad));
    }
    expect(socket.sent).toEqual([]);
    for (const ok of [
      subscribe,
      frame({ type: 'UNSUBSCRIBE' }),
      frame({ type: 'FILTER_MGT', uuids: [FOREIGN_MAC] }),
    ]) {
      socket.send(ok);
    }
    expect(socket.sent).toHaveLength(3);
    expect(socketRecords()[0]?.frames).toEqual([
      { app_namespace: TEST_NS, type: 'SUBSCRIBE' },
      { app_namespace: TEST_NS, type: 'UNSUBSCRIBE' },
      { app_namespace: TEST_NS, type: 'FILTER_MGT', uuids: [FOREIGN_MAC] },
    ]);
  });

  it('publisher frames are rejected in R and W blocks; connecting to the publisher path in R is allowed', async () => {
    const { h } = makeHarness({ tiers: { W: true, S: true } });
    const position = frame({ user_uuid: TEST_MAC, lat: 1, lon: 2 });
    for (const tier of ['R', 'W'] as const) {
      await inBlock(h, tier, async () => {
        const socket = new Guarded(PUB);
        await expectGuardViolation('G16', async () => socket.send(position));
        expect(socket.sent).toEqual([]);
      });
    }
    await expectGuardViolation('G16', async () => new Guarded(PUB).send(position));
    expect(positionsUsed(h)).toBe(0);
  });

  it('in an S block a non-test user_uuid is rejected and a test one is counted', async () => {
    const { h } = makeHarness({ tiers: { S: true } });
    await inBlock(
      h,
      'S',
      async () => {
        const socket = new Guarded(PUB);
        await expectGuardViolation('G16', async () =>
          socket.send(frame({ user_uuid: FOREIGN_MAC, lat: 1, lon: 2 }))
        );
        await expectGuardViolation('G16', async () =>
          socket.send(frame({ user_uuid: TEST_MAC, user_udid: FOREIGN_MAC, lat: 1, lon: 2 }))
        );
        expect(positionsUsed(h)).toBe(0);
        socket.send(frame({ user_uuid: TEST_MAC, lat: 1, lon: 2 }));
        expect(positionsUsed(h)).toBe(1);
        expect(socket.sent).toHaveLength(1);
      },
      'websocket'
    );
  });

  it('a frame whose targetApplications names another namespace is rejected (subscriber and publisher)', async () => {
    const { h } = makeHarness({ tiers: { S: true } });
    await expectGuardViolation('G16', async () =>
      new Guarded(SUB).send(frame({ type: 'SUBSCRIBE', targetApplications: ['other-ns'] }))
    );
    await inBlock(
      h,
      'S',
      async () => {
        const socket = new Guarded(PUB);
        for (const targets of [['other-ns'], 'other-ns', [TEST_NS, 'other-ns']])
          await expectGuardViolation('G16', async () =>
            socket.send(frame({ user_uuid: TEST_MAC, lat: 1, lon: 2, targetApplications: targets }))
          );
        expect([positionsUsed(h), socket.sent]).toEqual([0, []]);
        socket.send(frame({ user_uuid: TEST_MAC, lat: 1, lon: 2, targetApplications: [TEST_NS] }));
        expect(socket.sent).toHaveLength(1);
      },
      'websocket'
    );
  });

  it('a publisher frame is rejected when the preflight is unsafe (G18)', async () => {
    const { h } = makeHarness({
      tiers: { S: true },
      preflight: { ...SAFE_PREFLIGHT, positionSafe: false },
    });
    await inBlock(
      h,
      'S',
      async () => {
        const socket = new Guarded(PUB);
        await expectGuardViolation('G18', async () =>
          socket.send(frame({ user_uuid: TEST_MAC, lat: 1, lon: 2 }))
        );
        expect(socket.sent).toEqual([]);
      },
      'websocket'
    );
    expect(positionsUsed(h)).toBe(0);
  });

  it('G18 (e): a publisher frame on a test MAC of another run’s range is rejected; a time-limited positionSafe past its end too', async () => {
    const { h } = makeHarness({ tiers: { S: true } });
    await inBlock(
      h,
      'S',
      async () => {
        const socket = new Guarded(PUB);
        // review round 3: also one digit away (same first three run-id digits, or the four at another offset)
        for (const mac of [
          '025d4b222201',
          '02:5D:4B:22:22:01',
          '025d4b3fa801',
          '02:5d:4b:3f:a8:01',
          '025d4b013fa9',
        ])
          await expectGuardViolation('G18', async () =>
            socket.send(frame({ user_uuid: mac, lat: 1, lon: 2 }))
          );
        await expectGuardViolation('G18', async () =>
          socket.send(frame({ user_uuid: TEST_MAC, user_udid: '025d4b222201', lat: 1, lon: 2 }))
        );
        expect([positionsUsed(h), socket.sent]).toEqual([0, []]);
        socket.send(frame({ user_uuid: TEST_MAC, lat: 1, lon: 2 }));
        expect(positionsUsed(h)).toBe(1);
      },
      'websocket'
    );
    const limited = (until: string) =>
      makeHarness({
        tiers: { S: true },
        preflight: { ...SAFE_PREFLIGHT, timeLimited: ['positionSafe'], timeLimitedUntil: until },
      });
    for (const [until, admitted] of [
      [new Date(Date.now() + 3_600_000).toISOString(), true],
      [new Date(Date.now() - 1_000).toISOString(), false],
    ] as const) {
      const run = limited(until);
      await inBlock(
        run.h,
        'S',
        async () => {
          const socket = new Guarded(PUB);
          const send = (): void => socket.send(frame({ user_uuid: TEST_MAC, lat: 1, lon: 2 }));
          if (admitted) send();
          else await expectGuardViolation('G18', async () => send());
          expect(socket.sent).toHaveLength(admitted ? 1 : 0);
        },
        'websocket'
      );
    }
  });

  it('example mode: publisher frames only in a --write process with S; same G18 rule', async () => {
    const readOnly = makeHarness({
      mode: 'example',
      tiers: { W: true, S: true },
      exampleWrite: false,
    });
    await expectGuardViolation('G16', async () =>
      new Guarded(PUB).send(frame({ user_uuid: TEST_MAC }))
    );
    expect(positionsUsed(readOnly.h)).toBe(0);
    const write = makeHarness({ mode: 'example', tiers: { W: true, S: true }, exampleWrite: true });
    new Guarded(PUB).send(frame({ user_uuid: TEST_MAC }));
    expect(positionsUsed(write.h)).toBe(1);
    makeHarness({
      mode: 'example',
      tiers: { W: true, S: true },
      exampleWrite: true,
      preflight: { ...SAFE_PREFLIGHT, ruleEngineSafe: false },
    });
    await expectGuardViolation('G18', async () =>
      new Guarded(PUB).send(frame({ user_uuid: TEST_MAC }))
    );
  });

  it('a foreign key may connect but never send', async () => {
    makeHarness();
    const socket = new Guarded(`wss://rtls.test/api/ws/subscriber?apiKey=wrong-key`);
    expect(socket.readyState).toBe(1);
    await expectGuardViolation('G16', async () => socket.send(subscribe));
    const none = new Guarded('wss://rtls.test/api/ws/subscriber');
    await expectGuardViolation('G16', async () => none.send(subscribe));
    expect([socket.sent, none.sent]).toEqual([[], []]);
  });

  it('credential sources: ?token= and Authorization: Bearer with the configured key pass, ?token=other cannot send', async () => {
    makeHarness();
    const token = new Guarded(`wss://rtls.test/api/ws/subscriber?token=${TEST_KEY}`);
    token.send(subscribe);
    const bearer = new Guarded('wss://rtls.test/api/ws/subscriber', undefined, {
      headers: { Authorization: `Bearer ${TEST_KEY}` },
    });
    bearer.send(subscribe);
    const other = new Guarded('wss://rtls.test/api/ws/subscriber?token=other-value');
    await expectGuardViolation('G16', async () => other.send(subscribe));
    expect([token.sent.length, bearer.sent.length, other.sent.length]).toEqual([1, 1, 0]);
  });

  it('a subclass of the guarded class still passes every frame through the guard', async () => {
    makeHarness();
    let seen = 0;
    class Counting extends Guarded {
      send(data: string): void {
        seen += 1;
        super.send(data);
      }
    }
    const socket = new Counting(SUB);
    await expectGuardViolation('G16', async () => socket.send(frame({ type: 'CLEAR_DATA' })));
    socket.send(subscribe);
    expect([seen, socket.sent]).toEqual([2, [subscribe]]);
  });
});

describe('socket lifetime (G16)', () => {
  it('closes a socket after 120 s and records a violation', () => {
    vi.useFakeTimers();
    const { h } = makeHarness();
    const socket = new Guarded(SUB);
    vi.advanceTimersByTime(119_999);
    expect(socket.readyState).toBe(1);
    vi.advanceTimersByTime(1);
    expect(socket.readyState).toBe(3);
    expect(h.violations()).toEqual([{ rule: 'G16', method: 'WS', template: '/ws/subscriber' }]);
  });

  it('a socket closed in time is not touched', () => {
    vi.useFakeTimers();
    const { h } = makeHarness();
    const socket = new Guarded(SUB);
    socket.close();
    vi.advanceTimersByTime(200_000);
    expect([socket.closes, socket.terminated]).toEqual([1, 0]);
    expect(h.violations()).toEqual([]);
  });

  it('a subclass whose close() sends nothing is still closed through the wrapped close, else terminate()', () => {
    vi.useFakeTimers();
    makeHarness();
    class NoCloseEcho extends Guarded {
      close(): void {
        // sends nothing (P8 noCloseEcho)
      }
    }
    const quiet = new NoCloseEcho(SUB);
    const SlowGuarded = guardWebSocket(SlowCloseSocket);
    class SlowNoClose extends SlowGuarded {
      close(): void {
        // sends nothing
      }
    }
    const slow = new SlowNoClose(SUB);
    vi.advanceTimersByTime(120_000);
    expect([quiet.readyState, quiet.closes, quiet.terminated]).toEqual([3, 1, 0]);
    expect([slow.readyState, slow.closes, slow.terminated]).toEqual([3, 1, 1]);
  });
});

describe('guardedWsModule', () => {
  it('replaces WebSocket and the default export with the guarded class and keeps the other exports', async () => {
    makeHarness();
    class FakeServer {}
    const mod = await guardedWsModule(async () => ({
      WebSocket: FakeSocket,
      default: FakeSocket,
      WebSocketServer: FakeServer,
    }));
    expect(mod.WebSocket).not.toBe(FakeSocket);
    expect(mod.default).toBe(mod.WebSocket);
    expect(mod.WebSocketServer).toBe(FakeServer);
    const Ws = mod.WebSocket as typeof FakeSocket;
    await expectGuardViolation(
      'G16',
      async () => new Ws(`wss://evil.test/api/ws/subscriber?apiKey=${TEST_KEY}`)
    );
    expect(new Ws(SUB)).toBeInstanceOf(FakeSocket);
  });
});

describe('G16 redirects', () => {
  /** Records the constructor arguments it was given. */
  class ArgsSocket extends FakeSocket {
    static seen: unknown[][] = [];
    constructor(...args: [string | URL, unknown?, unknown?]) {
      super(...args);
      ArgsSocket.seen.push(args);
    }
  }
  const GuardedArgs = guardWebSocket(ArgsSocket);

  it('followRedirects is never enabled: requested → G16; an options object gets followRedirects false, maxRedirects 0', async () => {
    makeHarness();
    ArgsSocket.seen = [];
    await expectGuardViolation('G16', async () => {
      new GuardedArgs(SUB, { followRedirects: true });
    });
    await expectGuardViolation('G16', async () => {
      new GuardedArgs(SUB, [], { followRedirects: true, maxRedirects: 3 });
    });
    expect(ArgsSocket.seen).toEqual([]);
    new GuardedArgs(SUB, { headers: { 'X-Trace': '1' } });
    new GuardedArgs(SUB, ['v1'], { handshakeTimeout: 5 });
    new GuardedArgs(SUB);
    expect(ArgsSocket.seen).toEqual([
      [SUB, { headers: { 'X-Trace': '1' }, followRedirects: false, maxRedirects: 0 }],
      [SUB, ['v1'], { handshakeTimeout: 5, followRedirects: false, maxRedirects: 0 }],
      [SUB],
    ]);
  });
});
