import { describe, it, expect } from 'vitest';
import { createRtlsClient, RtlsClient, ContextError } from '../../src';

describe('AssetsResource with context', () => {
  let client: RtlsClient;

  describe('list', () => {
    it('uses default namespace when not specified', async () => {
      client = createRtlsClient({
        apiKey: 'test',
        namespace: 'default-ns',
      });

      // MSW handler at /assets/:namespace should respond with array
      const result = await client.assets.list();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('uses explicit namespace (legacy)', async () => {
      client = createRtlsClient({
        apiKey: 'test',
        namespace: 'default-ns',
      });

      // Legacy call with explicit namespace
      const result = await client.assets.list('explicit-ns');

      expect(Array.isArray(result)).toBe(true);
    });

    it('allows namespace override in options', async () => {
      client = createRtlsClient({
        apiKey: 'test',
        namespace: 'default-ns',
      });

      // Override in options
      const result = await client.assets.list({ namespace: 'override-ns' });

      expect(Array.isArray(result)).toBe(true);
    });

    it('throws when no namespace available', async () => {
      client = createRtlsClient({ apiKey: 'test' });

      await expect(client.assets.list()).rejects.toThrow(ContextError);
    });

    it('passes options correctly with default namespace', async () => {
      client = createRtlsClient({
        apiKey: 'test',
        namespace: 'ns',
      });

      // Should use default namespace but also pass limit
      const result = await client.assets.list({ limit: 10 });

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('get', () => {
    it('uses default namespace', async () => {
      client = createRtlsClient({
        apiKey: 'test',
        namespace: 'default-ns',
      });

      const result = await client.assets.get('AA:BB:CC:DD:EE:FF');

      expect(result).toHaveProperty('user_udid');
    });

    it('uses explicit namespace (legacy)', async () => {
      client = createRtlsClient({
        apiKey: 'test',
        namespace: 'default-ns',
      });

      const result = await client.assets.get('explicit-ns', 'AA:BB:CC:DD:EE:FF');

      expect(result).toHaveProperty('user_udid');
    });

    it('throws when no namespace available', async () => {
      client = createRtlsClient({ apiKey: 'test' });

      await expect(client.assets.get('AA:BB:CC:DD:EE:FF')).rejects.toThrow(ContextError);
    });
  });

  describe('create', () => {
    it('uses default namespace', async () => {
      client = createRtlsClient({
        apiKey: 'test',
        namespace: 'default-ns',
      });

      const result = await client.assets.create('AA:BB:CC:DD:EE:FF', { user_name: 'Test' });

      expect(result).toHaveProperty('user_name', 'Test');
    });

    it('uses explicit namespace (legacy)', async () => {
      client = createRtlsClient({
        apiKey: 'test',
        namespace: 'default-ns',
      });

      const result = await client.assets.create('explicit-ns', 'AA:BB:CC:DD:EE:FF', { user_name: 'Test' });

      expect(result).toHaveProperty('user_name', 'Test');
    });
  });

  describe('update', () => {
    it('uses default namespace', async () => {
      client = createRtlsClient({
        apiKey: 'test',
        namespace: 'default-ns',
      });

      const result = await client.assets.update('AA:BB:CC:DD:EE:FF', { user_name: 'Updated' });

      expect(result).toHaveProperty('user_name', 'Updated');
    });
  });

  describe('delete', () => {
    it('uses default namespace', async () => {
      client = createRtlsClient({
        apiKey: 'test',
        namespace: 'default-ns',
      });

      // Should not throw
      await expect(client.assets.delete('AA:BB:CC:DD:EE:FF')).resolves.toBeUndefined();
    });
  });

  describe('scoped client', () => {
    it('forNamespace changes default namespace', async () => {
      client = createRtlsClient({
        apiKey: 'test',
        namespace: 'original-ns',
      });

      const scoped = client.forNamespace('scoped-ns');

      expect(scoped.namespace).toBe('scoped-ns');

      const result = await scoped.assets.list();
      expect(Array.isArray(result)).toBe(true);
    });

    it('setNamespace changes default namespace', async () => {
      client = createRtlsClient({
        apiKey: 'test',
        namespace: 'original-ns',
      });

      client.setNamespace('new-ns');

      expect(client.namespace).toBe('new-ns');

      const result = await client.assets.list();
      expect(Array.isArray(result)).toBe(true);
    });

    it('original client is unaffected by forNamespace', async () => {
      client = createRtlsClient({
        apiKey: 'test',
        namespace: 'original-ns',
      });

      const scoped = client.forNamespace('scoped-ns');

      expect(client.namespace).toBe('original-ns');
      expect(scoped.namespace).toBe('scoped-ns');
    });
  });

  describe('iterate', () => {
    it('uses default namespace', async () => {
      client = createRtlsClient({
        apiKey: 'test',
        namespace: 'default-ns',
      });

      const assets: Record<string, unknown>[] = [];
      for await (const asset of client.assets.iterate()) {
        assets.push(asset);
      }

      expect(assets.length).toBeGreaterThan(0);
    });

    it('uses explicit namespace (legacy)', async () => {
      client = createRtlsClient({
        apiKey: 'test',
        namespace: 'default-ns',
      });

      const assets: Record<string, unknown>[] = [];
      for await (const asset of client.assets.iterate('explicit-ns')) {
        assets.push(asset);
      }

      expect(assets.length).toBeGreaterThan(0);
    });
  });
});
