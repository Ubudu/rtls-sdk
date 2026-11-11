import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';
import {
  AbortError,
  AuthenticationError,
  createRtlsClient,
  NotFoundError,
  StreamError,
  TimeoutError,
  ValidationError,
  type RtlsClientOptions,
} from '../../../src';
import type { SseEvent } from '../../../src/utils/sse';

const BASE = 'https://stream.test/api';
const STREAM = `${BASE}/notifications/:ns/stream`;
const PATH = '/notifications/{namespace}/stream' as const;
const params = { namespace: 'ns' };
const encoder = new TextEncoder();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function transport(options: RtlsClientOptions = {}) {
  return createRtlsClient({ baseUrl: BASE, apiKey: 'k', ...options }).transport;
}

type Step = string | { wait: number } | { error: string } | 'close';

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

/** Serves the steps as text/event-stream; `seen` records whether the request signal fired. */
function serve(steps: readonly Step[], seen?: { aborted: boolean }): void {
  server.use(
    http.get(STREAM, ({ request }) => {
      request.signal.addEventListener('abort', () => {
        if (seen) seen.aborted = true;
      });
      return new HttpResponse(sseBody(steps), {
        headers: { 'content-type': 'text/event-stream; charset=utf-8' },
      });
    })
  );
}

/**
 * Polls `seen.aborted` for at most `ms` (well under the 2000 ms silences the bodies use). The abort reaches the
 * MSW handler's request signal asynchronously, so reading it right after the iterator settles can be too early.
 */
async function abortSeen(seen: { aborted: boolean }, ms = 500): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (!seen.aborted && Date.now() < deadline) await sleep(5);
  return seen.aborted;
}

async function collect(iterable: AsyncIterable<SseEvent>): Promise<SseEvent[]> {
  const out: SseEvent[] = [];
  for await (const event of iterable) out.push(event);
  return out;
}

function only(rec: { requests: readonly RecordedRequest[] }): RecordedRequest {
  expect(rec.requests).toHaveLength(1);
  return rec.requests[0] as RecordedRequest;
}

