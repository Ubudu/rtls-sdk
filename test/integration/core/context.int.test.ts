/**
 * Core live tests L-C1…L-C3 (P1 §9), tier R, no writes. Rewrite of the context test P0 moved here (P0 §9.2): its 14
 * cases still hold under 0.3.0 and are kept; L-C1 adds the 0.3.0 clearing (B9), validation (B10, B11), the
 * `ResourceBase` resolvers and the shared transport; L-C2 the shared `raw` middleware; L-C3 the WebSocket client
 * construction (no connection is opened: connection behaviour is P8's).
 */

import { beforeAll } from 'vitest';
import type { Middleware } from 'openapi-fetch';
import {
  ContextError,
  RtlsError,
  RtlsWebSocketClient,
  type CallContext,
  type RtlsClient,
} from '../../../src';
import { ResourceBase } from '../../../src/client/resource';
import {
  createLiveClient,
  describeLive,
  discover,
  getHarness,
  guardedFetch,
  liveEnv,
  requestLog,
  type Discovery,
} from '../harness';
import { recordingFetch } from './support/recording-fetch';
import { thrownBy } from './support/rejection';
import { auditReadOnlyRequests } from './support/request-audit';

/** Exposes the protected context resolvers of `ResourceBase` (L-C1). */
class ProbeResource extends ResourceBase {
  venue(ctx?: CallContext): number {
    return this.venueId(ctx);
  }

  map(ctx?: CallContext): number {
    return this.mapId(ctx);
  }

  floor(ctx?: CallContext): number | undefined {
    return this.level(ctx);
  }

  namespace(ctx?: CallContext): string {
    return this.ns(ctx);
  }
}

function webSocketBase(baseUrl: string): string {
  const url = new URL(baseUrl);
  return `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}${url.pathname.replace(/\/+$/, '')}`;
}

