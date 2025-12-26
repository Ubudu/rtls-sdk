import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlertsResource } from '../../src/resources/alerts';
import type { BaseClient } from '../../src/client/base';

describe('AlertsResource with context', () => {
  let mockClient: BaseClient;
  let resource: AlertsResource;
  const mockRequest = vi.fn();

  beforeEach(() => {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue([]);
    mockClient = {
      request: mockRequest,
      raw: { GET: vi.fn(), POST: vi.fn() },
      namespace: 'default-ns',
      requireNs: vi.fn((ctx?) => ctx?.namespace ?? 'default-ns'),
    } as unknown as BaseClient;
    resource = new AlertsResource(mockClient);
  });

  describe('getRules', () => {
    it('uses default namespace', async () => {
      await resource.getRules();
      expect(mockClient.requireNs).toHaveBeenCalled();
    });

    it('uses explicit namespace (legacy)', async () => {
      await resource.getRules('explicit-ns');
      expect(mockRequest).toHaveBeenCalled();
    });
  });

  describe('saveRules', () => {
    it('uses default namespace', async () => {
      await resource.saveRules([{ name: 'test-rule' }]);
      expect(mockClient.requireNs).toHaveBeenCalled();
    });

    it('uses explicit namespace (legacy)', async () => {
      await resource.saveRules('explicit-ns', [{ name: 'test-rule' }]);
      expect(mockRequest).toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('uses default namespace with options', async () => {
      await resource.list({ timestampFrom: 1000, timestampTo: 2000 });
      expect(mockClient.requireNs).toHaveBeenCalled();
    });

    it('uses explicit namespace (legacy)', async () => {
      await resource.list('explicit-ns', { timestampFrom: 1000, timestampTo: 2000 });
      expect(mockRequest).toHaveBeenCalled();
    });
  });
});
