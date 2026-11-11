import { describe, it, expect, beforeEach, vi } from 'vitest';
import { delay, http, HttpResponse } from 'msw';
import {
  AuthenticationError,
  ContextError,
  createRtlsClient,
  NotFoundError,
  RtlsClient,
  RtlsWebSocketClient,
  ServerError,
  ServiceUnavailableError,
  TimeoutError,
  ValidationError,
  WEBSOCKET_URLS,
  type RtlsClientOptions,
} from '../../../src';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';
import {
  AlertsResource,
  AssetsResource,
  DashboardsResource,
  NavigationResource,
  PositionsResource,
  SpatialResource,
  VenuesResource,
  ZonesResource,
} from '../../../src/resources';
import { SettingsResource } from '../../../src/resources/settings';
import { TagActionsResource, type TagAction } from '../../../src/resources/tag-actions';
import { coreFixture, fixtureHttpResponse } from './support/core-fixtures';

const API = 'https://root.test/api';

function only(rec: { requests: readonly RecordedRequest[] }): RecordedRequest {
  expect(rec.requests).toHaveLength(1);
  return rec.requests[0] as RecordedRequest;
}

const root = (options: RtlsClientOptions = {}): RtlsClient =>
  createRtlsClient({ baseUrl: API, apiKey: 'test-api-key', ...options });

const ACTIONS: TagAction[] = [
  { macAddress: 'aabbccddeeff', action: 'ptlGreen' },
  { macAddress: '112233445566', action: 'uwbBlink' },
];

