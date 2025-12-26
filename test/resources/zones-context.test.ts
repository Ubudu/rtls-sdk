import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZonesResource } from '../../src/resources/zones';
import type { BaseClient } from '../../src/client/base';

describe('ZonesResource with context', () => {
  let mockClient: BaseClient;
  let resource: ZonesResource;
  const mockRequest = vi.fn();

  beforeEach(() => {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ type: 'FeatureCollection', features: [] });
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
    resource = new ZonesResource(mockClient);
  });

  describe('list', () => {
    it('uses default namespace and venueId', async () => {
      await resource.list();
      expect(mockClient.requireNs).toHaveBeenCalled();
      expect(mockClient.requireVenue).toHaveBeenCalled();
    });

    it('allows venueId override in options', async () => {
      await resource.list({ venueId: 999 });
      expect(mockClient.requireNs).toHaveBeenCalled();
      expect(mockClient.requireVenue).toHaveBeenCalledWith({ venueId: 999 });
    });

    it('uses explicit namespace and venueId (legacy)', async () => {
      await resource.list('explicit-ns', 456);
      expect(mockRequest).toHaveBeenCalled();
    });
  });

  describe('listAsArray', () => {
    it('uses default context', async () => {
      await resource.listAsArray();
      expect(mockClient.requireNs).toHaveBeenCalled();
      expect(mockClient.requireVenue).toHaveBeenCalled();
    });
  });

  describe('listByMap', () => {
    it('uses default context including mapId', async () => {
      await resource.listByMap();
      expect(mockClient.requireNs).toHaveBeenCalled();
      expect(mockClient.requireVenue).toHaveBeenCalled();
      expect(mockClient.requireMap).toHaveBeenCalled();
    });

    it('uses explicit namespace, venueId, and mapId (legacy)', async () => {
      await resource.listByMap('explicit-ns', 456, 789);
      expect(mockRequest).toHaveBeenCalled();
    });
  });

  describe('getPresence', () => {
    it('uses default namespace with options', async () => {
      mockRequest.mockResolvedValue([]);
      await resource.getPresence({ timestampFrom: 1000, timestampTo: 2000 });
      expect(mockClient.requireNs).toHaveBeenCalled();
    });
  });
});
