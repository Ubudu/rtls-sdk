import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ValidationError } from '../../../../src';
import { applyUniversalQuery } from '../../../../src/utils/filter-eval';
import {
  applyFilters,
  combineFilters,
  filters,
  serializeFilters,
} from '../../../../src/utils/filtering';
import type { LocalQuery, Page } from '../../../../src/types';

interface Vector {
  name: string;
  items: unknown[];
  query: Record<string, string>;
  expected: unknown;
}

const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/universal-filter-parity.json', import.meta.url), 'utf8')
) as { _source: string; _note: string; vectors: Vector[] };
const vectors = fixture.vectors;
const byName = new Map(vectors.map((v) => [v.name, v]));

/** The page applyFilters returns when the query has no page or limit. */
function wholePage(data: unknown[]): Page<unknown> {
  return {
    data,
    pagination: {
      page: 1,
      limit: data.length,
      total: data.length,
      totalPages: data.length ? 1 : 0,
      hasNext: false,
      hasPrev: false,
    },
  };
}

/** The raw query a LocalQuery stands for (filters, sort, fields, page, limit as the server reads them). */
function wireOf(query: LocalQuery): Record<string, string> {
  const raw: Record<string, string> = { ...serializeFilters(query.filters, 'universal') };
  if (query.sort !== undefined) {
    raw.sort = typeof query.sort === 'string' ? query.sort : query.sort.join(',');
  }
  if (query.fields !== undefined) raw.fields = query.fields.join(',');
  if (query.page !== undefined) raw.page = String(query.page);
  if (query.limit !== undefined) raw.limit = String(query.limit);
  return raw;
}

/** The vectors expressed with the builders (the in-key forms, unknown keys, raw values such as '5px' or 'TRUE',
 *  page=0 / limit=0 and index-syntax filter keys cannot be built and are absent). */
