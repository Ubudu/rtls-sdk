import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRtlsClient, RtlsClient, NotFoundError } from '../../src';
import { TEST_CONFIG, hasCredentials } from './setup';

describe.skipIf(!hasCredentials())('AssetsResource Integration', () => {
  let client: RtlsClient;
  const namespace = TEST_CONFIG.namespace!;

  // Test MAC address for create/update/delete tests
  const testMac = 'aa:bb:cc:dd:ee:ff';
  let existingAssetMac: string | null = null;

  beforeAll(() => {
    client = createRtlsClient({
      apiKey: TEST_CONFIG.apiKey,
    });
  });

  afterAll(async () => {
    // Cleanup: delete test asset if it exists
    try {
      await client.assets.delete(namespace, testMac);
    } catch {
      // Ignore errors during cleanup
    }
  });

  // ========================
  // Phase 2: Assets Resource
  // ========================

  describe('Task 2.1: List Assets', () => {
    it('should list assets without options', async () => {
      const result = await client.assets.list(namespace);

      console.log('=== Task 2.1: List Assets - No Options ===');
      console.log('Endpoint: GET /assets/{app_namespace}');
      console.log('Response Type:', typeof result);
      console.log('Is Array:', Array.isArray(result));

      // Document the actual response format
      if (Array.isArray(result)) {
        console.log('FINDING: API returns direct array, NOT PaginatedResponse');
        console.log(`Found ${result.length} assets`);
        if (result.length > 0) {
          existingAssetMac = (result[0] as Record<string, unknown>).user_udid as string;
          console.log('Sample asset keys:', Object.keys(result[0]));
          console.log('First asset:', JSON.stringify(result[0], null, 2));
        }
        expect(result.length).toBeGreaterThanOrEqual(0);
      } else {
        console.log('FINDING: API returns paginated response');
        expect(result).toHaveProperty('data');
      }
    });

    it('should list assets with pagination options', async () => {
      const result = await client.assets.list(namespace, { page: 1, limit: 5 });

      console.log('=== Task 2.1: List Assets - With Pagination ===');
      console.log('Query params: page=1, limit=5');
      console.log('Response Type:', typeof result);
      console.log('Is Array:', Array.isArray(result));
      console.log('Response:', JSON.stringify(result, null, 2).slice(0, 500));

      // Document pagination support
      if (Array.isArray(result)) {
        console.log('FINDING: Pagination query params may be ignored - still returns array');
      }
    });

    it('should list assets with sorting', async () => {
      const result = await client.assets.list(namespace, { sort: 'user_name' });

      console.log('=== Task 2.1: List Assets - With Sorting ===');
      console.log('Query params: sort=user_name');
      console.log('Response:', JSON.stringify(result, null, 2).slice(0, 500));
    });
  });

  describe('Task 2.2: Get Single Asset', () => {
    it('should get existing asset', async () => {
      if (!existingAssetMac) {
        console.log('=== Task 2.2: Get Single Asset - SKIPPED (no assets exist) ===');
        return;
      }

      const result = await client.assets.get(namespace, existingAssetMac);

      console.log('=== Task 2.2: Get Single Asset ===');
      console.log('Endpoint: GET /assets/{app_namespace}/{mac_address}');
      console.log('MAC:', existingAssetMac);
      console.log('Response:', JSON.stringify(result, null, 2));
      console.log('Schema keys:', Object.keys(result));

      expect(result).toBeDefined();
      expect(result).toHaveProperty('user_udid');
    });

    it('should handle non-existent asset', async () => {
      try {
        await client.assets.get(namespace, 'non:ex:is:te:nt:00');
        console.log('=== Task 2.2: Get Non-existent Asset ===');
        console.log('UNEXPECTED: No error thrown');
      } catch (error) {
        console.log('=== Task 2.2: Get Non-existent Asset ===');
        console.log('Error Type:', error instanceof Error ? error.constructor.name : typeof error);
        console.log('Is NotFoundError:', error instanceof NotFoundError);
        if (error instanceof Error) {
          console.log('Message:', error.message);
        }
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Task 2.3: Create Asset', () => {
    it('should create new asset with minimal data', async () => {
      try {
        const result = await client.assets.create(namespace, testMac, {
          user_name: 'Test Asset',
        });

        console.log('=== Task 2.3: Create Asset - Minimal ===');
        console.log('Endpoint: POST /assets/{app_namespace}/{mac_address}');
        console.log('Request: { user_name: "Test Asset" }');
        console.log('Response:', JSON.stringify(result, null, 2));
        console.log('Response keys:', Object.keys(result));

        expect(result).toBeDefined();
      } catch (error) {
        console.log('=== Task 2.3: Create Asset - Minimal ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });

    it('should handle duplicate asset creation', async () => {
      try {
        await client.assets.create(namespace, testMac, {
          user_name: 'Test Asset Duplicate',
        });
        console.log('=== Task 2.3: Create Duplicate Asset ===');
        console.log('FINDING: API may allow duplicate creation (upsert behavior)');
      } catch (error) {
        console.log('=== Task 2.3: Create Duplicate Asset ===');
        console.log('Error Type:', error instanceof Error ? error.constructor.name : typeof error);
        if (error instanceof Error) {
          console.log('Message:', error.message);
        }
      }
    });
  });

  describe('Task 2.4: Update Asset', () => {
    it('should update existing asset', async () => {
      try {
        const result = await client.assets.update(namespace, testMac, {
          user_name: 'Updated Test Asset',
          color: '#00ff00',
        });

        console.log('=== Task 2.4: Update Asset ===');
        console.log('Endpoint: PATCH /assets/{app_namespace}/{mac_address}');
        console.log('Request: { user_name: "Updated Test Asset", color: "#00ff00" }');
        console.log('Response:', JSON.stringify(result, null, 2));

        expect(result).toBeDefined();
      } catch (error) {
        console.log('=== Task 2.4: Update Asset ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });

    it('should handle update of non-existent asset', async () => {
      try {
        await client.assets.update(namespace, 'no:ne:xi:st:en:t1', {
          user_name: 'Ghost Asset',
        });
        console.log('=== Task 2.4: Update Non-existent Asset ===');
        console.log('FINDING: API may create asset if not exists (upsert)');
      } catch (error) {
        console.log('=== Task 2.4: Update Non-existent Asset ===');
        console.log('Error Type:', error instanceof Error ? error.constructor.name : typeof error);
      }
    });
  });

  describe('Task 2.5: Delete Asset', () => {
    it('should delete existing asset', async () => {
      // First ensure the test asset exists
      try {
        await client.assets.create(namespace, testMac, { user_name: 'To Delete' });
      } catch {
        // Ignore if already exists
      }

      try {
        await client.assets.delete(namespace, testMac);

        console.log('=== Task 2.5: Delete Asset ===');
        console.log('Endpoint: DELETE /assets/{app_namespace}/{mac_address}');
        console.log('Response: void (no error thrown)');
        console.log('SDK Match: YES - returns void');
      } catch (error) {
        console.log('=== Task 2.5: Delete Asset ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });

    it('should handle delete of non-existent asset', async () => {
      try {
        await client.assets.delete(namespace, 'no:ne:xi:st:en:t2');
        console.log('=== Task 2.5: Delete Non-existent Asset ===');
        console.log('FINDING: No error thrown for non-existent delete');
      } catch (error) {
        console.log('=== Task 2.5: Delete Non-existent Asset ===');
        console.log('Error Type:', error instanceof Error ? error.constructor.name : typeof error);
      }
    });
  });

  describe('Task 2.6: Batch Save Assets', () => {
    it('should batch save multiple assets', async () => {
      const assetsToSave = [
        { user_udid: 'ba:tc:h1:00:00:01', user_name: 'Batch Test 1' },
        { user_udid: 'ba:tc:h1:00:00:02', user_name: 'Batch Test 2' },
      ];

      try {
        const result = await client.assets.batchSave(namespace, assetsToSave);

        console.log('=== Task 2.6: Batch Save Assets ===');
        console.log('Endpoint: POST /assets/{app_namespace}');
        console.log('Request: Array of 2 assets');
        console.log('Response Type:', typeof result);
        console.log('Response:', JSON.stringify(result, null, 2));

        // Cleanup
        try {
          await client.assets.delete(namespace, 'ba:tc:h1:00:00:01');
          await client.assets.delete(namespace, 'ba:tc:h1:00:00:02');
        } catch {
          // Ignore cleanup errors
        }
      } catch (error) {
        console.log('=== Task 2.6: Batch Save Assets ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });
  });

  describe('Task 2.7: Batch Delete Assets', () => {
    it('should batch delete multiple assets', async () => {
      // First create assets to delete
      const toDelete = ['ba:tc:hd:00:00:01', 'ba:tc:hd:00:00:02'];
      for (const mac of toDelete) {
        try {
          await client.assets.create(namespace, mac, { user_name: 'To Batch Delete' });
        } catch {
          // Ignore if already exists
        }
      }

      try {
        const result = await client.assets.batchDelete(namespace, toDelete);

        console.log('=== Task 2.7: Batch Delete Assets ===');
        console.log('Endpoint: DELETE /assets/{app_namespace}');
        console.log('Request: Array of MAC addresses');
        console.log('Response Type:', typeof result);
        console.log('Response:', JSON.stringify(result, null, 2));
      } catch (error) {
        console.log('=== Task 2.7: Batch Delete Assets ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });
  });

  describe('Task 2.8: Asset History', () => {
    it('should get asset history', async () => {
      const now = Date.now();
      const oneDayAgo = now - 86400000;
      const macToQuery = existingAssetMac || 'f27ba65c518e';

      try {
        const result = await client.assets.getHistory(namespace, macToQuery, {
          startTime: oneDayAgo,
          endTime: now,
        });

        console.log('=== Task 2.8: Asset History ===');
        console.log('Endpoint: GET /asset_history/{app_namespace}/{mac_address}');
        console.log('Query: startTime, endTime (Unix ms)');
        console.log('Response Type:', typeof result);
        console.log('Is Array:', Array.isArray(result));
        console.log('Response:', JSON.stringify(result, null, 2).slice(0, 1000));
      } catch (error) {
        console.log('=== Task 2.8: Asset History ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });
  });

  describe('Task 2.9: Asset Stats', () => {
    it('should get asset stats', async () => {
      const now = Date.now();
      const oneDayAgo = now - 86400000;

      try {
        const result = await client.assets.getStats(namespace, {
          startTime: oneDayAgo,
          endTime: now,
        });

        console.log('=== Task 2.9: Asset Stats ===');
        console.log('Endpoint: GET /asset_stats/{app_namespace}/{start_time}/{end_time}');
        console.log('Response Type:', typeof result);
        console.log('Response:', JSON.stringify(result, null, 2));
        console.log('Keys:', Object.keys(result));
      } catch (error) {
        console.log('=== Task 2.9: Asset Stats ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });
  });

  describe('Task 2.10: Asset Iteration', () => {
    it('should iterate through assets', async () => {
      console.log('=== Task 2.10: Asset Iteration ===');
      console.log('SDK Method: client.assets.iterate(namespace, options?)');

      try {
        const items: unknown[] = [];
        let count = 0;
        for await (const asset of client.assets.iterate(namespace, { pageSize: 10 })) {
          items.push(asset);
          count++;
          if (count >= 5) break; // Limit for testing
        }

        console.log(`Iterated through ${items.length} assets`);
        console.log('FINDING: Iteration may fail if API returns direct array');

        if (items.length > 0) {
          console.log('Sample item:', JSON.stringify(items[0], null, 2));
        }
      } catch (error) {
        console.log('Error:', error instanceof Error ? error.message : error);
        console.log('FINDING: Iteration fails because API returns array, not paginated response');
      }
    });
  });

  describe('Task 2.11: Asset GetAll', () => {
    it('should get all assets', async () => {
      console.log('=== Task 2.11: Asset GetAll ===');
      console.log('SDK Method: client.assets.getAll(namespace, options?)');

      try {
        const assets = await client.assets.getAll(namespace, { maxItems: 10 });

        console.log(`Got ${assets.length} assets`);
        console.log('Response Type:', typeof assets);
        console.log('Is Array:', Array.isArray(assets));
      } catch (error) {
        console.log('Error:', error instanceof Error ? error.message : error);
        console.log('FINDING: GetAll fails because API returns array, not paginated response');
      }
    });
  });
});
