import { describe, it, expect, beforeEach } from 'vitest';
import { createRtlsClient, RtlsClient } from '../../src';

describe('AssetsResource', () => {
  let client: RtlsClient;
  const namespace = 'test-namespace';

  beforeEach(() => {
    client = createRtlsClient({ apiKey: 'test-key' });
  });

  describe('list', () => {
    it('should list assets', async () => {
      const result = await client.assets.list(namespace);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('total');
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should support pagination options', async () => {
      const result = await client.assets.list(namespace, { page: 1, limit: 10 });

      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });
  });

  describe('get', () => {
    it('should get single asset', async () => {
      const result = await client.assets.get(namespace, 'AABBCCDDEEFF');

      expect(result).toHaveProperty('mac_address');
    });
  });

  describe('iterate', () => {
    it('should iterate through all assets', async () => {
      const assets: Record<string, unknown>[] = [];
      for await (const asset of client.assets.iterate(namespace)) {
        assets.push(asset);
      }

      expect(assets.length).toBeGreaterThan(0);
    });
  });

  describe('getAll', () => {
    it('should collect all assets', async () => {
      const assets = await client.assets.getAll(namespace);

      expect(Array.isArray(assets)).toBe(true);
    });

    it('should respect maxItems option', async () => {
      const assets = await client.assets.getAll(namespace, { maxItems: 1 });

      expect(assets.length).toBeLessThanOrEqual(1);
    });
  });
});
