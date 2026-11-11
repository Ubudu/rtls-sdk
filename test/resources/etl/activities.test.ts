// Unit tests of client.etl.activities (P7 §8.3, A1–A11): query building, search escaping, local validation, Page
// normalisation and the lazy iterator, through the real transport against MSW. Entries come from the loaded
// fixture, so that a live re-recording (--record) does not break them.
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';
import { fixtureResponse, loadFixture } from '../../contract/fixtures';
import {
  collectAll,
  createRtlsClient,
  ServerError,
  ValidationError,
  type EtlActivity,
  type Page,
  type RtlsClient,
  type RtlsError,
} from '../../../src';

const BASE = 'https://rtls.ubudu.com/api';
const ACTIVITIES = `${BASE}/etl/activities`;

interface ActivitiesBody {
  activities: EtlActivity[];
  pagination: { total: number; page: number; limit: number; pages: number };
}

const fixture = loadFixture('etl', 'activities-page');
const fixtureBody = fixture.body as ActivitiesBody;

function client(): RtlsClient {
  return createRtlsClient({ apiKey: 'test-key' });
}

function only(rec: { requests: readonly RecordedRequest[] }): RecordedRequest {
  expect(rec.requests).toHaveLength(1);
  return rec.requests[0] as RecordedRequest;
}

/** The rejection of `p` (fails the test when it resolves). */
async function expectRejection(p: Promise<unknown>): Promise<RtlsError> {
  const [outcome] = await Promise.allSettled([p]);
  expect(outcome?.status).toBe('rejected');
  return (outcome as PromiseRejectedResult).reason as RtlsError;
}