describe('RtlsClient', () => {
  let client: RtlsClient;

  beforeEach(() => {
    client = createRtlsClient({
      apiKey: 'test-api-key',
    });
  });

  describe('initialization', () => {
    it('should create client with default options', () => {
      const defaultClient = createRtlsClient();
      expect(defaultClient).toBeInstanceOf(RtlsClient);
    });

    it('should create client with custom options', () => {
      const customClient = createRtlsClient({
        baseUrl: 'https://custom.api.com',
        apiKey: 'custom-key',
        timeoutMs: 5000,
      });
      expect(customClient).toBeInstanceOf(RtlsClient);
    });

    it('should expose resource instances', () => {
      expect(client.assets).toBeInstanceOf(AssetsResource);
      expect(client.positions).toBeInstanceOf(PositionsResource);
      expect(client.zones).toBeInstanceOf(ZonesResource);
      expect(client.venues).toBeInstanceOf(VenuesResource);
      expect(client.alerts).toBeInstanceOf(AlertsResource);
      expect(client.dashboards).toBeInstanceOf(DashboardsResource);
      expect(client.navigation).toBeInstanceOf(NavigationResource);
      expect(client.spatial).toBeInstanceOf(SpatialResource);
    });

    it('should expose raw client', () => {
      expect(client.raw).toEqual(
        expect.objectContaining({ GET: expect.any(Function), POST: expect.any(Function) })
      );
    });
  });

  describe('health() on the transport (P1 §6.1, B12)', () => {
    it("GET /health → { status: 'OK' }, no content-type, no body", async () => {
      server.use(http.get(`${API}/health`, () => HttpResponse.json({ status: 'OK' })));
      const rec = recordRequests();
      await expect(root().health()).resolves.toStrictEqual({ status: 'OK' });
      const request = only(rec);
      expect(request.method).toBe('GET');
      expect(request.url.href).toBe(`${API}/health`);
      expect(request.headers.has('content-type')).toBe(false);
      expect(request.headers.get('x-api-key')).toBe('test-api-key');
      await expect(request.text()).resolves.toBe('');
    });

    it("503 { status: 'MongoDB connection not ready' } → ServiceUnavailableError with that message", async () => {
      server.use(http.get(`${API}/health`, () => fixtureHttpResponse(coreFixture('health-503'))));
      const call = root().health();
      await expect(call).rejects.toBeInstanceOf(ServiceUnavailableError);
      await expect(call).rejects.toMatchObject({
        status: 503,
        code: 'SERVICE_UNAVAILABLE',
        message: 'MongoDB connection not ready',
      });
    });

    it('honours the per-call timeoutMs and headers', async () => {
      server.use(
        http.get(`${API}/health`, async () => {
          await delay(200);
          return HttpResponse.json({ status: 'OK' });
        })
      );
      const call = root().health({ timeoutMs: 20, headers: { 'X-Trace': 't1' } });
      await expect(call).rejects.toBeInstanceOf(TimeoutError);
      await expect(call).rejects.toMatchObject({ timeoutMs: 20 });
    });

    it('a client without credentials sends no credential header', async () => {
      server.use(http.get(`${API}/health`, () => HttpResponse.json({ status: 'OK' })));
      const rec = recordRequests();
      await createRtlsClient({ baseUrl: API }).health();
      const request = only(rec);
      expect(request.headers.has('x-api-key')).toBe(false);
      expect(request.headers.has('authorization')).toBe(false);
    });
  });

  describe('settings.get() and tagActions.send() (moved from the root client)', () => {
    it('client.settings and client.tagActions are their resources', () => {
      expect(client.settings).toBeInstanceOf(SettingsResource);
      expect(client.tagActions).toBeInstanceOf(TagActionsResource);
    });

    it("settings.get({ namespace: 'x' }) → GET /settings/x; the default namespace applies otherwise", async () => {
      server.use(http.get(`${API}/settings/:ns`, () => HttpResponse.json({ map: {} })));
      const rec = recordRequests();
      await expect(
        root({ namespace: 'default-ns' }).settings.get({ namespace: 'x' })
      ).resolves.toStrictEqual({
        map: {},
      });
      await root({ namespace: 'default-ns' }).settings.get();
      expect(rec.requests.map((r) => `${r.method} ${r.url.pathname}${r.url.search}`)).toStrictEqual(
        ['GET /api/settings/x', 'GET /api/settings/default-ns']
      );
    });

    it('tagActions.send([...], { namespace }) → POST /tag-actions/ns with the array as JSON body', async () => {
      server.use(
        http.post(`${API}/tag-actions/:ns`, () =>
          HttpResponse.json({ message: 'Actions sent successfully', tagCount: 2, results: {} })
        )
      );
      const rec = recordRequests();
      await expect(root().tagActions.send(ACTIONS, { namespace: 'ns' })).resolves.toStrictEqual({
        message: 'Actions sent successfully',
        tagCount: 2,
        results: {},
      });
      const request = only(rec);
      expect(request.method).toBe('POST');
      expect(request.url.href).toBe(`${API}/tag-actions/ns`);
      expect(request.headers.get('content-type')).toBe('application/json');
      await expect(request.text()).resolves.toBe(JSON.stringify(ACTIONS));
    });

    it('tagActions.send is never retried, even under a policy that retries POST', async () => {
      server.use(http.post(`${API}/tag-actions/:ns`, () => HttpResponse.json({}, { status: 503 })));
      const rec = recordRequests();
      const policy = {
        methods: ['GET', 'POST'] as const,
        retries: 2,
        baseDelayMs: 0,
        maxDelayMs: 0,
      };
      const call = root({
        retry: { ...policy, methods: [...policy.methods] },
        namespace: 'ns',
      }).tagActions.send(ACTIONS);
      await expect(call).rejects.toBeInstanceOf(ServiceUnavailableError);
      expect(rec.requests).toHaveLength(1);
    });

    it('tagActions.send with a non-array → ValidationError status 0, nothing sent', async () => {
      const rec = recordRequests();
      const call = root({ namespace: 'ns' }).tagActions.send('ptlGreen' as unknown as TagAction[]);
      await expect(call).rejects.toBeInstanceOf(ValidationError);
      await expect(call).rejects.toMatchObject({ status: 0, details: ['actions'] });
      expect(rec.requests).toHaveLength(0);
    });
  });

  describe('deprecated root delegates (P1 §6.1)', () => {
    describe('getSettings → settings.get', () => {
      beforeEach(() => {
        server.use(http.get(`${API}/settings/:ns`, () => HttpResponse.json({ map: { id: 1 } })));
      });

      it("getSettings('ns') → GET /settings/ns", async () => {
        const rec = recordRequests();
        await expect(root().getSettings('ns')).resolves.toStrictEqual({ map: { id: 1 } });
        expect(only(rec).url.href).toBe(`${API}/settings/ns`);
      });

      it("getSettings() uses the default namespace; getSettings('') too", async () => {
        const rec = recordRequests();
        await root({ namespace: 'ctx-ns' }).getSettings();
        await root({ namespace: 'ctx-ns' }).getSettings('');
        expect(rec.requests.map((r) => r.url.pathname)).toStrictEqual([
          '/api/settings/ctx-ns',
          '/api/settings/ctx-ns',
        ]);
      });

      it("getSettings({ namespace: 'x', timeoutMs: 5 }) → GET /settings/x with that timeout", async () => {
        server.use(
          http.get(`${API}/settings/:ns`, async () => {
            await delay(200);
            return HttpResponse.json({});
          })
        );
        const rec = recordRequests();
        const call = root({ namespace: 'ctx-ns' }).getSettings({ namespace: 'x', timeoutMs: 5 });
        await expect(call).rejects.toBeInstanceOf(TimeoutError);
        await expect(call).rejects.toMatchObject({ timeoutMs: 5 });
        expect(only(rec).url.pathname).toBe('/api/settings/x');
      });

      it('the trailing options win over the bag (timeoutMs, headers per name)', async () => {
        server.use(
          http.get(`${API}/settings/:ns`, async () => {
            await delay(200);
            return HttpResponse.json({});
          })
        );
        const rec = recordRequests();
        const call = root().getSettings(
          { namespace: 'x', timeoutMs: 10_000, headers: { 'X-A': '1', 'X-B': '1' } },
          { timeoutMs: 5, headers: { 'x-b': '2' } }
        );
        await expect(call).rejects.toMatchObject({ timeoutMs: 5 });
        const request = only(rec);
        expect(request.headers.get('x-a')).toBe('1');
        expect(request.headers.get('x-b')).toBe('2');
      });

      it('no namespace anywhere → ContextError, 0 requests', async () => {
        const rec = recordRequests();
        const call = root().getSettings();
        await expect(call).rejects.toBeInstanceOf(ContextError);
        await expect(call).rejects.toMatchObject({
          status: 0,
          code: 'CONTEXT_ERROR',
          problem: 'missing',
        });
        expect(rec.requests).toHaveLength(0);
      });

      it('a non-string namespace from JavaScript → ContextError invalid, 0 requests', async () => {
        const rec = recordRequests();
        const call = root({ namespace: 'ctx-ns' }).getSettings(42 as unknown as string);
        await expect(call).rejects.toMatchObject({ code: 'CONTEXT_ERROR', problem: 'invalid' });
        expect(rec.requests).toHaveLength(0);
      });

      it.each<[string, string, typeof AuthenticationError | typeof NotFoundError, number]>([
        ['401', 'error-401', AuthenticationError, 401],
        ['404 empty', 'error-e12-empty-404', NotFoundError, 404],
      ])('%s → the mapped class', async (_name, fixture, Class, status) => {
        server.use(
          http.get(`${API}/settings/:ns`, () => fixtureHttpResponse(coreFixture(fixture)))
        );
        const call = root().getSettings('ns');
        await expect(call).rejects.toBeInstanceOf(Class);
        await expect(call).rejects.toMatchObject({ status });
      });
    });

    describe('esQuery on the transport', () => {
      const QUERY = { size: 1, query: { range: { timestamp: { gte: 1 } } } };

      it("esQuery('ns', 'positions', q) → POST /es/query/ns/positions with body q", async () => {
        server.use(
          http.post(`${API}/es/query/:ns/:type`, () => HttpResponse.json({ hits: { hits: [] } }))
        );
        const rec = recordRequests();
        await expect(root().esQuery('ns', 'positions', QUERY)).resolves.toStrictEqual({
          hits: { hits: [] },
        });
        const request = only(rec);
        expect(request.method).toBe('POST');
        expect(request.url.href).toBe(`${API}/es/query/ns/positions`);
        expect(request.headers.get('content-type')).toBe('application/json');
        await expect(request.text()).resolves.toBe(JSON.stringify(QUERY));
      });

      it("esQuery('', …) uses the default namespace", async () => {
        server.use(http.post(`${API}/es/query/:ns/:type`, () => HttpResponse.json({})));
        const rec = recordRequests();
        await root({ namespace: 'ctx-ns' }).esQuery('', 'alerts', QUERY);
        expect(only(rec).url.pathname).toBe('/api/es/query/ctx-ns/alerts');
      });

      it('is retried under retry: true (read-only POST, retry: { idempotent: true })', async () => {
        let attempts = 0;
        server.use(
          http.post(`${API}/es/query/:ns/:type`, () => {
            attempts += 1;
            return attempts === 1
              ? HttpResponse.json({}, { status: 503 })
              : HttpResponse.json({ hits: { hits: [] } });
          })
        );
        const client = root({ retry: { retries: 1, baseDelayMs: 0, maxDelayMs: 0 } });
        await expect(client.esQuery('ns', 'alerts', QUERY)).resolves.toStrictEqual({
          hits: { hits: [] },
        });
        expect(attempts).toBe(2);
      });

      it('without a retry policy → one attempt', async () => {
        const rec = recordRequests();
        server.use(
          http.post(`${API}/es/query/:ns/:type`, () => HttpResponse.json({}, { status: 503 }))
        );
        await expect(root().esQuery('ns', 'alerts', QUERY)).rejects.toBeInstanceOf(
          ServiceUnavailableError
        );
        expect(rec.requests).toHaveLength(1);
      });

      it('400 { error, violations } → ValidationError with details', async () => {
        server.use(
          http.post(`${API}/es/query/:ns/:type`, () =>
            fixtureHttpResponse(coreFixture('error-violations'))
          )
        );
        const call = root().esQuery('ns', 'alerts', { size: -1 });
        await expect(call).rejects.toBeInstanceOf(ValidationError);
        await expect(call).rejects.toMatchObject({
          status: 400,
          message: 'unbounded size (-1) is not permitted',
          details: ['size=-1'],
        });
      });
    });

    describe('sendTagActions → tagActions.send', () => {
      it("sendTagActions('ns', [...]) → POST /tag-actions/ns with the array body", async () => {
        server.use(
          http.post(`${API}/tag-actions/:ns`, () =>
            HttpResponse.json({ message: 'Actions sent successfully', tagCount: 2 })
          )
        );
        const rec = recordRequests();
        await expect(root().sendTagActions('ns', ACTIONS)).resolves.toStrictEqual({
          message: 'Actions sent successfully',
          tagCount: 2,
        });
        const request = only(rec);
        expect(request.url.href).toBe(`${API}/tag-actions/ns`);
        await expect(request.text()).resolves.toBe(JSON.stringify(ACTIONS));
      });

      it('400 { error } → ValidationError', async () => {
        server.use(
          http.post(`${API}/tag-actions/:ns`, () =>
            HttpResponse.json({ error: 'Invalid actions' }, { status: 400 })
          )
        );
        const call = root().sendTagActions('ns', ACTIONS);
        await expect(call).rejects.toBeInstanceOf(ValidationError);
        await expect(call).rejects.toMatchObject({ status: 400, message: 'Invalid actions' });
      });

      it("500 { message: 'Some actions failed', success: false, results } → ServerError 500 with body.results", async () => {
        server.use(
          http.post(`${API}/tag-actions/:ns`, () =>
            fixtureHttpResponse(coreFixture('error-tag-actions-500'))
          )
        );
        const call = root().sendTagActions('ns', ACTIONS);
        await expect(call).rejects.toBeInstanceOf(ServerError);
        await expect(call).rejects.toMatchObject({
          status: 500,
          message: 'Some actions failed',
          body: { results: [{ success: false }] },
        });
      });

      it('a resolved { success: false } is rethrown as ServerError (status 500, the 0.2.0 failure)', async () => {
        const client = root();
        const resolved = {
          message: 'Some actions failed',
          tagCount: 1,
          results: [],
          success: false,
        };
        const send = vi.spyOn(client.tagActions, 'send').mockResolvedValue(resolved);
        const call = client.sendTagActions('ns', ACTIONS, { timeoutMs: 1000 });
        await expect(call).rejects.toBeInstanceOf(ServerError);
        await expect(call).rejects.toMatchObject({
          status: 500,
          code: 'SERVER_ERROR',
          message: 'Some actions failed',
          body: resolved,
        });
        expect(send).toHaveBeenCalledWith(ACTIONS, { timeoutMs: 1000, namespace: 'ns' });
      });

      it('a resolved { success: true } is returned as is', async () => {
        const client = root();
        const resolved = { message: 'ok', tagCount: 0, results: [], success: true };
        vi.spyOn(client.tagActions, 'send').mockResolvedValue(resolved);
        await expect(client.sendTagActions('ns', [])).resolves.toBe(resolved);
      });
    });
  });

  describe('createWebSocket() (P1 §6.1, B14; construction only)', () => {
    const ws = (
      options: RtlsClientOptions,
      wsOptions?: Parameters<RtlsClient['createWebSocket']>[0]
    ) => createRtlsClient(options).createWebSocket(wsOptions);

    it('the option namespace wins over the default; the default applies otherwise', () => {
      const socket = ws({ apiKey: 'k', namespace: 'default-ns' }, { namespace: 'other' });
      expect(socket).toBeInstanceOf(RtlsWebSocketClient);
      expect(socket.isConnected()).toBe(false);
      expect(socket.getConfig().namespace).toBe('other');
      expect(ws({ apiKey: 'k', namespace: 'default-ns' }).getConfig().namespace).toBe('default-ns');
    });

    it("an option namespace of '' or null does not replace the default namespace", () => {
      expect(
        ws({ apiKey: 'k', namespace: 'default-ns' }, { namespace: '' }).getConfig().namespace
      ).toBe('default-ns');
      expect(
        ws(
          { apiKey: 'k', namespace: 'default-ns' },
          { namespace: null as unknown as string }
        ).getConfig().namespace
      ).toBe('default-ns');
    });

    it("no namespace (or '') → ContextError", () => {
      expect(() => ws({ apiKey: 'k' })).toThrow(ContextError);
      expect(() => ws({ apiKey: 'k' }, { namespace: '' })).toThrow(
        expect.objectContaining({
          code: 'CONTEXT_ERROR',
          status: 0,
          message:
            'Namespace is required. Pass { namespace } or set a default namespace on the client',
        })
      );
    });

    it('a Bearer-only client → token, no apiKey', () => {
      const config = ws({ accessToken: 't', namespace: 'ns' }).getConfig();
      expect(config.token).toBe('t');
      expect(config).not.toHaveProperty('apiKey');
    });

    it('an apiKey client → apiKey, no token', () => {
      const config = ws({ apiKey: 'k', namespace: 'ns' }).getConfig();
      expect(config.apiKey).toBe('k');
      expect(config).not.toHaveProperty('token');
    });

    it("both credentials → token only (D11); auth: 'apiKey' → apiKey only", () => {
      const both = ws({ apiKey: 'k', accessToken: 't', namespace: 'ns' }).getConfig();
      expect(both.token).toBe('t');
      expect(both).not.toHaveProperty('apiKey');
      const forced = ws({
        apiKey: 'k',
        accessToken: 't',
        auth: 'apiKey',
        namespace: 'ns',
      }).getConfig();
      expect(forced.apiKey).toBe('k');
      expect(forced).not.toHaveProperty('token');
    });

    it('no credential → ValidationError status 0; a credential in the options is enough', () => {
      expect(() => ws({ namespace: 'ns' })).toThrow(ValidationError);
      expect(() => ws({ namespace: 'ns' })).toThrow(
        expect.objectContaining({
          status: 0,
          message: 'createWebSocket() needs an apiKey or accessToken',
        })
      );
      expect(ws({ namespace: 'ns' }, { token: 'x' }).getConfig().token).toBe('x');
    });

    it.each<[string, string | undefined, string, string]>([
      ['the default baseUrl', undefined, WEBSOCKET_URLS.SUBSCRIBER, WEBSOCKET_URLS.PUBLISHER],
      ['https://h/api', 'https://h/api', 'wss://h/api/ws/subscriber', 'wss://h/api/ws/publisher'],
      [
        'http://h:8080/x/',
        'http://h:8080/x/',
        'ws://h:8080/x/ws/subscriber',
        'ws://h:8080/x/ws/publisher',
      ],
      ['a base URL without a path', 'https://h', 'wss://h/ws/subscriber', 'wss://h/ws/publisher'],
    ])('URLs from %s', (_name, baseUrl, subscriberUrl, publisherUrl) => {
      const config = ws({ apiKey: 'k', namespace: 'ns', baseUrl }).getConfig();
      expect(config.subscriberUrl).toBe(subscriberUrl);
      expect(config.publisherUrl).toBe(publisherUrl);
    });

    it('a root-relative baseUrl: resolved against location in a browser; elsewhere both URLs must be given', () => {
      expect(() => ws({ apiKey: 'k', namespace: 'ns', baseUrl: '/rtls-api' })).toThrow(
        expect.objectContaining({ status: 0, details: ['subscriberUrl', 'publisherUrl'] })
      );
      const given = ws(
        { apiKey: 'k', namespace: 'ns', baseUrl: '/rtls-api' },
        { subscriberUrl: 'wss://h/ws/subscriber', publisherUrl: 'wss://h/ws/publisher' }
      ).getConfig();
      expect(given.subscriberUrl).toBe('wss://h/ws/subscriber');
      vi.stubGlobal('location', { href: 'https://app.test/page/index.html' });
      try {
        const config = ws({ apiKey: 'k', namespace: 'ns', baseUrl: '/rtls-api/' }).getConfig();
        expect(config.subscriberUrl).toBe('wss://app.test/rtls-api/ws/subscriber');
        expect(config.publisherUrl).toBe('wss://app.test/rtls-api/ws/publisher');
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('explicit options win (subscriberUrl, apiKey); the rest is derived', () => {
      const config = ws(
        { apiKey: 'k', namespace: 'ns', baseUrl: 'https://h/api' },
        { subscriberUrl: 'wss://other/ws', apiKey: 'other-key', debug: true }
      ).getConfig();
      expect(config).toStrictEqual({
        apiKey: 'other-key',
        namespace: 'ns',
        subscriberUrl: 'wss://other/ws',
        publisherUrl: 'wss://h/api/ws/publisher',
        debug: true,
      });
    });
  });

  describe('scoped clients share the transport and raw (P1 §6.1, B18)', () => {
    const BASE = 'https://scoped.test/api';
    const parentOf = (): RtlsClient =>
      createRtlsClient({ baseUrl: BASE, apiKey: 'k', namespace: 'ns', venueId: 1, mapId: 2 });

    it.each<[string, (parent: RtlsClient) => RtlsClient]>([
      ['forNamespace', (parent) => parent.forNamespace('other')],
      ['forVenue', (parent) => parent.forVenue(7, { mapId: 3, level: -1 })],
      ['forMap', (parent) => parent.forMap(4, { level: 2 })],
      ['withContext', (parent) => parent.withContext({ venueId: 9 })],
      ['a scoped client of a scoped client', (parent) => parent.forVenue(7).forMap(5)],
    ])(
      '%s: the same Transport and raw instance (===), only the context differs',
      (_name, scope) => {
        const parent = parentOf();
        const child = scope(parent);
        expect(child).toBeInstanceOf(RtlsClient);
        expect(child).not.toBe(parent);
        expect(child.transport).toBe(parent.transport);
        expect(child.raw).toBe(parent.raw);
        expect(parent.context).toStrictEqual({ namespace: 'ns', venueId: 1, mapId: 2 });
      }
    );

    it('a raw.use() middleware registered on the parent runs for a request from the child', async () => {
      server.use(http.get(`${BASE}/health`, () => HttpResponse.json({ status: 'OK' })));
      const parent = parentOf();
      const seen: string[] = [];
      parent.raw.use({
        onRequest({ request }) {
          seen.push(new URL(request.url).pathname);
          return undefined;
        },
      });
      const child = parent.forVenue(7);
      const { data, response } = await child.raw.GET('/health');
      expect(response.status).toBe(200);
      expect(data).toStrictEqual({ status: 'OK' });
      expect(seen).toStrictEqual(['/api/health']);
    });

    it("a child's transport sends the parent's base URL and single credential", async () => {
      server.use(http.get(`${BASE}/settings/:ns`, () => HttpResponse.json({ map: {} })));
      const parent = createRtlsClient({ baseUrl: BASE, apiKey: 'k', accessToken: 't' });
      const rec = recordRequests();
      await parent
        .withContext({ namespace: 'x' })
        .transport.request('GET', '/settings/{app_namespace}', {
          params: { app_namespace: 'x' },
        });
      const request = rec.requests[0];
      expect(request?.url.href).toBe(`${BASE}/settings/x`);
      expect(request?.headers.get('authorization')).toBe('Bearer t');
      expect(request?.headers.has('x-api-key')).toBe(false);
    });

    it('withContext({ venueId: undefined }) clears the venue in the new client and still shares the transport', () => {
      const parent = parentOf();
      const child = parent.withContext({ venueId: undefined });
      expect(child.venueId).toBeUndefined();
      expect(child.context).toStrictEqual({ namespace: 'ns', mapId: 2 });
      expect(parent.venueId).toBe(1);
      expect(child.transport).toBe(parent.transport);
    });

    it('a client built without a parent gets its own transport and raw', () => {
      const a = parentOf();
      const b = parentOf();
      expect(a.transport).not.toBe(b.transport);
      expect(a.raw).not.toBe(b.raw);
    });
  });

  describe('constructor option validation (P1 §6.1)', () => {
    it.each([
      ['not a URL', 'rtls.ubudu.com/api'],
      ['an ftp URL', 'ftp://rtls.ubudu.com/api'],
      ['a ws URL', 'wss://rtls.ubudu.com/api'],
      ['a protocol-relative URL', '//rtls.ubudu.com/api'],
      ['a non-string', 42],
    ])('a bad baseUrl (%s) → ValidationError with status 0', (_name, baseUrl) => {
      expect(() => createRtlsClient({ baseUrl: baseUrl as string })).toThrow(ValidationError);
      expect(() => createRtlsClient({ baseUrl: baseUrl as string })).toThrow(
        expect.objectContaining({ status: 0, details: ['baseUrl'] })
      );
    });

    it('a root-relative baseUrl (same-origin proxy, as 0.2.0) is accepted: requests go to <path>/<route>', async () => {
      const urls: string[] = [];
      const fetch = async (input: RequestInfo | URL): Promise<Response> => {
        urls.push(input instanceof Request ? input.url : String(input));
        return Response.json({ status: 'OK' });
      };
      await expect(
        createRtlsClient({ baseUrl: '/rtls-api/', apiKey: 'k', fetch }).health()
      ).resolves.toStrictEqual({ status: 'OK' });
      expect(urls).toStrictEqual(['/rtls-api/health']);
    });

    it('trailing slashes of baseUrl are stripped', async () => {
      server.use(
        http.get('http://h.test:8080/x/health', () => HttpResponse.json({ status: 'OK' }))
      );
      const rec = recordRequests();
      const custom = createRtlsClient({ baseUrl: 'http://h.test:8080/x//' });
      await custom.health();
      expect(rec.requests.map((r) => r.url.href)).toEqual(['http://h.test:8080/x/health']);
    });
  });
});
