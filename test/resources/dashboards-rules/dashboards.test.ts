// client.dashboards against MSW with the real request builder (P5 §8.1 D1–D11). Also holds the cases of the
// 0.2.0 dashboards-context test (default namespace, legacy string, override, create namespace sources), which
// mocked the client and is deleted.
import { describe, it, expect } from 'vitest';
import { delay, http, HttpResponse } from 'msw';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';
import { fixtureResponse, loadFixture } from '../../contract/fixtures';
import {
  AuthenticationError,
  AuthorizationError,
  ContextError,
  createRtlsClient,
  NotFoundError,
  PayloadTooLargeError,
  ServerError,
  TimeoutError,
  ValidationError,
  type CreateDashboardInput,
  type Dashboard,
  type RtlsClient,
  type UpdateDashboardInput,
} from '../../../src';

const BASE = 'https://rtls.ubudu.com/api';
const ID = '65a1b2c3d4e5f60718293a4b';

const client = (): RtlsClient => createRtlsClient({ apiKey: 'test-key', namespace: 'test-ns' });
const bare = (): RtlsClient => createRtlsClient({ apiKey: 'test-key' });
const body = (name: string): unknown => loadFixture('dashboards-rules', name).body;

/** The parsed parts of a recorded request. */
async function sent(rec: { readonly requests: readonly RecordedRequest[] }, i = 0) {
  const r = rec.requests[i] as RecordedRequest;
  const text = await r.text();
  return {
    method: r.method,
    path: r.url.pathname,
    search: r.url.search,
    apiKey: r.headers.get('x-api-key'),
    contentType: r.headers.get('content-type'),
    body: text === '' ? undefined : (JSON.parse(text) as unknown),
  };
}

const json = (status: number, payload: { error: string; details?: string[] }) => () =>
  HttpResponse.json(payload, { status });

const LISTS = [
  ['list', '/dashboards', 'dashboards-list'],
  ['listCreated', '/dashboards/created', 'dashboards-created'],
  ['listShared', '/dashboards/shared', 'dashboards-shared'],
  ['listSelected', '/dashboards/selected', 'dashboards-selected'],
] as const;

describe('dashboards lists (D1–D3)', () => {
  describe.each(LISTS)('%s → GET %s', (method, path, fixture) => {
    it('D1 sends the default namespace and returns the fixture unchanged (_id kept, no id)', async () => {
      const rec = recordRequests();
      const result = await client().dashboards[method]();
      const req = await sent(rec);
      expect(req).toStrictEqual({
        method: 'GET',
        path: `/api${path}`,
        search: '?namespace=test-ns',
        apiKey: 'test-key',
        contentType: null,
        body: undefined,
      });
      expect(result).toStrictEqual(body(fixture));
      expect(result[0]?._id).toMatch(/^[0-9a-f]{24}$/);
      expect(result.every((d) => !('id' in d))).toBe(true);
    });

    it('D2 legacy string, options.namespace, no namespace at all', async () => {
      const rec = recordRequests();
      await client().dashboards[method]('x');
      await client().dashboards[method]({ namespace: 'y' });
      await bare().dashboards[method]();
      await bare().dashboards[method]({});
      await client().dashboards[method]('');
      expect(rec.requests.map((r) => r.url.search)).toStrictEqual([
        '?namespace=x',
        '?namespace=y',
        '',
        '',
        '?namespace=test-ns',
      ]);
      expect(rec.requests.every((r) => r.url.pathname === `/api${path}`)).toBe(true);
    });

    it('D2 the 0.2.0 two-object form honours the trailing request options', async () => {
      server.use(
        http.get(`${BASE}${path}`, async () => {
          await delay(300);
          return HttpResponse.json([]);
        })
      );
      await expect(
        client().dashboards[method](undefined, { timeoutMs: 50 })
      ).rejects.toBeInstanceOf(TimeoutError);
    });

    it('D2 trailing headers win over the bag, and the legacy string takes request options', async () => {
      const rec = recordRequests();
      await client().dashboards[method](
        { namespace: 'z', headers: { 'X-Trace': 'bag', 'X-Keep': 'k' } },
        { headers: { 'x-trace': 'trailing' } }
      );
      await client().dashboards[method]('w', { headers: { 'X-Trace': 'legacy' } });
      expect(rec.requests[0]?.url.search).toBe('?namespace=z');
      expect(rec.requests[0]?.headers.get('x-trace')).toBe('trailing');
      expect(rec.requests[0]?.headers.get('x-keep')).toBe('k');
      expect(rec.requests[1]?.url.search).toBe('?namespace=w');
      expect(rec.requests[1]?.headers.get('x-trace')).toBe('legacy');
    });

    it('D11 a 500 becomes ServerError with the server message', async () => {
      server.use(http.get(`${BASE}${path}`, json(500, { error: 'Failed to fetch dashboards' })));
      const call = client().dashboards[method]();
      await expect(call).rejects.toBeInstanceOf(ServerError);
      await expect(call).rejects.toMatchObject({
        status: 500,
        message: 'Failed to fetch dashboards',
      });
    });

    it('D11 a 401 becomes AuthenticationError', async () => {
      server.use(http.get(`${BASE}${path}`, json(401, { error: 'Failed to authenticate user' })));
      await expect(client().dashboards[method]()).rejects.toBeInstanceOf(AuthenticationError);
    });
  });
});

