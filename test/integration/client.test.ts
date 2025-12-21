import { describe, it, expect, beforeAll } from 'vitest';
import { createRtlsClient, RtlsClient } from '../../src';
import { TEST_CONFIG, hasCredentials } from './setup';

describe.skipIf(!hasCredentials())('RtlsClient Integration', () => {
  let client: RtlsClient;

  beforeAll(() => {
    client = createRtlsClient({
      apiKey: TEST_CONFIG.apiKey,
    });
  });

  describe('health', () => {
    it('should return health status', async () => {
      const health = await client.health();

      expect(health).toBeDefined();
      console.log('Health check response:', JSON.stringify(health, null, 2));
    });
  });

  describe('getSettings', () => {
    it('should return settings for namespace', async () => {
      const settings = await client.getSettings(TEST_CONFIG.namespace!);

      expect(settings).toBeDefined();
      console.log('Settings response:', JSON.stringify(settings, null, 2));
    });
  });
});
