import { describe, it, expect, beforeEach } from 'vitest';
import { createRtlsClient, ContextError } from '../src';

describe('RtlsClient context management', () => {
  describe('constructor context', () => {
    it('accepts all context options', () => {
      const client = createRtlsClient({
        apiKey: 'test-key',
        namespace: 'my-ns',
        venueId: 123,
        mapId: 456,
        level: 2,
      });

      expect(client.namespace).toBe('my-ns');
      expect(client.venueId).toBe(123);
      expect(client.mapId).toBe(456);
      expect(client.level).toBe(2);
    });

    it('defaults context to undefined when not provided', () => {
      const client = createRtlsClient({ apiKey: 'test-key' });

      expect(client.namespace).toBeUndefined();
      expect(client.venueId).toBeUndefined();
      expect(client.mapId).toBeUndefined();
      expect(client.level).toBeUndefined();
    });

    it('context getter returns read-only copy', () => {
      const client = createRtlsClient({
        apiKey: 'test-key',
        namespace: 'ns1',
        venueId: 1,
      });

      const ctx = client.context;
      expect(ctx.namespace).toBe('ns1');
      expect(ctx.venueId).toBe(1);

      // Modifying the returned object should not affect client
      (ctx as { namespace: string }).namespace = 'modified';
      expect(client.namespace).toBe('ns1');
    });
  });

  describe('mutable setters', () => {
    let client: ReturnType<typeof createRtlsClient>;

    beforeEach(() => {
      client = createRtlsClient({ apiKey: 'test-key' });
    });

    it('setNamespace updates namespace', () => {
      client.setNamespace('new-ns');
      expect(client.namespace).toBe('new-ns');
    });

    it('setVenue updates venueId', () => {
      client.setVenue(999);
      expect(client.venueId).toBe(999);
    });

    it('setMap updates mapId', () => {
      client.setMap(888);
      expect(client.mapId).toBe(888);
    });

    it('setLevel updates level', () => {
      client.setLevel(5);
      expect(client.level).toBe(5);
    });

    it('setters are chainable', () => {
      const result = client
        .setNamespace('ns')
        .setVenue(1)
        .setMap(2)
        .setLevel(3);

      expect(result).toBe(client);
      expect(client.namespace).toBe('ns');
      expect(client.venueId).toBe(1);
      expect(client.mapId).toBe(2);
      expect(client.level).toBe(3);
    });

    it('setContext sets multiple values', () => {
      client.setContext({ namespace: 'bulk-ns', venueId: 100 });

      expect(client.namespace).toBe('bulk-ns');
      expect(client.venueId).toBe(100);
      expect(client.mapId).toBeUndefined();
    });

    it('setContext is chainable', () => {
      const result = client.setContext({ namespace: 'ns' }).setVenue(1);
      expect(result).toBe(client);
    });

    it('clearContext removes all context', () => {
      client
        .setNamespace('ns')
        .setVenue(1)
        .setMap(2)
        .setLevel(3)
        .clearContext();

      expect(client.namespace).toBeUndefined();
      expect(client.venueId).toBeUndefined();
      expect(client.mapId).toBeUndefined();
      expect(client.level).toBeUndefined();
    });

    it('clearContext is chainable', () => {
      const result = client.clearContext();
      expect(result).toBe(client);
    });
  });

  describe('scoped client factories', () => {
    let client: ReturnType<typeof createRtlsClient>;

    beforeEach(() => {
      client = createRtlsClient({
        apiKey: 'test-key',
        namespace: 'parent-ns',
        venueId: 100,
        mapId: 200,
        level: 1,
      });
    });

    describe('forNamespace', () => {
      it('creates new client with different namespace', () => {
        const scoped = client.forNamespace('child-ns');

        expect(scoped).not.toBe(client);
        expect(scoped.namespace).toBe('child-ns');
      });

      it('inherits other context from parent', () => {
        const scoped = client.forNamespace('child-ns');

        expect(scoped.venueId).toBe(100);
        expect(scoped.mapId).toBe(200);
        expect(scoped.level).toBe(1);
      });

      it('does not modify parent', () => {
        client.forNamespace('child-ns');
        expect(client.namespace).toBe('parent-ns');
      });
    });

    describe('forVenue', () => {
      it('creates new client with different venueId', () => {
        const scoped = client.forVenue(999);

        expect(scoped).not.toBe(client);
        expect(scoped.venueId).toBe(999);
      });

      it('inherits namespace from parent', () => {
        const scoped = client.forVenue(999);
        expect(scoped.namespace).toBe('parent-ns');
      });

      it('accepts optional mapId and level', () => {
        const scoped = client.forVenue(999, { mapId: 888, level: 5 });

        expect(scoped.venueId).toBe(999);
        expect(scoped.mapId).toBe(888);
        expect(scoped.level).toBe(5);
      });

      it('uses parent mapId/level when not overridden', () => {
        const scoped = client.forVenue(999);

        expect(scoped.mapId).toBe(200);
        expect(scoped.level).toBe(1);
      });
    });

    describe('forMap', () => {
      it('creates new client with different mapId', () => {
        const scoped = client.forMap(777);

        expect(scoped).not.toBe(client);
        expect(scoped.mapId).toBe(777);
      });

      it('inherits namespace and venueId from parent', () => {
        const scoped = client.forMap(777);

        expect(scoped.namespace).toBe('parent-ns');
        expect(scoped.venueId).toBe(100);
      });

      it('accepts optional level', () => {
        const scoped = client.forMap(777, { level: 9 });
        expect(scoped.level).toBe(9);
      });
    });

    describe('withContext', () => {
      it('creates new client with merged context', () => {
        const scoped = client.withContext({ venueId: 555, level: 7 });

        expect(scoped).not.toBe(client);
        expect(scoped.namespace).toBe('parent-ns'); // inherited
        expect(scoped.venueId).toBe(555); // overridden
        expect(scoped.mapId).toBe(200); // inherited
        expect(scoped.level).toBe(7); // overridden
      });

      it('can override all values', () => {
        const scoped = client.withContext({
          namespace: 'new-ns',
          venueId: 1,
          mapId: 2,
          level: 3,
        });

        expect(scoped.namespace).toBe('new-ns');
        expect(scoped.venueId).toBe(1);
        expect(scoped.mapId).toBe(2);
        expect(scoped.level).toBe(3);
      });
    });
  });

  describe('context resolution', () => {
    it('requireNs throws ContextError when namespace not set', () => {
      const client = createRtlsClient({ apiKey: 'test' });

      expect(() => (client as any).requireNs()).toThrow(ContextError);
    });

    it('requireNs returns namespace when set', () => {
      const client = createRtlsClient({ apiKey: 'test', namespace: 'my-ns' });

      expect((client as any).requireNs()).toBe('my-ns');
    });

    it('requireNs accepts override', () => {
      const client = createRtlsClient({ apiKey: 'test', namespace: 'default' });

      expect((client as any).requireNs({ namespace: 'override' })).toBe('override');
    });

    it('requireVenue throws ContextError when venueId not set', () => {
      const client = createRtlsClient({ apiKey: 'test' });

      expect(() => (client as any).requireVenue()).toThrow(ContextError);
    });

    it('requireVenue returns venueId when set', () => {
      const client = createRtlsClient({ apiKey: 'test', venueId: 123 });

      expect((client as any).requireVenue()).toBe(123);
    });
  });
});