describe('dashboards.get (D4)', () => {
  it('encodes the id in the path and returns the creator view', async () => {
    const rec = recordRequests();
    const d = await client().dashboards.get('abc/def');
    const req = await sent(rec);
    expect(req.method).toBe('GET');
    expect(req.path).toBe('/api/dashboards/abc%2Fdef');
    expect(req.search).toBe('');
    expect(req.apiKey).toBe('test-key');
    expect(d).toStrictEqual(body('dashboard'));
    expect(d.shared_with?.[0]?.permissions).toStrictEqual(['edit']);
  });

  it('uses no context field (a namespace in options is not sent)', async () => {
    const rec = recordRequests();
    await bare().dashboards.get(ID, { namespace: 'ignored' });
    expect(rec.requests[0]?.url.search).toBe('');
  });

  it('types the non-creator view without shared_with / selected_by', async () => {
    server.use(
      http.get(`${BASE}/dashboards/:id`, () =>
        fixtureResponse(loadFixture('dashboards-rules', 'dashboard-noncreator'))
      )
    );
    const d: Dashboard = await client().dashboards.get(ID);
    expect(d.shared_with).toBeUndefined();
    expect(d.selected_by).toBeUndefined();
    expect(d.can_edit).toBe(false);
  });

  it.each(['', '   ', 42, undefined])('get(%j) → ValidationError, no request', async (id) => {
    const rec = recordRequests();
    const call = client().dashboards.get(id as string);
    await expect(call).rejects.toBeInstanceOf(ValidationError);
    await expect(call).rejects.toMatchObject({ status: 0, details: ['id'] });
    expect(rec.requests).toHaveLength(0);
  });

  it('403 Access denied → AuthorizationError', async () => {
    server.use(http.get(`${BASE}/dashboards/:id`, json(403, { error: 'Access denied' })));
    const call = client().dashboards.get(ID);
    await expect(call).rejects.toBeInstanceOf(AuthorizationError);
    await expect(call).rejects.toMatchObject({ status: 403, message: 'Access denied' });
  });
});

