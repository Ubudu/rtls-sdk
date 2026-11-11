// Unit tests of client.positions.query (P3 §8.2): the real resource code against MSW, requests captured with
// recordRequests(), results compared with the fixture bodies.
import { describe, expect, expectTypeOf, it } from 'vitest';
import { delay, http, HttpResponse } from 'msw';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';
import { fixtureResponse, loadFixture } from '../../contract/fixtures';
import {
  AbortError,
  ContextError,
  createRtlsClient,
  PayloadTooLargeError,
  ServerError,
  TimeoutError,
  ValidationError,
  type AssetPosition,
  type EsDataType,
  type EsSearchResponse,
} from '../../../src';
import {
  BASE_URL,
  ES_413_HTML,
  ES_GUARD_AGG_DEPTH,
  ES_GUARD_SIZE,
  ES_INVALID_DATATYPE,
} from './support/positions-handlers';

const API_KEY = 'test-key';
const ROUTE = `${BASE_URL}/es/query/:namespace/:dataType`;
const NOW = 1_700_000_000_000;
const RANGE = { range: { timestamp: { gte: NOW - 3_600_000, lte: NOW, format: 'epoch_millis' } } };
const DSL = { size: 2, query: RANGE, sort: [{ timestamp: 'desc' }] };

const client = createRtlsClient({ apiKey: API_KEY, namespace: 'ns-test' });
const noNamespace = createRtlsClient({ apiKey: API_KEY });

const body = (name: string): unknown => loadFixture('positions-spatial', name).body;

async function expectPost(
  request: RecordedRequest | undefined,
  path: string,
  json: unknown
): Promise<void> {
  expect(request).toBeDefined();
  const r = request as RecordedRequest;
  expect({
    method: r.method,
    path: r.url.pathname,
    search: r.url.search,
    auth: r.headers.get('x-api-key'),
    contentType: r.headers.get('content-type'),
    body: JSON.parse(await r.text()) as unknown,
  }).toStrictEqual({
    method: 'POST',
    path: `/api${path}`,
    search: '',
    auth: API_KEY,
    contentType: 'application/json',
    body: json,
  });
}

function reply(status: number, json: Record<string, string | readonly string[]>): void {
  server.use(http.post(ROUTE, () => HttpResponse.json(json, { status })));
}

