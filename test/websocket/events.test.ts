// Typed event emitter and debug logger (P8-T8, §8.2 E1–E5). `TypedEventEmitter` exists in the 0.2.0 tree too:
// regression B16 runs against it (§13).
import { DebugLogger, TypedEventEmitter } from '../../src/websocket/events';

interface Events {
  ping: number;
  pong: string;
}

class Emitter extends TypedEventEmitter<Events> {
  fire<K extends keyof Events>(event: K, data: Events[K]): void {
    this.emit(event, data);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TypedEventEmitter', () => {
  it('regression B16: once(h) then off(h) removes the handler', () => {
    const emitter = new Emitter();
    const handler = vi.fn();
    emitter.once('ping', handler);
    emitter.off('ping', handler);
    emitter.fire('ping', 1);
    expect(handler).not.toHaveBeenCalled();
    expect(emitter.listenerCount('ping')).toBe(0);
  });

  it('E2: once fires exactly once; its returned function also removes it', () => {
    const emitter = new Emitter();
    const handler = vi.fn();
    emitter.once('ping', handler);
    emitter.fire('ping', 1);
    emitter.fire('ping', 2);
    expect(handler.mock.calls).toStrictEqual([[1]]);
    const other = vi.fn();
    const off = emitter.once('ping', other);
    off();
    emitter.fire('ping', 3);
    expect(other).not.toHaveBeenCalled();
  });

  it('E3: on returns a working unsubscribe', () => {
    const emitter = new Emitter();
    const handler = vi.fn();
    const off = emitter.on('pong', handler);
    emitter.fire('pong', 'a');
    off();
    emitter.fire('pong', 'b');
    expect(handler.mock.calls).toStrictEqual([['a']]);
  });

  it('E4: a throwing handler does not stop the others; console.error is called', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const emitter = new Emitter();
    const after = vi.fn();
    emitter.on('ping', () => {
      throw new Error('handler bug');
    });
    emitter.on('ping', after);
    emitter.fire('ping', 7);
    expect(after).toHaveBeenCalledWith(7);
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(String(consoleError.mock.calls[0]?.[0])).toContain('"ping"');
  });

  it('E5: listenerCount, hasListeners, eventNames, removeAllListeners(event) and ()', () => {
    const emitter = new Emitter();
    const a = vi.fn();
    emitter.on('ping', a);
    emitter.on('ping', vi.fn());
    emitter.once('pong', vi.fn());
    expect([emitter.listenerCount('ping'), emitter.hasListeners('pong')]).toStrictEqual([2, true]);
    expect(emitter.eventNames()).toStrictEqual(['ping', 'pong']);
    emitter.off('ping', a);
    emitter.removeAllListeners('pong');
    expect([emitter.listenerCount('ping'), emitter.hasListeners('pong')]).toStrictEqual([1, false]);
    expect(emitter.eventNames()).toStrictEqual(['ping']);
    emitter.removeAllListeners();
    expect(emitter.eventNames()).toStrictEqual([]);
    emitter.fire('ping', 1);
    expect(a).not.toHaveBeenCalled();
  });
});

describe('DebugLogger', () => {
  it('log and warn print only in debug mode; the error level always; everything is redacted', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const redact = (text: string): string => text.replaceAll('s3cret', '***');
    const quiet = new DebugLogger('Quiet', false, redact);
    quiet.log('hidden');
    quiet.warn('hidden');
    quiet.print('log', 'hidden');
    quiet.print('error', 'shown s3cret');
    const loud = new DebugLogger('Loud', true, redact);
    loud.log('message s3cret');
    loud.warn('deprecated');
    loud.print('error', 'dropped');
    expect([log.mock.calls.length, warn.mock.calls.length, error.mock.calls.length]).toStrictEqual([
      1, 1, 2,
    ]);
    const printed = JSON.stringify([log.mock.calls, warn.mock.calls, error.mock.calls]);
    expect(printed).not.toContain('s3cret');
    expect(String(log.mock.calls[0]?.[0])).toMatch(/\] \[Loud\] message \*\*\*$/);
    expect(String(warn.mock.calls[0]?.[0])).toContain('[Loud] WARN: deprecated');
    expect(String(error.mock.calls[0]?.[0])).toContain('[Quiet] ERROR: shown ***');
    expect(String(error.mock.calls[1]?.[0])).toContain('[Loud] ERROR: dropped');
    // one argument per call: no data values are printed
    expect(
      [...log.mock.calls, ...warn.mock.calls, ...error.mock.calls].map((c) => c.length)
    ).toStrictEqual([1, 1, 1, 1]);
  });

  it('has no level method of its own for errors (every level goes through print)', () => {
    expect('error' in DebugLogger.prototype).toBe(false);
  });
});