describe('dashboards.create (D5)', () => {
  it('minimal input → name, default namespace and data []; 201 typed result', async () => {
    const rec = recordRequests();
    const d = await client().dashboards.create({ name: 'n' });
    const req = await sent(rec);
    expect(req.method).toBe('POST');
    expect(req.path).toBe('/api/dashboards');
    expect(req.search).toBe('');
    expect(req.apiKey).toBe('test-key');
    expect(req.contentType).toMatch(/^application\/json/);
    expect(req.body).toStrictEqual({ name: 'n', application_namespace: 'test-ns', data: [] });
    expect(d).toStrictEqual(body('dashboard-create-201'));
  });

  it('full input → every field forwarded, permissions mapped (view stripped, edit once)', async () => {
    const rec = recordRequests();
    await client().dashboards.create({
      name: 'Full',
      description: 'desc',
      data: [{ id: 'w1' }],
      dynamicVariables: [{ id: 'v1', name: 'var', version: 1 }],
      shared_with: [
        { username: 'a', permissions: ['view'] },
        { username: 'b', permissions: ['view', 'edit'] },
        { username: 'c', permissions: ['edit', 'edit'] },
        { username: 'd' },
      ],
      selected_by: ['a'],
    });
    expect((await sent(rec)).body).toStrictEqual({
      name: 'Full',
      application_namespace: 'test-ns',
      data: [{ id: 'w1' }],
      description: 'desc',
      dynamicVariables: [{ id: 'v1', name: 'var', version: 1 }],
      shared_with: [
        { username: 'a', permissions: [] },
        { username: 'b', permissions: ['edit'] },
        { username: 'c', permissions: ['edit'] },
        { username: 'd', permissions: [] },
      ],
      selected_by: ['a'],
    });
  });

  it('data {} is rejected (USI-P5-10: stored without data, later updates fail); a non-empty object is sent', async () => {
    const rec = recordRequests();
    const call = client().dashboards.create({ name: 'n', data: {} });
    await expect(call).rejects.toBeInstanceOf(ValidationError);
    await expect(call).rejects.toMatchObject({ status: 0, details: ['data'] });
    expect(rec.requests).toHaveLength(0);
    await client().dashboards.create({ name: 'n', data: { layout: 'grid' } });
    expect((await sent(rec)).body).toStrictEqual({
      name: 'n',
      application_namespace: 'test-ns',
      data: { layout: 'grid' },
    });
  });

  it('a stored dashboard without data (USI-P5-10) is returned as is', async () => {
    const { data: _dropped, ...withoutData } = body('dashboard') as Dashboard;
    server.use(http.get(`${BASE}/dashboards/:id`, () => HttpResponse.json(withoutData)));
    const d: Dashboard = await client().dashboards.get(ID);
    expect('data' in d).toBe(false);
    expect(d.data).toBeUndefined();
  });

  it('namespace precedence: options.namespace > input.namespace > client default', async () => {
    const rec = recordRequests();
    await client().dashboards.create({ name: 'n', namespace: 'in' }, { namespace: 'opt' });
    await client().dashboards.create({ name: 'n', namespace: 'in' });
    await client().dashboards.create({ name: 'n' }, { namespace: 'opt' });
    await client().dashboards.create({ name: 'n', namespace: '' });
    await bare().dashboards.create({ name: 'n', namespace: 'in' });
    const namespaces: unknown[] = [];
    for (let i = 0; i < rec.requests.length; i++) {
      const { body: b } = await sent(rec, i);
      namespaces.push((b as { application_namespace: unknown }).application_namespace);
    }
    expect(namespaces).toStrictEqual(['opt', 'in', 'opt', 'test-ns', 'in']);
  });

  it('no namespace anywhere → ContextError, no request', async () => {
    const rec = recordRequests();
    await expect(bare().dashboards.create({ name: 'n' })).rejects.toBeInstanceOf(ContextError);
    expect(rec.requests).toHaveLength(0);
  });

  it.each([
    [{ name: '' }, ['name']],
    [{ name: '  ' }, ['name']],
    [{ name: 42 }, ['name']],
    [{}, ['name']],
    [{ name: 'n', description: 5 }, ['description']],
    [{ name: 'n', data: 'x' }, ['data']],
    [{ name: 'n', data: null }, ['data']],
    [{ name: 'n', dynamicVariables: 'x' }, ['dynamicVariables']],
    [{ name: 'n', dynamicVariables: [1] }, ['dynamicVariables[0]']],
    [{ name: 'n', shared_with: 'u' }, ['shared_with']],
    [{ name: 'n', shared_with: ['u'] }, ['shared_with[0]']],
    [{ name: 'n', shared_with: [{ username: '' }] }, ['shared_with[0].username']],
    [
      { name: 'n', shared_with: [{ username: 'u', permissions: ['admin'] }] },
      ['shared_with[0].permissions[0]'],
    ],
    [
      { name: 'n', shared_with: [{ username: 'u', permissions: 'edit' }] },
      ['shared_with[0].permissions'],
    ],
    [{ name: 'n', selected_by: 'u' }, ['selected_by']],
    [{ name: 'n', selected_by: [''] }, ['selected_by[0]']],
    [{ name: '', description: 1 }, ['name', 'description']],
  ])('guard %j → ValidationError %j, no request', async (input, details) => {
    const rec = recordRequests();
    const call = client().dashboards.create(input as unknown as CreateDashboardInput);
    await expect(call).rejects.toBeInstanceOf(ValidationError);
    await expect(call).rejects.toMatchObject({ status: 0, details });
    expect(rec.requests).toHaveLength(0);
  });

  it.each([null, 'x', ['n']])('input %j → ValidationError, no request', async (input) => {
    const rec = recordRequests();
    const call = client().dashboards.create(input as unknown as CreateDashboardInput);
    await expect(call).rejects.toMatchObject({ status: 0, details: ['input'] });
    expect(rec.requests).toHaveLength(0);
  });

  it('400 Validation error with details → ValidationError carrying them', async () => {
    server.use(
      http.post(`${BASE}/dashboards`, json(400, { error: 'Validation error', details: ['d'] }))
    );
    const call = client().dashboards.create({ name: 'n' });
    await expect(call).rejects.toBeInstanceOf(ValidationError);
    await expect(call).rejects.toMatchObject({
      status: 400,
      message: 'Validation error',
      details: ['d'],
    });
  });

  it('413 with an HTML body → PayloadTooLargeError without markup in the message', async () => {
    server.use(
      http.post(
        `${BASE}/dashboards`,
        () =>
          new HttpResponse(
            '<!DOCTYPE html><html><body><pre>PayloadTooLargeError</pre></body></html>',
            {
              status: 413,
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            }
          )
      )
    );
    const call = client().dashboards.create({ name: 'n' });
    await expect(call).rejects.toBeInstanceOf(PayloadTooLargeError);
    await expect(call).rejects.toSatisfy(
      (e: unknown) => e instanceof Error && !/[<>]/.test(e.message)
    );
  });

  it('500 → ServerError', async () => {
    server.use(http.post(`${BASE}/dashboards`, json(500, { error: 'Failed to create dashboard' })));
    const call = client().dashboards.create({ name: 'n' });
    await expect(call).rejects.toBeInstanceOf(ServerError);
    await expect(call).rejects.toMatchObject({ message: 'Failed to create dashboard' });
  });
});

