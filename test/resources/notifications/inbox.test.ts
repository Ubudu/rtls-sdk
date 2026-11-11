// Unit tests of the notifications inbox (P6 §8.1 Q1–Q9, I1–I14, S1–S10 and the inbox error table): the real resource
// through the P1 transport against MSW; request assertions through recordRequests().
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';
import { fixtureResponse, loadFixture } from '../../contract/fixtures';
import {
  AuthenticationError,
  ConflictError,
  createRtlsClient,
  NotFoundError,
  ServerError,
  ValidationError,
  type NotificationFacets,
  type NotificationFilter,
  type NotificationGroup,
  type NotificationItem,
  type NotificationUnreadCount,
  type OffsetPage,
} from '../../../src';
import {
  assertLimit,
  assertNonEmptyString,
  assertObjectId,
  assertSelectiveFilter,
  toWireFilter,
} from '../../../src/resources/notifications/query';

const API = 'https://rtls.ubudu.com/api/notifications/ns-test';
const ID = '665f1c2e9b1d4a0012345601';
const client = createRtlsClient({ apiKey: 'k', namespace: 'ns-test' });
const notifications = client.notifications;

function only(rec: { requests: readonly RecordedRequest[] }): RecordedRequest {
  expect(rec.requests).toHaveLength(1);
  return rec.requests[0] as RecordedRequest;
}

function queryOf(r: RecordedRequest): Record<string, string> {
  const out: Record<string, string> = {};
  let count = 0;
  r.url.searchParams.forEach((value, key) => {
    out[key] = value;
    count += 1;
  });
  expect(Object.keys(out)).toHaveLength(count);
  return out;
}

function expectRequest(
  r: RecordedRequest,
  method: string,
  path: string,
  query: Record<string, string> = {}
): void {
  expect(r.method).toBe(method);
  expect(`${r.url.origin}${r.url.pathname}`).toBe(`${API}${path}`);
  expect(queryOf(r)).toEqual(query);
  expect(r.headers.get('x-api-key')).toBe('k');
}

async function expectNoBody(r: RecordedRequest): Promise<void> {
  expect(r.headers.get('content-type')).toBeNull();
  expect(await r.text()).toBe('');
}

async function expectJsonBody(r: RecordedRequest, body: unknown): Promise<void> {
  expect(r.headers.get('content-type')).toMatch(/^application\/json/);
  expect(JSON.parse(await r.text())).toEqual(body);
}

function body<T>(name: string): T {
  return loadFixture('notifications', name).body as T;
}

const clientGuard = expect.objectContaining({ status: 0 });

/** Items of the flat fixture with distinct ids (`<prefix><n>` padded to 24 hex). */
function items(...n: number[]): NotificationItem[] {
  const [dm] = body<NotificationItem[]>('list.flat');
  return n.map((i) => ({ ...(dm as NotificationItem), _id: i.toString(16).padStart(24, '0') }));
}