describe('Transport.stream (P1 §6.3 step 10)', () => {
  it('named events arrive in order with their data strings; the server closing the stream ends the iterator', async () => {
    serve([
      'event: open\ndata: {"app_namespace":"ns"}\n\n',
      'event: item\ndata: {"id":1}\n\n',
      'event: unread_count\ndata: 3\n\n',
      'close',
    ]);
    await expect(collect(transport().stream(PATH, { params }))).resolves.toEqual([
      { event: 'open', data: '{"app_namespace":"ns"}' },
      { event: 'item', data: '{"id":1}' },
      { event: 'unread_count', data: '3' },
    ]);
  });

  it('heartbeat comments yield nothing; multi-line data is joined with \\n', async () => {
    serve([': hb\n\n', 'data: line 1\ndata: line 2\n\n', ': hb\n\n', 'close']);
    await expect(collect(transport().stream(PATH, { params }))).resolves.toEqual([
      { event: 'message', data: 'line 1\nline 2' },
    ]);
  });

  it('a chunk split inside a line and inside \\r\\n', async () => {
    serve(['event: it', 'em\r', '\ndata: {"a"', ':1}\r\n\r', '\n', 'close']);
    await expect(collect(transport().stream(PATH, { params }))).resolves.toEqual([
      { event: 'item', data: '{"a":1}' },
    ]);
  });

  it('client timeoutMs 30 with a 150 ms stream of heartbeats every 10 ms → completes without TimeoutError', async () => {
    const steps: Step[] = ['event: open\ndata: {}\n\n'];
    for (let i = 0; i < 15; i += 1) steps.push({ wait: 10 }, ': hb\n\n');
    steps.push('data: last\n\n', 'close');
    serve(steps);
    const started = Date.now();
    const got = await collect(transport({ timeoutMs: 30 }).stream(PATH, { params }));
    expect(Date.now() - started).toBeGreaterThanOrEqual(100);
    expect(got).toEqual([
      { event: 'open', data: '{}' },
      { event: 'message', data: 'last' },
    ]);
  });

  it('idleTimeoutMs 50 with silence after open → StreamError reason idle_timeout; the request is aborted', async () => {
    const seen = { aborted: false };
    serve(['event: open\ndata: {}\n\n', { wait: 2000 }, 'close'], seen);
    const got: SseEvent[] = [];
    const started = Date.now();
    const run = (async () => {
      for await (const event of transport().stream(PATH, { params, idleTimeoutMs: 50 }))
        got.push(event);
    })();
    await expect(run).rejects.toBeInstanceOf(StreamError);
    // Ends on the idle timer, not when the silent body source finally settles.
    expect(Date.now() - started).toBeLessThan(1000);
    await expect(run).rejects.toMatchObject({
      reason: 'idle_timeout',
      code: 'STREAM_ERROR',
      status: 0,
    });
    await expect(run).rejects.not.toBeInstanceOf(TimeoutError);
    expect(got).toEqual([{ event: 'open', data: '{}' }]);
    expect(await abortSeen(seen)).toBe(true);
  });

  it('the idle timer also covers the wait for the headers', async () => {
    server.use(
      http.get(STREAM, async () => {
        await sleep(300);
        return new HttpResponse(sseBody(['close']), {
          headers: { 'content-type': 'text/event-stream' },
        });
      })
    );
    const it = transport().stream(PATH, { params, idleTimeoutMs: 30 });
    await expect(it.next()).rejects.toMatchObject({ reason: 'idle_timeout' });
  });

  it('heartbeats every 20 ms with idleTimeoutMs 50 → no error', async () => {
    const steps: Step[] = [];
    for (let i = 0; i < 8; i += 1) steps.push({ wait: 20 }, ': hb\n\n');
    steps.push('data: done\n\n', 'close');
    serve(steps);
    await expect(collect(transport().stream(PATH, { params, idleTimeoutMs: 50 }))).resolves.toEqual(
      [{ event: 'message', data: 'done' }]
    );
  });

  it('idleTimeoutMs 0 disables the idle timer', async () => {
    serve([{ wait: 80 }, 'data: late\n\n', 'close']);
    await expect(collect(transport().stream(PATH, { params, idleTimeoutMs: 0 }))).resolves.toEqual([
      { event: 'message', data: 'late' },
    ]);
  });

  it('a user abort mid-stream → AbortError with the reason as cause', async () => {
    serve(['data: first\n\n', { wait: 2000 }, 'close']);
    const controller = new AbortController();
    const reason = new Error('sdk-test-stop');
    const got: SseEvent[] = [];
    const started = Date.now();
    const run = (async () => {
      for await (const event of transport().stream(PATH, { params, signal: controller.signal })) {
        got.push(event);
        setTimeout(() => controller.abort(reason), 10);
      }
    })();
    await expect(run).rejects.toBeInstanceOf(AbortError);
    expect(Date.now() - started).toBeLessThan(1000);
    await expect(run).rejects.toSatisfy((e: AbortError) => e.cause === reason);
    expect(got).toEqual([{ event: 'message', data: 'first' }]);
  });

  it('a pre-aborted signal → AbortError from the first next(), no request', async () => {
    serve(['close']);
    const rec = recordRequests();
    const it = transport().stream(PATH, { params, signal: AbortSignal.abort(new Error('no')) });
    await expect(it.next()).rejects.toBeInstanceOf(AbortError);
    expect(rec.requests).toHaveLength(0);
  });

  it('break in for await → MSW sees the request aborted, no error', async () => {
    const seen = { aborted: false };
    serve(['data: 1\n\n', 'data: 2\n\n', { wait: 2000 }, 'close'], seen);
    const got: SseEvent[] = [];
    const started = Date.now();
    for await (const event of transport().stream(PATH, { params })) {
      got.push(event);
      break;
    }
    expect(Date.now() - started).toBeLessThan(1000);
    expect(got).toEqual([{ event: 'message', data: '1' }]);
    expect(await abortSeen(seen)).toBe(true);
  });

  it('return() on the iterator resolves done without an error', async () => {
    const seen = { aborted: false };
    serve(['data: 1\n\n', { wait: 2000 }, 'close'], seen);
    const it = transport().stream(PATH, { params });
    await expect(it.next()).resolves.toEqual({
      done: false,
      value: { event: 'message', data: '1' },
    });
    await expect(it.return?.()).resolves.toEqual({ done: true, value: undefined });
    await expect(it.next()).resolves.toEqual({ done: true, value: undefined });
    expect(await abortSeen(seen)).toBe(true);
  });

  it('401 JSON before the stream → AuthenticationError from the first next()', async () => {
    server.use(
      http.get(STREAM, () => HttpResponse.json({ error: 'unauthorized' }, { status: 401 }))
    );
    const it = transport().stream(PATH, { params });
    const first = it.next();
    await expect(first).rejects.toBeInstanceOf(AuthenticationError);
    await expect(first).rejects.toMatchObject({ status: 401, apiCode: 'unauthorized' });
  });

  it('a body error mid-stream → StreamError reason network', async () => {
    serve(['data: 1\n\n', { wait: 10 }, { error: 'connection reset' }]);
    const got: SseEvent[] = [];
    const run = (async () => {
      for await (const event of transport().stream(PATH, { params })) got.push(event);
    })();
    await expect(run).rejects.toBeInstanceOf(StreamError);
    await expect(run).rejects.toMatchObject({ reason: 'network' });
    expect(got).toEqual([{ event: 'message', data: '1' }]);
  });

  it('a body that fails with an SDK error mid-stream is still a StreamError reason network (cause kept)', async () => {
    const cause = new NotFoundError('gone');
    const fetch = async (): Promise<Response> =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('data: 1\n\n'));
            setTimeout(() => controller.error(cause), 5);
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } }
      );
    const got: SseEvent[] = [];
    const run = (async () => {
      for await (const event of transport({ fetch }).stream(PATH, { params })) got.push(event);
    })();
    await expect(run).rejects.toBeInstanceOf(StreamError);
    await expect(run).rejects.toSatisfy(
      (e: StreamError) => e.reason === 'network' && e.cause === cause
    );
    expect(got).toEqual([{ event: 'message', data: '1' }]);
  });

  it('stream() without options (GET /health answers JSON) → StreamError reason protocol', async () => {
    server.use(http.get(`${BASE}/health`, () => HttpResponse.json({ status: 'OK' })));
    const rec = recordRequests();
    await expect(transport().stream('/health').next()).rejects.toMatchObject({
      reason: 'protocol',
    });
    expect(only(rec).headers.get('accept')).toBe('text/event-stream');
  });

  it('200 with content-type application/json → StreamError reason protocol', async () => {
    server.use(http.get(STREAM, () => HttpResponse.json({ status: 'OK' })));
    const it = transport().stream(PATH, { params });
    const first = it.next();
    await expect(first).rejects.toBeInstanceOf(StreamError);
    await expect(first).rejects.toMatchObject({ reason: 'protocol', status: 200 });
  });

  it('a 2xx without any content type → StreamError reason protocol', async () => {
    server.use(http.get(STREAM, () => new HttpResponse(encoder.encode('data: x\n\n'))));
    await expect(transport().stream(PATH, { params }).next()).rejects.toMatchObject({
      reason: 'protocol',
    });
  });

  it('an empty 2xx event stream ends at once', async () => {
    server.use(
      http.get(
        STREAM,
        () => new HttpResponse(null, { headers: { 'content-type': 'text/event-stream' } })
      )
    );
    await expect(collect(transport().stream(PATH, { params }))).resolves.toEqual([]);
  });

  it('the request carries accept: text/event-stream and the credential, no content-type', async () => {
    serve(['close']);
    const rec = recordRequests();
    await collect(
      transport({ headers: { 'Content-Type': 'application/json' } }).stream(PATH, { params })
    );
    const req = only(rec);
    expect(req.method).toBe('GET');
    expect(req.url.href).toBe(`${BASE}/notifications/ns/stream`);
    expect(req.headers.get('accept')).toBe('text/event-stream');
    expect(req.headers.get('x-api-key')).toBe('k');
    expect(req.headers.has('content-type')).toBe(false);
  });

  it('an invalid idleTimeoutMs → ValidationError at once, no request', () => {
    serve(['close']);
    const rec = recordRequests();
    expect(() => transport().stream(PATH, { params, idleTimeoutMs: -1 })).toThrow(ValidationError);
    expect(() => transport().stream(PATH, { params, idleTimeoutMs: -1 })).toThrow(
      expect.objectContaining({ status: 0, details: ['idleTimeoutMs'] })
    );
    expect(rec.requests).toHaveLength(0);
  });

  it('a missing path param → ValidationError at once, no request', () => {
    const rec = recordRequests();
    expect(() => transport().stream(PATH, { params: {} as never })).toThrow(ValidationError);
    expect(rec.requests).toHaveLength(0);
  });
});