describe('dashboards.update (D6)', () => {
  it('sends only the keys that are not undefined', async () => {
    const rec = recordRequests();
    const d = await client().dashboards.update(ID, { name: 'n', description: undefined });
    const req = await sent(rec);
    expect(req.method).toBe('PUT');
    expect(req.path).toBe(`/api/dashboards/${ID}`);
    expect(req.apiKey).toBe('test-key');
    expect(req.contentType).toMatch(/^application\/json/);
    expect(req.body).toStrictEqual({ name: 'n' });
    expect(d).toStrictEqual(body('dashboard-update-200'));
  });

  it('{ dynamicVariables: [] } clears; {} is allowed', async () => {
    const rec = recordRequests();
    await client().dashboards.update(ID, { dynamicVariables: [] });
    await client().dashboards.update(ID, {});
    expect((await sent(rec, 0)).body).toStrictEqual({ dynamicVariables: [] });
    expect((await sent(rec, 1)).body).toStrictEqual({});
  });

  it('every field, shared_with mapped as for create', async () => {
    const rec = recordRequests();
    await client().dashboards.update(ID, {
      name: 'n',
      description: '',
      data: { layout: 'grid' },
      dynamicVariables: [{ id: 'v', name: 'n' }],
      application_namespace: 'other-ns',
      shared_with: [
        { username: 'v', permissions: ['view'] },
        { username: 'e', permissions: ['edit'] },
      ],
      selected_by: ['v'],
    });
    expect((await sent(rec)).body).toStrictEqual({
      name: 'n',
      description: '',
      data: { layout: 'grid' },
      dynamicVariables: [{ id: 'v', name: 'n' }],
      application_namespace: 'other-ns',
      shared_with: [
        { username: 'v', permissions: [] },
        { username: 'e', permissions: ['edit'] },
      ],
      selected_by: ['v'],
    });
  });

  it.each([
    [{ dynamicVariables: null }, ['dynamicVariables']],
    [{ application_namespace: '' }, ['application_namespace']],
    [{ application_namespace: null }, ['application_namespace']],
    [{ name: null }, ['name']],
    [{ name: '  ' }, ['name']],
    [{ description: null }, ['description']],
    [{ data: null }, ['data']],
    [{ data: 'x' }, ['data']],
    [{ data: {} }, ['data']],
    [{ shared_with: null }, ['shared_with']],
    [
      { shared_with: [{ username: 'u', permissions: ['admin'] }] },
      ['shared_with[0].permissions[0]'],
    ],
    [{ selected_by: null }, ['selected_by']],
  ])('guard %j → ValidationError %j, no request', async (input, details) => {
    const rec = recordRequests();
    const call = client().dashboards.update(ID, input as unknown as UpdateDashboardInput);
    await expect(call).rejects.toBeInstanceOf(ValidationError);
    await expect(call).rejects.toMatchObject({ status: 0, details });
    expect(rec.requests).toHaveLength(0);
  });

  it('id and input guards, no request', async () => {
    const rec = recordRequests();
    await expect(client().dashboards.update('', { name: 'n' })).rejects.toMatchObject({
      status: 0,
      details: ['id'],
    });
    await expect(
      client().dashboards.update(ID, null as unknown as UpdateDashboardInput)
    ).rejects.toMatchObject({ status: 0, details: ['input'] });
    expect(rec.requests).toHaveLength(0);
  });

  it.each([
    'You do not have permission to edit this dashboard',
    'Only the creator can modify the shared_with list',
  ])('403 %s → AuthorizationError with that message', async (message) => {
    server.use(http.put(`${BASE}/dashboards/:id`, json(403, { error: message })));
    const call = client().dashboards.update(ID, { name: 'n' });
    await expect(call).rejects.toBeInstanceOf(AuthorizationError);
    await expect(call).rejects.toMatchObject({ status: 403, message });
  });

  it('400 Validation error with details → ValidationError carrying them', async () => {
    server.use(
      http.put(`${BASE}/dashboards/:id`, json(400, { error: 'Validation error', details: ['d'] }))
    );
    const call = client().dashboards.update(ID, { data: [] });
    await expect(call).rejects.toBeInstanceOf(ValidationError);
    await expect(call).rejects.toMatchObject({ status: 400, details: ['d'] });
  });
});

