// Unit tests of client.notifications.stream() (P6 §8.1 T1–T20): the real reconnect loop over the P1 transport against
// MSW event-stream bodies; fake timers (setTimeout, clearTimeout, Date only) where waiting is involved.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';
import { loadFixture } from '../../contract/fixtures';
import {
  AuthenticationError,
  AuthorizationError,
  ContextError,
  createRtlsClient,
  NotFoundError,
  RtlsError,
  ServerError,
  StreamError,
  ValidationError,
  type NotificationStream,
  type NotificationStreamEvent,
} from '../../../src';
import type { Transport } from '../../../src/client/transport';
import { createNotificationStream } from '../../../src/resources/notifications/stream';

const API = 'https://rtls.ubudu.com/api/notifications/ns-test';
const STREAM = `${API}/stream`;
const client = createRtlsClient({ apiKey: 'k', namespace: 'ns-test' });
const encoder = new TextEncoder();
const FRAMES = loadFixture('notifications', 'stream.frames').text as string;
/** The fixture split per frame (each ends with its blank line). */
const FRAME_LIST = FRAMES.split(/(?<=\n\n)/);
const OPEN = 'event: open\ndata: {"app_namespace":"ns-test","user_id":"u"}\n\n';
const STATE = 'event: state\ndata: {"id":"65f000000000000000000001","read":true}\n\n';
const TYPES = ['open', 'item', 'state', 'unread_count', 'reconnected'] as const;

type Step = string | { wait: number } | { error: string } | 'close';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** An SSE body that plays `steps`: a string is sent, `{ wait }` pauses, `{ error }` errors the body, 'close' ends it. */
function sseBody(steps: readonly Step[]): ReadableStream<Uint8Array> {
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const step of steps) {
        if (cancelled) return;
        if (step === 'close') {
          controller.close();
          return;
        }
        if (typeof step === 'string') controller.enqueue(encoder.encode(step));
        else if ('wait' in step) await sleep(step.wait);
        else {
          controller.error(new Error(step.error));
          return;
        }
      }
    },
    cancel() {
      cancelled = true;
    },
  });
}

type Answer = () => Response;
const sse =
  (...steps: Step[]): Answer =>
  () =>
    new HttpResponse(sseBody(steps), {
      headers: { 'content-type': 'text/event-stream; charset=utf-8' },
    });
const status =
  (code: number, body: Record<string, unknown> = { error: 'internal_error' }): Answer =>
  () =>
    HttpResponse.json(body, { status: code });

/** Answers the n-th stream request with `answers[n]` (the last one repeats); `aborted[n]` = its signal fired. */
function serve(...answers: Answer[]): { aborted: boolean[] } {
  let n = 0;
  const aborted: boolean[] = [];
  server.use(
    http.get(STREAM, ({ request }) => {
      const i = n++;
      aborted[i] = false;
      request.signal.addEventListener('abort', () => {
        aborted[i] = true;
      });
      return (answers[Math.min(i, answers.length - 1)] as Answer)();
    })
  );
  return { aborted };
}

interface Recorded {
  events: NotificationStreamEvent[];
  errors: Array<{ error: RtlsError; fatal: boolean }>;
}

function listen(stream: NotificationStream): Recorded {
  const out: Recorded = { events: [], errors: [] };
  for (const type of TYPES) stream.on(type, (event) => out.events.push(event));
  stream.on('error', (error, info) => out.errors.push({ error, fatal: info.fatal }));
  return out;
}

/** Real macrotask turns (setImmediate is not faked): lets fetch, MSW and the body reader progress. */
async function settle(turns = 30): Promise<void> {
  for (let i = 0; i < turns; i++) await new Promise<void>((resolve) => setImmediate(resolve));
}

function fakeTimers(): void {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
}

const types = (events: readonly NotificationStreamEvent[]): string[] => events.map((e) => e.type);

afterEach(() => {
  vi.useRealTimers();
});

