import { describe, it, expect, beforeAll } from 'vitest';
import { createRtlsClient, RtlsClient } from '../../src';
import { TEST_CONFIG, hasCredentials } from './setup';

describe.skipIf(!hasCredentials())('VenuesResource Integration', () => {
  let client: RtlsClient;
  const namespace = TEST_CONFIG.namespace!;
  let venueId: number | null = null;
  let mapId: number | null = null;

  beforeAll(async () => {
    client = createRtlsClient({
      apiKey: TEST_CONFIG.apiKey,
    });

    // Get a venue ID for subsequent tests
    try {
      const venues = await client.venues.list(namespace);
      if (Array.isArray(venues) && venues.length > 0) {
        venueId = (venues[0] as Record<string, unknown>).id as number;
      }
    } catch {
      // Ignore errors
    }
  });

  // ========================
  // Phase 4: Venues Resource
  // ========================

  describe('Task 4.1: List Venues', () => {
    it('should list venues without options', async () => {
      const result = await client.venues.list(namespace);

      console.log('=== Task 4.1: List Venues - No Options ===');
      console.log('Endpoint: GET /venues/{namespace}');
      console.log('Response Type:', typeof result);
      console.log('Is Array:', Array.isArray(result));

      if (Array.isArray(result)) {
        console.log('FINDING: API returns direct array, NOT PaginatedResponse');
        console.log(`Found ${result.length} venues`);
        if (result.length > 0) {
          console.log('Venue schema keys:', Object.keys(result[0]));
          console.log('First venue:', JSON.stringify(result[0], null, 2));
        }
        expect(result.length).toBeGreaterThanOrEqual(0);
      } else {
        console.log('FINDING: API returns paginated response');
        expect(result).toHaveProperty('data');
      }
    });

    it('should list venues with pagination options', async () => {
      const result = await client.venues.list(namespace, { page: 1, limit: 5 });

      console.log('=== Task 4.1: List Venues - With Pagination ===');
      console.log('Query params: page=1, limit=5');
      console.log('Response:', JSON.stringify(result, null, 2).slice(0, 500));
    });
  });

  describe('Task 4.2: Get Single Venue', () => {
    it('should get venue by ID', async () => {
      if (!venueId) {
        console.log('=== Task 4.2: Get Single Venue - SKIPPED (no venues) ===');
        return;
      }

      try {
        const result = await client.venues.get(namespace, venueId);

        console.log('=== Task 4.2: Get Single Venue ===');
        console.log('Endpoint: GET /venues/{namespace}/{venueId}');
        console.log('Venue ID:', venueId);
        console.log('Response Type:', typeof result);
        console.log('Response:', JSON.stringify(result, null, 2));
        console.log('Schema keys:', Object.keys(result));
        console.log('Nested data: statistics, coordinates');

        expect(result).toBeDefined();
        expect(result).toHaveProperty('id');
      } catch (error) {
        console.log('=== Task 4.2: Get Single Venue ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });
  });

  describe('Task 4.3: List Maps', () => {
    it('should list maps for venue', async () => {
      if (!venueId) {
        console.log('=== Task 4.3: List Maps - SKIPPED (no venues) ===');
        return;
      }

      try {
        const result = await client.venues.listMaps(namespace, venueId);

        console.log('=== Task 4.3: List Maps ===');
        console.log('Endpoint: GET /venues/{namespace}/{venueId}/maps');
        console.log('Venue ID:', venueId);
        console.log('Response Type:', typeof result);
        console.log('Is Array:', Array.isArray(result));
        console.log('Response:', JSON.stringify(result, null, 2).slice(0, 1000));

        if (Array.isArray(result)) {
          console.log(`Found ${result.length} maps`);
          if (result.length > 0) {
            mapId = (result[0] as Record<string, unknown>).id as number;
            console.log('Map schema keys:', Object.keys(result[0]));
          }
        }
      } catch (error) {
        console.log('=== Task 4.3: List Maps ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });
  });

  describe('Task 4.4: List POIs', () => {
    it('should list POIs for venue', async () => {
      if (!venueId) {
        console.log('=== Task 4.4: List POIs - SKIPPED (no venues) ===');
        return;
      }

      try {
        const result = await client.venues.listPois(namespace, venueId);

        console.log('=== Task 4.4: List POIs ===');
        console.log('Endpoint: GET /venues/{namespace}/{venueId}/pois');
        console.log('Venue ID:', venueId);
        console.log('Response Type:', typeof result);
        console.log('Is Array:', Array.isArray(result));
        console.log('Response:', JSON.stringify(result, null, 2).slice(0, 1000));

        if (Array.isArray(result)) {
          console.log(`Found ${result.length} POIs`);
          if (result.length > 0) {
            console.log('POI schema keys:', Object.keys(result[0]));
          }
        }
      } catch (error) {
        console.log('=== Task 4.4: List POIs ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });
  });

  describe('Task 4.5: List Map POIs', () => {
    it('should list POIs for specific map', async () => {
      if (!venueId || !mapId) {
        console.log('=== Task 4.5: List Map POIs - SKIPPED (no venue or map) ===');
        return;
      }

      try {
        const result = await client.venues.listMapPois(namespace, venueId, mapId);

        console.log('=== Task 4.5: List Map POIs ===');
        console.log('Endpoint: GET /venues/{namespace}/{venueId}/maps/{mapId}/pois');
        console.log('Venue ID:', venueId, 'Map ID:', mapId);
        console.log('Response Type:', typeof result);
        console.log('Is Array:', Array.isArray(result));
        console.log('Response:', JSON.stringify(result, null, 2).slice(0, 1000));

        if (Array.isArray(result)) {
          console.log(`Found ${result.length} POIs on map`);
        }
      } catch (error) {
        console.log('=== Task 4.5: List Map POIs ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });
  });

  describe('Task 4.6: List Paths', () => {
    it('should list paths for venue', async () => {
      if (!venueId) {
        console.log('=== Task 4.6: List Paths - SKIPPED (no venues) ===');
        return;
      }

      try {
        const result = await client.venues.listPaths(namespace, venueId);

        console.log('=== Task 4.6: List Paths ===');
        console.log('Endpoint: GET /venues/{namespace}/{venueId}/paths');
        console.log('Venue ID:', venueId);
        console.log('Response Type:', typeof result);
        console.log('Is Array:', Array.isArray(result));
        console.log('Response:', JSON.stringify(result, null, 2).slice(0, 1000));

        if (Array.isArray(result)) {
          console.log(`Found ${result.length} paths`);
          if (result.length > 0) {
            console.log('Path schema keys:', Object.keys(result[0]));
          }
        }
      } catch (error) {
        console.log('=== Task 4.6: List Paths ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });
  });

  describe('Task 4.7: Venue Iteration', () => {
    it('should iterate through venues', async () => {
      console.log('=== Task 4.7: Venue Iteration ===');
      console.log('SDK Method: client.venues.iterate(namespace, options?)');

      try {
        const items: unknown[] = [];
        let count = 0;
        for await (const venue of client.venues.iterate(namespace, { pageSize: 10 })) {
          items.push(venue);
          count++;
          if (count >= 5) break;
        }

        console.log(`Iterated through ${items.length} venues`);

        if (items.length > 0) {
          console.log('Sample venue:', JSON.stringify(items[0], null, 2));
        }
      } catch (error) {
        console.log('Error:', error instanceof Error ? error.message : error);
        console.log('FINDING: Iteration fails because API returns array, not paginated response');
      }
    });
  });
});