describe('dashboards.delete (D7)', () => {
  it('DELETE, 204 → undefined', async () => {
    const rec = recordRequests();
    const result = await client().dashboards.delete(ID);
    const req = await sent(rec);
    expect(result).toBeUndefined();
    expect(req.method).toBe('DELETE');
    expect(req.path).toBe(`/api/dashboards/${ID}`);
    expect(req.apiKey).toBe('test-key');
    expect(req.body).toBeUndefined();
  });

  it('403 Only the creator can delete the dashboard → AuthorizationError', async () => {
    server.use(
      http.delete(
        `${BASE}/dashboards/:id`,
        json(403, { error: 'Only the creator can delete the dashboard' })
      )
    );
    const call = client().dashboards.delete(ID);
    await expect(call).rejects.toBeInstanceOf(AuthorizationError);
    await expect(call).rejects.toMatchObject({
      message: 'Only the creator can delete the dashboard',
    });
  });

  it("delete('') → ValidationError, no request", async () => {
    const rec = recordRequests();
    await expect(client().dashboards.delete('')).rejects.toBeInstanceOf(ValidationError);
    expect(rec.requests).toHaveLength(0);
  });
});

describe('dashboards.share (D8)', () => {
  it('one user without permissions → permissions []', async () => {
    const rec = recordRequests();
    const d = await client().dashboards.share(ID, { username: 'u' });
    const req = await sent(rec);
    expect(req.method).toBe('POST');
    expect(req.path).toBe(`/api/dashboards/${ID}/share`);
    expect(req.apiKey).toBe('test-key');
    expect(req.contentType).toMatch(/^application\/json/);
    expect(req.body).toStrictEqual({ users: [{ username: 'u', permissions: [] }] });
    expect(d).toStrictEqual(body('dashboard-share-200'));
  });

  it('an array keeps its order and maps permissions', async () => {
    const rec = recordRequests();
    await client().dashboards.share(ID, [
      { username: 'b', permissions: ['edit'] },
      { username: 'a', permissions: ['view'] },
      { username: 'c', permissions: ['view', 'edit', 'edit'] },
    ]);
    expect((await sent(rec)).body).toStrictEqual({
      users: [
        { username: 'b', permissions: ['edit'] },
        { username: 'a', permissions: [] },
        { username: 'c', permissions: ['edit'] },
      ],
    });
  });

  it('legacy (id, username, permissions): only write === true grants edit', async () => {
    const rec = recordRequests();
    const d = client().dashboards;
    await d.share(ID, 'u', { write: true });
    await d.share(ID, 'u', { read: true });
    await d.share(ID, 'u', { delete: true });
    await (d.share as unknown as (id: string, username: string) => Promise<Dashboard>)(ID, 'u');
    await d.share(ID, 'u', null as unknown as { write: boolean });
    const bodies: unknown[] = [];
    for (let i = 0; i < rec.requests.length; i++) bodies.push((await sent(rec, i)).body);
    expect(bodies).toStrictEqual([
      { users: [{ username: 'u', permissions: ['edit'] }] },
      { users: [{ username: 'u', permissions: [] }] },
      { users: [{ username: 'u', permissions: [] }] },
      { users: [{ username: 'u', permissions: [] }] },
      { users: [{ username: 'u', permissions: [] }] },
    ]);
  });

  it('legacy form takes trailing request options; the new form takes them in options', async () => {
    const rec = recordRequests();
    await client().dashboards.share(ID, 'u', { write: true }, { headers: { 'X-Trace': 'legacy' } });
    await client().dashboards.share(ID, { username: 'u' }, { headers: { 'X-Trace': 'bag' } });
    expect(rec.requests[0]?.headers.get('x-trace')).toBe('legacy');
    expect(rec.requests[1]?.headers.get('x-trace')).toBe('bag');
  });

  it.each([
    [[], ['users']],
    [{ username: '' }, ['users[0].username']],
    [[{ username: 'u', permissions: ['admin'] }], ['users[0].permissions[0]']],
    [[null], ['users[0]']],
  ])('share(id, %j) → ValidationError %j, no request', async (users, details) => {
    const rec = recordRequests();
    const call = client().dashboards.share(ID, users as unknown as { username: string });
    await expect(call).rejects.toBeInstanceOf(ValidationError);
    await expect(call).rejects.toMatchObject({ status: 0, details });
    expect(rec.requests).toHaveLength(0);
  });

  it("legacy share(id, '', …) and share('', …) → ValidationError, no request", async () => {
    const rec = recordRequests();
    await expect(client().dashboards.share(ID, '', { write: true })).rejects.toMatchObject({
      details: ['username'],
    });
    await expect(client().dashboards.share('', { username: 'u' })).rejects.toMatchObject({
      details: ['id'],
    });
    expect(rec.requests).toHaveLength(0);
  });

  it('400 No valid users provided → ValidationError; 403 creator only → AuthorizationError', async () => {
    server.use(
      http.post(`${BASE}/dashboards/:id/share`, json(400, { error: 'No valid users provided' }), {
        once: true,
      }),
      http.post(
        `${BASE}/dashboards/:id/share`,
        json(403, { error: 'Only the creator can share the dashboard' })
      )
    );
    const first = client().dashboards.share(ID, { username: 'u' });
    await expect(first).rejects.toBeInstanceOf(ValidationError);
    await expect(first).rejects.toMatchObject({ status: 400, message: 'No valid users provided' });
    const second = client().dashboards.share(ID, { username: 'u' });
    await expect(second).rejects.toBeInstanceOf(AuthorizationError);
    await expect(second).rejects.toMatchObject({
      message: 'Only the creator can share the dashboard',
    });
  });
});