describe('notifications query helpers (Q1–Q9)', () => {
  it('Q1 toWireFilter maps every key to its wire string', () => {
    expect(
      toWireFilter({
        q: ' a ',
        state: 'unread',
        kind: 'mission',
        severity: 'warning',
        zone: 12,
        asset: 'aabbccddeeff',
        thread_key: 'dm:x',
        pinned: true,
        from: new Date(1000),
        to: '1970-01-01T00:00:02Z',
      })
    ).toEqual({
      q: 'a',
      state: 'unread',
      kind: 'mission',
      severity: 'warning',
      zone: '12',
      asset: 'aabbccddeeff',
      thread_key: 'dm:x',
      pinned: 'true',
      from: '1000',
      to: '2000',
    });
  });

  it('Q2 omits undefined values, an empty q and pinned: false', () => {
    expect(toWireFilter(undefined)).toEqual({});
    expect(
      toWireFilter({
        q: '   ',
        state: undefined,
        kind: undefined,
        pinned: false as unknown as true,
        zone: null as unknown as number,
      })
    ).toEqual({});
    expect(toWireFilter({ to: 0 })).toEqual({ to: '0' });
  });

  it('Q2 trims asset and thread_key; a blank one names its key', () => {
    expect(toWireFilter({ asset: ' aabb ', thread_key: '\tdm:x ' })).toEqual({
      asset: 'aabb',
      thread_key: 'dm:x',
    });
    expect(() => toWireFilter({ asset: ' ' })).toThrow(
      expect.objectContaining({ status: 0, details: ['asset'] })
    );
    expect(() => toWireFilter({ thread_key: '' })).toThrow(
      expect.objectContaining({ status: 0, details: ['thread_key'] })
    );
  });

  it('Q3 zone: 1.5 → ValidationError, and list() sends nothing', async () => {
    expect(() => toWireFilter({ zone: 1.5 })).toThrow(ValidationError);
    expect(() => toWireFilter({ zone: '3' as unknown as number })).toThrow(ValidationError);
    const rec = recordRequests();
    await expect(notifications.list({ zone: 1.5 })).rejects.toBeInstanceOf(ValidationError);
    expect(rec.requests).toHaveLength(0);
  });

  it.each<[string, NotificationFilter]>([
    ['{}', {}],
    ['{pinned:false}', { pinned: false as unknown as true }],
    ["{q:'  '}", { q: '  ' }],
    ['{state:undefined}', { state: undefined }],
    ["{state:'all'}", { state: 'all' }],
    ['{from:0}', { from: 0 }],
    ['{to:now}', { to: Date.now() }],
    ["{state:'all', from:0, to:1}", { state: 'all', from: 0, to: 1 }],
    ["{q:'zone:3 severity:critical'}", { q: 'zone:3 severity:critical' }],
    ["{q:'from:nobody'}", { q: 'from:nobody' }],
  ])('Q4 assertSelectiveFilter rejects %s', (_label, filter) => {
    expect(() => assertSelectiveFilter(toWireFilter(filter))).toThrow(
      expect.objectContaining({ status: 0, details: ['filter'] })
    );
  });

  it.each<[string, NotificationFilter]>([
    ["{state:'unread'}", { state: 'unread' }],
    ["{state:'archived'}", { state: 'archived' }],
    ["{thread_key:'dm:x'}", { thread_key: 'dm:x' }],
    ['{pinned:true}', { pinned: true }],
    ["{q:'cold room'}", { q: 'cold room' }],
    ["{q:'zone:3 freezer'}", { q: 'zone:3 freezer' }],
    ['{q:\'"cold room"\'}', { q: '"cold room"' }],
    ["{state:'all', kind:'alert'}", { state: 'all', kind: 'alert' }],
    ["{severity:'info'}", { severity: 'info' }],
    ['{zone:0}', { zone: 0 }],
    ["{asset:'a'}", { asset: 'a' }],
  ])('Q4 assertSelectiveFilter accepts %s', (_label, filter) => {
    expect(() => assertSelectiveFilter(toWireFilter(filter))).not.toThrow();
  });

  it('Q5 assertObjectId', () => {
    for (const bad of [
      'stream',
      'facets',
      '',
      'a'.repeat(23),
      'a'.repeat(25),
      'g'.repeat(24),
      42,
    ]) {
      expect(() => assertObjectId(bad)).toThrow(
        expect.objectContaining({ status: 0, details: ['id'] })
      );
    }
    expect(() => assertObjectId('zz', 'ids')).toThrow(
      expect.objectContaining({ details: ['ids'] })
    );
    expect(() => assertObjectId('665F1C2E9B1D4A0012345601')).not.toThrow();
    expect(() => assertObjectId('665f1c2e9b1d4a0012345601')).not.toThrow();
  });

  it('Q6 assertLimit', () => {
    for (const limit of [0, 201, 1.5, -1, '5', NaN]) {
      expect(() => assertLimit({ limit })).toThrow(
        expect.objectContaining({ status: 0, details: ['limit'] })
      );
    }
    expect(() => assertLimit({ limit: 1 })).not.toThrow();
    expect(() => assertLimit({ limit: 200 })).not.toThrow();
    expect(() => assertLimit({})).not.toThrow();
    expect(() => assertLimit({ offset: 0 })).not.toThrow();
    for (const offset of [-1, 0.5, '0']) {
      expect(() => assertLimit({ offset })).toThrow(
        expect.objectContaining({ status: 0, details: ['offset'] })
      );
    }
  });

  it('Q7 from as an invalid date string → ValidationError', () => {
    expect(() => toWireFilter({ from: 'not a date' })).toThrow(
      expect.objectContaining({ status: 0, details: ['from'] })
    );
    expect(() => toWireFilter({ to: new Date(NaN) })).toThrow(
      expect.objectContaining({ status: 0, details: ['to'] })
    );
  });

  it('Q8 every wire value is a string', () => {
    const wire = toWireFilter({ zone: 4, pinned: true, from: 1, to: new Date(2), state: 'all' });
    expect(Object.values(wire).every((v) => typeof v === 'string')).toBe(true);
    expect(Object.keys(wire)).toHaveLength(5);
  });

  it.each<[string, Record<string, unknown>]>([
    ["kind:'bogus'", { kind: 'bogus' }],
    ["state:'nope'", { state: 'nope' }],
    ["severity:'x'", { severity: 'x' }],
    ['asset: 12', { asset: 12 }],
    ['thread_key: true', { thread_key: true }],
    ["asset: ''", { asset: '' }],
    ["thread_key: ''", { thread_key: '' }],
    ["thread_key: '  '", { thread_key: '  ' }],
    ["thread_key: '  ', state: 'unread'", { thread_key: '  ', state: 'unread' }],
    ['q: 3', { q: 3 }],
    ["pinned: 'true'", { pinned: 'true' }],
  ])('Q9 enum/type guard %s → ValidationError; list() and bulk() send nothing', async (_l, f) => {
    const filter = f as NotificationFilter;
    expect(() => toWireFilter(filter)).toThrow(ValidationError);
    const rec = recordRequests();
    await expect(notifications.list(filter)).rejects.toSatisfy(
      (e) => e instanceof ValidationError && e.status === 0
    );
    await expect(notifications.bulk({ filter, action: 'read' })).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(rec.requests).toHaveLength(0);
  });

  it('a filter that is not an object → ValidationError', () => {
    expect(() => toWireFilter('state=all' as unknown as NotificationFilter)).toThrow(
      expect.objectContaining({ details: ['filter'] })
    );
    expect(() => toWireFilter([] as unknown as NotificationFilter)).toThrow(ValidationError);
  });

  it('assertNonEmptyString', () => {
    for (const bad of ['', '  ', 3, undefined]) {
      expect(() => assertNonEmptyString(bad, 'token')).toThrow(
        expect.objectContaining({ status: 0, details: ['token'] })
      );
    }
    expect(() => assertNonEmptyString('u', 'token')).not.toThrow();
  });
});

