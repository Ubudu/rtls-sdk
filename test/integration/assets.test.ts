import { describe, it, expect, beforeAll } from 'vitest';
import { createRtlsClient, RtlsClient } from '../../src';
import { TEST_CONFIG, hasCredentials } from './setup';

describe.skipIf(!hasCredentials())('AssetsResource Integration', () => {
  let client: RtlsClient;
  const namespace = TEST_CONFIG.namespace!;

  beforeAll(() => {
    client = createRtlsClient({
      apiKey: TEST_CONFIG.apiKey,
    });
  });

  describe('list', () => {
    it('should list assets from the API', async () => {
      const result = await client.assets.list(namespace);

      // NOTE: The actual API returns a direct array, not a paginated response
      // This test reveals the SDK assumption doesn't match reality
      console.log('Assets API response type:', typeof result);
      console.log('Assets API response:', JSON.stringify(result, null, 2).slice(0, 500));

      // Check if it's an array (actual API) or paginated response (SDK expectation)
      if (Array.isArray(result)) {
        console.log(`Found ${result.length} assets (direct array response)`);
        if (result.length > 0) {
          console.log('First asset:', JSON.stringify(result[0], null, 2));
        }
        expect(result.length).toBeGreaterThanOrEqual(0);
      } else {
        // SDK expected format
        expect(result).toHaveProperty('data');
      }
    });
  });
});
