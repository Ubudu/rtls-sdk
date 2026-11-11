/**
 * Notifications stream, tier R (P6 §9.2): open within 10 s (UNVERIFIED-2), both consumption styles, the
 * pre-aborted signal, the idle-timeout reconnect, a throwing listener, the fatal 401 and the network failure path,
 * plus the transport-level abort between two events. Every stream is aborted by its test; no event content is
 * logged.
 */
import { beforeAll } from 'vitest';
import {
  AbortError,
  AuthenticationError,
  NetworkError,
  StreamError,
  ValidationError,
  type NotificationStreamEvent,
  type RtlsClient,
  type RtlsError,
} from '../../../src';
import {
  createLiveClient,
  createUnreachableClient,
  describeLive,
  getHarness,
  requestLog,
} from '../harness';

type OpenData = Extract<NotificationStreamEvent, { type: 'open' }>['data'];
interface ErrorCall {
  error: RtlsError;
  fatal: boolean;
}

/** Requests to the stream route in the harness log of the current test. */
function streamRequests(): number {
  return requestLog().filter(
    (e) => e.method === 'GET' && /\/notifications\/[^/]+\/stream$/.test(e.path)
  ).length;
}

/** Requests of the current test that got an HTTP answer. */
function answered(): number {
  return requestLog().filter((e) => e.status !== undefined).length;
}