describe('notifications inbox reads (I1–I14)', () => {
  it('I1 list() → GET /notifications/ns-test?group_by=flat only; the flat fixture', async () => {
    const rec = recordRequests();
    const list: NotificationItem[] = await notifications.list();
    const r = only(rec);
    expectRequest(r, 'GET', '', { group_by: 'flat' });
    await expectNoBody(r);
    expect(list).toEqual(body('list.flat'));
  });

  it('I2 list() with a filter and bounds → exact query', async () => {
    const rec = recordRequests();
    await notifications.list({ state: 'all', limit: 2, offset: 4, thread_key: 'dm:x' });
    const r = only(rec);
    expectRequest(r, 'GET', '', {
      group_by: 'flat',
      state: 'all',
      thread_key: 'dm:x',
      limit: '2',
      offset: '4',
    });
    expect(r.url.search).toContain('thread_key=dm%3Ax');
  });

  it('I3 list({ limit: 500 }) → ValidationError, no request', async () => {
    const rec = recordRequests();
    await expect(notifications.list({ limit: 500 })).rejects.toEqual(clientGuard);
    await expect(notifications.list({ offset: -1 })).rejects.toBeInstanceOf(ValidationError);
    expect(rec.requests).toHaveLength(0);
  });

  it('I4 listPage() with X-Total-Count: 7 → { items, total: 7, limit: 50, offset: 0 }', async () => {
    server.use(
      http.get(API, () => HttpResponse.json(items(1, 2), { headers: { 'X-Total-Count': '7' } }))
    );
    const rec = recordRequests();
    const page: OffsetPage<NotificationItem> = await notifications.listPage();
    expectRequest(only(rec), 'GET', '', { group_by: 'flat' });
    expect(page).toEqual({ items: items(1, 2), total: 7, limit: 50, offset: 0 });
  });

  it('I4 listPage() echoes the given limit and offset; the default handler sends total 2', async () => {
    const rec = recordRequests();
    const page = await notifications.listPage({ limit: 10, offset: 20, kind: 'mission' });
    expectRequest(only(rec), 'GET', '', {
      group_by: 'flat',
      kind: 'mission',
      limit: '10',
      offset: '20',
    });
    expect(page).toEqual({ items: body('list.flat'), total: 2, limit: 10, offset: 20 });
  });

  it.each<[string, Record<string, string>]>([
    ['no header', {}],
    ['X-Total-Count: abc', { 'X-Total-Count': 'abc' }],
    ['X-Total-Count: -1', { 'X-Total-Count': '-1' }],
  ])('I5 listPage() with %s → total absent', async (_label, headers) => {
    server.use(http.get(API, () => HttpResponse.json(items(1), { headers })));
    const page = await notifications.listPage();
    expect(page).not.toHaveProperty('total');
    expect(page.items).toHaveLength(1);
  });

  it('I6 iterate({ limit: 2 }) over pages of 2, 2, 1 (total 5): offsets 0, 2, 4, one pinned `to`', async () => {
    const all = items(1, 2, 3, 4, 5);
    server.use(
      http.get(API, ({ request }) => {
        const offset = Number(new URL(request.url).searchParams.get('offset'));
        return HttpResponse.json(all.slice(offset, offset + 2), {
          headers: { 'X-Total-Count': '5' },
        });
      })
    );
    const rec = recordRequests();
    const before = Date.now();
    const it = notifications.iterate({ limit: 2, state: 'all' });
    expect(rec.requests).toHaveLength(0);
    const first = await it.next();
    expect(first.value?._id).toBe(all[0]?._id);
    expect(rec.requests).toHaveLength(1);
    const ids = [first.value?._id];
    for await (const item of it) ids.push(item._id);
    expect(ids).toEqual(all.map((i) => i._id));
    expect(rec.requests).toHaveLength(3);
    const queries = rec.requests.map(queryOf);
    expect(queries.map((q) => q.offset)).toEqual(['0', '2', '4']);
    const to = queries[0]?.to;
    expect(Number(to)).toBeGreaterThanOrEqual(before);
    for (const q of queries) {
      expect(q).toEqual({ group_by: 'flat', state: 'all', to, limit: '2', offset: q.offset });
    }
  });

  it('I6 iterate() defaults: page size 200 from offset 0; stops after a short page', async () => {
    const rec = recordRequests();
    const ids: string[] = [];
    for await (const item of notifications.iterate()) ids.push(item._id);
    expect(ids).toHaveLength(2);
    const r = only(rec);
    expect(queryOf(r)).toMatchObject({ group_by: 'flat', limit: '200', offset: '0' });
  });

  it('I7 iterate() with an explicit to sends it unchanged; offset starts at query.offset', async () => {
    server.use(http.get(API, () => HttpResponse.json(items(1))));
    const rec = recordRequests();
    const ids: string[] = [];
    for await (const item of notifications.iterate({ to: 5000, offset: 3, limit: 5 })) {
      ids.push(item._id);
    }
    expect(ids).toHaveLength(1);
    expect(queryOf(only(rec))).toEqual({
      group_by: 'flat',
      to: '5000',
      limit: '5',
      offset: '3',
    });
  });

  it('I8 iterate() skips an id already yielded on an earlier page', async () => {
    const [a, b, c] = items(1, 2, 3);
    const pages: Record<string, NotificationItem[]> = { '0': [a!, b!], '2': [b!, c!], '4': [] };
    server.use(
      http.get(API, ({ request }) =>
        HttpResponse.json(pages[new URL(request.url).searchParams.get('offset') ?? ''] ?? [])
      )
    );
    const rec = recordRequests();
    const ids: string[] = [];
    for await (const item of notifications.iterate({ limit: 2 })) ids.push(item._id);
    expect(ids).toEqual([a!._id, b!._id, c!._id]);
    expect(rec.requests).toHaveLength(3);
  });

  it('iterate() validates at once (no request): bounds and filter', () => {
    const rec = recordRequests();
    expect(() => notifications.iterate({ limit: 0 })).toThrow(clientGuard);
    expect(() => notifications.iterate({ kind: 'x' as never })).toThrow(ValidationError);
    expect(rec.requests).toHaveLength(0);
  });

  it('iterate(): an HTTP error rejects the first next()', async () => {
    server.use(
      http.get(API, () => fixtureResponse(loadFixture('notifications', 'error.internal')))
    );
    await expect(notifications.iterate().next()).rejects.toBeInstanceOf(ServerError);
  });

  it('I9 listGroups() → group_by=thread; the thread fixture', async () => {
    const rec = recordRequests();
    const groups: NotificationGroup[] = await notifications.listGroups();
    expectRequest(only(rec), 'GET', '', { group_by: 'thread' });
    expect(groups).toEqual(body('list.groups.thread'));
    expect(groups[0]?.group_by).toBe('thread');
  });

  it('I10 listGroups({ group_by: zone, state: unread }) → exact query; type → the type fixture', async () => {
    const rec = recordRequests();
    await notifications.listGroups({ group_by: 'zone', state: 'unread' });
    const byType = await notifications.listGroups({ group_by: 'type', limit: 3 });
    expect(rec.requests).toHaveLength(2);
    expectRequest(rec.requests[0]!, 'GET', '', { group_by: 'zone', state: 'unread' });
    expectRequest(rec.requests[1]!, 'GET', '', { group_by: 'type', limit: '3' });
    expect(byType).toEqual(body('list.groups.type'));
  });

  it('I11 listGroups with group_by flat or a q key → ValidationError, no request', async () => {
    const rec = recordRequests();
    await expect(notifications.listGroups({ group_by: 'flat' } as never)).rejects.toEqual(
      expect.objectContaining({ status: 0, details: ['group_by'] })
    );
    await expect(notifications.listGroups({ q: 'x' } as never)).rejects.toEqual(
      expect.objectContaining({ status: 0, details: ['q'] })
    );
    await expect(notifications.listGroups({ limit: 201 })).rejects.toBeInstanceOf(ValidationError);
    expect(rec.requests).toHaveLength(0);
  });

  it('I12 facets({ state: all, kind: alert }) → GET /facets?state=all&kind=alert', async () => {
    const rec = recordRequests();
    const facets: NotificationFacets = await notifications.facets({ state: 'all', kind: 'alert' });
    expectRequest(only(rec), 'GET', '/facets', { state: 'all', kind: 'alert' });
    expect(facets).toEqual(body('facets'));
    expect(facets.state.archived).toBe(0);
  });

  it('I12 facets() without a filter sends no query', async () => {
    const rec = recordRequests();
    await notifications.facets();
    expectRequest(only(rec), 'GET', '/facets');
  });

  it('I13 unreadCount() → GET /unread_count; { unread: 0, needs_action: 0 }', async () => {
    const rec = recordRequests();
    const count: NotificationUnreadCount = await notifications.unreadCount();
    const r = only(rec);
    expectRequest(r, 'GET', '/unread_count');
    await expectNoBody(r);
    expect(count).toEqual({ unread: 0, needs_action: 0 });
  });

  it('I14 get(id) → GET /<id>; 404 → NotFoundError; get(stream) → no request', async () => {
    const rec = recordRequests();
    const item: NotificationItem = await notifications.get(ID);
    expectRequest(only(rec), 'GET', `/${ID}`);
    expect(item).toEqual(body('item.dm'));

    server.use(
      http.get(`${API}/:id`, () => fixtureResponse(loadFixture('notifications', 'error.not-found')))
    );
    await expect(notifications.get(ID)).rejects.toSatisfy(
      (e) => e instanceof NotFoundError && e.status === 404 && e.apiCode === 'not_found'
    );
    rec.stop();
    const none = recordRequests();
    await expect(notifications.get('stream')).rejects.toEqual(clientGuard);
    await expect(notifications.get('facets')).rejects.toBeInstanceOf(ValidationError);
    expect(none.requests).toHaveLength(0);
  });
});

