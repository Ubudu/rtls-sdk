import { describe, it, expect } from 'vitest';
import { queryEntries, serializeQuery } from '../../../../src/utils/query';
import { ValidationError } from '../../../../src/errors';

describe('serializeQuery (P1 §6.3 step 2)', () => {
  it('keeps insertion order and skips undefined, null and empty arrays', () => {
    expect(serializeQuery({ b: 2, a: 'x', u: undefined, n: null, e: [], c: true })).toBe(
      'b=2&a=x&c=true'
    );
  });

  it('serializes booleans, numbers, Dates (epoch ms) and arrays (comma-joined)', () => {
    const at = new Date(1718983010000);
    expect(serializeQuery({ t: true, f: false, n: -1.5, d: at, list: ['a', 1, false] })).toBe(
      't=true&f=false&n=-1.5&d=1718983010000&list=a%2C1%2Cfalse'
    );
  });

  it('keeps ":" raw in keys (filter keys) and encodes the value', () => {
    expect(serializeQuery({ 'data.flag:eq': 'a:b' })).toBe('data.flag:eq=a%3Ab');
  });

  it('encodes space, &, #, +, é in keys and values; URLSearchParams decodes them back', () => {
    const query = { 'a b&c#d+é': 'x y&z#w+é' };
    const encoded = serializeQuery(query);
    expect(encoded).toBe('a%20b%26c%23d%2B%C3%A9=x%20y%26z%23w%2B%C3%A9');
    expect([...new URLSearchParams(encoded)]).toEqual([['a b&c#d+é', 'x y&z#w+é']]);
  });

  it("an empty query or only skipped entries → ''", () => {
    expect(serializeQuery(undefined)).toBe('');
    expect(serializeQuery({})).toBe('');
    expect(serializeQuery({ a: undefined })).toBe('');
  });

  it('bigint values are sent as their digits', () => {
    expect(queryEntries({ big: 12345678901234567890n })).toEqual([['big', '12345678901234567890']]);
  });

  it.each([
    ['an object', { q: {} }],
    ['NaN', { q: NaN }],
    ['-Infinity', { q: -Infinity }],
    ['a nested array', { q: [['a']] }],
    ['a null element', { q: ['a', null] }],
    ['a symbol', { q: Symbol('s') }],
  ])('%s → ValidationError with status 0 before anything is sent', (_name, query) => {
    expect(() => serializeQuery(query)).toThrow(ValidationError);
    expect(() => serializeQuery(query)).toThrow(
      expect.objectContaining({ status: 0, details: ['q'] })
    );
  });
});