describe('dashboards.unshare (D9)', () => {
  it('a string becomes a one-element list; a list is sent as is', async () => {
    const rec = recordRequests();
    const d = await client().dashboards.unshare(ID, 'u');
    await client().dashboards.unshare(ID, ['a', 'b']);
    const req = await sent(rec, 0);
    expect(req.method).toBe('POST');
    expect(req.path).toBe(`/api/dashboards/${ID}/unshare`);
    expect(req.apiKey).toBe('test-key');
    expect(req.contentType).toMatch(/^application\/json/);
    expect(req.body).toStrictEqual({ usernames: ['u'] });
    expect((await sent(rec, 1)).body).toStrictEqual({ usernames: ['a', 'b'] });
    expect(d).toStrictEqual(body('dashboard-unshare-200'));
  });

  it.each([
    [[], ['usernames']],
    ['', ['usernames[0]']],
    [[''], ['usernames[0]']],
    [[1], ['usernames[0]']],
    [null, ['usernames']],
    [['a', ' '], ['usernames[1]']],
  ])('unshare(id, %j) → ValidationError %j, no request', async (usernames, details) => {
    const rec = recordRequests();
    const call = client().dashboards.unshare(ID, usernames as unknown as string[]);
    await expect(call).rejects.toBeInstanceOf(ValidationError);
    await expect(call).rejects.toMatchObject({ status: 0, details });
    expect(rec.requests).toHaveLength(0);
  });

  it('403 Only the creator can unshare the dashboard → AuthorizationError', async () => {
    server.use(
      http.post(
        `${BASE}/dashboards/:id/unshare`,
        json(403, { error: 'Only the creator can unshare the dashboard' })
      )
    );
    const call = client().dashboards.unshare(ID, 'u');
    await expect(call).rejects.toBeInstanceOf(AuthorizationError);
    await expect(call).rejects.toMatchObject({
      message: 'Only the creator can unshare the dashboard',
    });
  });
});

