import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PositionsResource } from '../../src/resources/positions';
import type { BaseClient } from '../../src/client/base';

describe('PositionsResource with context', () => {
  let mockClient: BaseClient;
  let resource: PositionsResource;
  const mockRequest = vi.fn();

  beforeEach(() => {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue([]);
    mockClient = {
      request: mockRequest,
      raw: { GET: vi.fn(), POST: vi.fn() },
      namespace: 'default-ns',
      requireNs: vi.fn((ctx?) => ctx?.namespace ?? 'default-ns'),
      requireVenue: vi.fn(),
      requireMap: vi.fn(),
    } as unknown as BaseClient;
    resource = new PositionsResource(mockClient);
  });

  describe('listCached', () => {
    it('uses default namespace when not specified', async () => {
      await resource.listCached();
      expect(mockClient.requireNs).toHaveBeenCalled();
    });

    it('uses explicit namespace (legacy)', async () => {
      await resource.listCached('explicit-ns');
      expect(mockRequest).toHaveBeenCalled();
    });
  });

  describe('getCached', () => {
    it('uses default namespace', async () => {
      mockRequest.mockResolvedValue({});
      await resource.getCached('AA:BB:CC:DD:EE:FF');
      expect(mockClient.requireNs).toHaveBeenCalled();
    });

    it('uses explicit namespace (legacy)', async () => {
      mockRequest.mockResolvedValue({});
      await resource.getCached('explicit-ns', 'AA:BB:CC:DD:EE:FF');
      expect(mockRequest).toHaveBeenCalled();
    });
  });

  describe('getLast', () => {
    it('uses default namespace', async () => {
      mockRequest.mockResolvedValue({});
      await resource.getLast('AA:BB:CC:DD:EE:FF');
      expect(mockClient.requireNs).toHaveBeenCalled();
    });

    it('uses explicit namespace (legacy)', async () => {
      mockRequest.mockResolvedValue({});
      await resource.getLast('explicit-ns', 'AA:BB:CC:DD:EE:FF');
      expect(mockRequest).toHaveBeenCalled();
    });
  });

  describe('listLast', () => {
    it('uses default namespace with options', async () => {
      mockRequest.mockResolvedValue([]);
      await resource.listLast({ key: 'test', queryString: 'forklift' });
      expect(mockClient.requireNs).toHaveBeenCalled();
    });

    it('uses explicit namespace (legacy)', async () => {
      mockRequest.mockResolvedValue([]);
      await resource.listLast('explicit-ns', { key: 'test' });
      expect(mockRequest).toHaveBeenCalled();
    });
  });

  describe('getHistory', () => {
    it('uses default namespace with options', async () => {
      mockRequest.mockResolvedValue([]);
      await resource.getHistory({ timestampFrom: 1000, timestampTo: 2000, value: 'test-udid' });
      expect(mockClient.requireNs).toHaveBeenCalled();
    });

    it('uses explicit namespace (legacy)', async () => {
      mockRequest.mockResolvedValue([]);
      await resource.getHistory('explicit-ns', {
        timestampFrom: 1000,
        timestampTo: 2000,
        value: 'test-udid',
      });
      expect(mockRequest).toHaveBeenCalled();
    });
  });

  describe('publish', () => {
    it('uses default namespace', async () => {
      await resource.publish({ user_udid: 'test-123' });
      expect(mockClient.requireNs).toHaveBeenCalled();
    });

    it('uses explicit namespace (legacy)', async () => {
      await resource.publish('explicit-ns', { user_udid: 'test-123' });
      expect(mockRequest).toHaveBeenCalled();
    });
  });
});
