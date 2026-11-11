// Core live tests L-T1…L-T7 (P1 §9), plus L-T8 (`parseAs: 'stream'` and `download` on `GET /health`, P1-T23): the
// typed transport against production, tier R, GET only. Assertions compare statuses, booleans and counts; asset
// MACs are compared, never printed (a failing assertion names no live value).
import {
  AbortError,
  NotFoundError,
  StreamError,
  TimeoutError,
  ValidationError,
  buildQueryParams,
  formatMac,
  isValidMac,
} from '../../../src';
import { readTotalCount } from '../../../src/utils/pagination';
import { pollUntil } from '../../../src/utils/poll';
import {
  createLiveClient,
  describeLive,
  expectKnownServerIssue,
  getHarness,
  guardedFetch,
  lastHour,
  liveEnv,
  recordFact,
  requestLog,
  testName,
} from '../harness';
import { recordingFetch } from './support/recording-fetch';
import { rejectionOf } from './support/rejection';
import { auditReadOnlyRequests } from './support/request-audit';

interface LiveAsset {
  user_udid: string;
  user_type?: unknown;
  user_name?: unknown;
}

async function firstAsset(): Promise<LiveAsset> {
  const client = createLiveClient();
  const assets = await client.transport.request<LiveAsset[]>('GET', '/assets/{app_namespace}', {
    params: { app_namespace: getHarness().env.namespace },
  });
  const asset = assets.find((a) => typeof a.user_udid === 'string' && isValidMac(a.user_udid));
  if (asset === undefined) throw new Error('fixture: no asset with a MAC in the namespace');
  return asset;
}

/** L-T6: `X-Total-Count` present → a non-negative integer; absent → USI-P1-9 reproduces. */
async function expectTotalCountHeader(headers: Headers): Promise<void> {
  const raw = headers.get('x-total-count');
  const total = readTotalCount(headers);
  if (raw === null) {
    await expectKnownServerIssue(
      'USI-P1-9',
      'GET /notifications/{namespace} answers without X-Total-Count although the server sets it',
      () => {
        expect(headers.has('x-total-count')).toBe(false);
        expect(total).toBeUndefined();
      }
    );
    return;
  }
  expect(Number.isInteger(total) && (total ?? -1) >= 0).toBe(true);
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text + decoder.decode();
}