describe('request bodies (D10)', () => {
  it('no body contains id, namespace or an undefined-valued key', async () => {
    const rec = recordRequests();
    const d = client().dashboards;
    await d.create({
      name: 'n',
      namespace: 'in',
      description: undefined,
      id: 'x',
    } as unknown as CreateDashboardInput);
    await d.update(ID, {
      id: 'x',
      namespace: 'y',
      name: undefined,
      data: [],
    } as unknown as UpdateDashboardInput);
    await d.share(ID, { username: 'u', permissions: undefined });
    await d.unshare(ID, ['u']);
    const keys: string[][] = [];
    for (let i = 0; i < rec.requests.length; i++) {
      const text = await (rec.requests[i] as RecordedRequest).text();
      keys.push(Object.keys(JSON.parse(text) as object));
      expect(text).not.toMatch(/"(id|namespace)"\s*:/);
    }
    expect(keys).toStrictEqual([
      ['name', 'application_namespace', 'data'],
      ['data'],
      ['users'],
      ['usernames'],
    ]);
  });
});

const ID_CALLS = [
  ['get', 'get', '/dashboards/:id', (c: RtlsClient) => c.dashboards.get(ID)],
  ['update', 'put', '/dashboards/:id', (c: RtlsClient) => c.dashboards.update(ID, { name: 'n' })],
  ['delete', 'delete', '/dashboards/:id', (c: RtlsClient) => c.dashboards.delete(ID)],
  [
    'share',
    'post',
    '/dashboards/:id/share',
    (c: RtlsClient) => c.dashboards.share(ID, { username: 'u' }),
  ],
  ['unshare', 'post', '/dashboards/:id/unshare', (c: RtlsClient) => c.dashboards.unshare(ID, 'u')],
] as const;