describe('notifications single-item changes (S1–S10)', () => {
  it('S1 markRead(id) → POST /<id>/read, no body; read: true', async () => {
    const rec = recordRequests();
    const item = await notifications.markRead(ID);
    const r = only(rec);
    expectRequest(r, 'POST', `/${ID}/read`);
    await expectNoBody(r);
    expect(item.read).toBe(true);
    expect(item).toEqual(body('item.read'));
  });

  it('S2 acknowledge(id) → POST /<id>/acknowledge, no body', async () => {
    const rec = recordRequests();
    const item = await notifications.acknowledge(ID);
    const r = only(rec);
    expectRequest(r, 'POST', `/${ID}/acknowledge`);
    await expectNoBody(r);
    expect(item.acknowledged).toBe(true);
    expect(item.read).toBe(false);
  });

  it('S3 acknowledge 409 not_actionable → ConflictError', async () => {
    server.use(
      http.post(`${API}/:id/acknowledge`, () =>
        fixtureResponse(loadFixture('notifications', 'error.not-actionable'))
      )
    );
    await expect(notifications.acknowledge(ID)).rejects.toSatisfy(
      (e) => e instanceof ConflictError && e.status === 409 && e.apiCode === 'not_actionable'
    );
  });

  it('S4 archive(id) → POST /<id>/archive, no body', async () => {
    const rec = recordRequests();
    const item = await notifications.archive(ID);
    const r = only(rec);
    expectRequest(r, 'POST', `/${ID}/archive`);
    await expectNoBody(r);
    expect(item.archived).toBe(true);
  });

  it('S5 pin(id) → { pinned: true }; unpin(id) → { pinned: false }', async () => {
    const rec = recordRequests();
    const pinned = await notifications.pin(ID);
    await notifications.unpin(ID);
    expect(rec.requests).toHaveLength(2);
    expectRequest(rec.requests[0]!, 'POST', `/${ID}/pin`);
    await expectJsonBody(rec.requests[0]!, { pinned: true });
    expectRequest(rec.requests[1]!, 'POST', `/${ID}/pin`);
    await expectJsonBody(rec.requests[1]!, { pinned: false });
    expect(pinned).toEqual(body('item.pinned'));
  });

  it('S6 snooze(id, Date) → { until: 5000 }; snooze(id, 0) → { until: 0 }', async () => {
    const rec = recordRequests();
    const item = await notifications.snooze(ID, new Date(5000));
    await notifications.snooze(ID, 0);
    await notifications.snooze(ID, '1970-01-01T00:00:01Z');
    expect(rec.requests).toHaveLength(3);
    expectRequest(rec.requests[0]!, 'POST', `/${ID}/snooze`);
    await expectJsonBody(rec.requests[0]!, { until: 5000 });
    await expectJsonBody(rec.requests[1]!, { until: 0 });
    await expectJsonBody(rec.requests[2]!, { until: 1000 });
    expect(item.snooze_until).toEqual(expect.any(Number));
  });

  it('S7 snooze(id, not a date) → ValidationError, no request', async () => {
    const rec = recordRequests();
    await expect(notifications.snooze(ID, 'not a date')).rejects.toEqual(clientGuard);
    await expect(notifications.snooze(ID, NaN)).rejects.toBeInstanceOf(ValidationError);
    expect(rec.requests).toHaveLength(0);
  });

  it('S8 updateMission(id, in_progress) → PATCH /<id> { mission: { status } }', async () => {
    const rec = recordRequests();
    const item = await notifications.updateMission(ID, 'in_progress');
    const r = only(rec);
    expectRequest(r, 'PATCH', `/${ID}`);
    await expectJsonBody(r, { mission: { status: 'in_progress' } });
    expect(item.mission?.status).toBe('in_progress');
  });

  it('S8 updateMission has no client guard on the status (the server validates)', async () => {
    const rec = recordRequests();
    await notifications.updateMission(ID, 'closed' as never);
    await expectJsonBody(only(rec), { mission: { status: 'closed' } });
  });

  it('S9 updateMission 409 not_a_mission → ConflictError; 400 → ValidationError with the body message', async () => {
    server.use(
      http.patch(`${API}/:id`, () =>
        fixtureResponse(loadFixture('notifications', 'error.not-a-mission'))
      )
    );
    await expect(notifications.updateMission(ID, 'done')).rejects.toSatisfy(
      (e) => e instanceof ConflictError && e.apiCode === 'not_a_mission'
    );
    server.use(
      http.patch(`${API}/:id`, () =>
        fixtureResponse(loadFixture('notifications', 'error.bad-request'))
      )
    );
    await expect(notifications.updateMission(ID, 'done')).rejects.toSatisfy(
      (e) =>
        e instanceof ValidationError &&
        e.status === 400 &&
        e.apiCode === 'bad_request' &&
        e.message === 'mission.status must be open|in_progress|done'
    );
  });

  it.each<[string, (id: string) => Promise<unknown>]>([
    ['markRead', (id) => notifications.markRead(id)],
    ['acknowledge', (id) => notifications.acknowledge(id)],
    ['archive', (id) => notifications.archive(id)],
    ['pin', (id) => notifications.pin(id)],
    ['unpin', (id) => notifications.unpin(id)],
    ['snooze', (id) => notifications.snooze(id, 1000)],
    ['updateMission', (id) => notifications.updateMission(id, 'done')],
    ['get', (id) => notifications.get(id)],
  ])('S10 %s(not-an-id) → ValidationError, no request', async (_name, call) => {
    const rec = recordRequests();
    await expect(call('not-an-id')).rejects.toEqual(
      expect.objectContaining({ status: 0, details: ['id'] })
    );
    expect(rec.requests).toHaveLength(0);
  });
});

