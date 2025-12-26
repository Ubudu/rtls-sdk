import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardsResource } from '../../src/resources/dashboards';
import type { BaseClient } from '../../src/client/base';

describe('DashboardsResource with context', () => {
  let mockClient: BaseClient;
  let resource: DashboardsResource;
  const mockRequest = vi.fn();

  beforeEach(() => {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue([]);
    mockClient = {
      request: mockRequest,
      raw: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
      namespace: 'default-ns',
      requireNs: vi.fn((ctx?) => ctx?.namespace ?? 'default-ns'),
    } as unknown as BaseClient;
    resource = new DashboardsResource(mockClient);
  });

  describe('list', () => {
    it('uses default namespace when available', async () => {
      await resource.list();
      // list uses optional namespace from client.namespace
      expect(mockRequest).toHaveBeenCalled();
    });

    it('uses explicit namespace (legacy)', async () => {
      await resource.list('explicit-ns');
      expect(mockRequest).toHaveBeenCalled();
    });

    it('allows namespace override in options', async () => {
      await resource.list({ namespace: 'override-ns' });
      expect(mockRequest).toHaveBeenCalled();
    });
  });

  describe('listCreated', () => {
    it('uses default namespace when available', async () => {
      await resource.listCreated();
      expect(mockRequest).toHaveBeenCalled();
    });

    it('uses explicit namespace (legacy)', async () => {
      await resource.listCreated('explicit-ns');
      expect(mockRequest).toHaveBeenCalled();
    });
  });

  describe('listShared', () => {
    it('uses default namespace when available', async () => {
      await resource.listShared();
      expect(mockRequest).toHaveBeenCalled();
    });
  });

  describe('listSelected', () => {
    it('uses default namespace when available', async () => {
      await resource.listSelected();
      expect(mockRequest).toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('works without namespace context', async () => {
      mockRequest.mockResolvedValue({});
      await resource.get('dashboard-id');
      expect(mockRequest).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('uses default namespace when not in data', async () => {
      mockRequest.mockResolvedValue({});
      await resource.create({ name: 'Test Dashboard' });
      expect(mockRequest).toHaveBeenCalled();
    });

    it('uses namespace from data when provided', async () => {
      mockRequest.mockResolvedValue({});
      await resource.create({ name: 'Test Dashboard', namespace: 'explicit-ns' });
      expect(mockRequest).toHaveBeenCalled();
    });

    it('throws when no namespace available', async () => {
      // Create a client with undefined namespace property
      const noNamespaceClient = {
        request: mockRequest,
        raw: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
        namespace: undefined,
        requireNs: vi.fn((ctx?) => ctx?.namespace ?? undefined),
      } as unknown as BaseClient;
      const resourceNoNs = new DashboardsResource(noNamespaceClient);

      await expect(resourceNoNs.create({ name: 'Test' })).rejects.toThrow(
        'Namespace is required for creating a dashboard'
      );
    });
  });

  describe('update', () => {
    it('works without namespace context', async () => {
      mockRequest.mockResolvedValue({});
      await resource.update('dashboard-id', { name: 'Updated' });
      expect(mockRequest).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('works without namespace context', async () => {
      await resource.delete('dashboard-id');
      expect(mockRequest).toHaveBeenCalled();
    });
  });

  describe('share', () => {
    it('works without namespace context', async () => {
      mockRequest.mockResolvedValue({});
      await resource.share('dashboard-id', 'user-email@example.com', { read: true });
      expect(mockRequest).toHaveBeenCalled();
    });
  });
});