describeLive(
  'R',
  'notifications stream',
  () => {
    describe.sequential('stream', () => {
      let client: RtlsClient;
      let NS: string;
      let selfId: string;

      beforeAll(async () => {
        client = createLiveClient();
        NS = getHarness().env.namespace;
        selfId = (await client.notifications.cleanupPolicy.get()).user_id;
      });

      it(
        '1 receives open within 10 s and ends aborted (UNVERIFIED-2)',
        { timeout: 30_000 },
        async () => {
          const controller = new AbortController();
          const deadline = setTimeout(() => controller.abort(), 15_000);
          const started = Date.now();
          const stream = client.notifications.stream({ signal: controller.signal });
          const opened = await new Promise<{ data: OpenData; ms: number } | null>((resolve) => {
            const late = setTimeout(() => resolve(null), 10_000);
            stream.on('open', (event) => {
              clearTimeout(late);
              resolve({ data: event.data, ms: Date.now() - started });
            });
          });
          controller.abort();
          clearTimeout(deadline);
          expect(opened?.data).toEqual({ app_namespace: NS, user_id: selfId });
          expect(opened?.ms ?? Infinity).toBeLessThanOrEqual(10_000);
          expect(await stream.done).toEqual({ reason: 'aborted' });
        }
      );

      it(
        '2 for await: the first event is open; break ends it aborted',
        { timeout: 30_000 },
        async () => {
          const controller = new AbortController();
          const deadline = setTimeout(() => controller.abort(), 15_000);
          const stream = client.notifications.stream({ signal: controller.signal });
          let first: string | undefined;
          for await (const event of stream) {
            first = event.type;
            break;
          }
          clearTimeout(deadline);
          controller.abort();
          expect(first).toBe('open');
          expect(await stream.done).toEqual({ reason: 'aborted' });
        }
      );

      it('3 a pre-aborted signal sends no request', { timeout: 15_000 }, async () => {
        const before = streamRequests();
        const stream = client.notifications.stream({ signal: AbortSignal.abort() });
        expect(await stream.done).toEqual({ reason: 'aborted' });
        await new Promise((resolve) => setTimeout(resolve, 200));
        expect(streamRequests()).toBe(before);
      });

      it(
        '4 an idle timeout reconnects once (live idle-timeout path)',
        { timeout: 30_000 },
        async () => {
          const before = streamRequests();
          const controller = new AbortController();
          const deadline = setTimeout(() => controller.abort(), 20_000);
          const errors: ErrorCall[] = [];
          const reconnects: number[] = [];
          const stream = client.notifications
            .stream({
              signal: controller.signal,
              idleTimeoutMs: 1000,
              reconnect: { initialDelayMs: 100 },
            })
            .on('error', (error, info) => errors.push({ error, fatal: info.fatal }))
            .on('reconnected', (event) => {
              reconnects.push(event.data.attempt);
              controller.abort();
            });
          const end = await stream.done;
          clearTimeout(deadline);
          expect(end).toEqual({ reason: 'aborted' });
          expect(reconnects).toEqual([1]);
          expect(errors).toHaveLength(1);
          expect(errors[0]?.fatal).toBe(false);
          expect(errors[0]?.error).toBeInstanceOf(StreamError);
          expect((errors[0]?.error as StreamError).reason).toBe('idle_timeout');
          const made = streamRequests() - before;
          expect(made).toBeGreaterThanOrEqual(2);
          expect(made).toBeLessThanOrEqual(3);
        }
      );

      it(
        '5 a throwing listener is reported as a protocol StreamError',
        { timeout: 30_000 },
        async () => {
          const controller = new AbortController();
          const deadline = setTimeout(() => controller.abort(), 15_000);
          const boom = new Error('listener failure');
          const errors: ErrorCall[] = [];
          const stream = client.notifications
            .stream({ signal: controller.signal })
            .on('error', (error, info) => {
              errors.push({ error, fatal: info.fatal });
              controller.abort();
            })
            .on('open', () => {
              throw boom;
            });
          expect(await stream.done).toEqual({ reason: 'aborted' });
          clearTimeout(deadline);
          expect(errors).toHaveLength(1);
          expect(errors[0]?.error).toBeInstanceOf(StreamError);
          expect((errors[0]?.error as StreamError).reason).toBe('protocol');
          expect(errors[0]?.error.cause).toBe(boom);
        }
      );

      it(
        '6 a wrong API key ends the stream with a fatal AuthenticationError',
        { timeout: 30_000 },
        async () => {
          const wrong = createLiveClient({ apiKey: 'sdk-test-wrong-key' });
          const controller = new AbortController();
          const deadline = setTimeout(() => controller.abort(), 15_000);
          const errors: ErrorCall[] = [];
          const stream = wrong.notifications
            .stream({ signal: controller.signal })
            .on('error', (error, info) => errors.push({ error, fatal: info.fatal }));
          const end = await stream.done;
          clearTimeout(deadline);
          controller.abort();
          expect(end.reason).toBe('error');
          expect(end.reason === 'error' ? end.error : null).toBeInstanceOf(AuthenticationError);
          expect(errors).toHaveLength(1);
          expect(errors[0]?.fatal).toBe(true);
          expect(errors[0]?.error).toBeInstanceOf(AuthenticationError);
        }
      );

      it(
        '7 an unreachable host fails twice, then fatally, with NetworkError',
        { timeout: 60_000 },
        async () => {
          const unreachable = createUnreachableClient();
          const before = answered();
          const controller = new AbortController();
          const deadline = setTimeout(() => controller.abort(), 55_000);
          const errors: ErrorCall[] = [];
          const stream = unreachable.notifications
            .stream({
              signal: controller.signal,
              reconnect: { initialDelayMs: 10, maxDelayMs: 40, maxAttempts: 2 },
            })
            .on('error', (error, info) => errors.push({ error, fatal: info.fatal }));
          const end = await stream.done;
          clearTimeout(deadline);
          controller.abort();
          expect(end.reason).toBe('error');
          expect(end.reason === 'error' ? end.error : null).toBeInstanceOf(NetworkError);
          expect(errors.map((e) => e.fatal)).toEqual([false, false, true]);
          expect(errors.every((e) => e.error instanceof NetworkError)).toBe(true);
          expect(answered()).toBe(before);
        }
      );

      it(
        '8 iterating a stream that ends in error throws that error',
        { timeout: 30_000 },
        async () => {
          const wrong = createLiveClient({ apiKey: 'sdk-test-wrong-key' });
          const controller = new AbortController();
          const deadline = setTimeout(() => controller.abort(), 15_000);
          const types: string[] = [];
          const consume = async (): Promise<void> => {
            for await (const event of wrong.notifications.stream({ signal: controller.signal })) {
              types.push(event.type);
            }
          };
          await expect(consume()).rejects.toBeInstanceOf(AuthenticationError);
          clearTimeout(deadline);
          controller.abort();
          expect(types).toEqual([]);
        }
      );

      // LIVE-TESTING §6: the option guards, off(), the one-iterator rule and the iterator's own end paths run
      // live. Every stream here has an aborted signal or fails its guard, so none sends a request.
      it(
        '9 option guards, off() and the iterator protocol send nothing',
        { timeout: 15_000 },
        async () => {
          const n = client.notifications;
          const before = streamRequests();
          const signal = AbortSignal.abort();
          expect(() => n.stream({} as never)).toThrow(ValidationError);
          expect(() => n.stream({ signal, idleTimeoutMs: -1 })).toThrow(ValidationError);
          expect(() => n.stream({ signal, reconnect: 'yes' as never })).toThrow(ValidationError);
          expect(() => n.stream({ signal, reconnect: { initialDelayMs: -1 } })).toThrow(
            ValidationError
          );
          expect(() => n.stream({ signal, reconnect: { maxAttempts: 1.5 } })).toThrow(
            ValidationError
          );

          const stream = n.stream({ signal, reconnect: false });
          const listener = (): void => undefined;
          expect(stream.on('open', listener).off('open', listener)).toBe(stream);
          const iterator = stream[Symbol.asyncIterator]();
          expect(() => stream[Symbol.asyncIterator]()).toThrow(TypeError);
          expect(await iterator.next()).toEqual({ value: undefined, done: true });
          const stop = new Error('consumer stopped');
          await expect(iterator.throw?.(stop)).rejects.toBe(stop);
          expect(await stream.done).toEqual({ reason: 'aborted' });
          expect(streamRequests()).toBe(before);
        }
      );

      // LIVE-TESTING §6: the transport's body read that starts after the caller has aborted (raceSignal on a
      // signal that is already aborted, the aborted body read settling afterwards). The iterator is suspended
      // between events, so nothing reads the body until the next next(); events already buffered may come first.
      it(
        '10 transport.stream: next() after an abort between events throws AbortError',
        { timeout: 30_000 },
        async () => {
          const before = streamRequests();
          const controller = new AbortController();
          const deadline = setTimeout(() => controller.abort(), 15_000);
          const events = client.transport.stream('/notifications/{namespace}/stream', {
            params: { namespace: NS },
            signal: controller.signal,
          });
          // Events already buffered come back without a read; the first next() that reads the body rejects.
          const drain = async (): Promise<void> => {
            for (let i = 0; i < 20; i += 1) {
              if ((await events.next()).done === true) return;
            }
          };
          try {
            const first = await events.next();
            expect(first.done).toBe(false);
            expect(first.value?.event).toBe('open');
            controller.abort(new Error('sdk-test-stop'));
            const ended = drain();
            await expect(ended).rejects.toBeInstanceOf(AbortError);
            await expect(ended).rejects.toHaveProperty('cause.message', 'sdk-test-stop');
          } finally {
            clearTimeout(deadline);
            controller.abort();
            await events.return?.(undefined);
          }
          expect(streamRequests() - before).toBe(1);
        }
      );
    });
  },
  { feature: 'notifications' }
);