describeLive('R', 'context', () => {
  auditReadOnlyRequests();

  let NAMESPACE: string;
  let discovery: Discovery;

  beforeAll(async () => {
    NAMESPACE = getHarness().env.namespace;
    discovery = await discover();
  });

  describe('Client with default namespace', () => {
    let client: RtlsClient;

    beforeAll(() => {
      client = createLiveClient();
    });

    it('lists assets without explicit namespace', async () => {
      const assets = await client.assets.list();
      expect(Array.isArray(assets)).toBe(true);
    });

    it('lists cached positions without explicit namespace', async () => {
      const positions = await client.positions.listCached();
      expect(Array.isArray(positions)).toBe(true);
    });

    it('lists venues without explicit namespace', async () => {
      const venues = await client.venues.list();
      expect(Array.isArray(venues)).toBe(true);
    });

    it('allows namespace override per-call', async () => {
      // Should work with override (uses same namespace for simplicity)
      const assets = await client.assets.list({ namespace: NAMESPACE });
      expect(Array.isArray(assets)).toBe(true);
    });

    it('supports legacy explicit namespace syntax', async () => {
      const assets = await client.assets.list(NAMESPACE);
      expect(Array.isArray(assets)).toBe(true);
    });
  });

  describe('Client without default namespace', () => {
    let client: RtlsClient;

    beforeAll(() => {
      client = createLiveClient({ namespace: null });
    });

    it('throws ContextError when namespace not provided', async () => {
      await expect(client.assets.list()).rejects.toThrow(ContextError);
      expect(requestLog()).toHaveLength(0);
    });

    it('works when namespace provided explicitly', async () => {
      const assets = await client.assets.list(NAMESPACE);
      expect(Array.isArray(assets)).toBe(true);
    });

    it('works when namespace provided in options', async () => {
      const assets = await client.assets.list({ namespace: NAMESPACE });
      expect(Array.isArray(assets)).toBe(true);
    });
  });

  describe('Mutable setters', () => {
    it('setNamespace changes default namespace', async () => {
      const client = createLiveClient({ namespace: null });

      // Initially no namespace
      expect(client.namespace).toBeUndefined();

      // Set namespace
      client.setNamespace(NAMESPACE);
      expect(client.namespace).toBe(NAMESPACE);

      // Should now work without explicit namespace
      const assets = await client.assets.list();
      expect(Array.isArray(assets)).toBe(true);
    });

    it('setters are chainable', () => {
      const client = createLiveClient({ namespace: null });

      const result = client.setNamespace(NAMESPACE).setVenue(123).setLevel(0);

      expect(result).toBe(client);
      expect(client.namespace).toBe(NAMESPACE);
      expect(client.venueId).toBe(123);
      expect(client.level).toBe(0);
    });

    it('clearContext resets all defaults', () => {
      const client = createLiveClient({
        venueId: 123,
      });

      client.clearContext();

      expect(client.namespace).toBeUndefined();
      expect(client.venueId).toBeUndefined();
    });
  });

  describe('Scoped clients (immutable)', () => {
    it('forNamespace creates new client with different namespace', async () => {
      const client = createLiveClient({ namespace: null });
      const scopedClient = client.forNamespace(NAMESPACE);

      // Original unchanged
      expect(client.namespace).toBeUndefined();

      // Scoped client has namespace
      expect(scopedClient.namespace).toBe(NAMESPACE);

      // Scoped client works
      const assets = await scopedClient.assets.list();
      expect(Array.isArray(assets)).toBe(true);
    });

    it('withContext creates client with multiple overrides', () => {
      const client = createLiveClient({ namespace: 'original' });

      const scopedClient = client.withContext({
        namespace: NAMESPACE,
        venueId: 999,
        level: 2,
      });

      // Original unchanged
      expect(client.namespace).toBe('original');
      expect(client.venueId).toBeUndefined();

      // Scoped client has overrides
      expect(scopedClient.namespace).toBe(NAMESPACE);
      expect(scopedClient.venueId).toBe(999);
      expect(scopedClient.level).toBe(2);
    });
  });

  describe('Spatial queries with context', () => {
    let client: RtlsClient;

    beforeAll(() => {
      client = createLiveClient();
    });

    it('nearestZones works with default namespace', async () => {
      const result = await client.spatial.nearestZones({
        lat: 48.8566,
        lon: 2.3522,
        limit: 5,
      });
      expect(result).toHaveProperty('reference_point');
    });
  });

  describe('L-C1 0.3.0 context rules', () => {
    it('forNamespace(ns).getSettings() reads the namespace through the shared transport', async () => {
      const parent = createLiveClient({ namespace: null });
      const scoped = parent.forNamespace(NAMESPACE);
      expect(scoped.transport).toBe(parent.transport);
      expect(scoped.raw).toBe(parent.raw);
      const settings = await scoped.getSettings();
      expect(typeof settings === 'object' && settings !== null).toBe(true);
    });

    it('no default namespace: getSettings() throws ContextError and sends nothing', async () => {
      const rec = recordingFetch(guardedFetch);
      const client = createLiveClient({ namespace: null, fetch: rec.fetch });
      await expect(client.getSettings()).rejects.toSatisfy(
        (e: unknown) => e instanceof ContextError && e instanceof RtlsError && e.status === 0
      );
      expect(rec.calls).toHaveLength(0);
    });

    it('setContext({ namespace: undefined }) clears it; setNamespace(ns) restores it (B9)', async () => {
      const client = createLiveClient();
      client.setContext({ namespace: undefined });
      expect(client.namespace).toBeUndefined();
      await expect(client.getSettings()).rejects.toSatisfy(
        (e: unknown) =>
          e instanceof ContextError && e.problem === 'missing' && e.code === 'CONTEXT_ERROR'
      );
      expect(requestLog()).toHaveLength(0);
      client.setNamespace(NAMESPACE);
      const settings = await client.getSettings();
      expect(typeof settings === 'object' && settings !== null).toBe(true);
    });

    it('forVenue, forMap and withContext expose the discovered ids; withContext clears on undefined', () => {
      const client = createLiveClient();
      const venue = client.forVenue(discovery.venueId);
      expect(venue.venueId).toBe(discovery.venueId);
      expect(venue.namespace === NAMESPACE).toBe(true);
      const map = venue.forMap(0);
      expect(map.mapId).toBe(0);
      expect(map.venueId).toBe(discovery.venueId);
      expect(map.namespace === NAMESPACE).toBe(true);
      const ctx = client.withContext({ venueId: discovery.venueId, mapId: discovery.mapId });
      expect(ctx.venueId).toBe(discovery.venueId);
      expect(ctx.mapId).toBe(discovery.mapId);
      const cleared = ctx.withContext({ venueId: undefined });
      expect(cleared.venueId).toBeUndefined();
      expect(cleared.mapId).toBe(discovery.mapId);
    });

    it('setVenue(NaN) and forVenue(-1) throw ContextError problem invalid (B10, B11)', () => {
      const client = createLiveClient();
      for (const error of [
        thrownBy(() => client.setVenue(NaN)),
        thrownBy(() => client.forVenue(-1)),
      ]) {
        expect(error).toBeInstanceOf(ContextError);
        expect((error as ContextError).problem).toBe('invalid');
        expect((error as ContextError).status).toBe(0);
      }
      expect(client.venueId).toBeUndefined();
    });

    it('ResourceBase resolves venue, map and level from the context and per call', () => {
      const scoped = createLiveClient().forVenue(discovery.venueId, {
        mapId: discovery.mapId,
        level: 0,
      });
      const probe = new ProbeResource(scoped);
      expect(probe.namespace() === NAMESPACE).toBe(true);
      expect(probe.venue()).toBe(discovery.venueId);
      expect(probe.map()).toBe(discovery.mapId);
      expect(probe.floor()).toBe(0);
      expect(probe.venue({ venueId: discovery.venueId + 1 })).toBe(discovery.venueId + 1);
      expect(probe.map({ mapId: 0 })).toBe(0);
      expect(probe.floor({ level: -1 })).toBe(-1);
      const error = thrownBy(() => probe.venue({ venueId: NaN }));
      expect(error).toBeInstanceOf(ContextError);
      expect((error as ContextError).problem).toBe('invalid');
      expect(requestLog()).toHaveLength(0);
    });
  });

  describe('L-C2 scoped clients share raw middleware', () => {
    it('a raw.use() middleware of the parent runs for a request of a forVenue() child', async () => {
      const client = createLiveClient();
      let count = 0;
      const counting: Middleware = {
        onRequest() {
          count += 1;
          return undefined;
        },
      };
      client.raw.use(counting);
      const { data, response } = await client.forVenue(discovery.venueId).raw.GET('/health');
      expect(response.status).toBe(200);
      expect(data).toEqual({ status: 'OK' });
      expect(count).toBe(1);
    });
  });

  describe('L-C3 createWebSocket (construction only)', () => {
    it('an API-key client gets apiKey and the URLs derived from the live base URL', () => {
      const env = liveEnv();
      const ws = createLiveClient().createWebSocket();
      expect(ws).toBeInstanceOf(RtlsWebSocketClient);
      expect(ws.isConnected()).toBe(false);
      const config = ws.getConfig();
      expect(config.namespace === env.namespace).toBe(true);
      expect(config.subscriberUrl).toBe(`${webSocketBase(env.baseUrl)}/ws/subscriber`);
      expect(config.publisherUrl).toBe(`${webSocketBase(env.baseUrl)}/ws/publisher`);
      expect(config.apiKey === env.apiKey).toBe(true);
      expect(config.token).toBeUndefined();
    });

    it('a client with an access token gets token and no apiKey (D11)', () => {
      const env = liveEnv();
      const ws = createLiveClient({ accessToken: env.apiKey }).createWebSocket();
      expect(ws.isConnected()).toBe(false);
      const config = ws.getConfig();
      expect(config.token === env.apiKey).toBe(true);
      expect(config.apiKey).toBeUndefined();
      expect(config.subscriberUrl).toBe(`${webSocketBase(env.baseUrl)}/ws/subscriber`);
    });

    it('createWebSocket() without a namespace throws ContextError', () => {
      const error = thrownBy(() => createLiveClient({ namespace: null }).createWebSocket());
      expect(error).toBeInstanceOf(ContextError);
    });

    it('createWebSocket() without a credential throws ValidationError status 0', () => {
      const error = thrownBy(() => createLiveClient({ apiKey: undefined }).createWebSocket());
      expect(error).toBeInstanceOf(RtlsError);
      expect((error as RtlsError).status).toBe(0);
      expect((error as RtlsError).code).toBe('VALIDATION_ERROR');
    });
  });
});