function query(r: RecordedRequest): Record<string, string> {
  const out: Record<string, string> = {};
  r.url.searchParams.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

/** `n` entries cloned from the fixture with distinct ids. */
function entries(n: number): EtlActivity[] {
  return Array.from({ length: n }, (_v, i) => {
    const source = fixtureBody.activities[i % fixtureBody.activities.length] as EtlActivity;
    return { ...source, _id: `64b0000000000000000000${String(50 + i)}` };
  });
}

/** A server that pages `items` by the request's page/limit; `failOn` answers 500 for that page. */
function pagedServer(items: EtlActivity[], failOn?: number): void {
  server.use(
    http.get(ACTIVITIES, ({ request }) => {
      const url = new URL(request.url);
      const page = Number(url.searchParams.get('page') ?? '1');
      const limit = Number(url.searchParams.get('limit') ?? '10');
      if (page === failOn) return fixtureResponse(loadFixture('etl', 'error-activities-500'));
      return HttpResponse.json({
        activities: items.slice((page - 1) * limit, page * limit),
        pagination: { total: items.length, page, limit, pages: Math.ceil(items.length / limit) },
      });
    })
  );
}

function pageAnswer(pagination: ActivitiesBody['pagination']): void {
  server.use(http.get(ACTIVITIES, () => HttpResponse.json({ activities: [], pagination })));
}

describe('client.etl.activities.listPage (GET /etl/activities)', () => {
  it('A1 no query sent; the envelope is normalised to Page', async () => {
    const rec = recordRequests();
    const page: Page<EtlActivity> = await client().etl.activities.listPage();
    const r = only(rec);
    expect(r.method).toBe('GET');
    expect(r.url.pathname).toBe('/api/etl/activities');
    expect(r.url.search).toBe('');
    expect(r.headers.get('x-api-key')).toBe('test-key');
    expect(r.headers.get('content-type')).toBeNull();
    const p = fixtureBody.pagination;
    expect(page).toEqual({
      data: fixtureBody.activities,
      pagination: {
        page: p.page,
        limit: p.limit,
        total: p.total,
        totalPages: p.pages,
        hasNext: p.page < p.pages,
        hasPrev: p.page > 1,
      },
    });
  });

  it('A2 every query key is sent as given', async () => {
    const rec = recordRequests();
    await client().etl.activities.listPage({
      page: 2,
      limit: 5,
      sortField: 'timestamp',
      sortOrder: 'asc',
      search: 'x',
      action: 'upload',
      resourceType: 'file',
    });
    expect(query(only(rec))).toEqual({
      page: '2',
      limit: '5',
      sortField: 'timestamp',
      sortOrder: 'asc',
      search: 'x',
      action: 'upload',
      resourceType: 'file',
    });
  });

  it('A2b only the keys that are set are sent', async () => {
    const rec = recordRequests();
    await client().etl.activities.listPage({ limit: 3, action: undefined, search: undefined });
    expect(query(only(rec))).toEqual({ limit: '3' });
  });

  it('A3 search: special characters are sent escaped', async () => {
    const rec = recordRequests();
    await client().etl.activities.listPage({ search: 'a.b(c)*' });
    expect(only(rec).url.searchParams.get('search')).toBe('a\\.b\\(c\\)\\*');
    rec.stop();
    const rec2 = recordRequests();
    await client().etl.activities.listPage({ search: '^[x]{1}|y+?$\\' });
    expect(only(rec2).url.searchParams.get('search')).toBe('\\^\\[x\\]\\{1\\}\\|y\\+\\?\\$\\\\');
  });

  it('A4 page / limit / pageSize not an integer >= 1 → ValidationError, no request', async () => {
    const rec = recordRequests();
    const activities = client().etl.activities;
    const details: unknown[] = [];
    for (const bad of [0, -1, 1.5, NaN, '2']) {
      details.push((await expectRejection(activities.listPage({ page: bad as number }))).details);
      details.push((await expectRejection(activities.listPage({ limit: bad as number }))).details);
    }
    expect(details).toEqual(Array.from({ length: 5 }, () => [['page'], ['limit']]).flat());
    for (const bad of [0, 1.5, -3]) {
      const err = await expectRejection(activities.iterate({ pageSize: bad }).next());
      expect(err).toBeInstanceOf(ValidationError);
      expect(err).toMatchObject({ status: 0, details: ['pageSize'] });
    }
    expect(rec.requests).toHaveLength(0);
  });

  it('A5 hasNext / hasPrev from page and pages', async () => {
    const flags: boolean[][] = [];
    for (const pagination of [
      { total: 0, page: 1, limit: 10, pages: 0 },
      { total: 30, page: 3, limit: 10, pages: 3 },
      { total: 30, page: 1, limit: 10, pages: 3 },
    ]) {
      pageAnswer(pagination);
      const { pagination: p } = await client().etl.activities.listPage();
      flags.push([p.hasNext, p.hasPrev]);
      expect(p.totalPages).toBe(pagination.pages);
    }
    expect(flags).toEqual([
      [false, false],
      [false, true],
      [true, false],
    ]);
  });

  it('A6 entries narrow on action: an upload entry exposes details.processingStats', async () => {
    const { data } = await client().etl.activities.listPage();
    const uploads = data.filter((e) => e.action === 'upload');
    const profiles = data.filter((e) => e.action !== 'upload');
    expect(uploads.length + profiles.length).toBe(fixtureBody.activities.length);
    const stats = uploads.map((e) => (e.action === 'upload' ? e.details.processingStats : null));
    const expected = fixtureBody.activities
      .filter((e) => e.action === 'upload')
      .map((e) => (e.details as { processingStats?: unknown }).processingStats);
    expect(stats).toEqual(expected);
    expect(uploads.length).toBeGreaterThan(0);
  });

  it('A10 500 Internal server error → ServerError', async () => {
    server.use(
      http.get(ACTIVITIES, () => fixtureResponse(loadFixture('etl', 'error-activities-500')))
    );
    const err = await expectRejection(client().etl.activities.listPage());
    expect(err).toBeInstanceOf(ServerError);
    expect(err).toMatchObject({ status: 500, message: 'Internal server error' });
  });

  it('forwards the request options (pre-aborted signal → AbortError, no request)', async () => {
    const rec = recordRequests();
    const controller = new AbortController();
    controller.abort();
    await expect(
      client().etl.activities.listPage({}, { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(rec.requests).toHaveLength(0);
  });
});

describe('client.etl.activities.iterate', () => {
  it('A7 yields every entry; page=1,2,3 with limit=2; no 4th request', async () => {
    const items = entries(5);
    pagedServer(items);
    const rec = recordRequests();
    const seen: EtlActivity[] = [];
    for await (const entry of client().etl.activities.iterate({ pageSize: 2 })) seen.push(entry);
    expect(seen).toEqual(items);
    expect(rec.requests.map((r) => query(r))).toEqual([
      { page: '1', limit: '2' },
      { page: '2', limit: '2' },
      { page: '3', limit: '2' },
    ]);
  });

  it('A8 collectAll with maxItems stops pulling: 3 items, 2 requests', async () => {
    pagedServer(entries(5));
    const rec = recordRequests();
    const items = await collectAll(client().etl.activities.iterate({ pageSize: 2 }), {
      maxItems: 3,
    });
    expect(items).toHaveLength(3);
    expect(rec.requests).toHaveLength(2);
  });

  it('A9 filters go on every page request; pageSize is never sent; default limit 100', async () => {
    const items = entries(3);
    pagedServer(items);
    const rec = recordRequests();
    const seen = await collectAll(
      client().etl.activities.iterate({ action: 'upload', search: 'a.b' })
    );
    expect(seen).toEqual(items);
    expect(rec.requests.map((r) => query(r))).toEqual([
      { action: 'upload', search: 'a\\.b', page: '1', limit: '100' },
    ]);

    pagedServer(entries(5));
    const rec2 = recordRequests();
    await collectAll(client().etl.activities.iterate({ pageSize: 2, action: 'upload' }));
    const queries = rec2.requests.map((r) => query(r));
    expect(queries.map((q) => q.action)).toEqual(['upload', 'upload', 'upload']);
    expect(queries.filter((q) => 'pageSize' in q)).toEqual([]);
  });

  it('A9b an empty page ends the iteration', async () => {
    pagedServer([]);
    const rec = recordRequests();
    expect(await collectAll(client().etl.activities.iterate())).toEqual([]);
    expect(rec.requests).toHaveLength(1);
  });

  it('A11 a failing page 2: the 2 items of page 1, then ServerError; no 3rd request', async () => {
    const items = entries(5);
    pagedServer(items, 2);
    const rec = recordRequests();
    const iterator = client().etl.activities.iterate({ pageSize: 2 });
    const first = await iterator.next();
    const second = await iterator.next();
    expect([first.value, second.value]).toEqual(items.slice(0, 2));
    const err = await expectRejection(iterator.next());
    expect(err).toBeInstanceOf(ServerError);
    expect(err.status).toBe(500);
    expect(rec.requests).toHaveLength(2);
  });

  it('a pre-aborted signal ends the iteration with AbortError before any request', async () => {
    const rec = recordRequests();
    const controller = new AbortController();
    controller.abort();
    const iterator = client().etl.activities.iterate({}, { signal: controller.signal });
    await expect(iterator.next()).rejects.toMatchObject({ name: 'AbortError' });
    expect(rec.requests).toHaveLength(0);
  });
});