describe('notifications.stream: request and events', () => {
  it('T1 GET /notifications/ns-test/stream, no query string, Accept text/event-stream, auth header', async () => {
    const rec = recordRequests();
    const stream = client.notifications.stream({
      signal: new AbortController().signal,
      reconnect: false,
    });
    await expect(stream.done).resolves.toEqual({ reason: 'ended' });
    expect(rec.requests).toHaveLength(1);
    const r = rec.requests[0] as RecordedRequest;
    expect(r.method).toBe('GET');
    expect(`${r.url.origin}${r.url.pathname}`).toBe(STREAM);
    expect(r.url.search).toBe('');
    expect(r.headers.get('accept')).toBe('text/event-stream');
    expect(r.headers.get('x-api-key')).toBe('k');
  });

  it('T2 the fixture frames reach on() listeners as typed open, item, state, unread_count events in order', async () => {
    const stream = client.notifications.stream({
      signal: new AbortController().signal,
      reconnect: false,
    });
    const { events, errors } = listen(stream);
    const items: string[] = [];
    stream.on('item', (event) => items.push(event.data.event_id));
    await expect(stream.done).resolves.toEqual({ reason: 'ended' });
    expect(types(events)).toEqual(['open', 'item', 'state', 'unread_count']);
    expect(events[0]).toEqual({
      type: 'open',
      data: { app_namespace: 'ns-test', user_id: '64f000000000000000000001' },
    });
    expect(events[2]).toEqual({
      type: 'state',
      data: { id: '65f000000000000000000001', read: true },
    });
    expect(events[3]).toEqual({ type: 'unread_count', data: { action: 'read', affected: 2 } });
    expect(items).toEqual(['evt-1']);
    expect(errors).toEqual([]);
  });

  it('T3 the same frames through for await give the same sequence', async () => {
    const stream = client.notifications.stream({
      signal: new AbortController().signal,
      reconnect: false,
    });
    const seen: NotificationStreamEvent[] = [];
    for await (const event of stream) seen.push(event);
    expect(types(seen)).toEqual(['open', 'item', 'state', 'unread_count']);
    expect(seen[1]).toMatchObject({ type: 'item', data: { _id: '65f000000000000000000001' } });
    await expect(stream.done).resolves.toEqual({ reason: 'ended' });
  });

  it('T4 a frame split across chunks with CRLF line ends gives one event', async () => {
    serve(
      sse(
        'event: op',
        'en\r\ndata: {"app_namespace":"ns-test",',
        '"user_id":"u"}\r',
        '\n\r\n',
        ...FRAME_LIST.slice(3),
        'close'
      )
    );
    const stream = client.notifications.stream({
      signal: new AbortController().signal,
      reconnect: false,
    });
    const { events } = listen(stream);
    await stream.done;
    expect(events).toEqual([
      { type: 'open', data: { app_namespace: 'ns-test', user_id: 'u' } },
      { type: 'state', data: { id: '65f000000000000000000001', read: true } },
      { type: 'unread_count', data: { action: 'read', affected: 2 } },
    ]);
  });

  it('T5 heartbeats, unknown event names, non-JSON or non-object data are dropped; the stream goes on', async () => {
    serve(
      sse(
        ': hb\n\n',
        'event: bogus\ndata: {"a":1}\n\n',
        'event: item\ndata: not json\n\n',
        'event: item\ndata: [1,2]\n\n',
        'event: item\ndata: 7\n\n',
        'data: {"no":"name"}\n\n',
        STATE,
        'close'
      )
    );
    const stream = client.notifications.stream({
      signal: new AbortController().signal,
      reconnect: false,
    });
    const { events, errors } = listen(stream);
    await expect(stream.done).resolves.toEqual({ reason: 'ended' });
    expect(types(events)).toEqual(['state']);
    expect(errors).toEqual([]);
  });

  it('T6 an emitter and an iterator attached together both receive every event', async () => {
    const stream = client.notifications.stream({
      signal: new AbortController().signal,
      reconnect: false,
    });
    const { events } = listen(stream);
    const iterated: NotificationStreamEvent[] = [];
    for await (const event of stream) iterated.push(event);
    expect(types(iterated)).toEqual(['open', 'item', 'state', 'unread_count']);
    expect(iterated).toEqual(events);
  });

  it('T7 a second [Symbol.asyncIterator]() throws TypeError', async () => {
    const controller = new AbortController();
    const stream = client.notifications.stream({ signal: controller.signal, reconnect: false });
    stream[Symbol.asyncIterator]();
    expect(() => stream[Symbol.asyncIterator]()).toThrow(TypeError);
    controller.abort();
    await expect(stream.done).resolves.toEqual({ reason: 'aborted' });
  });

  it('off() removes a listener; on/off chain', async () => {
    const stream = client.notifications.stream({
      signal: new AbortController().signal,
      reconnect: false,
    });
    const kept: string[] = [];
    const removed: string[] = [];
    const drop = (event: NotificationStreamEvent): void => {
      removed.push(event.type);
    };
    expect(
      stream
        .on('open', (event) => kept.push(event.type))
        .on('open', drop)
        .off('open', drop)
        .off('state', drop)
    ).toBe(stream);
    await stream.done;
    expect(kept).toEqual(['open']);
    expect(removed).toEqual([]);
  });
});

