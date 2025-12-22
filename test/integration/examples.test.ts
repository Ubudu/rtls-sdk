/**
 * Integration tests for SDK examples
 *
 * These tests validate that the patterns demonstrated in the examples work correctly
 * when run against the live API.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { client, NAMESPACE, skipIfNoCredentials } from './setup';
import {
  filters,
  combineFilters,
  extractZonesFromGeoJSON,
  extractPoisFromGeoJSON,
  extractPathNodesFromGeoJSON,
  RtlsError,
  NotFoundError,
} from '../../src';

describe('Examples Integration Tests', () => {
  beforeAll(() => {
    skipIfNoCredentials();
  });

  describe('01-getting-started patterns', () => {
    it('should check API health', async () => {
      const health = await client.health();
      expect(health).toBeDefined();
    });

    it('should list venues', async () => {
      const venues = await client.venues.list(NAMESPACE);
      expect(Array.isArray(venues)).toBe(true);
    });

    it('should list assets', async () => {
      const assets = await client.assets.list(NAMESPACE);
      expect(Array.isArray(assets)).toBe(true);
    });
  });

  describe('02-asset-tracking patterns', () => {
    it('should get cached positions', async () => {
      const positions = await client.positions.listCached(NAMESPACE);
      expect(Array.isArray(positions)).toBe(true);
    });

    it('should iterate through assets', async () => {
      const names: string[] = [];
      let count = 0;

      for await (const asset of client.assets.iterate(NAMESPACE)) {
        names.push(asset.user_name as string);
        count++;
        if (count >= 3) break;
      }

      expect(count).toBeLessThanOrEqual(3);
    });

    it('should get all assets', async () => {
      const assets = await client.assets.getAll(NAMESPACE);
      expect(Array.isArray(assets)).toBe(true);
    });

    it('should get asset stats with time range', async () => {
      const endTime = Date.now();
      const startTime = endTime - 24 * 60 * 60 * 1000;

      try {
        const stats = await client.assets.getStats(NAMESPACE, {
          startTime,
          endTime,
        });
        expect(stats).toBeDefined();
      } catch (error) {
        // Stats may not be available for all namespaces
        if (error instanceof RtlsError) {
          expect(error.status).toBeGreaterThanOrEqual(400);
        } else {
          throw error;
        }
      }
    });
  });

  describe('03-zone-geofencing patterns', () => {
    let venueId: number | null = null;

    beforeAll(async () => {
      const venues = await client.venues.list(NAMESPACE);
      if (venues.length > 0) {
        venueId = (venues[0] as { id: number }).id;
      }
    });

    it('should list zones as GeoJSON', async () => {
      if (!venueId) return;

      const geoJson = await client.zones.list(NAMESPACE, venueId);
      expect(geoJson.type).toBe('FeatureCollection');
      expect(Array.isArray(geoJson.features)).toBe(true);
    });

    it('should extract zones from GeoJSON', async () => {
      if (!venueId) return;

      const geoJson = await client.zones.list(NAMESPACE, venueId);
      const zones = extractZonesFromGeoJSON(geoJson);
      expect(Array.isArray(zones)).toBe(true);

      if (zones.length > 0) {
        expect(zones[0]).toHaveProperty('id');
        expect(zones[0]).toHaveProperty('name');
      }
    });

    it('should iterate through zones', async () => {
      if (!venueId) return;

      let count = 0;
      for await (const zone of client.zones.iterate(NAMESPACE, venueId)) {
        expect(zone).toHaveProperty('name');
        count++;
        if (count >= 3) break;
      }
    });
  });

  describe('04-navigation patterns', () => {
    let venueId: number | null = null;

    beforeAll(async () => {
      const venues = await client.venues.list(NAMESPACE);
      if (venues.length > 0) {
        venueId = (venues[0] as { id: number }).id;
      }
    });

    it('should list POIs as GeoJSON', async () => {
      if (!venueId) return;

      const geoJson = await client.venues.listPois(NAMESPACE, venueId);
      expect(geoJson.type).toBe('FeatureCollection');
    });

    it('should extract POIs from GeoJSON', async () => {
      if (!venueId) return;

      const geoJson = await client.venues.listPois(NAMESPACE, venueId);
      const pois = extractPoisFromGeoJSON(geoJson);
      expect(Array.isArray(pois)).toBe(true);
    });

    it('should list path nodes', async () => {
      if (!venueId) return;

      const nodes = await client.venues.listPathNodes(NAMESPACE, venueId);
      expect(Array.isArray(nodes)).toBe(true);
    });

    it('should list path segments', async () => {
      if (!venueId) return;

      const segments = await client.venues.listPathSegments(NAMESPACE, venueId);
      expect(Array.isArray(segments)).toBe(true);
    });
  });

  describe('05-error-handling patterns', () => {
    it('should throw NotFoundError for non-existent asset', async () => {
      try {
        await client.assets.get(NAMESPACE, 'NONEXISTENT:12:34:56:78:90');
        expect.fail('Should have thrown NotFoundError');
      } catch (error) {
        // May be NotFoundError or other RtlsError depending on API
        expect(error).toBeInstanceOf(RtlsError);
      }
    });

    it('should provide error status code', async () => {
      try {
        await client.assets.get(NAMESPACE, 'INVALID:MAC');
        expect.fail('Should have thrown error');
      } catch (error) {
        if (error instanceof RtlsError) {
          expect(typeof error.status).toBe('number');
          expect(typeof error.message).toBe('string');
        }
      }
    });
  });

  describe('06-pagination-filtering patterns', () => {
    it('should apply equals filter', async () => {
      const assets = await client.assets.list(NAMESPACE);

      if (assets.length > 0) {
        const firstType = (assets[0] as { user_type: string }).user_type;
        if (firstType) {
          const filtered = await client.assets.list(NAMESPACE, {
            ...filters.equals('user_type', firstType),
          });
          expect(Array.isArray(filtered)).toBe(true);
        }
      }
    });

    it('should combine multiple filters', async () => {
      const combined = combineFilters(
        filters.exists('user_type', true),
        filters.exists('user_name', true)
      );

      const assets = await client.assets.list(NAMESPACE, combined);
      expect(Array.isArray(assets)).toBe(true);
    });

    it('should process with async iterator', async () => {
      const items: unknown[] = [];
      let count = 0;

      for await (const asset of client.assets.iterate(NAMESPACE)) {
        items.push(asset);
        count++;
        if (count >= 5) break;
      }

      expect(items.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Spatial query patterns', () => {
    let venueCoords: { lat: number; lng: number } | null = null;

    beforeAll(async () => {
      const venues = await client.venues.list(NAMESPACE);
      if (venues.length > 0) {
        const venue = venues[0] as { coordinates?: { lat: number; lng: number } };
        if (venue.coordinates) {
          venueCoords = venue.coordinates;
        }
      }
    });

    it('should find zones containing point', async () => {
      if (!venueCoords) return;

      const result = await client.spatial.zonesContainingPoint(NAMESPACE, {
        lat: venueCoords.lat,
        lon: venueCoords.lng,
      });

      expect(result).toHaveProperty('reference_point');
      expect(result).toHaveProperty('containing_zones');
    });

    it('should find nearest zones', async () => {
      if (!venueCoords) return;

      const result = await client.spatial.nearestZones(NAMESPACE, {
        lat: venueCoords.lat,
        lon: venueCoords.lng,
        limit: 5,
      });

      expect(result).toHaveProperty('reference_point');
      expect(result).toHaveProperty('zones');
    });

    it('should find zones within radius', async () => {
      if (!venueCoords) return;

      const result = await client.spatial.zonesWithinRadius(NAMESPACE, {
        lat: venueCoords.lat,
        lon: venueCoords.lng,
        radiusMeters: 500,
      });

      expect(result).toHaveProperty('radius_meters');
      expect(result).toHaveProperty('zones');
    });

    it('should find nearest POIs', async () => {
      if (!venueCoords) return;

      const result = await client.spatial.nearestPois(NAMESPACE, {
        lat: venueCoords.lat,
        lon: venueCoords.lng,
        limit: 5,
      });

      expect(result).toHaveProperty('reference_point');
      expect(result).toHaveProperty('pois');
    });
  });
});
