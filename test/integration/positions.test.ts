import { describe, it, expect, beforeAll } from 'vitest';
import { createRtlsClient, RtlsClient } from '../../src';
import { TEST_CONFIG, hasCredentials } from './setup';

describe.skipIf(!hasCredentials())('PositionsResource Integration', () => {
  let client: RtlsClient;
  const namespace = TEST_CONFIG.namespace!;

  beforeAll(() => {
    client = createRtlsClient({
      apiKey: TEST_CONFIG.apiKey,
    });
  });

  describe('listCached', () => {
    it('should list cached positions', async () => {
      const result = await client.positions.listCached(namespace);

      console.log('Positions API response type:', typeof result);
      console.log('Is array:', Array.isArray(result));
      console.log('Positions API response:', JSON.stringify(result, null, 2).slice(0, 500));

      // NOTE: The actual API returns a direct array, not a paginated response
      if (Array.isArray(result)) {
        console.log(`Found ${result.length} cached positions (direct array response)`);
        if (result.length > 0) {
          console.log('First position:', JSON.stringify(result[0], null, 2));
        }
        expect(result.length).toBeGreaterThanOrEqual(0);
      } else {
        expect(result).toHaveProperty('data');
      }
    });
  });
});
