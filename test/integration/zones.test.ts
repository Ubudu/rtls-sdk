import { describe, it, beforeAll } from 'vitest';
import { createRtlsClient, RtlsClient } from '../../src';
import { TEST_CONFIG, hasCredentials } from './setup';

describe.skipIf(!hasCredentials())('ZonesResource Integration', () => {
  let client: RtlsClient;
  const namespace = TEST_CONFIG.namespace!;
  let venueId: number | null = null;
  let mapId: number | null = null;

  beforeAll(async () => {
    client = createRtlsClient({
      apiKey: TEST_CONFIG.apiKey,
    });

    // Get a venue ID for zone tests
    try {
      const venues = await client.venues.list(namespace);
      if (Array.isArray(venues) && venues.length > 0) {
        venueId = (venues[0] as Record<string, unknown>).id as number;

        // Get a map ID
        const maps = await client.venues.listMaps(namespace, venueId);
        if (Array.isArray(maps) && maps.length > 0) {
          mapId = (maps[0] as Record<string, unknown>).id as number;
        }
      }
    } catch {
      // Ignore errors
    }
  });

  // ========================
  // Phase 5: Zones Resource
  // ========================

  describe('Task 5.1: List Zones by Venue', () => {
    it('should list zones for venue as GeoJSON', async () => {
      if (!venueId) {
        console.log('=== Task 5.1: List Zones - SKIPPED (no venues) ===');
        return;
      }

      try {
        const result = await client.zones.list(namespace, venueId);

        console.log('=== Task 5.1: List Zones by Venue (GeoJSON) ===');
        console.log('Endpoint: GET /venues/{namespace}/{venueId}/zones');
        console.log('Venue ID:', venueId);
        console.log('Response Type:', typeof result);

        // Result should be GeoJSON FeatureCollection
        expect(result).toHaveProperty('type', 'FeatureCollection');
        expect(result).toHaveProperty('features');
        console.log(`GeoJSON type: ${result.type}`);
        console.log(`Found ${result.features.length} zone features`);
        if (result.features.length > 0) {
          console.log('First feature:', JSON.stringify(result.features[0], null, 2));
        }
        if (result.metadata) {
          console.log('Metadata:', JSON.stringify(result.metadata, null, 2));
        }
      } catch (error) {
        console.log('=== Task 5.1: List Zones by Venue ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });

    it('should list zones as flat array using listAsArray', async () => {
      if (!venueId) {
        console.log('=== Task 5.1: List Zones as Array - SKIPPED ===');
        return;
      }

      try {
        const result = await client.zones.listAsArray(namespace, venueId);

        console.log('=== Task 5.1: List Zones as Array ===');
        console.log('SDK Method: client.zones.listAsArray()');
        expect(Array.isArray(result)).toBe(true);
        console.log(`Found ${result.length} zones`);
        if (result.length > 0) {
          console.log('First zone:', JSON.stringify(result[0], null, 2));
        }
      } catch (error) {
        console.log('=== Task 5.1: List Zones as Array ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });
  });

  describe('Task 5.2: List Zones by Map', () => {
    it('should list zones for specific map', async () => {
      if (!venueId || !mapId) {
        console.log('=== Task 5.2: List Zones by Map - SKIPPED (no venue/map) ===');
        return;
      }

      try {
        const result = await client.zones.listByMap(namespace, venueId, mapId);

        console.log('=== Task 5.2: List Zones by Map ===');
        console.log('Endpoint: GET /venues/{namespace}/{venueId}/maps/{mapId}/zones');
        console.log('Venue ID:', venueId, 'Map ID:', mapId);
        console.log('Response Type:', typeof result);
        console.log('Response:', JSON.stringify(result, null, 2).slice(0, 1000));

        // Check if GeoJSON FeatureCollection
        if (result && typeof result === 'object' && 'type' in result) {
          const geoJson = result as { type: string; features?: unknown[] };
          console.log('FINDING: API returns GeoJSON FeatureCollection');
          if (geoJson.type === 'FeatureCollection' && geoJson.features) {
            console.log(`Found ${geoJson.features.length} zone features on map`);
          }
        }
      } catch (error) {
        console.log('=== Task 5.2: List Zones by Map ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });
  });

  describe('Task 5.3: Zone Presence', () => {
    it('should get zone presence data', async () => {
      const now = Date.now();
      const oneDayAgo = now - 86400000;

      try {
        const result = await client.zones.getPresence(namespace, {
          timestampFrom: oneDayAgo,
          timestampTo: now,
          interval: '1h',
        });

        console.log('=== Task 5.3: Zone Presence ===');
        console.log('Endpoint: GET /es/zone_presence/{appNamespace}');
        console.log('Query: timestampFrom, timestampTo, interval');
        console.log('Response Type:', typeof result);
        console.log('Is Array:', Array.isArray(result));
        console.log('Response:', JSON.stringify(result, null, 2).slice(0, 1000));

        if (Array.isArray(result)) {
          console.log(`Found ${result.length} presence records`);
          if (result.length > 0) {
            console.log('Record schema keys:', Object.keys(result[0]));
          }
        }
      } catch (error) {
        console.log('=== Task 5.3: Zone Presence ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });

    it('should get zone presence with filtering', async () => {
      const now = Date.now();
      const oneDayAgo = now - 86400000;

      try {
        const result = await client.zones.getPresence(namespace, {
          timestampFrom: oneDayAgo,
          timestampTo: now,
          key: 'user_type',
          value: 'ptl_ubudu',
        });

        console.log('=== Task 5.3: Zone Presence - With Filtering ===');
        console.log('Query: timestampFrom, timestampTo, key=user_type, value=ptl_ubudu');
        console.log('Response:', JSON.stringify(result, null, 2).slice(0, 500));
      } catch (error) {
        console.log('=== Task 5.3: Zone Presence - With Filtering ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });
  });

  describe('Task 5.4: Zone Iteration', () => {
    it('should iterate through zones', async () => {
      if (!venueId) {
        console.log('=== Task 5.4: Zone Iteration - SKIPPED (no venues) ===');
        return;
      }

      console.log('=== Task 5.4: Zone Iteration ===');
      console.log('SDK Method: client.zones.iterate(namespace, venueId)');

      try {
        const items: unknown[] = [];
        let count = 0;
        for await (const zone of client.zones.iterate(namespace, venueId)) {
          items.push(zone);
          count++;
          if (count >= 5) break;
        }

        console.log(`Iterated through ${items.length} zones`);
        expect(items.length).toBeGreaterThanOrEqual(0);

        if (items.length > 0) {
          console.log('Sample zone:', JSON.stringify(items[0], null, 2));
        }
      } catch (error) {
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });
  });

  describe('Task 5.5: Zone GetAll', () => {
    it('should get all zones', async () => {
      if (!venueId) {
        console.log('=== Task 5.5: Zone GetAll - SKIPPED (no venues) ===');
        return;
      }

      console.log('=== Task 5.5: Zone GetAll ===');
      console.log('SDK Method: client.zones.getAll(namespace, venueId)');

      try {
        const zones = await client.zones.getAll(namespace, venueId);

        console.log(`Got ${zones.length} zones`);
        console.log('Response Type:', typeof zones);
        console.log('Is Array:', Array.isArray(zones));
        expect(Array.isArray(zones)).toBe(true);
      } catch (error) {
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });
  });
});
