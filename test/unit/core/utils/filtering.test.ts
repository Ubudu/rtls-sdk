import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { recordRequests, server, type RecordedRequest } from '../../../mocks/server';
import { createRtlsClient, ValidationError } from '../../../../src';
import { buildQueryParams } from '../../../../src/utils/query';
import {
  combineFilters,
  filter,
  filters,
  serializeFilters,
  type FilterGrammar,
} from '../../../../src/utils/filtering';
import type { FilterOptions } from '../../../../src/types';

const D1 = new Date('2024-01-01T00:00:00.000Z');
const D2 = new Date('2024-01-02T00:00:00.000Z');
const MS1 = 1704067200000;
const MS2 = 1704153600000;

const BASE = 'https://filtering.test/api';

function only(rec: { requests: readonly RecordedRequest[] }): RecordedRequest {
  expect(rec.requests).toHaveLength(1);
  return rec.requests[0] as RecordedRequest;
}

/** The query keys of a URL in order (the test config has no DOM.Iterable). */
function queryKeys(url: URL): string[] {
  const keys: string[] = [];
  url.searchParams.forEach((_value, key) => keys.push(key));
  return keys;
}

describe('filter builders, serializeFilters (P1 §5.11, §6.6, src/utils/filtering.ts)', () => {
  describe('builders keep typed values (B8)', () => {
    it.each<[string, FilterOptions, FilterOptions]>([
      ['equals (number)', filters.equals('n', 5), { 'n:eq': 5 }],
      ['equals (boolean)', filters.equals('b', false), { 'b:eq': false }],
      ['equals (string)', filters.equals('s', 'Alice'), { 's:eq': 'Alice' }],
      ['notEquals', filters.notEquals('s', 'x'), { 's:ne': 'x' }],
      ['greaterThan (number)', filters.greaterThan('v', 1), { 'v:gt': 1 }],
      ['greaterThan (Date kept)', filters.greaterThan('t', D1), { 't:gt': D1 }],
      ['greaterThanOrEqual', filters.greaterThanOrEqual('v', 2), { 'v:gte': 2 }],
      ['lessThan', filters.lessThan('v', 3), { 'v:lt': 3 }],
      ['lessThanOrEqual (Date kept)', filters.lessThanOrEqual('t', D2), { 't:lte': D2 }],
      ['contains', filters.contains('s', 'ab'), { 's:contains': 'ab' }],
      ['startsWith', filters.startsWith('s', 'a'), { 's:starts': 'a' }],
      ['endsWith', filters.endsWith('s', 'b'), { 's:ends': 'b' }],
      [
        'matches(/a+/gi) → source, flags dropped',
        filters.matches('s', /a+/gi),
        { 's:regex': 'a+' },
      ],
      ['matches (string)', filters.matches('s', '^x'), { 's:regex': '^x' }],
      ['in', filters.in('t', ['a']), { 't:in': ['a'] }],
      ['in (mixed)', filters.in('n', [1, '2']), { 'n:in': [1, '2'] }],
      ['notIn', filters.notIn('t', ['a', 'b']), { 't:nin': ['a', 'b'] }],
      ['exists (default true)', filters.exists('f'), { 'f:exists': true }],
      ['exists false', filters.exists('f', false), { 'f:exists': false }],
      ['between (numbers)', filters.between('x', 1, 2), { 'x:between': [1, 2] }],
      ['between(Date, Date) → [ms, ms]', filters.between('t', D1, D2), { 't:between': [MS1, MS2] }],
      ['size', filters.size('t', 2), { 't:size': 2 }],
      ['all', filters.all('t', ['a', 'b']), { 't:all': ['a', 'b'] }],
      ['elemMatch (one value)', filters.elemMatch('t', 'a'), { 't:elem': 'a' }],
      ['elemMatch (values)', filters.elemMatch('t', ['a', 'b']), { 't:elem': ['a', 'b'] }],
    ])('%s', (_name, built, expected) => {
      expect(built).toStrictEqual(expected);
    });

    it('the 0.2.0 wire form is unchanged: between 1,2 · in a · equals 5 (universal and buildQueryParams)', () => {
      const combined = combineFilters(
        filters.between('x', 1, 2),
        filters.in('t', ['a']),
        filters.equals('n', 5)
      );
      const wire = { 'x:between': '1,2', 't:in': 'a', 'n:eq': '5' };
      expect(serializeFilters(combined, 'universal')).toStrictEqual(wire);
      expect(buildQueryParams(combined)).toStrictEqual(wire);
    });

    it('filter() keeps the typed value and turns a RegExp into its source', () => {
      expect(filter('a', 'in', ['x', 1])).toStrictEqual({ 'a:in': ['x', 1] });
      expect(filter('d', 'gte', D1)).toStrictEqual({ 'd:gte': D1 });
      expect(filter('s', 'regex', /^a\.b$/m)).toStrictEqual({ 's:regex': '^a\\.b$' });
      expect(filter('user_type', 'exists', true)).toStrictEqual({ 'user_type:exists': true });
    });

    it('combineFilters merges, a later filter on the same key wins', () => {
      expect(
        combineFilters(filters.equals('a', 1), filters.equals('b', 2), filters.equals('a', 3))
      ).toStrictEqual({ 'a:eq': 3, 'b:eq': 2 });
      expect(combineFilters()).toStrictEqual({});
    });
  });

  describe("universal serializer ('field:op' query keys)", () => {
    it('one key per filter in insertion order, every value a string', () => {
      const query = serializeFilters(
        combineFilters(
          filters.equals('n', 5),
          filters.equals('b', true),
          filters.contains('s', 'Ab'),
          filters.size('t', 0)
        ),
        'universal'
      );
      expect(query).toStrictEqual({
        'n:eq': '5',
        'b:eq': 'true',
        's:contains': 'Ab',
        't:size': '0',
      });
      expect(Object.keys(query)).toStrictEqual(['n:eq', 'b:eq', 's:contains', 't:size']);
    });

    it('lists are joined with ",", numbers stringified', () => {
      expect(
        serializeFilters(
          combineFilters(filters.in('c', ['red', 'blue', 3]), filters.all('t', ['a', 'b'])),
          'universal'
        )
      ).toStrictEqual({ 'c:in': 'red,blue,3', 't:all': 'a,b' });
    });

    it('exists booleans → "true" / "false"', () => {
      expect(
        serializeFilters(
          combineFilters(filters.exists('a'), filters.exists('b', false)),
          'universal'
        )
      ).toStrictEqual({ 'a:exists': 'true', 'b:exists': 'false' });
    });

    it('a Date becomes epoch ms (scalar operators and between bounds)', () => {
      expect(
        serializeFilters(
          combineFilters(
            filters.greaterThan('t', D1),
            filter('d', 'eq', D2),
            filters.between('w', D1, D2)
          ),
          'universal'
        )
      ).toStrictEqual({ 't:gt': String(MS1), 'd:eq': String(MS2), 'w:between': `${MS1},${MS2}` });
    });

    it('a single value on a list operator is a one-element list', () => {
      expect(serializeFilters(filter('c', 'in', 'red'), 'universal')).toStrictEqual({
        'c:in': 'red',
      });
      expect(serializeFilters(filter('n', 'nin', 4), 'universal')).toStrictEqual({ 'n:nin': '4' });
    });

    it('nested dot paths are kept; undefined and null values are skipped; no filters → {}', () => {
      expect(
        serializeFilters(
          { 'data.flag:eq': true, 'a:eq': undefined, 'b:eq': null } as unknown as FilterOptions,
          'universal'
        )
      ).toStrictEqual({ 'data.flag:eq': 'true' });
      expect(serializeFilters(undefined, 'universal')).toStrictEqual({});
      expect(serializeFilters({}, 'universal')).toStrictEqual({});
    });
  });

  describe('venue serializer (filters=<JSON>)', () => {
    it.each<[string, FilterOptions, string]>([
      [
        'eq string',
        filters.equals('name', 'Hall A'),
        '[{"field":"name","operator":"eq","value":"Hall A"}]',
      ],
      [
        'eq number keeps its type',
        filters.equals('level', 0),
        '[{"field":"level","operator":"eq","value":0}]',
      ],
      [
        'eq boolean keeps its type',
        filters.equals('on', true),
        '[{"field":"on","operator":"eq","value":true}]',
      ],
      ['ne', filters.notEquals('type', 'x'), '[{"field":"type","operator":"ne","value":"x"}]'],
      ['gt', filters.greaterThan('level', 1), '[{"field":"level","operator":"gt","value":1}]'],
      [
        'gte with a Date → ms',
        filters.greaterThanOrEqual('t', D1),
        `[{"field":"t","operator":"gte","value":${MS1}}]`,
      ],
      ['lt', filters.lessThan('level', 2), '[{"field":"level","operator":"lt","value":2}]'],
      [
        'lte',
        filters.lessThanOrEqual('level', 3),
        '[{"field":"level","operator":"lte","value":3}]',
      ],
      [
        'contains',
        filters.contains('name', 'Hall'),
        '[{"field":"name","operator":"contains","value":"Hall"}]',
      ],
      [
        'starts',
        filters.startsWith('name', 'H'),
        '[{"field":"name","operator":"starts","value":"H"}]',
      ],
      ['ends', filters.endsWith('name', 'A'), '[{"field":"name","operator":"ends","value":"A"}]'],
      [
        'regex (source only)',
        filters.matches('name', /^H.*A$/i),
        '[{"field":"name","operator":"regex","value":"^H.*A$"}]',
      ],
      [
        'in keeps typed values',
        filters.in('id', [1, 'b']),
        '[{"field":"id","operator":"in","value":[1,"b"]}]',
      ],
      [
        'nin → not_in',
        filters.notIn('id', [3]),
        '[{"field":"id","operator":"not_in","value":[3]}]',
      ],
      [
        'exists true → exists, no value',
        filters.exists('tags'),
        '[{"field":"tags","operator":"exists"}]',
      ],
      [
        'exists false → not_exists, no value',
        filters.exists('tags', false),
        '[{"field":"tags","operator":"not_exists"}]',
      ],
      [
        'between → [min, max]',
        filters.between('level', -1, 2),
        '[{"field":"level","operator":"between","value":[-1,2]}]',
      ],
      [
        'between Dates → [ms, ms]',
        filters.between('t', D1, D2),
        `[{"field":"t","operator":"between","value":[${MS1},${MS2}]}]`,
      ],
      [
        'nested path',
        filters.equals('properties.type', 'zone'),
        '[{"field":"properties.type","operator":"eq","value":"zone"}]',
      ],
    ])('%s', (_name, built, json) => {
      expect(serializeFilters(built, 'venue')).toStrictEqual({ filters: json });
    });

    it('several filters → one JSON array in insertion order', () => {
      expect(
        serializeFilters(
          combineFilters(filters.equals('name', 'A'), filters.exists('tags', false)),
          'venue'
        )
      ).toStrictEqual({
        filters:
          '[{"field":"name","operator":"eq","value":"A"},{"field":"tags","operator":"not_exists"}]',
      });
    });

    it.each<[string, FilterOptions, string]>([
      ['size', filters.size('t', 1), 't:size'],
      ['all', filters.all('t', ['a']), 't:all'],
      ['elem', filters.elemMatch('t', 'a'), 't:elem'],
    ])('%s has no venue counterpart → ValidationError status 0', (_name, built, key) => {
      expect(() => serializeFilters(built, 'venue')).toThrow(ValidationError);
      expect(() => serializeFilters(built, 'venue')).toThrow(
        expect.objectContaining({ status: 0, code: 'VALIDATION_ERROR', details: [key] })
      );
    });

    it('no filter → {} (undefined, {}, only undefined values)', () => {
      expect(serializeFilters(undefined, 'venue')).toStrictEqual({});
      expect(serializeFilters({}, 'venue')).toStrictEqual({});
      expect(serializeFilters({ 'a:eq': undefined }, 'venue')).toStrictEqual({});
    });
  });

  describe('guards, identical for both grammars → ValidationError status 0', () => {
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ['a field with ":"', { 'a:b:eq': 1 }, 'a:b:eq'],
      ['index syntax [0]', { 'tags[0]:eq': 'a' }, 'tags[0]:eq'],
      ['a field with "]"', { 'a]:eq': 1 }, 'a]:eq'],
      ['an empty field', { ':eq': 1 }, ':eq'],
      ['a key without an operator', { name: 'x' }, 'name'],
      ['an unknown operator', { 'name:like': 'x' }, 'name:like'],
      ['a list element with ","', filters.in('c', ['a,b']), 'c:in'],
      ['an empty list', filters.in('c', []), 'c:in'],
      ['a boolean list element', { 'c:in': [true] }, 'c:in'],
      ['a null list element', { 'c:in': [null] }, 'c:in'],
      ['a non-finite list element', { 'c:nin': [NaN] }, 'c:nin'],
      ['between with one value', { 'x:between': [1] }, 'x:between'],
      ['between with three values', { 'x:between': [1, 2, 3] }, 'x:between'],
      ['between with a string bound', { 'x:between': ['1', 2] }, 'x:between'],
      ['between with a scalar', { 'x:between': 5 }, 'x:between'],
      ['between with an invalid Date', filters.between('t', new Date('x'), D2), 't:between'],
      ['an array on eq', { 'a:eq': ['x'] }, 'a:eq'],
      ['an object value', { 'a:eq': { x: 1 } }, 'a:eq'],
      ['a non-finite number', filters.greaterThan('v', NaN), 'v:gt'],
      ['Infinity', filters.equals('v', Infinity), 'v:eq'],
      ['an invalid Date', filters.greaterThan('t', new Date('x')), 't:gt'],
      ['exists with a string', { 'f:exists': 'true' }, 'f:exists'],
    ];

    it.each(
      cases.flatMap(([name, input, key]) =>
        (['universal', 'venue'] as const).map((grammar) => [name, grammar, input, key] as const)
      )
    )('%s (%s)', (_name, grammar, input, key) => {
      const run = (): unknown => serializeFilters(input as FilterOptions, grammar);
      expect(run).toThrow(ValidationError);
      expect(run).toThrow(
        expect.objectContaining({ status: 0, code: 'VALIDATION_ERROR', details: [key] })
      );
    });

    it.each<[string, unknown]>([
      ['a string', 'name:eq=x'],
      ['an array', [filters.equals('a', 1)]],
    ])('filters that are %s → ValidationError naming "filters"', (_name, input) => {
      expect(() => serializeFilters(input as FilterOptions, 'universal')).toThrow(
        expect.objectContaining({ status: 0, details: ['filters'] })
      );
    });

    it('an unknown grammar → ValidationError naming "grammar"', () => {
      expect(() => serializeFilters({}, 'sql' as FilterGrammar)).toThrow(
        expect.objectContaining({ status: 0, details: ['grammar'] })
      );
    });

    it('a rejected filter throws before any request is sent', async () => {
      server.use(http.get(`${BASE}/*`, () => HttpResponse.json([])));
      const transport = createRtlsClient({ baseUrl: BASE, apiKey: 'k' }).transport;
      const rec = recordRequests();
      const send = async (): Promise<unknown> =>
        transport.request('GET', '/assets/{app_namespace}', {
          params: { app_namespace: 'ns' },
          query: serializeFilters(filters.in('c', ['a,b']), 'universal'),
        });
      await expect(send()).rejects.toBeInstanceOf(ValidationError);
      expect(rec.requests).toHaveLength(0);
    });
  });

  describe('through the Transport', () => {
    it('the universal output gives the expected raw query string, decoded by the server to the original', async () => {
      server.use(http.get(`${BASE}/assets/:ns`, () => HttpResponse.json([])));
      const transport = createRtlsClient({ baseUrl: BASE, apiKey: 'k' }).transport;
      const rec = recordRequests();
      await transport.request('GET', '/assets/{app_namespace}', {
        params: { app_namespace: 'ns' },
        query: serializeFilters(
          combineFilters(
            filters.equals('data.flag', true),
            filters.in('user_type', ['fork lift', 'person']),
            filters.between('battery', 10, 90),
            filters.matches('user_name', /^a&b#+/)
          ),
          'universal'
        ),
      });
      const request = only(rec);
      expect(request.url.search).toBe(
        '?data.flag:eq=true&user_type:in=fork%20lift%2Cperson&battery:between=10%2C90&user_name:regex=%5Ea%26b%23%2B'
      );
      expect(queryKeys(request.url)).toStrictEqual([
        'data.flag:eq',
        'user_type:in',
        'battery:between',
        'user_name:regex',
      ]);
      expect(request.url.searchParams.get('user_type:in')).toBe('fork lift,person');
      expect(request.url.searchParams.get('user_name:regex')).toBe('^a&b#+');
    });

    it('the venue output is one filters key whose decoded value is the JSON array', async () => {
      server.use(http.get(`${BASE}/venues/:ns`, () => HttpResponse.json([])));
      const transport = createRtlsClient({ baseUrl: BASE, apiKey: 'k' }).transport;
      const rec = recordRequests();
      await transport.request('GET', '/venues/{namespace}', {
        params: { namespace: 'ns' },
        query: serializeFilters(filters.equals('name', 'Hall A & B'), 'venue'),
      });
      const request = only(rec);
      expect(queryKeys(request.url)).toStrictEqual(['filters']);
      expect(request.url.searchParams.get('filters')).toBe(
        '[{"field":"name","operator":"eq","value":"Hall A & B"}]'
      );
      expect(request.url.search).toBe(
        `?filters=${encodeURIComponent('[{"field":"name","operator":"eq","value":"Hall A & B"}]')}`
      );
    });
  });
});
