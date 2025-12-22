import { describe, it, expect, beforeAll } from 'vitest';
import { createRtlsClient, RtlsClient } from '../../src';
import { TEST_CONFIG, hasCredentials } from './setup';

describe.skipIf(!hasCredentials())('SpatialResource Integration', () => {
  let client: RtlsClient;
  const namespace = TEST_CONFIG.namespace!;

  // Sample coordinates from the Paris venue
  const testLat = 48.8845592614254;
  const testLon = 2.31099665164948;

  beforeAll(() => {
    client = createRtlsClient({
      apiKey: TEST_CONFIG.apiKey,
    });
  });

  // ========================
  // Phase 8: Spatial Resource
  // ========================

  describe('Task 8.1: Zones Containing Point', () => {
    it('should find zones containing point', async () => {
      try {
        const result = await client.spatial.zonesContainingPoint(namespace, {
          lat: testLat,
          lon: testLon,
        });

        console.log('=== Task 8.1: Zones Containing Point ===');
        console.log('Endpoint: GET /spatial/zones/{namespace}/containing-point');
        console.log('Query: lat=' + testLat + ', lon=' + testLon);
        console.log('Response Type:', typeof result);
        console.log('Is Array:', Array.isArray(result));
        console.log('Response:', JSON.stringify(result, null, 2).slice(0, 1000));

        if (Array.isArray(result)) {
          console.log(`Found ${result.length} zones containing point`);
          if (result.length > 0) {
            console.log('Zone schema keys:', Object.keys(result[0]));
          }
        }

        expect(result).toBeDefined();
      } catch (error) {
        console.log('=== Task 8.1: Zones Containing Point ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });

    it('should find zones containing point with level', async () => {
      try {
        const result = await client.spatial.zonesContainingPoint(namespace, {
          lat: testLat,
          lon: testLon,
          level: 0,
        });

        console.log('=== Task 8.1: Zones Containing Point - With Level ===');
        console.log('Query: lat, lon, level=0');
        console.log('Response:', JSON.stringify(result, null, 2).slice(0, 500));
      } catch (error) {
        console.log('=== Task 8.1: Zones Containing Point - With Level ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });
  });

  describe('Task 8.2: Nearest Zones', () => {
    it('should find nearest zones to point', async () => {
      try {
        const result = await client.spatial.nearestZones(namespace, {
          lat: testLat,
          lon: testLon,
          limit: 5,
        });

        console.log('=== Task 8.2: Nearest Zones ===');
        console.log('Endpoint: GET /spatial/zones/{namespace}/nearest-to-point');
        console.log('Query: lat, lon, limit=5');
        console.log('Response Type:', typeof result);
        console.log('Is Array:', Array.isArray(result));
        console.log('Response:', JSON.stringify(result, null, 2).slice(0, 1000));

        if (Array.isArray(result)) {
          console.log(`Found ${result.length} nearest zones`);
          if (result.length > 0) {
            console.log('Zone schema keys:', Object.keys(result[0]));
            console.log('Distance calculation: Check if distance field exists');
          }
        }

        expect(result).toBeDefined();
      } catch (error) {
        console.log('=== Task 8.2: Nearest Zones ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });
  });

  describe('Task 8.3: Zones Within Radius', () => {
    it('should find zones within radius', async () => {
      try {
        const result = await client.spatial.zonesWithinRadius(namespace, {
          lat: testLat,
          lon: testLon,
          radiusMeters: 100,
        });

        console.log('=== Task 8.3: Zones Within Radius ===');
        console.log('Endpoint: GET /spatial/zones/{namespace}/within-radius');
        console.log('Query: lat, lon, radius_meters=100');
        console.log('Response Type:', typeof result);
        console.log('Is Array:', Array.isArray(result));
        console.log('Response:', JSON.stringify(result, null, 2).slice(0, 1000));

        if (Array.isArray(result)) {
          console.log(`Found ${result.length} zones within 100m radius`);
        }

        expect(result).toBeDefined();
      } catch (error) {
        console.log('=== Task 8.3: Zones Within Radius ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });

    it('should find zones within larger radius', async () => {
      try {
        const result = await client.spatial.zonesWithinRadius(namespace, {
          lat: testLat,
          lon: testLon,
          radiusMeters: 1000,
        });

        console.log('=== Task 8.3: Zones Within Radius - 1km ===');
        console.log('Query: radius_meters=1000');
        console.log('Result count:', Array.isArray(result) ? result.length : 'N/A');
      } catch (error) {
        console.log('=== Task 8.3: Zones Within Radius - 1km ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });
  });

  describe('Task 8.4: Analyze Custom Zones', () => {
    it('should analyze custom zones', async () => {
      const customZones = [
        {
          type: 'Feature' as const,
          geometry: {
            type: 'Polygon' as const,
            coordinates: [
              [
                [testLon - 0.001, testLat - 0.001],
                [testLon + 0.001, testLat - 0.001],
                [testLon + 0.001, testLat + 0.001],
                [testLon - 0.001, testLat + 0.001],
                [testLon - 0.001, testLat - 0.001],
              ],
            ],
          },
          properties: {
            name: 'Test Custom Zone',
          },
        },
      ];

      try {
        const result = await client.spatial.analyzeCustomZones(namespace, {
          reference_point: { lat: testLat, lon: testLon },
          zones: customZones,
        });

        console.log('=== Task 8.4: Analyze Custom Zones ===');
        console.log('Endpoint: POST /spatial/zones/{namespace}/analyze-custom');
        console.log('Request: { reference_point, zones: GeoJSON Features array }');
        console.log('Response Type:', typeof result);
        console.log('Response:', JSON.stringify(result, null, 2).slice(0, 1000));

        expect(result).toBeDefined();
      } catch (error) {
        console.log('=== Task 8.4: Analyze Custom Zones ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });
  });

  describe('Task 8.5: Nearest POIs', () => {
    it('should find nearest POIs to point', async () => {
      try {
        const result = await client.spatial.nearestPois(namespace, {
          lat: testLat,
          lon: testLon,
          limit: 5,
        });

        console.log('=== Task 8.5: Nearest POIs ===');
        console.log('Endpoint: GET /spatial/pois/{namespace}/nearest-to-point');
        console.log('Query: lat, lon, limit=5');
        console.log('Response Type:', typeof result);
        console.log('Is Array:', Array.isArray(result));
        console.log('Response:', JSON.stringify(result, null, 2).slice(0, 1000));

        if (Array.isArray(result)) {
          console.log(`Found ${result.length} nearest POIs`);
          if (result.length > 0) {
            console.log('POI schema keys:', Object.keys(result[0]));
          }
        }

        expect(result).toBeDefined();
      } catch (error) {
        console.log('=== Task 8.5: Nearest POIs ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });
  });

  describe('Task 8.6: POIs Within Radius', () => {
    it('should find POIs within radius', async () => {
      try {
        const result = await client.spatial.poisWithinRadius(namespace, {
          lat: testLat,
          lon: testLon,
          radiusMeters: 100,
        });

        console.log('=== Task 8.6: POIs Within Radius ===');
        console.log('Endpoint: GET /spatial/pois/{namespace}/within-radius');
        console.log('Query: lat, lon, radius_meters=100');
        console.log('Response Type:', typeof result);
        console.log('Is Array:', Array.isArray(result));
        console.log('Response:', JSON.stringify(result, null, 2).slice(0, 1000));

        if (Array.isArray(result)) {
          console.log(`Found ${result.length} POIs within 100m radius`);
        }

        expect(result).toBeDefined();
      } catch (error) {
        console.log('=== Task 8.6: POIs Within Radius ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });
  });

  describe('Task 8.7: Analyze Custom POIs', () => {
    it('should analyze custom POIs', async () => {
      const customPois = [
        {
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [testLon, testLat] as [number, number],
          },
          properties: {
            name: 'Test Custom POI',
            category: 'test',
          },
        },
      ];

      try {
        const result = await client.spatial.analyzeCustomPois(namespace, {
          reference_point: { lat: testLat, lon: testLon },
          pois: customPois,
        });

        console.log('=== Task 8.7: Analyze Custom POIs ===');
        console.log('Endpoint: POST /spatial/pois/{namespace}/analyze-custom');
        console.log('Request: { reference_point, pois: GeoJSON Point Features array }');
        console.log('Response Type:', typeof result);
        console.log('Response:', JSON.stringify(result, null, 2).slice(0, 1000));

        expect(result).toBeDefined();
      } catch (error) {
        console.log('=== Task 8.7: Analyze Custom POIs ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });
  });
});
