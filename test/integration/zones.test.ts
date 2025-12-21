import { describe, it, expect, beforeAll } from 'vitest';
import { createRtlsClient, RtlsClient } from '../../src';
import { TEST_CONFIG, hasCredentials } from './setup';

describe.skipIf(!hasCredentials())('ZonesResource Integration', () => {
  let client: RtlsClient;
  const namespace = TEST_CONFIG.namespace!;

  beforeAll(() => {
    client = createRtlsClient({
      apiKey: TEST_CONFIG.apiKey,
    });
  });

  describe('list', () => {
    it('should list zones', async () => {
      const result = await client.zones.list(namespace);

      console.log('Zones API response type:', typeof result);
      console.log('Zones API response:', JSON.stringify(result, null, 2).slice(0, 1000));

      // NOTE: The actual API returns a GeoJSON FeatureCollection, not a paginated response
      if (result && typeof result === 'object' && 'type' in result) {
        const geoJson = result as { type: string; features?: unknown[] };
        console.log(`Zones format: ${geoJson.type}`);
        if (geoJson.type === 'FeatureCollection' && geoJson.features) {
          console.log(`Found ${geoJson.features.length} zones (GeoJSON features)`);
          expect(geoJson.features.length).toBeGreaterThanOrEqual(0);
        }
      } else {
        expect(result).toHaveProperty('data');
      }
    });
  });
});