describe('notifications inbox errors', () => {
  it('401 → AuthenticationError (status 401)', async () => {
    server.use(
      http.get(API, () => fixtureResponse(loadFixture('notifications', 'error.auth-missing')))
    );
    await expect(notifications.list()).rejects.toSatisfy(
      (e) =>
        e instanceof AuthenticationError &&
        e.status === 401 &&
        e.message === 'No authentication credentials provided'
    );
  });

  it('404 with an HTML body (feature disabled) → NotFoundError without apiCode', async () => {
    server.use(
      http.get(
        `${API}/unread_count`,
        () =>
          new HttpResponse('<!DOCTYPE html><pre>Cannot GET</pre>', {
            status: 404,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          })
      )
    );
    await expect(notifications.unreadCount()).rejects.toSatisfy(
      (e) => e instanceof NotFoundError && e.status === 404 && e.apiCode === undefined
    );
  });

  it('500 internal_error → ServerError; message prefers body.message', async () => {
    server.use(
      http.get(`${API}/facets`, () =>
        fixtureResponse(loadFixture('notifications', 'error.internal'))
      )
    );
    await expect(notifications.facets()).rejects.toSatisfy(
      (e) => e instanceof ServerError && e.status === 500 && e.apiCode === 'internal_error'
    );
    server.use(
      http.get(`${API}/facets`, () =>
        HttpResponse.json({ error: 'internal_error', message: 'database down' }, { status: 500 })
      )
    );
    await expect(notifications.facets()).rejects.toSatisfy(
      (e) => e instanceof ServerError && e.message === 'database down'
    );
  });

  it('per-call namespace and request options are applied', async () => {
    const rec = recordRequests();
    await notifications.unreadCount({ namespace: 'other', headers: { 'X-Trace': 't' } });
    const r = only(rec);
    expect(r.url.pathname).toBe('/api/notifications/other/unread_count');
    expect(r.headers.get('x-trace')).toBe('t');
  });
});
