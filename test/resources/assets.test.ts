import { describe, it, expect, beforeEach } from 'vitest';
import { createRtlsClient, RtlsClient } from '../../src';

describe('AssetsResource', () => {
  let client: RtlsClient;
  const namespace = 'test-namespace';

  beforeEach(() => {
    client = createRtlsClient({ apiKey: 'test-key' });
  });

  describe('list', () => {
    it('should list assets as direct array', async () => {
      const result = await client.assets.list(namespace);

      // API now returns direct array, not paginated
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('get', () => {
    it('should get single asset', async () => {
      const result = await client.assets.get(namespace, 'AABBCCDDEEFF');

      expect(result).toHaveProperty('user_udid');
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
      expect(assets.length).toBeGreaterThan(0);
    });
  });
});
