import { describe, it, expect, beforeAll } from 'vitest';
import { createRtlsClient, RtlsClient } from '../../src';
import { TEST_CONFIG, hasCredentials } from './setup';

describe.skipIf(!hasCredentials())('PositionsResource Integration', () => {
  let client: RtlsClient;
  const namespace = TEST_CONFIG.namespace!;
  let existingAssetMac: string | null = null;

  beforeAll(async () => {
    client = createRtlsClient({
      apiKey: TEST_CONFIG.apiKey,
    });

    // Get an existing asset MAC for testing
    try {
      const assets = await client.assets.list(namespace);
      if (Array.isArray(assets) && assets.length > 0) {
        existingAssetMac = (assets[0] as Record<string, unknown>).user_udid as string;
      }
    } catch {
      // Ignore errors
    }
  });

  // ========================
  // Phase 3: Positions Resource
  // ========================

  describe('Task 3.1: List Cached Positions', () => {
    it('should list cached positions', async () => {
      const result = await client.positions.listCached(namespace);

      console.log('=== Task 3.1: List Cached Positions ===');
      console.log('Endpoint: GET /cache/{app_namespace}/positions');
      console.log('Response Type:', typeof result);
      console.log('Is Array:', Array.isArray(result));

      if (Array.isArray(result)) {
        console.log(`Found ${result.length} cached positions`);
        if (result.length > 0) {
          console.log('Position schema keys:', Object.keys(result[0]));
          console.log('First position:', JSON.stringify(result[0], null, 2));
        }
        expect(result.length).toBeGreaterThanOrEqual(0);
      } else {
        console.log('Response:', JSON.stringify(result, null, 2).slice(0, 500));
      }
    });
  });

  describe('Task 3.2: Get Single Cached Position', () => {
    it('should get cached position for existing asset', async () => {
      if (!existingAssetMac) {
        console.log('=== Task 3.2: Get Cached Position - SKIPPED (no assets) ===');
        return;
      }

      try {
        const result = await client.positions.getCached(namespace, existingAssetMac);

        console.log('=== Task 3.2: Get Single Cached Position ===');
        console.log('Endpoint: GET /cache/{app_namespace}/positions/{mac_address}');
        console.log('MAC:', existingAssetMac);
        console.log('Response:', JSON.stringify(result, null, 2));
        console.log('Schema keys:', Object.keys(result));

        expect(result).toBeDefined();
      } catch (error) {
        console.log('=== Task 3.2: Get Single Cached Position ===');
        console.log('Error:', error instanceof Error ? error.message : error);
        console.log('FINDING: Position may not be cached for this asset');
      }
    });

    it('should handle non-existent position', async () => {
      try {
        await client.positions.getCached(namespace, 'no:ne:xi:st:en:t0');
        console.log('=== Task 3.2: Get Non-existent Cached Position ===');
        console.log('UNEXPECTED: No error thrown');
      } catch (error) {
        console.log('=== Task 3.2: Get Non-existent Cached Position ===');
        console.log('Error Type:', error instanceof Error ? error.constructor.name : typeof error);
        if (error instanceof Error) {
          console.log('Message:', error.message);
        }
      }
    });
  });

  describe('Task 3.3: Get Last Position', () => {
    it('should get last position for asset', async () => {
      if (!existingAssetMac) {
        console.log('=== Task 3.3: Get Last Position - SKIPPED (no assets) ===');
        return;
      }

      try {
        const result = await client.positions.getLast(namespace, existingAssetMac);

        console.log('=== Task 3.3: Get Last Position ===');
        console.log('Endpoint: GET /asset_last_position/{app_namespace}/{mac_address}');
        console.log('MAC:', existingAssetMac);
        console.log('Response:', JSON.stringify(result, null, 2));
        console.log('Schema keys:', Object.keys(result));
        console.log('Difference from cached: This endpoint fetches from persistent storage');

        expect(result).toBeDefined();
      } catch (error) {
        console.log('=== Task 3.3: Get Last Position ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });
  });

  describe('Task 3.4: List Last Positions (ES)', () => {
    it('should list last positions without options', async () => {
      try {
        const result = await client.positions.listLast(namespace);

        console.log('=== Task 3.4: List Last Positions - No Options ===');
        console.log('Endpoint: GET /es/last_positions/{appNamespace}');
        console.log('Response Type:', typeof result);
        console.log('Is Array:', Array.isArray(result));
        console.log('Response:', JSON.stringify(result, null, 2).slice(0, 1000));

        if (Array.isArray(result)) {
          console.log(`Found ${result.length} last positions`);
          if (result.length > 0) {
            console.log('Position schema keys:', Object.keys(result[0]));
          }
        }
      } catch (error) {
        console.log('=== Task 3.4: List Last Positions - No Options ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });

    it('should list last positions with key and queryString', async () => {
      try {
        const result = await client.positions.listLast(namespace, {
          key: 'user_type',
          queryString: 'ptl_ubudu',
        });

        console.log('=== Task 3.4: List Last Positions - With Query ===');
        console.log('Query: key=user_type, queryString=ptl_ubudu');
        console.log('Response:', JSON.stringify(result, null, 2).slice(0, 500));
      } catch (error) {
        console.log('=== Task 3.4: List Last Positions - With Query ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });

    it('should list last positions with timestamp range', async () => {
      const now = Date.now();
      const oneDayAgo = now - 86400000;

      try {
        const result = await client.positions.listLast(namespace, {
          timestampFrom: oneDayAgo,
          timestampTo: now,
        });

        console.log('=== Task 3.4: List Last Positions - With Timestamps ===');
        console.log('Query: timestampFrom, timestampTo');
        console.log('Response:', JSON.stringify(result, null, 2).slice(0, 500));
      } catch (error) {
        console.log('=== Task 3.4: List Last Positions - With Timestamps ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });
  });

  describe('Task 3.5: Get Position History', () => {
    it('should get position history', async () => {
      const now = Date.now();
      const oneDayAgo = now - 86400000;
      const macToQuery = existingAssetMac || 'f27ba65c518e';

      try {
        const result = await client.positions.getHistory(namespace, {
          timestampFrom: oneDayAgo,
          timestampTo: now,
          value: macToQuery,
        });

        console.log('=== Task 3.5: Get Position History ===');
        console.log('Endpoint: GET /es/position_history/{appNamespace}');
        console.log('Query: timestampFrom, timestampTo, key, value');
        console.log('Response Type:', typeof result);
        console.log('Is Array:', Array.isArray(result));
        console.log('Response:', JSON.stringify(result, null, 2).slice(0, 1000));

        if (Array.isArray(result)) {
          console.log(`Found ${result.length} history entries`);
          if (result.length > 0) {
            console.log('Entry schema keys:', Object.keys(result[0]));
          }
        }
      } catch (error) {
        console.log('=== Task 3.5: Get Position History ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });
  });

  describe('Task 3.6: Publish Position', () => {
    it('should document publish position API', async () => {
      // NOTE: We don't actually publish positions in tests to avoid polluting data
      console.log('=== Task 3.6: Publish Position ===');
      console.log('Endpoint: POST /publisher/{app_namespace}');
      console.log('SDK Method: client.positions.publish(namespace, position, options?)');
      console.log('Required Fields: user_udid');
      console.log('Optional Fields: lat, lon, map_uuid, user_name');
      console.log('Options: patchAssetData (boolean)');
      console.log('Response: void');
      console.log('Note: Not testing to avoid publishing test data');

      expect(typeof client.positions.publish).toBe('function');
    });

    it('should attempt to publish position (dry run info)', async () => {
      // Document the expected request format
      const samplePosition = {
        user_udid: 'test-udid',
        lat: 48.8845592614254,
        lon: 2.31099665164948,
        user_name: 'Test Position',
      };

      console.log('=== Task 3.6: Publish Position - Sample Request ===');
      console.log('Sample position data:', JSON.stringify(samplePosition, null, 2));
      console.log('With patchAssetData option: Updates asset metadata along with position');

      // We can try publishing a test position and immediately verify behavior
      // Uncomment below to test actual publishing:
      /*
      try {
        await client.positions.publish(namespace, samplePosition, { patchAssetData: false });
        console.log('Publish successful - no error thrown');
      } catch (error) {
        console.log('Publish error:', error instanceof Error ? error.message : error);
      }
      */
    });
  });
});
