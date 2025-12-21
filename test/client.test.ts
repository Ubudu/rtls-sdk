import { describe, it, expect, beforeEach } from 'vitest';
import { createRtlsClient, RtlsClient } from '../src';

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
      expect(client.assets).toBeDefined();
      expect(client.positions).toBeDefined();
      expect(client.zones).toBeDefined();
      expect(client.venues).toBeDefined();
      expect(client.alerts).toBeDefined();
      expect(client.dashboards).toBeDefined();
      expect(client.navigation).toBeDefined();
      expect(client.spatial).toBeDefined();
    });

    it('should expose raw client', () => {
      expect(client.raw).toBeDefined();
    });
  });

  describe('health check', () => {
    it('should return health status', async () => {
      const health = await client.health();
      expect(health).toHaveProperty('status', 'healthy');
    });
  });
});
