import { describe, it, expect, vi } from 'vitest';
import { buildQueryParams, paginate, collectAll } from '../../src/utils';

describe('pagination utilities', () => {
  describe('buildQueryParams', () => {
    it('should build empty params for undefined options', () => {
      expect(buildQueryParams()).toEqual({});
      expect(buildQueryParams(undefined)).toEqual({});
    });

    it('should build pagination params', () => {
      const params = buildQueryParams({ page: 2, limit: 50 });

      expect(params.page).toBe('2');
      expect(params.limit).toBe('50');
    });

    it('should build sort params', () => {
      const params = buildQueryParams({ sort: 'name:asc' });
      expect(params.sort).toBe('name:asc');

      const arrayParams = buildQueryParams({ sort: ['name:asc', 'date:desc'] });
      expect(arrayParams.sort).toBe('name:asc,date:desc');
    });

    it('should build fields params', () => {
      const params = buildQueryParams({ fields: ['name', 'mac_address'] });
      expect(params.fields).toBe('name,mac_address');
    });

    it('should include filter operators', () => {
      const params = buildQueryParams({
        'name:contains': 'test',
        'status:eq': 'active',
      });

      expect(params['name:contains']).toBe('test');
      expect(params['status:eq']).toBe('active');
    });
  });

  describe('paginate', () => {
    it('should iterate through pages', async () => {
      const mockFetcher = vi
        .fn()
        .mockResolvedValueOnce({
          data: [{ id: 1 }, { id: 2 }],
          hasNext: true,
        })
        .mockResolvedValueOnce({
          data: [{ id: 3 }],
          hasNext: false,
        });

      const items: { id: number }[] = [];
      for await (const item of paginate(mockFetcher, { pageSize: 2 })) {
        items.push(item as { id: number });
      }

      expect(items).toHaveLength(3);
      expect(mockFetcher).toHaveBeenCalledTimes(2);
    });
  });

  describe('collectAll', () => {
    it('should collect all items', async () => {
      const mockFetcher = vi
        .fn()
        .mockResolvedValueOnce({
          data: [{ id: 1 }, { id: 2 }],
          hasNext: true,
        })
        .mockResolvedValueOnce({
          data: [{ id: 3 }],
          hasNext: false,
        });

      const items = await collectAll(mockFetcher);

      expect(items).toHaveLength(3);
    });

    it('should respect maxItems', async () => {
      const mockFetcher = vi.fn().mockResolvedValue({
        data: [{ id: 1 }, { id: 2 }, { id: 3 }],
        hasNext: true,
      });

      const items = await collectAll(mockFetcher, { maxItems: 2 });

      expect(items).toHaveLength(2);
    });
  });
});