describeLive('R', 'core transport', () => {
  auditReadOnlyRequests();

  it('L-T1 requestWithResponse returns status, headers and the parsed body', async () => {
    const response = await createLiveClient().transport.requestWithResponse('GET', '/health');
    expect(response.status).toBe(200);
    expect((response.headers.get('content-type') ?? '').includes('application/json')).toBe(true);
    expect(response.data.status).toBe('OK');
  });

  it('L-T2 a formatted MAC path parameter is normalised to the stored form (D9)', async () => {
    const asset = await firstAsset();
    const formatted = formatMac(asset.user_udid);
    expect(isValidMac(formatted)).toBe(true);
    expect(formatted.includes(':')).toBe(true);
    const client = createLiveClient();
    const one = await client.transport.request<LiveAsset>(
      'GET',
      '/assets/{app_namespace}/{mac_address}',
      { params: { app_namespace: getHarness().env.namespace, mac_address: formatted } }
    );
    expect(one.user_udid === asset.user_udid).toBe(true);
    const log = requestLog().filter((e) => e.template === '/assets/{app_namespace}/{mac_address}');
    expect(log.map((e) => e.status)).toEqual([200]);
    expect(log[0]?.path.endsWith(`/${asset.user_udid}`)).toBe(true);
  });

  it('L-T3 key/value are sent and honoured, also through buildQueryParams', async () => {
    const asset = await firstAsset();
    const client = createLiveClient();
    const params = { app_namespace: getHarness().env.namespace };
    const direct = await client.transport.request<LiveAsset[]>('GET', '/assets/{app_namespace}', {
      params,
      query: { key: 'user_udid', value: asset.user_udid },
    });
    const built = await client.transport.request<LiveAsset[]>('GET', '/assets/{app_namespace}', {
      params,
      query: buildQueryParams({ key: 'user_udid', value: asset.user_udid }),
    });
    for (const list of [direct, built]) {
      expect(list).toHaveLength(1);
      expect(list[0]?.user_udid === asset.user_udid).toBe(true);
    }
  });

  it('L-T4 a client with retry: true makes exactly one attempt on success', async () => {
    const rec = recordingFetch(guardedFetch);
    const settings = await createLiveClient({ retry: true, fetch: rec.fetch }).getSettings();
    expect(typeof settings === 'object' && settings !== null).toBe(true);
    expect(rec.calls).toHaveLength(1);
  });

  it('L-T4b a retry policy does not retry a 404 (status not in retryOn)', async () => {
    const rec = recordingFetch(guardedFetch);
    const client = createLiveClient({
      retry: { retries: 2, baseDelayMs: 1, maxDelayMs: 1 },
      fetch: rec.fetch,
    });
    const error = await rejectionOf(
      client.transport.request<unknown>('GET', '/dashboards/{id}', {
        params: { id: '0'.repeat(24) },
      })
    );
    expect(error).toBeInstanceOf(NotFoundError);
    expect(rec.calls).toHaveLength(1);
  });

  it('L-T5 pollUntil polls until the predicate holds', async () => {
    const client = createLiveClient();
    let n = 0;
    const health = await pollUntil(
      () => client.health(),
      () => {
        n += 1;
        return n >= 2;
      },
      { intervalMs: 10, timeoutMs: 5000 }
    );
    expect(health).toEqual({ status: 'OK' });
    expect(n).toBe(2);
    expect(requestLog().filter((e) => e.template === '/health')).toHaveLength(2);
  });

  it('L-T5b pollUntil ends with TimeoutError at its deadline and with AbortError when aborted', async () => {
    const client = createLiveClient();
    const timeout = await rejectionOf(
      pollUntil(
        () => client.health(),
        () => false,
        { intervalMs: 20, timeoutMs: 30 }
      )
    );
    expect(timeout).toBeInstanceOf(TimeoutError);
    const body = (timeout as TimeoutError).body as { attempts: number; lastValue: unknown };
    expect(body.attempts >= 1).toBe(true);
    expect(body.lastValue).toEqual({ status: 'OK' });
    expect((timeout as TimeoutError).timeoutMs).toBe(30);

    const controller = new AbortController();
    const aborted = await rejectionOf(
      pollUntil(
        () => client.health(),
        () => {
          setTimeout(() => controller.abort(new Error('sdk-test-stop')), 10);
          return false;
        },
        { intervalMs: 5000, timeoutMs: 20_000, signal: controller.signal }
      )
    );
    expect(aborted).toBeInstanceOf(AbortError);
    expect(((aborted as AbortError).cause as Error).message).toBe('sdk-test-stop');

    const preAborted = await rejectionOf(
      pollUntil(
        () => client.health(),
        () => true,
        { signal: AbortSignal.abort() }
      )
    );
    expect(preAborted).toBeInstanceOf(AbortError);
  });

  it('L-T7 stream() on a non-SSE route throws StreamError protocol from the first next()', async () => {
    const rec = recordingFetch(guardedFetch);
    const client = createLiveClient({ fetch: rec.fetch });
    const ac = new AbortController();
    try {
      const events = client.transport.stream('/health', { signal: ac.signal });
      const error = await rejectionOf(events.next());
      expect(error).toBeInstanceOf(StreamError);
      expect((error as StreamError).reason).toBe('protocol');
      expect((error as StreamError).status).toBe(200);
    } finally {
      ac.abort();
    }
    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0]?.headerNames.includes('accept')).toBe(true);
    expect(rec.calls[0]?.headerNames.includes('x-api-key')).toBe(true);
  });

  it('L-T7b stream() maps an HTTP error before the stream starts, thrown by the first next()', async () => {
    const ac = new AbortController();
    try {
      const events = createLiveClient().transport.stream('/dashboards/{id}', {
        params: { id: testName('not-an-id') },
        signal: ac.signal,
      });
      const error = await rejectionOf(events.next());
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).status).toBe(400);
    } finally {
      ac.abort();
    }
  });

  it('L-T8 parseAs stream returns the unread body; reading, cancelling and aborting it work live', async () => {
    const client = createLiveClient();
    const read = await client.transport.request<ReadableStream<Uint8Array>>('GET', '/health', {
      parseAs: 'stream',
    });
    expect(read).toBeInstanceOf(ReadableStream);
    expect(JSON.parse(await readAll(read))).toEqual({ status: 'OK' });

    const cancelled = await client.transport.request<ReadableStream<Uint8Array>>('GET', '/health', {
      parseAs: 'stream',
    });
    await cancelled.cancel();

    const ac = new AbortController();
    const aborted = await client.transport.request<ReadableStream<Uint8Array>>('GET', '/health', {
      parseAs: 'stream',
      signal: ac.signal,
    });
    ac.abort(new Error('sdk-test-stop'));
    const error = await rejectionOf(readAll(aborted));
    expect(error).toBeInstanceOf(AbortError);

    const failed = await rejectionOf(
      client.transport.request<ReadableStream<Uint8Array>>('GET', '/dashboards/{id}', {
        params: { id: testName('not-an-id') },
        parseAs: 'stream',
      })
    );
    expect(failed).toBeInstanceOf(ValidationError);
    expect((failed as ValidationError).status).toBe(400);

    const file = await client.transport.download('/health');
    expect(file.data).toBeInstanceOf(Blob);
    expect(JSON.parse(await file.data.text())).toEqual({ status: 'OK' });
    expect((file.contentType ?? '').includes('application/json')).toBe(true);
    expect(file.filename).toBeUndefined();
    expect(requestLog().map((e) => `${e.method} ${e.template}`)).toEqual([
      'GET /health',
      'GET /health',
      'GET /health',
      'GET /dashboards/{id}',
      'GET /health',
    ]);
  });

  it('L-T9 client headers, per-call headers and a client-level credential header are sent', async () => {
    const rec = recordingFetch(guardedFetch);
    const client = createLiveClient({
      headers: { 'X-Sdk-Test': 'core', 'Content-Type': 'text/plain' },
      fetch: rec.fetch,
    });
    expect(await client.health({ headers: { 'X-Sdk-Call': 'core' } })).toEqual({ status: 'OK' });
    const { response } = await client.raw.GET('/health');
    expect(response.status).toBe(200);
    for (const call of rec.calls) {
      expect(call.headerNames.includes('x-sdk-test')).toBe(true);
      expect(call.headerNames.includes('content-type')).toBe(false);
      expect(call.headerNames.includes('x-api-key')).toBe(true);
    }
    expect(rec.calls[0]?.headerNames.includes('x-sdk-call')).toBe(true);

    // The credential set as a client-level header instead of apiKey: sent once, and accepted.
    const viaHeader = recordingFetch(guardedFetch);
    const headerClient = createLiveClient({
      apiKey: undefined,
      headers: { 'X-API-Key': liveEnv().apiKey },
      fetch: viaHeader.fetch,
    });
    const settings = await headerClient.getSettings();
    expect(typeof settings === 'object' && settings !== null).toBe(true);
    expect(viaHeader.calls).toHaveLength(1);
    expect(viaHeader.calls[0]?.headerNames.filter((n) => n === 'x-api-key')).toHaveLength(1);
    expect(viaHeader.calls[0]?.headerNames.includes('authorization')).toBe(false);
  });
});

