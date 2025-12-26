import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VenuesResource } from '../../src/resources/venues';
import type { BaseClient } from '../../src/client/base';

describe('VenuesResource with context', () => {
  let mockClient: BaseClient;
  let resource: VenuesResource;
  const mockRequest = vi.fn();

  beforeEach(() => {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue([]);
    mockClient = {
      request: mockRequest,
      raw: { GET: vi.fn() },
      namespace: 'default-ns',
      venueId: 100,
      mapId: 200,
      requireNs: vi.fn((ctx?) => ctx?.namespace ?? 'default-ns'),
      requireVenue: vi.fn((ctx?) => ctx?.venueId ?? 100),
      requireMap: vi.fn((ctx?) => ctx?.mapId ?? 200),
    } as unknown as BaseClient;
    resource = new VenuesResource(mockClient);
  });

  describe('list', () => {
    it('uses default namespace', async () => {
      await resource.list();
      expect(mockClient.requireNs).toHaveBeenCalled();
    });

    it('uses explicit namespace (legacy)', async () => {
      await resource.list('explicit-ns');
      expect(mockRequest).toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('uses default namespace and venueId', async () => {
      mockRequest.mockResolvedValue({});
      await resource.get();
      expect(mockClient.requireNs).toHaveBeenCalled();
      expect(mockClient.requireVenue).toHaveBeenCalled();
    });

    it('allows venueId override in options', async () => {
      mockRequest.mockResolvedValue({});
      await resource.get({ venueId: 999 });
      expect(mockClient.requireNs).toHaveBeenCalled();
      expect(mockClient.requireVenue).toHaveBeenCalledWith({ venueId: 999 });
    });

    it('uses explicit namespace and venueId (legacy)', async () => {
      mockRequest.mockResolvedValue({});
      await resource.get('explicit-ns', 456);
      expect(mockRequest).toHaveBeenCalled();
    });
  });

  describe('listMaps', () => {
    it('uses default context', async () => {
      await resource.listMaps();
      expect(mockClient.requireNs).toHaveBeenCalled();
      expect(mockClient.requireVenue).toHaveBeenCalled();
    });
  });

  describe('listPois', () => {
    it('uses default context', async () => {
      mockRequest.mockResolvedValue({ type: 'FeatureCollection', features: [] });
      await resource.listPois();
      expect(mockClient.requireNs).toHaveBeenCalled();
      expect(mockClient.requireVenue).toHaveBeenCalled();
    });
  });

  describe('listMapPois', () => {
    it('uses default context including mapId', async () => {
      mockRequest.mockResolvedValue({ type: 'FeatureCollection', features: [] });
      await resource.listMapPois();
      expect(mockClient.requireNs).toHaveBeenCalled();
      expect(mockClient.requireVenue).toHaveBeenCalled();
      expect(mockClient.requireMap).toHaveBeenCalled();
    });

    it('uses explicit namespace, venueId, and mapId (legacy)', async () => {
      mockRequest.mockResolvedValue({ type: 'FeatureCollection', features: [] });
      await resource.listMapPois('explicit-ns', 456, 789);
      expect(mockRequest).toHaveBeenCalled();
    });
  });

  describe('listPaths', () => {
    it('uses default context', async () => {
      mockRequest.mockResolvedValue({ type: 'FeatureCollection', features: [] });
      await resource.listPaths();
      expect(mockClient.requireNs).toHaveBeenCalled();
      expect(mockClient.requireVenue).toHaveBeenCalled();
    });
  });
});