describe('positions.query', () => {
  it('U-Q-1 POST /es/query/{ns}/positions with the DSL unchanged; result = fixture body', async () => {
    const rec = recordRequests();
    const res = await client.positions.query<AssetPosition>('positions', DSL);
    await expectPost(rec.requests[0], '/es/query/ns-test/positions', DSL);
    expect(rec.requests).toHaveLength(1);
    expect(res).toStrictEqual(body('es-query-hits'));
    expectTypeOf(res).toEqualTypeOf<EsSearchResponse<AssetPosition, Record<string, unknown>>>();
    expectTypeOf(res.hits.hits[0]!._source.user.udid).toEqualTypeOf<string>();
  });

  it('U-Q-1 an aggregation query (size 0) returns the aggregations typed by TAggs', async () => {
    server.use(
      http.post(ROUTE, () => fixtureResponse(loadFixture('positions-spatial', 'es-query-aggs')))
    );
    type Aggs = { per_hour: { buckets: Array<{ key: number; doc_count: number }> } };
    const dsl = {
      size: 0,
      query: RANGE,
      aggs: { per_hour: { date_histogram: { field: 'timestamp', fixed_interval: '1h' } } },
    };
    const rec = recordRequests();
    const res = await client.positions.query<AssetPosition, Aggs>('positions', dsl);
    await expectPost(rec.requests[0], '/es/query/ns-test/positions', dsl);
    expect(res).toStrictEqual(body('es-query-aggs'));
    expectTypeOf(res.aggregations).toEqualTypeOf<Aggs | undefined>();
  });

  it.each(['alerts', 'zone_visits'] as const)(
    'U-Q-2 dataType %s → path segment',
    async (dataType) => {
      const rec = recordRequests();
      await client.positions.query(dataType, DSL);
      await expectPost(rec.requests[0], `/es/query/ns-test/${dataType}`, DSL);
    }
  );

  it('U-Q-3 { namespace, timeoutMs, headers } honoured', async () => {
    const rec = recordRequests();
    await client.positions.query('positions', DSL, {
      namespace: 'x',
      timeoutMs: 10_000,
      headers: { 'x-trace': 'q' },
    });
    await expectPost(rec.requests[0], '/es/query/x/positions', DSL);
    expect(rec.requests[0]?.headers.get('x-trace')).toBe('q');
    server.use(
      http.post(ROUTE, async () => {
        await delay(200);
        return HttpResponse.json({});
      })
    );
    await expect(client.positions.query('positions', DSL, { timeoutMs: 5 })).rejects.toBeInstanceOf(
      TimeoutError
    );
  });

  it('U-Q-4 guard rejection of a script clause (fixture es-query-guard-400) → ValidationError, details = violations', async () => {
    const fixture = loadFixture('positions-spatial', 'es-query-guard-400');
    server.use(http.post(ROUTE, () => fixtureResponse(fixture)));
    const dsl = {
      size: 1,
      query: { bool: { filter: [RANGE, { script: { script: { source: 'true' } } }] } },
    };
    const rec = recordRequests();
    const p = client.positions.query('positions', dsl);
    await expect(p).rejects.toBeInstanceOf(ValidationError);
    await expect(p).rejects.toMatchObject({
      status: 400,
      details: (fixture.body as { violations: string[] }).violations,
    });
    await expectPost(rec.requests[0], '/es/query/ns-test/positions', dsl);
  });

  it.each([
    ['size -1', { size: -1, query: RANGE }, ES_GUARD_SIZE],
    [
      'aggregations nested 4 deep',
      {
        size: 0,
        query: RANGE,
        aggs: {
          a: {
            date_histogram: { field: 'timestamp', fixed_interval: '1d' },
            aggs: {
              b: {
                date_histogram: { field: 'timestamp', fixed_interval: '1h' },
                aggs: {
                  c: {
                    date_histogram: { field: 'timestamp', fixed_interval: '1m' },
                    aggs: { d: { date_histogram: { field: 'timestamp', fixed_interval: '1s' } } },
                  },
                },
              },
            },
          },
        },
      },
      ES_GUARD_AGG_DEPTH,
    ],
  ] as const)(
    'U-Q-5 guard rejection (%s) → ValidationError, details = violations',
    async (_label, dsl, answer) => {
      reply(400, answer);
      const p = client.positions.query('positions', dsl);
      await expect(p).rejects.toBeInstanceOf(ValidationError);
      await expect(p).rejects.toMatchObject({ status: 400, details: [...answer.violations] });
    }
  );

  it('U-Q-6 500 Invalid dataType → ServerError (USI-P3-9)', async () => {
    reply(500, ES_INVALID_DATATYPE);
    const p = client.positions.query('nope' as EsDataType, DSL);
    await expect(p).rejects.toBeInstanceOf(ServerError);
    await expect(p).rejects.toMatchObject({ status: 500, message: ES_INVALID_DATATYPE.error });
  });

  it('U-Q-7 413 HTML page → PayloadTooLargeError whose message has no markup', async () => {
    server.use(
      http.post(ROUTE, () =>
        HttpResponse.text(ES_413_HTML, {
          status: 413,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      )
    );
    const p = client.positions.query('positions', DSL);
    await expect(p).rejects.toBeInstanceOf(PayloadTooLargeError);
    await expect(p).rejects.toSatisfy(
      (e: Error) => e.message.length > 0 && !e.message.includes('<')
    );
  });

  it('U-Q-8 deprecated client.esQuery(ns, dataType, dsl, requestOptions) → same wire', async () => {
    const rec = recordRequests();
    await client.esQuery('ns2', 'positions', DSL, { timeoutMs: 1000 });
    await expectPost(rec.requests[0], '/es/query/ns2/positions', DSL);
  });

  it('U-Q-9 read-only POST: the client retry policy (GET only) retries a 503 → 2 requests, the 200 body', async () => {
    const retrying = createRtlsClient({
      apiKey: API_KEY,
      namespace: 'ns-test',
      retry: { retries: 2, baseDelayMs: 1 },
    });
    let calls = 0;
    server.use(
      http.post(ROUTE, () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ error: 'unavailable' }, { status: 503 })
          : fixtureResponse(loadFixture('positions-spatial', 'es-query-hits'));
      })
    );
    const rec = recordRequests();
    await expect(retrying.positions.query('positions', DSL)).resolves.toStrictEqual(
      body('es-query-hits')
    );
    expect(rec.requests).toHaveLength(2);
  });

  it('pre-aborted signal → AbortError; no namespace → ContextError; nothing sent', async () => {
    const rec = recordRequests();
    await expect(
      client.positions.query('positions', DSL, { signal: AbortSignal.abort() })
    ).rejects.toBeInstanceOf(AbortError);
    await expect(noNamespace.positions.query('positions', DSL)).rejects.toBeInstanceOf(
      ContextError
    );
    expect(rec.requests).toHaveLength(0);
  });
});