describeLive(
  'R',
  'core transport headers',
  () => {
    auditReadOnlyRequests();

    it('L-T6 X-Total-Count of the flat notification list is read by readTotalCount (U4)', async () => {
      const client = createLiveClient();
      const namespace = getHarness().env.namespace;
      const response = await client.transport.requestWithResponse<unknown[]>(
        'GET',
        '/notifications/{namespace}',
        { params: { namespace }, query: { group_by: 'flat', limit: 1 } }
      );
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      recordFact('U4.notificationsXTotalCountPresent', response.headers.has('x-total-count'));
      recordFact('U4.notificationsXTotalCount', readTotalCount(response.headers) ?? null);
      await expectTotalCountHeader(response.headers);

      // The second custom header of P1 §5.7, read once on a bounded window (H-P3-4 input).
      // Dates in the query are sent as epoch milliseconds (P1 §6.3 step 2).
      const { timestampFrom, timestampTo } = lastHour();
      const last = await client.transport.requestWithResponse<unknown>(
        'GET',
        '/es/last_positions/{appNamespace}',
        {
          params: { appNamespace: namespace },
          query: { timestampFrom: new Date(timestampFrom), timestampTo: new Date(timestampTo) },
        }
      );
      const sent = requestLog().find((e) => e.template === '/es/last_positions/{appNamespace}');
      expect(sent?.query.timestampFrom).toBe(String(timestampFrom));
      expect(sent?.query.timestampTo).toBe(String(timestampTo));
      expect(last.status).toBe(200);
      recordFact('U4.lastPositionsSourcePresent', last.headers.has('x-last-positions-source'));
    });
  },
  { feature: 'notifications' }
);
