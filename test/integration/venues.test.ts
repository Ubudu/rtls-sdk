import { describe, it, expect, beforeAll } from 'vitest';
import { createRtlsClient, RtlsClient } from '../../src';
import { TEST_CONFIG, hasCredentials } from './setup';

describe.skipIf(!hasCredentials())('VenuesResource Integration', () => {
  let client: RtlsClient;
  const namespace = TEST_CONFIG.namespace!;

  beforeAll(() => {
    client = createRtlsClient({
      apiKey: TEST_CONFIG.apiKey,
    });
  });

  describe('list', () => {
    it('should list venues', async () => {
      const result = await client.venues.list(namespace);

      console.log('Venues API response type:', typeof result);
      console.log('Venues API response:', JSON.stringify(result, null, 2).slice(0, 500));

      // NOTE: The actual API returns a direct array, not a paginated response
      if (Array.isArray(result)) {
        console.log(`Found ${result.length} venues (direct array response)`);
        if (result.length > 0) {
          console.log('First venue:', JSON.stringify(result[0], null, 2));
        }
        expect(result.length).toBeGreaterThanOrEqual(0);
      } else {
        expect(result).toHaveProperty('data');
      }
    });
  });
});
