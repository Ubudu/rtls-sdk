import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { recordRequests, server } from '../../mocks/server';
import { ContextError, createRtlsClient, type CallContext, type RtlsClient } from '../../../src';
import { ResourceBase } from '../../../src/client/resource';
import type { Transport } from '../../../src/client/transport';

const BASE = 'https://resource.test/api';

/** Exposes the protected resolvers of ResourceBase. */
class ProbeResource extends ResourceBase {
  get sharedTransport(): Transport {
    return this.transport;
  }
  namespaceOf(ctx?: CallContext): string {
    return this.ns(ctx);
  }
  venueOf(ctx?: CallContext): number {
    return this.venueId(ctx);
  }
  mapOf(ctx?: CallContext): number {
    return this.mapId(ctx);
  }
  levelOf(ctx?: CallContext): number | undefined {
    return this.level(ctx);
  }
  async settings(ctx?: CallContext): Promise<unknown> {
    return await this.transport.request<unknown>('GET', '/settings/{app_namespace}', {
      params: { app_namespace: this.ns(ctx) },
    });
  }
}

const client = (context: CallContext = {}): RtlsClient =>
  createRtlsClient({ baseUrl: BASE, apiKey: 'k', ...context });

function expectContextError(
  run: () => unknown,
  problem: 'missing' | 'invalid',
  field: string
): void {
  expect(run).toThrow(ContextError);
  expect(run).toThrow(
    expect.objectContaining({ status: 0, code: 'CONTEXT_ERROR', problem, field })
  );
}

describe('ResourceBase (P1 §6.4, src/client/resource.ts)', () => {
  it('this.transport is the client transport; new XResource(client) works', () => {
    const c = client();
    const probe = new ProbeResource(c);
    expect(probe).toBeInstanceOf(ResourceBase);
    expect(probe.sharedTransport).toBe(c.transport);
  });

  describe('ns()', () => {
    it('per-call wins over the default; the default applies otherwise', () => {
      const probe = new ProbeResource(client({ namespace: 'default-ns' }));
      expect(probe.namespaceOf({ namespace: 'call-ns' })).toBe('call-ns');
      expect(probe.namespaceOf()).toBe('default-ns');
      expect(probe.namespaceOf({})).toBe('default-ns');
    });

    it.each([undefined, null, ''])('a per-call %j counts as not given', (namespace) => {
      const probe = new ProbeResource(client({ namespace: 'default-ns' }));
      expect(probe.namespaceOf({ namespace: namespace as string })).toBe('default-ns');
    });

    it("missing everywhere (or '') → ContextError problem 'missing' with the 0.2.0 message", () => {
      const probe = new ProbeResource(client());
      expectContextError(() => probe.namespaceOf(), 'missing', 'Namespace');
      expectContextError(() => probe.namespaceOf({ namespace: '' }), 'missing', 'Namespace');
      expect(() => probe.namespaceOf()).toThrow(/^Namespace is required\./);
    });

    it("a non-string from JavaScript → ContextError problem 'invalid'", () => {
      const probe = new ProbeResource(client({ namespace: 'default-ns' }));
      expectContextError(
        () => probe.namespaceOf({ namespace: 42 as unknown as string }),
        'invalid',
        'Namespace'
      );
    });

    it('a ContextError is thrown before any request', async () => {
      server.use(http.get(`${BASE}/*`, () => HttpResponse.json({})));
      const probe = new ProbeResource(client());
      const rec = recordRequests();
      await expect(probe.settings()).rejects.toBeInstanceOf(ContextError);
      expect(rec.requests).toHaveLength(0);
    });

    it('the resolved namespace reaches the request', async () => {
      server.use(http.get(`${BASE}/settings/:ns`, () => HttpResponse.json({ map: {} })));
      const probe = new ProbeResource(client({ namespace: 'default-ns' }));
      const rec = recordRequests();
      await probe.settings({ namespace: 'call-ns' });
      await probe.settings();
      expect(rec.requests.map((r) => r.url.pathname)).toStrictEqual([
        '/api/settings/call-ns',
        '/api/settings/default-ns',
      ]);
    });
  });

  describe.each<[string, 'venueId' | 'mapId', 'Venue ID' | 'Map ID']>([
    ['venueId()', 'venueId', 'Venue ID'],
    ['mapId()', 'mapId', 'Map ID'],
  ])('%s', (_name, key, field) => {
    const resolve = (probe: ProbeResource, ctx?: CallContext): number =>
      key === 'venueId' ? probe.venueOf(ctx) : probe.mapOf(ctx);

    it('per-call wins; the default applies otherwise; 0 is a valid id', () => {
      const probe = new ProbeResource(client({ [key]: 3 }));
      expect(resolve(probe, { [key]: 0 })).toBe(0);
      expect(resolve(probe, { [key]: 12 })).toBe(12);
      expect(resolve(probe)).toBe(3);
      expect(resolve(probe, { [key]: null as unknown as number })).toBe(3);
    });

    it("missing everywhere → ContextError problem 'missing'", () => {
      expectContextError(() => resolve(new ProbeResource(client())), 'missing', field);
    });

    it.each<[string, unknown]>([
      ['NaN', NaN],
      ['a float', 1.5],
      ['a negative id', -1],
      ["a digit string '3' (from JavaScript)", '3'],
      ['Infinity', Infinity],
    ])("%s → ContextError problem 'invalid'", (_case, value) => {
      const probe = new ProbeResource(client({ [key]: 3 }));
      expectContextError(() => resolve(probe, { [key]: value as number }), 'invalid', field);
    });
  });

  describe('level()', () => {
    it('per-call wins; the default applies; undefined when neither is set; negative levels are allowed', () => {
      const probe = new ProbeResource(client({ level: 2 }));
      expect(probe.levelOf({ level: -1 })).toBe(-1);
      expect(probe.levelOf({ level: 0 })).toBe(0);
      expect(probe.levelOf()).toBe(2);
      expect(new ProbeResource(client()).levelOf()).toBeUndefined();
      expect(new ProbeResource(client()).levelOf({ level: undefined })).toBeUndefined();
    });

    it.each<[string, unknown]>([
      ['1.5', 1.5],
      ['NaN', NaN],
      ["the string '0' (from JavaScript)", '0'],
    ])("%s → ContextError problem 'invalid'", (_case, value) => {
      const probe = new ProbeResource(client({ level: 2 }));
      expectContextError(() => probe.levelOf({ level: value as number }), 'invalid', 'Level');
    });
  });

  it('a resource of a scoped client resolves the scoped context and shares the parent transport', () => {
    const parent = client({ namespace: 'ns' });
    const scoped = parent.forVenue(7, { mapId: 2, level: 0 });
    const probe = new ProbeResource(scoped);
    expect(probe.namespaceOf()).toBe('ns');
    expect(probe.venueOf()).toBe(7);
    expect(probe.mapOf()).toBe(2);
    expect(probe.levelOf()).toBe(0);
    expect(probe.venueOf({ venueId: 8 })).toBe(8);
    expect(probe.sharedTransport).toBe(parent.transport);
    expectContextError(() => probe.venueOf({ venueId: NaN }), 'invalid', 'Venue ID');
  });
});
