import { describe, it, expect, vi } from 'vitest';
import { buildQueryParams } from '../../../../src/utils';
import {
  collectAll,
  normalizePage,
  paginate,
  paginateOffset,
  paginatePages,
  readTotalCount,
} from '../../../../src/utils/pagination';
import { AbortError, ValidationError } from '../../../../src/errors';
import {
  extractDataArray,
  isArrayResponse,
  normalizeListResponse,
} from '../../../../src/utils/response';
import type { OffsetPage, Page, PaginatedResponse } from '../../../../src/types';

describe('pagination utilities', () => {
  describe('buildQueryParams (P1 §6.5, rules of §6.3 step 2)', () => {
    it('undefined options → {}', () => {
      expect(buildQueryParams()).toEqual({});
      expect(buildQueryParams(undefined)).toEqual({});
    });

    it('B7: every defined key is forwarded, in insertion order (0.2.0 kept only page and colon keys)', () => {
      const params = buildQueryParams({
        key: 'user_udid',
        value: 'aabbccddeeff',
        level: 1,
        'a:eq': 1,
        page: 1,
      });
      expect(params).toEqual({
        key: 'user_udid',
        value: 'aabbccddeeff',
        level: '1',
        'a:eq': '1',
        page: '1',
      });
      expect(Object.keys(params)).toEqual(['key', 'value', 'level', 'a:eq', 'page']);
    });

    it('pagination params become strings', () => {
      expect(buildQueryParams({ page: 2, limit: 50 })).toEqual({ page: '2', limit: '50' });
    });

    it('sort as a string or an array (joined with a comma)', () => {
      expect(buildQueryParams({ sort: 'name:asc' })).toEqual({ sort: 'name:asc' });
      expect(buildQueryParams({ sort: ['name:asc', 'date:desc'] })).toEqual({
        sort: 'name:asc,date:desc',
      });
    });

    it('fields array joined with a comma', () => {
      expect(buildQueryParams({ fields: ['name', 'mac_address'] })).toEqual({
        fields: 'name,mac_address',
      });
    });

    it('filter operator keys keep their value', () => {
      expect(buildQueryParams({ 'name:contains': 'test', 'status:eq': 'active' })).toEqual({
        'name:contains': 'test',
        'status:eq': 'active',
      });
    });

    it('a Date becomes epoch milliseconds', () => {
      const at = new Date('2026-01-02T03:04:05.006Z');
      expect(buildQueryParams({ from: at })).toEqual({ from: String(at.getTime()) });
    });

    it("booleans become 'true' / 'false'", () => {
      expect(buildQueryParams({ active: true, archived: false })).toEqual({
        active: 'true',
        archived: 'false',
      });
    });

    it('undefined, null and empty arrays are skipped; an empty string is kept', () => {
      expect(buildQueryParams({ a: undefined, b: null, c: [], d: '' })).toEqual({ d: '' });
    });

    it.each([
      ['a plain object', { q: { nested: 1 } }],
      ['a non-finite number', { limit: NaN }],
      ['an infinite number', { limit: Infinity }],
      ['an invalid Date', { from: new Date('nope') }],
      ['an object inside an array', { tags: ['a', { b: 1 }] }],
      ['a function', { cb: () => 1 }],
    ])('%s → ValidationError with status 0, naming the key', (_name, options) => {
      expect(() => buildQueryParams(options)).toThrow(ValidationError);
      expect(() => buildQueryParams(options)).toThrow(
        expect.objectContaining({ status: 0, code: 'VALIDATION_ERROR' })
      );
    });

    it('the error names the offending key in details', () => {
      expect(() => buildQueryParams({ q: { nested: 1 } })).toThrow(
        expect.objectContaining({ details: ['q'] })
      );
    });
  });

  describe('normalizePage', () => {
    it('a bare array → a synthetic single page', () => {
      expect(normalizePage([1, 2, 3])).toEqual({
        data: [1, 2, 3],
        pagination: { page: 1, limit: 3, total: 3, totalPages: 1, hasNext: false, hasPrev: false },
      });
    });

    it('an empty array → totalPages 0', () => {
      expect(normalizePage([]).pagination).toEqual({
        page: 1,
        limit: 0,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      });
    });

    it('{ data } without pagination → a synthetic page that takes the request page and limit', () => {
      expect(normalizePage({ data: ['a'] }, { page: 2, limit: 10 })).toEqual({
        data: ['a'],
        pagination: { page: 2, limit: 10, total: 1, totalPages: 1, hasNext: false, hasPrev: true },
      });
    });

    it('an envelope is returned as is (same object)', () => {
      const envelope = {
        data: [{ id: 1 }],
        pagination: { page: 3, limit: 1, total: 9, totalPages: 9, hasNext: true, hasPrev: true },
      };
      expect(normalizePage(envelope)).toBe(envelope);
    });

    it('the flat 0.2.0 shape is nested', () => {
      expect(
        normalizePage({
          data: ['x'],
          page: 2,
          limit: 1,
          total: 5,
          totalPages: 5,
          hasNext: true,
          hasPrev: true,
        })
      ).toEqual({
        data: ['x'],
        pagination: { page: 2, limit: 1, total: 5, totalPages: 5, hasNext: true, hasPrev: true },
      });
    });

    it('a flat shape without hasNext gets hasNext false', () => {
      expect(normalizePage({ data: ['a'], page: 2 } as never).pagination).toEqual({
        page: 2,
        limit: 1,
        total: 1,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      });
    });

    it('a partial flat shape keeps what it carries and fills the rest', () => {
      expect(
        normalizePage({ data: [1, 2], hasNext: true } as never, { page: 4, limit: 2 })
      ).toEqual({
        data: [1, 2],
        pagination: { page: 4, limit: 2, total: 2, totalPages: 1, hasNext: true, hasPrev: true },
      });
    });

    it.each([null, 42, 'x', {}, { data: 'nope' }])(
      '%j → ValidationError with status 0',
      (value) => {
        expect(() => normalizePage(value as never)).toThrow(ValidationError);
        expect(() => normalizePage(value as never)).toThrow(expect.objectContaining({ status: 0 }));
      }
    );
  });

  describe('paginatePages', () => {
    const envelope = (data: number[], page: number, hasNext: boolean): Page<number> => ({
      data,
      pagination: { page, limit: 2, total: 6, totalPages: 3, hasNext, hasPrev: page > 1 },
    });

    it('a 3-page envelope → 3 calls, items in order, page and limit forwarded', async () => {
      const fetchPage = vi
        .fn<(page: number, limit: number, signal?: AbortSignal) => Promise<Page<number>>>()
        .mockResolvedValueOnce(envelope([1, 2], 1, true))
        .mockResolvedValueOnce(envelope([3, 4], 2, true))
        .mockResolvedValueOnce(envelope([5, 6], 3, false));
      await expect(collectAll(paginatePages(fetchPage, { limit: 2 }))).resolves.toEqual([
        1, 2, 3, 4, 5, 6,
      ]);
      expect(fetchPage.mock.calls.map(([page, limit]) => [page, limit])).toEqual([
        [1, 2],
        [2, 2],
        [3, 2],
      ]);
    });

    it('hasNext: false stops even when the page is full', async () => {
      const fetchPage = vi.fn(async () => envelope([1, 2], 1, false));
      await expect(collectAll(paginatePages(fetchPage, { limit: 2 }))).resolves.toEqual([1, 2]);
      expect(fetchPage).toHaveBeenCalledTimes(1);
    });

    it('a bare array shorter than limit stops; a full one continues', async () => {
      const fetchPage = vi
        .fn<(page: number, limit: number) => Promise<number[]>>()
        .mockResolvedValueOnce([1, 2])
        .mockResolvedValueOnce([3]);
      await expect(collectAll(paginatePages(fetchPage, { limit: 2 }))).resolves.toEqual([1, 2, 3]);
      expect(fetchPage).toHaveBeenCalledTimes(2);
    });

    it('an empty page stops even with hasNext: true', async () => {
      const fetchPage = vi
        .fn<(page: number, limit: number) => Promise<Page<number>>>()
        .mockResolvedValueOnce(envelope([1, 2], 1, true))
        .mockResolvedValueOnce(envelope([], 2, true))
        .mockResolvedValue(envelope([9], 3, true));
      await expect(collectAll(paginatePages(fetchPage, { limit: 2 }))).resolves.toEqual([1, 2]);
      expect(fetchPage).toHaveBeenCalledTimes(2);
    });

    it('maxPages: 2 stops after two pages', async () => {
      const fetchPage = vi.fn(async (page: number) => envelope([page], page, true));
      await expect(
        collectAll(paginatePages(fetchPage, { limit: 2, maxPages: 2 }))
      ).resolves.toEqual([1, 2]);
      expect(fetchPage).toHaveBeenCalledTimes(2);
    });

    it('startPage: 3 is forwarded; the default limit is 50', async () => {
      const fetchPage = vi.fn(async (page: number, limit: number) => {
        expect(limit).toBe(50);
        return envelope([page], page, false);
      });
      await expect(collectAll(paginatePages(fetchPage, { startPage: 3 }))).resolves.toEqual([3]);
      expect(fetchPage).toHaveBeenCalledWith(3, 50, undefined);
    });

    it('the signal is passed to fetchPage; an abort between pages → AbortError, no further fetch', async () => {
      const controller = new AbortController();
      const reason = new Error('stop paging');
      const fetchPage = vi.fn(async (page: number) => envelope([page], page, true));
      const iterator = paginatePages(fetchPage, { limit: 1, signal: controller.signal });
      await expect(iterator.next()).resolves.toEqual({ done: false, value: 1 });
      expect(fetchPage).toHaveBeenCalledWith(1, 1, controller.signal);
      controller.abort(reason);
      const next = iterator.next();
      await expect(next).rejects.toBeInstanceOf(AbortError);
      await expect(next).rejects.toSatisfy((e: AbortError) => e.cause === reason);
      expect(fetchPage).toHaveBeenCalledTimes(1);
    });

    it('a pre-aborted signal → AbortError before the first fetch', async () => {
      const fetchPage = vi.fn(async () => envelope([1], 1, false));
      await expect(
        paginatePages(fetchPage, { signal: AbortSignal.abort() }).next()
      ).rejects.toBeInstanceOf(AbortError);
      expect(fetchPage).not.toHaveBeenCalled();
    });

    it('lazy: after pulling only the first item of a 2-page source, fetchPage was called once', async () => {
      const fetchPage = vi
        .fn<(page: number, limit: number) => Promise<Page<number>>>()
        .mockResolvedValueOnce(envelope([1, 2], 1, true))
        .mockResolvedValueOnce(envelope([3, 4], 2, false));
      const iterator = paginatePages(fetchPage, { limit: 2 });
      await expect(iterator.next()).resolves.toEqual({ done: false, value: 1 });
      await expect(iterator.next()).resolves.toEqual({ done: false, value: 2 });
      expect(fetchPage).toHaveBeenCalledTimes(1);
      await expect(iterator.next()).resolves.toEqual({ done: false, value: 3 });
      expect(fetchPage).toHaveBeenCalledTimes(2);
      await iterator.return();
    });

    it('a { data } object without pagination is one page', async () => {
      const fetchPage = vi.fn(async () => ({ data: [1, 2] }) as unknown as Page<number>);
      await expect(collectAll(paginatePages(fetchPage, { limit: 2 }))).resolves.toEqual([1, 2]);
      expect(fetchPage).toHaveBeenCalledTimes(1);
    });

    it.each<[string, Parameters<typeof paginatePages>[1], string]>([
      ['limit 0', { limit: 0 }, 'limit'],
      ['limit 1.5', { limit: 1.5 }, 'limit'],
      ['limit -1', { limit: -1 }, 'limit'],
      ['startPage 0', { startPage: 0 }, 'startPage'],
      ['maxPages 0', { maxPages: 0 }, 'maxPages'],
      ['maxPages NaN', { maxPages: NaN }, 'maxPages'],
    ])('%s → ValidationError with status 0 at once, nothing fetched', (_name, options, field) => {
      const fetchPage = vi.fn(async () => [] as number[]);
      expect(() => paginatePages(fetchPage, options)).toThrow(ValidationError);
      expect(() => paginatePages(fetchPage, options)).toThrow(
        expect.objectContaining({ status: 0, details: [field] })
      );
      expect(fetchPage).not.toHaveBeenCalled();
    });
  });

  describe('paginateOffset', () => {
    const offsetPage = (items: number[], offset: number, total?: number): OffsetPage<number> => ({
      items,
      total,
      limit: 50,
      offset,
    });

    it('offsets 0, 50, 100: += limit, never += items.length (short pages, total known)', async () => {
      const fetchPage = vi.fn(async (offset: number, _limit: number) =>
        offsetPage(
          Array.from({ length: 30 }, (_v, i) => offset + i),
          offset,
          150
        )
      );
      const items = await collectAll(paginateOffset(fetchPage, { limit: 50 }));
      expect(fetchPage.mock.calls.map(([offset, limit]) => [offset, limit])).toEqual([
        [0, 50],
        [50, 50],
        [100, 50],
      ]);
      expect(items).toHaveLength(90);
    });

    it('total 120 → 3 calls', async () => {
      const fetchPage = vi.fn(async (offset: number, limit: number) =>
        offsetPage(
          Array.from({ length: Math.min(limit, 120 - offset) }, (_v, i) => offset + i),
          offset,
          120
        )
      );
      const items = await collectAll(paginateOffset(fetchPage));
      expect(fetchPage).toHaveBeenCalledTimes(3);
      expect(items).toHaveLength(120);
      expect(items[119]).toBe(119);
    });

    it('total unknown + a short page → stop', async () => {
      const fetchPage = vi
        .fn<(offset: number, limit: number) => Promise<OffsetPage<number>>>()
        .mockResolvedValueOnce(offsetPage([1, 2], 0))
        .mockResolvedValueOnce(offsetPage([3], 2));
      await expect(collectAll(paginateOffset(fetchPage, { limit: 2 }))).resolves.toEqual([1, 2, 3]);
      expect(fetchPage).toHaveBeenCalledTimes(2);
    });

    it('stopOnShortPage: false → continues past short pages until an empty one', async () => {
      const fetchPage = vi
        .fn<(offset: number, limit: number) => Promise<OffsetPage<number>>>()
        .mockResolvedValueOnce(offsetPage([1], 0))
        .mockResolvedValueOnce(offsetPage([2], 2))
        .mockResolvedValueOnce(offsetPage([], 4));
      await expect(
        collectAll(paginateOffset(fetchPage, { limit: 2, stopOnShortPage: false }))
      ).resolves.toEqual([1, 2]);
      expect(fetchPage.mock.calls.map(([offset]) => offset)).toEqual([0, 2, 4]);
    });

    it('an empty first page stops at once; startOffset is forwarded', async () => {
      const fetchPage = vi.fn(async (offset: number) => offsetPage([], offset, 999));
      await expect(collectAll(paginateOffset(fetchPage, { startOffset: 10 }))).resolves.toEqual([]);
      expect(fetchPage).toHaveBeenCalledWith(10, 50, undefined);
    });

    it('maxPages caps the number of fetches', async () => {
      const fetchPage = vi.fn(async (offset: number) => offsetPage([offset], offset));
      await expect(
        collectAll(paginateOffset(fetchPage, { limit: 1, maxPages: 3 }))
      ).resolves.toEqual([0, 1, 2]);
      expect(fetchPage).toHaveBeenCalledTimes(3);
    });

    it('lazy: after pulling only the first item of a 2-page source, fetchPage was called once', async () => {
      const fetchPage = vi
        .fn<(offset: number, limit: number) => Promise<OffsetPage<number>>>()
        .mockResolvedValueOnce(offsetPage([1, 2], 0, 4))
        .mockResolvedValueOnce(offsetPage([3, 4], 2, 4));
      const iterator = paginateOffset(fetchPage, { limit: 2 });
      await expect(iterator.next()).resolves.toEqual({ done: false, value: 1 });
      expect(fetchPage).toHaveBeenCalledTimes(1);
      await iterator.return();
    });

    it('an abort between pages → AbortError, no further fetch', async () => {
      const controller = new AbortController();
      const fetchPage = vi.fn(async (offset: number) => offsetPage([offset], offset));
      const iterator = paginateOffset(fetchPage, { limit: 1, signal: controller.signal });
      await expect(iterator.next()).resolves.toEqual({ done: false, value: 0 });
      controller.abort();
      await expect(iterator.next()).rejects.toBeInstanceOf(AbortError);
      expect(fetchPage).toHaveBeenCalledTimes(1);
    });

    it('a page without an items array → ValidationError', async () => {
      const fetchPage = vi.fn(async () => ({ data: [1] }) as unknown as OffsetPage<number>);
      await expect(collectAll(paginateOffset(fetchPage))).rejects.toMatchObject({
        status: 0,
        code: 'VALIDATION_ERROR',
      });
    });

    it.each<[string, Parameters<typeof paginateOffset>[1], string]>([
      ['limit 0', { limit: 0 }, 'limit'],
      ['limit 2.5', { limit: 2.5 }, 'limit'],
      ['startOffset -1', { startOffset: -1 }, 'startOffset'],
      ['startOffset 0.5', { startOffset: 0.5 }, 'startOffset'],
      ['maxPages 0', { maxPages: 0 }, 'maxPages'],
    ])('%s → ValidationError with status 0 at once', (_name, options, field) => {
      const fetchPage = vi.fn(async () => offsetPage([], 0));
      expect(() => paginateOffset(fetchPage, options)).toThrow(
        expect.objectContaining({ status: 0, code: 'VALIDATION_ERROR', details: [field] })
      );
      expect(fetchPage).not.toHaveBeenCalled();
    });
  });

  describe('collectAll', () => {
    it('collectAll(iterable, { maxItems: 3 }) → 3 items and the generator finally ran', async () => {
      let finallyRan = false;
      let produced = 0;
      async function* source(): AsyncGenerator<number> {
        try {
          for (let i = 0; i < 10; i += 1) {
            produced += 1;
            yield i;
          }
        } finally {
          finallyRan = true;
        }
      }
      await expect(collectAll(source(), { maxItems: 3 })).resolves.toEqual([0, 1, 2]);
      expect(finallyRan).toBe(true);
      expect(produced).toBe(3);
    });

    it('without maxItems everything is collected', async () => {
      async function* source(): AsyncGenerator<string> {
        yield 'a';
        yield 'b';
      }
      await expect(collectAll(source())).resolves.toEqual(['a', 'b']);
    });

    it('maxItems: 0 → [] without pulling', async () => {
      let pulled = false;
      async function* source(): AsyncGenerator<number> {
        pulled = true;
        yield 1;
      }
      await expect(collectAll(source(), { maxItems: 0 })).resolves.toEqual([]);
      expect(pulled).toBe(false);
    });

    it.each([42, null, 'abc', { length: 2 }])(
      'collectAll(%j) → ValidationError with status 0',
      async (source) => {
        const call = collectAll(source as never);
        await expect(call).rejects.toBeInstanceOf(ValidationError);
        await expect(call).rejects.toMatchObject({ status: 0, details: ['source'] });
      }
    );

    it('maxItems -1 → ValidationError', async () => {
      async function* source(): AsyncGenerator<number> {
        yield 1;
      }
      await expect(collectAll(source(), { maxItems: -1 })).rejects.toMatchObject({
        status: 0,
        details: ['maxItems'],
      });
    });
  });

  describe('deprecated paginate(fetcher) and collectAll(fetcher)', () => {
    const flat = (data: number[], page: number, hasNext: boolean): PaginatedResponse<number> => ({
      data,
      page,
      limit: 2,
      total: 4,
      totalPages: 2,
      hasNext,
      hasPrev: page > 1,
    });
    const nested = (data: number[], page: number, hasNext: boolean): Page<number> => ({
      data,
      pagination: { page, limit: 2, total: 4, totalPages: 2, hasNext, hasPrev: page > 1 },
    });

    it('paginate iterates the flat 0.2.0 shape', async () => {
      const fetcher = vi
        .fn<(page: number, limit: number) => Promise<PaginatedResponse<number>>>()
        .mockResolvedValueOnce(flat([1, 2], 1, true))
        .mockResolvedValueOnce(flat([3], 2, false));
      const items: number[] = [];
      for await (const item of paginate(fetcher, { pageSize: 2 })) items.push(item);
      expect(items).toEqual([1, 2, 3]);
      expect(fetcher.mock.calls).toEqual([
        [1, 2],
        [2, 2],
      ]);
    });

    it('paginate follows the nested envelope past page 1 (0.2.0 stopped after page 1)', async () => {
      const fetcher = vi
        .fn<(page: number, limit: number) => Promise<Page<number>>>()
        .mockResolvedValueOnce(nested([1, 2], 1, true))
        .mockResolvedValueOnce(nested([3, 4], 2, false));
      const items: number[] = [];
      for await (const item of paginate(fetcher, { pageSize: 2, startPage: 1 })) items.push(item);
      expect(items).toEqual([1, 2, 3, 4]);
      expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('paginate stops on an empty page whatever hasNext says; default page size 100', async () => {
      const fetcher = vi.fn(async () => nested([], 1, true));
      const items: number[] = [];
      for await (const item of paginate(fetcher)) items.push(item);
      expect(items).toEqual([]);
      expect(fetcher).toHaveBeenCalledWith(1, 100);
    });

    it('collectAll(fetcher) collects the flat and the nested shapes', async () => {
      const flatFetcher = vi
        .fn<(page: number, limit: number) => Promise<PaginatedResponse<number>>>()
        .mockResolvedValueOnce(flat([1, 2], 1, true))
        .mockResolvedValueOnce(flat([3], 2, false));
      await expect(collectAll(flatFetcher, { pageSize: 2 })).resolves.toEqual([1, 2, 3]);
      const nestedFetcher = vi
        .fn<(page: number, limit: number) => Promise<Page<number>>>()
        .mockResolvedValueOnce(nested([1, 2], 1, true))
        .mockResolvedValueOnce(nested([3], 2, false));
      await expect(collectAll(nestedFetcher, { pageSize: 2 })).resolves.toEqual([1, 2, 3]);
      expect(nestedFetcher.mock.calls).toEqual([
        [1, 2],
        [2, 2],
      ]);
    });

    it('collectAll(fetcher, { maxItems }) stops early', async () => {
      const fetcher = vi.fn(async (page: number) => flat([page * 10, page * 10 + 1], page, true));
      await expect(collectAll(fetcher, { maxItems: 3 })).resolves.toEqual([10, 11, 20]);
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
  });

  describe('response helpers (src/utils/response.ts)', () => {
    it('normalizeListResponse (deprecated): an array → the flat 0.2.0 shape', () => {
      expect(normalizeListResponse([{ id: 1 }, { id: 2 }])).toEqual({
        data: [{ id: 1 }, { id: 2 }],
        page: 1,
        limit: 2,
        total: 2,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      });
    });

    it('normalizeListResponse (deprecated): a non-array is returned unchanged', () => {
      const flat: PaginatedResponse<number> = {
        data: [1],
        page: 2,
        limit: 1,
        total: 3,
        totalPages: 3,
        hasNext: true,
        hasPrev: true,
      };
      expect(normalizeListResponse(flat)).toBe(flat);
    });

    it('isArrayResponse tells an array from a page object', () => {
      expect(isArrayResponse([1])).toBe(true);
      expect(isArrayResponse(normalizeListResponse([1]))).toBe(false);
    });

    it('extractDataArray: an array, a { data } object (envelope included), anything else → []', () => {
      expect(extractDataArray([1, 2])).toEqual([1, 2]);
      expect(
        extractDataArray({
          data: ['a'],
          pagination: {
            page: 1,
            limit: 1,
            total: 1,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
          },
        })
      ).toEqual(['a']);
      expect(extractDataArray({ items: [1] })).toEqual([]);
      expect(extractDataArray(null)).toEqual([]);
      expect(extractDataArray('text')).toEqual([]);
    });
  });

  describe('readTotalCount', () => {
    const headers = (value?: string) =>
      new Headers(value === undefined ? {} : { 'X-Total-Count': value });

    it.each([
      ['12', 12],
      [' 12 ', 12],
      ['0', 0],
    ])('%j → %s', (value, expected) => {
      expect(readTotalCount(headers(value))).toBe(expected);
    });

    it('missing → undefined', () => {
      expect(readTotalCount(headers())).toBeUndefined();
    });

    it.each(['', '-1', '1.5', '12abc', 'x', '1e3', '0x10'])('%j → undefined', (value) => {
      expect(readTotalCount(headers(value))).toBeUndefined();
    });
  });
});