describe('notifications.stream: closing', () => {
  it('T8 break inside for await aborts the request; done → aborted', async () => {
    const seen = serve(sse(OPEN, STATE));
    const stream = client.notifications.stream({ signal: new AbortController().signal });
    const got: string[] = [];
    for await (const event of stream) {
      got.push(event.type);
      if (event.type === 'state') break;
    }
    await expect(stream.done).resolves.toEqual({ reason: 'aborted' });
    expect(got).toEqual(['open', 'state']);
    await vi.waitFor(() => expect(seen.aborted[0]).toBe(true));
  });

  it('T8 iterator.throw() closes the stream and rethrows', async () => {
    serve(sse(OPEN));
    const stream = client.notifications.stream({ signal: new AbortController().signal });
    const iterator = stream[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({ done: false, value: { type: 'open' } });
    await expect(iterator.throw?.(new Error('consumer failed'))).rejects.toThrow('consumer failed');
    await expect(stream.done).resolves.toEqual({ reason: 'aborted' });
    await expect(iterator.next()).resolves.toEqual({ value: undefined, done: true });
  });

  it('T9 the caller aborting mid-stream ends with aborted; the request is aborted', async () => {
    const seen = serve(sse(OPEN));
    const controller = new AbortController();
    const stream = client.notifications.stream({ signal: controller.signal });
    const opened = new Promise<void>((resolve) => stream.on('open', () => resolve()));
    await opened;
    controller.abort();
    await expect(stream.done).resolves.toEqual({ reason: 'aborted' });
    await vi.waitFor(() => expect(seen.aborted[0]).toBe(true));
  });

  it('T9 a pre-aborted signal sends no request; done → aborted; the iterator ends at once', async () => {
    const rec = recordRequests();
    const controller = new AbortController();
    controller.abort();
    const stream = client.notifications.stream({ signal: controller.signal });
    await expect(stream.done).resolves.toEqual({ reason: 'aborted' });
    const seen: NotificationStreamEvent[] = [];
    for await (const event of stream) seen.push(event);
    await settle(5);
    expect(seen).toEqual([]);
    expect(rec.requests).toHaveLength(0);
  });

  it('T10 a missing signal or invalid options → ValidationError; no namespace → ContextError; no request', async () => {
    const rec = recordRequests();
    const signal = new AbortController().signal;
    expect(() => client.notifications.stream({} as never)).toThrow(ValidationError);
    expect(() => client.notifications.stream({ signal: 'x' } as never)).toThrow(
      expect.objectContaining({ status: 0, details: ['signal'] }) as Error
    );
    expect(() => client.notifications.stream(undefined as never)).toThrow(ValidationError);
    for (const reconnect of [
      'yes',
      [],
      { initialDelayMs: -1 },
      { maxDelayMs: Number.NaN },
      { maxDelayMs: Infinity },
      { maxAttempts: 1.5 },
      { maxAttempts: -1 },
    ]) {
      expect(() => client.notifications.stream({ signal, reconnect } as never)).toThrow(
        expect.objectContaining({ details: ['reconnect'] }) as Error
      );
    }
    for (const idleTimeoutMs of [-1, Number.NaN, '45000']) {
      expect(() => client.notifications.stream({ signal, idleTimeoutMs } as never)).toThrow(
        expect.objectContaining({ details: ['idleTimeoutMs'] }) as Error
      );
    }
    const noNamespace = createRtlsClient({ apiKey: 'k' });
    expect(() => noNamespace.notifications.stream({ signal })).toThrow(ContextError);
    await settle(5);
    expect(rec.requests).toHaveLength(0);
  });

  it('nothing is sent synchronously: the request starts on a later tick', async () => {
    const rec = recordRequests();
    const controller = new AbortController();
    const stream = client.notifications.stream({ signal: controller.signal, reconnect: false });
    expect(rec.requests).toHaveLength(0);
    await stream.done;
    expect(rec.requests).toHaveLength(1);
  });
});

describe('notifications.stream: failures', () => {
  it.each([
    [401, { error: 'No authentication credentials provided' }, AuthenticationError],
    [403, { error: 'namespace_access_denied' }, AuthorizationError],
    [404, { error: 'not_found' }, NotFoundError],
  ] as const)(
    'T11 %i is fatal: one error { fatal: true }, done error, one request',
    async (code, body, ErrorClass) => {
      serve(status(code, body));
      const rec = recordRequests();
      const stream = client.notifications.stream({ signal: new AbortController().signal });
      const { errors } = listen(stream);
      const end = await stream.done;
      expect(end.reason).toBe('error');
      expect(end).toMatchObject({ error: { status: code } });
      expect((end as { error: RtlsError }).error).toBeInstanceOf(ErrorClass);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.fatal).toBe(true);
      expect(errors[0]?.error).toBeInstanceOf(ErrorClass);
      expect(rec.requests).toHaveLength(1);
    }
  );

  it('T11 a fatal end makes the iterator throw that error after the queue drained', async () => {
    serve(sse(OPEN, { wait: 5 }, { error: 'gone' }), status(401, { error: 'x' }));
    const stream = client.notifications.stream({
      signal: new AbortController().signal,
      reconnect: { initialDelayMs: 0 },
    });
    const seen: string[] = [];
    const consume = async (): Promise<void> => {
      for await (const event of stream) seen.push(event.type);
    };
    await expect(consume()).rejects.toBeInstanceOf(AuthenticationError);
    expect(seen).toEqual(['open']);
    await expect(stream.done).resolves.toMatchObject({ reason: 'error' });
  });

  it('T12 500 then 200 → error { fatal: false }, a second request after initialDelayMs, open, reconnected { attempt: 1 }', async () => {
    fakeTimers();
    const rec = recordRequests();
    serve(status(500), sse(OPEN));
    const controller = new AbortController();
    const stream = client.notifications.stream({
      signal: controller.signal,
      reconnect: { initialDelayMs: 100 },
    });
    const { events, errors } = listen(stream);
    await settle();
    expect(rec.requests).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.fatal).toBe(false);
    expect(errors[0]?.error).toBeInstanceOf(ServerError);
    await vi.advanceTimersByTimeAsync(99);
    await settle();
    expect(rec.requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(rec.requests).toHaveLength(2);
    expect(events).toEqual([
      { type: 'open', data: { app_namespace: 'ns-test', user_id: 'u' } },
      { type: 'reconnected', data: { attempt: 1 } },
    ]);
    controller.abort();
    await expect(stream.done).resolves.toEqual({ reason: 'aborted' });
  });

  it('T12 500, 500, 200 → reconnected { attempt: 2 }', async () => {
    fakeTimers();
    const rec = recordRequests();
    serve(status(500), status(500), sse(OPEN));
    const controller = new AbortController();
    const stream = client.notifications.stream({
      signal: controller.signal,
      reconnect: { initialDelayMs: 100 },
    });
    const { events, errors } = listen(stream);
    await settle();
    await vi.advanceTimersByTimeAsync(100);
    await settle();
    expect(rec.requests).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(200);
    await settle();
    expect(rec.requests).toHaveLength(3);
    expect(errors.map((e) => e.fatal)).toEqual([false, false]);
    expect(events).toEqual([
      { type: 'open', data: { app_namespace: 'ns-test', user_id: 'u' } },
      { type: 'reconnected', data: { attempt: 2 } },
    ]);
    controller.abort();
    await expect(stream.done).resolves.toEqual({ reason: 'aborted' });
  });

  it('T13 back-off 100, 200, 300 (capped); the 4th failure is fatal with maxAttempts 3; 4 requests', async () => {
    fakeTimers();
    const rec = recordRequests();
    serve(status(500));
    const stream = client.notifications.stream({
      signal: new AbortController().signal,
      reconnect: { initialDelayMs: 100, maxDelayMs: 300, maxAttempts: 3 },
    });
    const { errors } = listen(stream);
    await settle();
    expect(rec.requests).toHaveLength(1);
    for (const [wait, count] of [
      [100, 2],
      [200, 3],
      [300, 4],
    ] as const) {
      await vi.advanceTimersByTimeAsync(wait - 1);
      await settle();
      expect(rec.requests).toHaveLength(count - 1);
      await vi.advanceTimersByTimeAsync(1);
      await settle();
      expect(rec.requests).toHaveLength(count);
    }
    const end = await stream.done;
    expect(end.reason).toBe('error');
    expect((end as { error: RtlsError }).error).toBeInstanceOf(ServerError);
    expect(errors.map((e) => e.fatal)).toEqual([false, false, false, true]);
    await vi.advanceTimersByTimeAsync(10_000);
    await settle();
    expect(rec.requests).toHaveLength(4);
  });

  it('T14 the failure counter resets on open: fail, open, fail, open → waits initialDelayMs twice, attempt 1 twice', async () => {
    fakeTimers();
    const rec = recordRequests();
    serve(status(500), sse(OPEN, { wait: 10 }, { error: 'reset' }), sse(OPEN));
    const controller = new AbortController();
    const stream = client.notifications.stream({
      signal: controller.signal,
      reconnect: { initialDelayMs: 100 },
    });
    const { events, errors } = listen(stream);
    await settle();
    await vi.advanceTimersByTimeAsync(100);
    await settle();
    expect(rec.requests).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(10);
    await settle();
    expect(errors).toHaveLength(2);
    expect(errors[1]?.error).toMatchObject({ name: 'StreamError', reason: 'network' });
    await vi.advanceTimersByTimeAsync(99);
    await settle();
    expect(rec.requests).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(rec.requests).toHaveLength(3);
    expect(events.filter((e) => e.type === 'reconnected')).toEqual([
      { type: 'reconnected', data: { attempt: 1 } },
      { type: 'reconnected', data: { attempt: 1 } },
    ]);
    expect(types(events)).toEqual(['open', 'reconnected', 'open', 'reconnected']);
    controller.abort();
    await expect(stream.done).resolves.toEqual({ reason: 'aborted' });
  });

  it('T15 a clean server close with reconnect off → done ended', async () => {
    serve(sse(OPEN, 'close'));
    const stream = client.notifications.stream({
      signal: new AbortController().signal,
      reconnect: false,
    });
    const { errors } = listen(stream);
    await expect(stream.done).resolves.toEqual({ reason: 'ended' });
    expect(errors).toEqual([]);
  });

  it('T15 a clean server close with reconnect on → StreamError "Stream closed by server" (network), then a reconnection', async () => {
    fakeTimers();
    const rec = recordRequests();
    serve(sse(OPEN, 'close'), sse(OPEN));
    const controller = new AbortController();
    const stream = client.notifications.stream({
      signal: controller.signal,
      reconnect: { initialDelayMs: 100 },
    });
    const { events, errors } = listen(stream);
    await settle();
    expect(errors).toHaveLength(1);
    expect(errors[0]?.fatal).toBe(false);
    expect(errors[0]?.error).toBeInstanceOf(StreamError);
    expect(errors[0]?.error).toMatchObject({
      reason: 'network',
      message: 'Stream closed by server',
    });
    await vi.advanceTimersByTimeAsync(100);
    await settle();
    expect(rec.requests).toHaveLength(2);
    expect(types(events)).toEqual(['open', 'open', 'reconnected']);
    expect(events[2]).toEqual({ type: 'reconnected', data: { attempt: 1 } });
    controller.abort();
    await expect(stream.done).resolves.toEqual({ reason: 'aborted' });
  });

  it('T16 no byte for idleTimeoutMs → StreamError idle_timeout { fatal: false } → reconnect', async () => {
    fakeTimers();
    const rec = recordRequests();
    serve(sse(OPEN), sse(OPEN));
    const controller = new AbortController();
    const stream = client.notifications.stream({
      signal: controller.signal,
      idleTimeoutMs: 1000,
      reconnect: { initialDelayMs: 100 },
    });
    const { events, errors } = listen(stream);
    await settle();
    expect(types(events)).toEqual(['open']);
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(errors).toHaveLength(1);
    expect(errors[0]?.fatal).toBe(false);
    expect(errors[0]?.error).toMatchObject({ name: 'StreamError', reason: 'idle_timeout' });
    await vi.advanceTimersByTimeAsync(100);
    await settle();
    expect(rec.requests).toHaveLength(2);
    expect(types(events)).toEqual(['open', 'open', 'reconnected']);
    controller.abort();
    await expect(stream.done).resolves.toEqual({ reason: 'aborted' });
  });

  it('with reconnect off a failure ends with error and is reported { fatal: true }', async () => {
    serve(status(503, { error: 'unavailable' }));
    const rec = recordRequests();
    const stream = client.notifications.stream({
      signal: new AbortController().signal,
      reconnect: false,
    });
    const { errors } = listen(stream);
    const end = await stream.done;
    expect(end).toMatchObject({ reason: 'error', error: { status: 503 } });
    expect(errors.map((e) => e.fatal)).toEqual([true]);
    expect(rec.requests).toHaveLength(1);
  });

  it('maxAttempts 0 makes the first failure fatal', async () => {
    serve(status(500));
    const rec = recordRequests();
    const stream = client.notifications.stream({
      signal: new AbortController().signal,
      reconnect: { maxAttempts: 0 },
    });
    const { errors } = listen(stream);
    await expect(stream.done).resolves.toMatchObject({ reason: 'error' });
    expect(errors.map((e) => e.fatal)).toEqual([true]);
    expect(rec.requests).toHaveLength(1);
  });

  it('an abort during the back-off wait ends at once with aborted and sends no further request', async () => {
    fakeTimers();
    const rec = recordRequests();
    serve(status(500));
    const controller = new AbortController();
    const stream = client.notifications.stream({
      signal: controller.signal,
      reconnect: { initialDelayMs: 10_000 },
    });
    await settle();
    expect(rec.requests).toHaveLength(1);
    controller.abort();
    await expect(stream.done).resolves.toEqual({ reason: 'aborted' });
    await vi.advanceTimersByTimeAsync(20_000);
    await settle();
    expect(rec.requests).toHaveLength(1);
  });

  it('an error listener that aborts ends the stream without waiting', async () => {
    serve(status(500));
    const rec = recordRequests();
    const controller = new AbortController();
    const stream = client.notifications.stream({
      signal: controller.signal,
      reconnect: { initialDelayMs: 60_000 },
    });
    stream.on('error', () => controller.abort());
    await expect(stream.done).resolves.toEqual({ reason: 'aborted' });
    expect(rec.requests).toHaveLength(1);
  });

  it('T17 a throwing listener becomes StreamError protocol with the cause; later events are still delivered', async () => {
    serve(sse(OPEN, STATE, 'close'));
    const stream = client.notifications.stream({
      signal: new AbortController().signal,
      reconnect: false,
    });
    const boom = new Error('listener failed');
    stream.on('open', () => {
      throw boom;
    });
    const { events, errors } = listen(stream);
    stream.on('error', () => {
      throw new Error('error listeners that throw are ignored');
    });
    await expect(stream.done).resolves.toEqual({ reason: 'ended' });
    expect(types(events)).toEqual(['open', 'state']);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.fatal).toBe(false);
    expect(errors[0]?.error).toBeInstanceOf(StreamError);
    expect(errors[0]?.error).toMatchObject({
      reason: 'protocol',
      message: 'Stream listener threw',
      cause: boom,
    });
  });

  it('T17 a throwing listener without error listeners is ignored', async () => {
    serve(sse(OPEN, STATE, 'close'));
    const stream = client.notifications.stream({
      signal: new AbortController().signal,
      reconnect: false,
    });
    const seen: string[] = [];
    stream.on('open', () => {
      throw new Error('ignored');
    });
    stream.on('state', (event) => seen.push(event.data.id));
    await expect(stream.done).resolves.toEqual({ reason: 'ended' });
    expect(seen).toEqual(['65f000000000000000000001']);
  });

  it('T18 with AbortSignal.any stubbed to undefined, an abort still closes the stream', async () => {
    const original = Object.getOwnPropertyDescriptor(AbortSignal, 'any');
    Object.defineProperty(AbortSignal, 'any', { value: undefined, configurable: true });
    try {
      const seen = serve(sse(OPEN));
      const controller = new AbortController();
      const stream = client.notifications.stream({ signal: controller.signal });
      await new Promise<void>((resolve) => stream.on('open', () => resolve()));
      controller.abort();
      await expect(stream.done).resolves.toEqual({ reason: 'aborted' });
      await vi.waitFor(() => expect(seen.aborted[0]).toBe(true));
    } finally {
      if (original) Object.defineProperty(AbortSignal, 'any', original);
    }
  });

  it('T19 heartbeats for 120 s of fake time → no error (no total timeout)', async () => {
    fakeTimers();
    const rec = recordRequests();
    const beats: Step[] = [OPEN];
    for (let i = 0; i < 8; i++) beats.push({ wait: 20_000 }, ': hb\n\n');
    serve(sse(...beats));
    const controller = new AbortController();
    const stream = client.notifications.stream({ signal: controller.signal });
    const { events, errors } = listen(stream);
    await settle();
    for (let elapsed = 0; elapsed < 120_000; elapsed += 20_000) {
      await vi.advanceTimersByTimeAsync(20_000);
      await settle();
    }
    expect(errors).toEqual([]);
    expect(types(events)).toEqual(['open']);
    expect(rec.requests).toHaveLength(1);
    controller.abort();
    await expect(stream.done).resolves.toEqual({ reason: 'aborted' });
  });

  it('T20 done never rejects, also when the transport fails with a non-SDK error', async () => {
    const failing = {
      stream: () => {
        throw new Error('not an RtlsError');
      },
    } as unknown as Transport;
    const stream = createNotificationStream(failing, 'ns-test', {
      signal: new AbortController().signal,
      reconnect: false,
    });
    const { errors } = listen(stream);
    const end = await stream.done;
    expect(end.reason).toBe('error');
    expect((end as { error: RtlsError }).error).toBeInstanceOf(StreamError);
    expect((end as { error: RtlsError }).error).toMatchObject({ reason: 'network' });
    expect(errors.map((e) => e.fatal)).toEqual([true]);

    serve(status(401, { error: 'x' }));
    const ends = await Promise.allSettled([
      client.notifications.stream({ signal: new AbortController().signal }).done,
      client.notifications.stream({ signal: AbortSignal.abort() }).done,
    ]);
    expect(ends.map((e) => e.status)).toEqual(['fulfilled', 'fulfilled']);
  });

  it('T20 done never rejects, also when the reconnect loop itself throws', async () => {
    const rec = recordRequests();
    const stream = createNotificationStream(client.transport, 'ns-test', {
      signal: new AbortController().signal,
    });
    // The loop starts on a later tick: replace it before it runs to simulate an internal failure.
    (stream as unknown as { run: () => Promise<never> }).run = () =>
      Promise.reject(new Error('internal failure'));
    const end = await stream.done;
    expect(end.reason).toBe('error');
    expect((end as { error: RtlsError }).error).toBeInstanceOf(StreamError);
    expect((end as { error: RtlsError }).error).toMatchObject({ reason: 'network' });
    expect(rec.requests).toHaveLength(0);
  });
});
