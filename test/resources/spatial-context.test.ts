import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpatialResource } from '../../src/resources/spatial';
import type { BaseClient } from '../../src/client/base';

describe('SpatialResource with context', () => {
  let mockClient: BaseClient;
  let resource: SpatialResource;
  const mockRequest = vi.fn();

  beforeEach(() => {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ reference_point: {}, zones: [] });
    mockClient = {
      request: mockRequest,
      raw: { GET: vi.fn(), POST: vi.fn() },
      namespace: 'default-ns',
      requireNs: vi.fn((ctx?) => ctx?.namespace ?? 'default-ns'),
      requireVenue: vi.fn(),
      requireMap: vi.fn(),
    } as unknown as BaseClient;
    resource = new SpatialResource(mockClient);
  });

  describe('zonesContainingPoint', () => {
    it('uses default namespace with point options', async () => {
      await resource.zonesContainingPoint({ lat: 48.8, lon: 2.3 });
      expect(mockClient.requireNs).toHaveBeenCalled();
    });

    it('uses explicit namespace (legacy)', async () => {
      await resource.zonesContainingPoint('explicit-ns', { lat: 48.8, lon: 2.3 });
      expect(mockRequest).toHaveBeenCalled();
    });
  });

  describe('nearestZones', () => {
    it('uses default namespace', async () => {
      await resource.nearestZones({ lat: 48.8, lon: 2.3, limit: 5 });
      expect(mockClient.requireNs).toHaveBeenCalled();
    });

    it('uses explicit namespace (legacy)', async () => {
      await resource.nearestZones('explicit-ns', { lat: 48.8, lon: 2.3, limit: 5 });
      expect(mockRequest).toHaveBeenCalled();
    });
  });

  describe('zonesWithinRadius', () => {
    it('uses default namespace', async () => {
      await resource.zonesWithinRadius({ lat: 48.8, lon: 2.3, radiusMeters: 100 });
      expect(mockClient.requireNs).toHaveBeenCalled();
    });

    it('uses explicit namespace (legacy)', async () => {
      await resource.zonesWithinRadius('explicit-ns', { lat: 48.8, lon: 2.3, radiusMeters: 100 });
      expect(mockRequest).toHaveBeenCalled();
    });
  });

  describe('nearestPois', () => {
    it('uses default namespace', async () => {
      mockRequest.mockResolvedValue({ reference_point: {}, pois: [] });
      await resource.nearestPois({ lat: 48.8, lon: 2.3 });
      expect(mockClient.requireNs).toHaveBeenCalled();
    });

    it('uses explicit namespace (legacy)', async () => {
      mockRequest.mockResolvedValue({ reference_point: {}, pois: [] });
      await resource.nearestPois('explicit-ns', { lat: 48.8, lon: 2.3 });
      expect(mockRequest).toHaveBeenCalled();
    });
  });

  describe('poisWithinRadius', () => {
    it('uses default namespace', async () => {
      mockRequest.mockResolvedValue({ reference_point: {}, pois: [] });
      await resource.poisWithinRadius({ lat: 48.8, lon: 2.3, radiusMeters: 100 });
      expect(mockClient.requireNs).toHaveBeenCalled();
    });
  });

  describe('analyzeCustomZones', () => {
    it('uses default namespace', async () => {
      await resource.analyzeCustomZones({
        lat: 48.8,
        lon: 2.3,
        customZones: [],
      });
      expect(mockClient.requireNs).toHaveBeenCalled();
    });
  });

  describe('analyzeCustomPois', () => {
    it('uses default namespace', async () => {
      mockRequest.mockResolvedValue({ reference_point: {}, pois: [] });
      await resource.analyzeCustomPois({
        lat: 48.8,
        lon: 2.3,
        customPois: [],
      });
      expect(mockClient.requireNs).toHaveBeenCalled();
    });
  });
});