const BUILT: Record<string, LocalQuery> = {
  'eq: string comparison is case-sensitive': { filters: filters.equals('name', 'Alice') },
  'eq: number field equals the string 5 loosely': { filters: filters.equals('n', 5) },
  "eq: boolean field against 'false'": { filters: filters.equals('b', false) },
  "eq: boolean field against 'FALSE ' (trimmed, lower-cased)": {
    filters: filters.equals('b', 'FALSE '),
  },
  "eq: boolean field against 'true'": { filters: filters.equals('b', true) },
  "eq: null and missing fields never equal 'null'": { filters: filters.equals('v', 'null') },
  'eq: empty value matches only an empty string': { filters: filters.equals('v', '') },
  "eq: one-element array field equals 'a'": { filters: filters.equals('t', 'a') },
  'eq: nested dot path data.x': { filters: filters.equals('data.x', 1) },
  'ne: missing field matches': { filters: filters.notEquals('s', 'on') },
  'ne: null field matches': { filters: filters.notEquals('s', 'x') },
  'gt: numeric string field compares as a number': { filters: filters.greaterThan('v', 9) },
  'gte: null >= 0 is true': { filters: filters.greaterThanOrEqual('v', 0) },
  'lt: missing field never matches': { filters: filters.lessThan('v', 5) },
  'lte: number and numeric string fields': { filters: filters.lessThanOrEqual('v', 4) },
  'lte: ISO date string field never matches': { filters: filters.lessThanOrEqual('d', 10) },
  'contains: case-insensitive': { filters: filters.contains('s', 'WORLD') },
  "contains: fields 0, false and '' never match": { filters: filters.contains('v', '0') },
  "contains: a false field never matches 'false'": { filters: filters.contains('v', 'false') },
  'contains: array field matches on its comma-joined text': {
    filters: filters.contains('t', 'b,c'),
  },
  'starts: case-insensitive': { filters: filters.startsWith('s', 'AL') },
  'starts: an empty value matches every truthy field': { filters: filters.startsWith('v', '') },
  'ends: case-insensitive': { filters: filters.endsWith('s', '.pdf') },
  'ends: number field matches on its text': { filters: filters.endsWith('s', '45') },
  'regex: case-insensitive': { filters: filters.matches('s', /^abc-\d+$/) },
  'regex: an invalid pattern never matches': { filters: filters.matches('s', '(') },
  'regex: a field 0 never matches': { filters: filters.matches('v', '0') },
  'in: scalar strings': { filters: filters.in('c', ['red', 'blue']) },
  'in: number field compares as text': { filters: filters.in('n', [1, 3]) },
  'in: values are trimmed': { filters: filters.in('c', [' red ', ' blue ']) },
  'in: one-element array field': { filters: filters.in('t', ['a', 'b']) },
  'in: two-element array field compares "a,b"': { filters: filters.in('t', ['a', 'b']) },
  "in: a missing field compares 'undefined'": { filters: filters.in('c', ['undefined', 'y']) },
  'nin: scalar strings and a missing field': { filters: filters.notIn('c', ['red']) },
  'nin: number field and trimmed values': { filters: filters.notIn('n', [' 1 ', ' 3']) },
  'nin: two-element array field': { filters: filters.notIn('t', ['a', 'b']) },
  "exists: 'true' keeps null and 0": { filters: filters.exists('v') },
  "exists: 'false' keeps only missing fields": { filters: filters.exists('v', false) },
  'exists: nested path': { filters: filters.exists('data.x', true) },
  'between: inclusive bounds': { filters: filters.between('v', 2, 3) },
  'between: numeric string fields': { filters: filters.between('v', 0, 5) },
  'between: ISO date string fields never match': {
    filters: filters.between('d', new Date(1700000000000), new Date(1800000000000)),
  },
  'between: reversed bounds never match': { filters: filters.between('v', 3, 1) },
  'size: array field': { filters: filters.size('t', 2) },
  'size: string field': { filters: filters.size('s', 3) },
  'size: number field never matches': { filters: filters.size('n', 3) },
  'size: zero': { filters: filters.size('t', 0) },
  'all: string arrays': { filters: filters.all('t', ['a', 'b']) },
  'all: numeric arrays never include the string values': { filters: filters.all('n', ['1', '2']) },
  'elem: string arrays': { filters: filters.elemMatch('t', ['a', 'b']) },
  'elem: numeric arrays never include the string values': {
    filters: filters.elemMatch('n', ['2', '3']),
  },
  'query value form f:eq=y': { filters: filters.equals('s', 'y') },
  'AND of two filters': {
    filters: combineFilters(filters.equals('a', 1), filters.equals('b', 'x')),
  },
  'no query keeps the items': {},
  'a null item has no fields': { filters: filters.exists('v', false) },
  'falsy primitive items have no fields': { filters: filters.equals('length', 0) },
  'sort: one key asc': { sort: 'n:asc' },
  'sort: one key desc': { sort: 'n:desc' },
  'sort: missing direction means asc': { sort: 'n' },
  'sort: unknown direction means asc, DESC is desc': { sort: ['n:up', 'a:DESC'] },
  'sort: two keys': { sort: ['a:asc', 'b:desc'] },
  'sort: nulls last on asc': { sort: 'n:asc' },
  'sort: nulls first on desc': { sort: 'n:desc' },
  'sort: missing fields last on asc': { sort: ['n:asc'] },
  'sort: a leading null comes first on desc': { sort: 'n:desc' },
  'sort: a leading missing value comes first on desc': { sort: 'n:desc' },
  'sort: two strings use localeCompare': { sort: 's:asc' },
  'sort: mixed types compare with <': { sort: 'v:asc' },
  'sort: nested field desc': { sort: 'data.x:desc' },
  'sort: equal keys keep the input order': { sort: 'n:asc' },
  'sort: an empty field is ignored': { sort: ':desc' },
  'sort: index syntax on an array field': { sort: 't[0]:asc' },
  'fields: nested projection': { fields: ['id', 'data.x'] },
  'fields: a missing field is omitted, null is kept': { fields: ['id', 'name', 'v'] },
  'fields: names are trimmed': { fields: [' id ', ' name '] },
  'fields: projection runs before pagination': { fields: ['id'], limit: 2 },
  'fields: index syntax keeps the literal key': { fields: ['id', 't[1]'] },
  'fields: an empty name selects nothing': { fields: ['id', '', ''] },
  'fields: a parent then its child': { fields: ['data', 'data.x'] },
  'fields: a child then its parent': { fields: ['data.x', 'data'] },
  'fields: two children share their parent': { fields: ['data.x', 'data.y'] },
  'fields: a deep child under a projected parent': { fields: ['a.b', 'a.b.c'] },
  'filters, then sort, then fields, then pagination': {
    filters: filters.greaterThanOrEqual('n', 2),
    sort: 'n:desc',
    fields: ['id'],
    page: 1,
    limit: 2,
  },
  'pagination: page plus limit': { page: 2, limit: 2 },
  'pagination: limit only starts at page 1': { limit: 3 },
  'pagination: page only uses limit 50': { page: 1 },
  'pagination: page out of range': { page: 9, limit: 2 },
  'pagination: last page flags': { page: 3, limit: 2 },
  'pagination: totals count the filtered items': {
    filters: filters.greaterThan('i', 2),
    page: 1,
    limit: 2,
  },
  'pagination: empty list': { page: 1, limit: 10 },
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('applyFilters and the universal evaluator (P1 §5.11, §6.6, src/utils/{filtering,filter-eval}.ts)', () => {
  describe('the parity fixture', () => {
    it('is server-code, holds at least 45 uniquely named vectors and no server path', () => {
      expect(fixture._source).toBe('server-code');
      expect(fixture._note).toMatch(/server's universal filter function/);
      expect(vectors.length).toBeGreaterThanOrEqual(45);
      expect(byName.size).toBe(vectors.length);
      expect(JSON.stringify(fixture)).not.toMatch(/rtls-api|\.js:\d/);
    });

    it.each([
      'eq',
      'ne',
      'gt',
      'gte',
      'lt',
      'lte',
      'contains',
      'starts',
      'ends',
      'regex',
      'in',
      'nin',
      'exists',
      'between',
      'size',
      'all',
      'elem',
      'in-key',
      'AND',
      'sort',
      'fields',
      'pagination',
    ])('covers "%s"', (topic) => {
      expect(
        vectors.some((v) => v.name.startsWith(`${topic}:`) || v.name.startsWith(`${topic} `))
      ).toBe(true);
    });
  });

  describe('applyUniversalQuery(items, rawQuery) deep-equals the server output for every vector', () => {
    it.each(vectors.map((v) => [v.name, v] as const))('%s', (_name, vector) => {
      const items = deepFreeze(structuredClone(vector.items));
      const result = applyUniversalQuery(items, vector.query);
      expect(result).toEqual(vector.expected);
      expect(JSON.parse(JSON.stringify(result))).toStrictEqual(vector.expected);
      expect(items).toStrictEqual(vector.items);
    });
  });

  describe('the same vectors built with the builders, through applyFilters', () => {
    it('the builder table covers the vectors it names, and at least 80 of them', () => {
      const unknown = Object.keys(BUILT).filter((name) => !byName.has(name));
      expect(unknown).toStrictEqual([]);
      expect(Object.keys(BUILT).length).toBeGreaterThanOrEqual(80);
    });

    it.each(Object.entries(BUILT))('%s', (name, query) => {
      const vector = byName.get(name) as Vector;
      expect(wireOf(query)).toStrictEqual(vector.query);
      const expected = Array.isArray(vector.expected)
        ? wholePage(vector.expected)
        : vector.expected;
      expect(applyFilters(structuredClone(vector.items), query)).toEqual(expected);
    });
  });

  describe('applyFilters', () => {
    const items = [
      { id: 1, name: 'b', n: 3, data: { x: 1, y: 2 } },
      { id: 2, name: 'a', n: 1, data: { x: 2 } },
      { id: 3, name: 'c', n: 2 },
    ];

    it('without page or limit → the whole result as a single page', () => {
      expect(applyFilters(items)).toStrictEqual(wholePage(items));
      expect(applyFilters(items, { filters: filters.greaterThan('n', 1) })).toStrictEqual({
        data: [items[0], items[2]],
        pagination: { page: 1, limit: 2, total: 2, totalPages: 1, hasNext: false, hasPrev: false },
      });
    });

    it('no match → limit 0, totalPages 0', () => {
      expect(applyFilters(items, { filters: filters.equals('name', 'zzz') })).toStrictEqual({
        data: [],
        pagination: { page: 1, limit: 0, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
      });
    });

    it('page and limit → the envelope; sort and fields applied first', () => {
      expect(
        applyFilters(items, { sort: ['name:asc'], fields: ['id', 'data.x'], page: 2, limit: 2 })
      ).toStrictEqual({
        data: [{ id: 3 }],
        pagination: { page: 2, limit: 2, total: 3, totalPages: 2, hasNext: false, hasPrev: true },
      });
    });

    it('the input array and its items are not modified, and data is a new array', () => {
      const frozen = deepFreeze(structuredClone(items));
      const page = applyFilters(frozen, {
        filters: filters.exists('id'),
        sort: 'n:desc',
        fields: ['data', 'data.x', 'name'],
        page: 1,
        limit: 2,
      });
      expect(page.data).toStrictEqual([{ data: { x: 1, y: 2 }, name: 'b' }, { name: 'c' }]);
      expect(frozen).toStrictEqual(items);
      const all = applyFilters(frozen);
      expect(all.data).not.toBe(frozen);
      expect(all.data).toStrictEqual(frozen);
    });

    it.each<[string, LocalQuery, string]>([
      ['page: 0', { page: 0 }, 'page'],
      ['page: -1', { page: -1 }, 'page'],
      ['page: NaN', { page: NaN }, 'page'],
      ["page: '2' (from JavaScript)", { page: '2' as unknown as number }, 'page'],
      ['limit: -1', { limit: -1 }, 'limit'],
      ['limit: 1.5', { limit: 1.5 }, 'limit'],
      ['limit: 0', { limit: 0 }, 'limit'],
      ['limit: Infinity', { limit: Infinity }, 'limit'],
      ['sort: a number', { sort: 5 as unknown as string }, 'sort'],
      ['sort: an array with a number', { sort: ['a:asc', 1] as unknown as string[] }, 'sort'],
      ['fields: a string', { fields: 'id,name' as unknown as string[] }, 'fields'],
      ['fields: an array with a number', { fields: [1] as unknown as string[] }, 'fields'],
      ['a rejected filter', { filters: filters.in('c', ['a,b']) }, 'c:in'],
    ])('%s → ValidationError status 0', (_name, query, detail) => {
      expect(() => applyFilters(items, query)).toThrow(ValidationError);
      expect(() => applyFilters(items, query)).toThrow(
        expect.objectContaining({ status: 0, code: 'VALIDATION_ERROR', details: [detail] })
      );
    });

    it.each<[string, unknown, unknown, string]>([
      ['items that are not an array', 'abc', undefined, 'items'],
      ['a null query', [], null, 'query'],
      ['an array query', [], [], 'query'],
      ['a string query', [], 'page=1', 'query'],
    ])('%s → ValidationError status 0', (_name, input, query, detail) => {
      const run = (): unknown => applyFilters(input as unknown[], query as LocalQuery);
      expect(run).toThrow(ValidationError);
      expect(run).toThrow(expect.objectContaining({ status: 0, details: [detail] }));
    });
  });
});