describe.each(ID_CALLS)('shared error matrix of %s (D11)', (name, verb, path, call) => {
  it('400 Invalid dashboard ID → ValidationError status 400', async () => {
    server.use(http[verb](`${BASE}${path}`, json(400, { error: 'Invalid dashboard ID' })));
    const p = call(client());
    await expect(p).rejects.toBeInstanceOf(ValidationError);
    await expect(p).rejects.toMatchObject({ status: 400, message: 'Invalid dashboard ID' });
  });

  it('401 → AuthenticationError', async () => {
    server.use(http[verb](`${BASE}${path}`, json(401, { error: 'Failed to authenticate user' })));
    const p = call(client());
    await expect(p).rejects.toBeInstanceOf(AuthenticationError);
    await expect(p).rejects.toMatchObject({ status: 401, message: 'Failed to authenticate user' });
  });

  it('404 Dashboard not found → NotFoundError status 404', async () => {
    server.use(http[verb](`${BASE}${path}`, json(404, { error: 'Dashboard not found' })));
    const p = call(client());
    await expect(p).rejects.toBeInstanceOf(NotFoundError);
    await expect(p).rejects.toMatchObject({ status: 404, message: 'Dashboard not found' });
  });

  it('500 → ServerError with the server message', async () => {
    const message = `Failed to ${name} dashboard`;
    server.use(http[verb](`${BASE}${path}`, json(500, { error: message })));
    const p = call(client());
    await expect(p).rejects.toBeInstanceOf(ServerError);
    await expect(p).rejects.toMatchObject({ status: 500, message });
  });
});

const OPTION_CALLS = [
  ['get', (c: RtlsClient, o: { headers: Record<string, string> }) => c.dashboards.get(ID, o)],
  [
    'create',
    (c: RtlsClient, o: { headers: Record<string, string> }) =>
      c.dashboards.create({ name: 'n' }, o),
  ],
  [
    'update',
    (c: RtlsClient, o: { headers: Record<string, string> }) =>
      c.dashboards.update(ID, { name: 'n' }, o),
  ],
  ['delete', (c: RtlsClient, o: { headers: Record<string, string> }) => c.dashboards.delete(ID, o)],
  [
    'share',
    (c: RtlsClient, o: { headers: Record<string, string> }) =>
      c.dashboards.share(ID, { username: 'u' }, o),
  ],
  [
    'unshare',
    (c: RtlsClient, o: { headers: Record<string, string> }) => c.dashboards.unshare(ID, 'u', o),
  ],
] as const;

describe.each(OPTION_CALLS)('request options of %s (CONVENTIONS §4)', (_name, call) => {
  it('forwards options.headers to the request', async () => {
    const rec = recordRequests();
    await call(client(), { headers: { 'X-Trace': 't' } });
    expect(rec.requests).toHaveLength(1);
    expect(rec.requests[0]?.headers.get('x-trace')).toBe('t');
  });
});
