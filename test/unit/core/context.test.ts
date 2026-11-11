import { describe, it, expect } from 'vitest';
import {
  resolveContext,
  requireNamespace,
  requireVenueId,
  requireMapId,
  ContextError,
  isNamespaceArg,
  isVenueIdArg,
  type RtlsContext,
} from '../../../src/context';
import { RtlsError, createRtlsClient, type RtlsClient } from '../../../src';
import { resolveMapArgs, resolveVenueArgs, splitCallOptions } from '../../../src/utils/args';
import { recordRequests } from '../../mocks/server';

/** Asserts a ContextError with the given field and problem (status 0, code CONTEXT_ERROR). */
function expectContextError(
  fn: () => unknown,
  field: string,
  problem: 'missing' | 'invalid'
): void {
  expect(fn).toThrow(ContextError);
  expect(fn).toThrow(expect.objectContaining({ field, problem, status: 0, code: 'CONTEXT_ERROR' }));
}

describe('context', () => {
  describe('resolveContext', () => {
    it('returns copy of defaults when no overrides', () => {
      const defaults = { namespace: 'ns1', venueId: 1, mapId: 2, level: 3 };
      const result = resolveContext(defaults);

      expect(result).toEqual(defaults);
      expect(result).not.toBe(defaults); // Should be a copy
    });

    it('returns copy of defaults when overrides is undefined', () => {
      const defaults = { namespace: 'ns1' };
      expect(resolveContext(defaults, undefined)).toEqual({ namespace: 'ns1' });
    });

    it('overrides namespace', () => {
      const defaults = { namespace: 'ns1', venueId: 1 };
      expect(resolveContext(defaults, { namespace: 'ns2' })).toEqual({
        namespace: 'ns2',
        venueId: 1,
        mapId: undefined,
        level: undefined,
      });
    });

    it('overrides multiple values', () => {
      const defaults = { namespace: 'ns1', venueId: 1, mapId: 2, level: 3 };
      const result = resolveContext(defaults, { namespace: 'ns2', mapId: 200 });
      expect(result).toEqual({ namespace: 'ns2', venueId: 1, mapId: 200, level: 3 });
    });

    it.each([
      ['undefined', undefined],
      ['null', null],
      ["''", ''],
    ])('a %s override falls back to the default', (_name, value) => {
      const defaults = { namespace: 'ns1', venueId: 1, mapId: 2, level: -1 };
      const overrides = {
        namespace: value,
        venueId: value,
        mapId: value,
        level: value,
      } as unknown as RtlsContext;
      expect(resolveContext(defaults, overrides)).toEqual(defaults);
    });

    it('0 and a negative level are real overrides, not fallbacks', () => {
      expect(resolveContext({ venueId: 5, level: 2 }, { venueId: 0, level: -2 })).toEqual({
        venueId: 0,
        level: -2,
        namespace: undefined,
        mapId: undefined,
      });
    });

    it('handles empty defaults and empty overrides', () => {
      expect(resolveContext({}, { namespace: 'ns1' }).namespace).toBe('ns1');
      expect(resolveContext({ namespace: 'ns1' }, {}).namespace).toBe('ns1');
    });
  });

  describe('requireNamespace', () => {
    it('returns context when namespace is present', () => {
      const result = requireNamespace({ namespace: 'my-ns', venueId: 1 });
      expect(result.namespace).toBe('my-ns');
      expect(result.venueId).toBe(1);
    });

    it.each([
      ['undefined', undefined],
      ['empty string', ''],
      ['null', null],
    ])('%s → ContextError (missing) with the 0.2.0 message', (_name, namespace) => {
      const ctx = { namespace } as unknown as RtlsContext;
      expectContextError(() => requireNamespace(ctx), 'Namespace', 'missing');
      expect(() => requireNamespace(ctx)).toThrow(/^Namespace is required\. Pass it to the method/);
    });

    it('a non-string namespace from JavaScript → ContextError (invalid)', () => {
      const ctx = { namespace: 42 } as unknown as RtlsContext;
      expectContextError(() => requireNamespace(ctx), 'Namespace', 'invalid');
    });

    it('the suggestion names createRtlsClient', () => {
      expect(() => requireNamespace({})).toThrow(
        expect.objectContaining({ suggestion: expect.stringContaining('createRtlsClient') })
      );
    });
  });

  describe.each([
    ['requireVenueId', 'Venue ID', 'venueId', requireVenueId],
    ['requireMapId', 'Map ID', 'mapId', requireMapId],
  ] as const)('%s', (_name, field, key, requireFn) => {
    it('returns the context for an integer >= 0, 0 included', () => {
      expect(requireFn({ [key]: 123 })[key]).toBe(123);
      expect(requireFn({ [key]: 0 })[key]).toBe(0);
    });

    it('undefined → ContextError (missing) with the 0.2.0 message', () => {
      expectContextError(() => requireFn({}), field, 'missing');
      expect(() => requireFn({})).toThrow(new RegExp(`^${field} is required\\. `));
    });

    it.each([
      ['NaN', NaN],
      ['1.5', 1.5],
      ['-1', -1],
      ["'3'", '3'],
      ['null', null],
      ['Infinity', Infinity],
    ])('%s → ContextError (invalid), "is invalid" message', (_label, value) => {
      const ctx = { [key]: value } as unknown as RtlsContext;
      expectContextError(() => requireFn(ctx), field, 'invalid');
      expect(() => requireFn(ctx)).toThrow(new RegExp(`^${field} is invalid\\. `));
    });
  });

  describe('client setters validate their argument', () => {
    it.each<[string, (c: RtlsClient) => unknown, string]>([
      ['setVenue(NaN)', (c) => c.setVenue(NaN), 'Venue ID'],
      ['setVenue(-1)', (c) => c.setVenue(-1), 'Venue ID'],
      ["setVenue('3')", (c) => c.setVenue('3' as unknown as number), 'Venue ID'],
      ['setMap(-1)', (c) => c.setMap(-1), 'Map ID'],
      ['setMap(1.5)', (c) => c.setMap(1.5), 'Map ID'],
      ['setLevel(1.5)', (c) => c.setLevel(1.5), 'Level'],
      ['setLevel(NaN)', (c) => c.setLevel(NaN), 'Level'],
      ['setNamespace(42)', (c) => c.setNamespace(42 as unknown as string), 'Namespace'],
    ])('%s → ContextError (invalid), context unchanged', (_name, call, field) => {
      const client = createRtlsClient({ namespace: 'ns', venueId: 1, mapId: 2, level: 3 });
      expectContextError(() => call(client), field, 'invalid');
      expect(client.context).toEqual({ namespace: 'ns', venueId: 1, mapId: 2, level: 3 });
    });

    it('the message names what was received: null, an object, a string, a number', () => {
      const client = createRtlsClient();
      expect(() => client.setVenue(null as unknown as number)).toThrow('(received null)');
      expect(() => client.setLevel({} as unknown as number)).toThrow('(received object)');
      expect(() => client.setMap('x' as unknown as number)).toThrow('(received the string "x")');
      expect(() => client.setVenue(-2)).toThrow('(received -2)');
    });

    it('setLevel(-1) and setVenue(0) are accepted', () => {
      const client = createRtlsClient();
      client.setLevel(-1).setVenue(0).setMap(0);
      expect(client.level).toBe(-1);
      expect(client.venueId).toBe(0);
      expect(client.mapId).toBe(0);
    });

    it('the constructor validates the context options too', () => {
      expectContextError(() => createRtlsClient({ venueId: NaN }), 'Venue ID', 'invalid');
      expectContextError(() => createRtlsClient({ level: 0.5 }), 'Level', 'invalid');
    });
  });

  describe('setContext (B9)', () => {
    it('a key present with undefined clears it; absent keys are kept', () => {
      const client = createRtlsClient({ namespace: 'ns', venueId: 1, mapId: 2, level: 3 });
      client.setContext({ venueId: undefined });
      expect(client.venueId).toBeUndefined();
      expect(client.context).toEqual({ namespace: 'ns', mapId: 2, level: 3 });
    });

    it('null clears as well (JavaScript callers)', () => {
      const client = createRtlsClient({ namespace: 'ns', mapId: 2 });
      client.setContext({ mapId: null } as unknown as RtlsContext);
      expect(client.mapId).toBeUndefined();
      expect(client.namespace).toBe('ns');
    });

    it('sets the given values and validates them; an invalid one changes nothing', () => {
      const client = createRtlsClient({ namespace: 'ns', venueId: 1 });
      client.setContext({ venueId: 7, level: -2 });
      expect(client.context).toEqual({ namespace: 'ns', venueId: 7, level: -2 });
      expectContextError(
        () => client.setContext({ namespace: 'x', mapId: -1 }),
        'Map ID',
        'invalid'
      );
      expect(client.context).toEqual({ namespace: 'ns', venueId: 7, level: -2 });
    });
  });

  describe('resolveVenueArgs / resolveMapArgs (legacy positional form, real client)', () => {
    const client = createRtlsClient({ namespace: 'ctx-ns', venueId: 5, mapId: 6 });
    const bare = createRtlsClient({ namespace: 'ctx-ns' });

    it("resolveVenueArgs(client, 'ns') → the context venue", () => {
      expect(resolveVenueArgs(client, 'ns')).toEqual({
        namespace: 'ns',
        venueId: 5,
        options: undefined,
      });
    });

    it("resolveVenueArgs(client, 'ns', { venueId: 9, limit: 1 }) → venue 9, options kept", () => {
      const options = { venueId: 9, limit: 1 };
      expect(resolveVenueArgs(client, 'ns', options)).toEqual({
        namespace: 'ns',
        venueId: 9,
        options,
      });
    });

    it("resolveVenueArgs(client, 'ns', '42') → 42; a number is kept; options after the id are kept", () => {
      expect(resolveVenueArgs(client, 'ns', '42').venueId).toBe(42);
      expect(resolveVenueArgs(client, 'ns', 3, { limit: 2 })).toEqual({
        namespace: 'ns',
        venueId: 3,
        options: { limit: 2 },
      });
    });

    it("resolveVenueArgs(client, 'ns', undefined, { venueId: 8 }) → venue from the trailing options", () => {
      expect(resolveVenueArgs(client, 'ns', undefined, { venueId: 8 }).venueId).toBe(8);
    });

    it.each([
      ["'x'", 'x'],
      ["'4.5'", '4.5'],
      ["'-1'", '-1'],
      ['NaN', NaN],
      ['-1', -1],
      ['1.5', 1.5],
      ['null', null],
    ])('resolveVenueArgs with %s → ContextError (invalid), not a plain Error', (_label, value) => {
      const call = () => resolveVenueArgs(client, 'ns', value as never);
      expectContextError(call, 'Venue ID', 'invalid');
      expect(call).toThrow(RtlsError);
    });

    it('no venue anywhere → ContextError (missing)', () => {
      expectContextError(() => resolveVenueArgs(bare, 'ns'), 'Venue ID', 'missing');
    });

    it('the context form validates per-call ids too', () => {
      expectContextError(() => resolveVenueArgs(client, { venueId: NaN }), 'Venue ID', 'invalid');
    });

    it("resolveMapArgs(client, 'ns') → the context venue and map", () => {
      expect(resolveMapArgs(client, 'ns')).toEqual({
        namespace: 'ns',
        venueId: 5,
        mapId: 6,
        options: undefined,
      });
    });

    it('resolveMapArgs: digit strings, numbers, a bag in place of an id, trailing options', () => {
      expect(resolveMapArgs(client, 'ns', '4', '5')).toMatchObject({ venueId: 4, mapId: 5 });
      expect(resolveMapArgs(client, 'ns', 4, { mapId: 7, limit: 1 })).toEqual({
        namespace: 'ns',
        venueId: 4,
        mapId: 7,
        options: { mapId: 7, limit: 1 },
      });
      expect(resolveMapArgs(client, 'ns', { venueId: 9, mapId: 8 })).toMatchObject({
        venueId: 9,
        mapId: 8,
      });
      expect(resolveMapArgs(client, 'ns', 1, 2, { limit: 3 })).toEqual({
        namespace: 'ns',
        venueId: 1,
        mapId: 2,
        options: { limit: 3 },
      });
    });

    it.each([
      ['x', 1, 'Venue ID'],
      [1, '4.5', 'Map ID'],
      [1, NaN, 'Map ID'],
      [NaN, 1, 'Venue ID'],
    ])('resolveMapArgs(client, ns, %j, %j) → ContextError (invalid) on %s', (venue, map, field) => {
      expectContextError(
        () => resolveMapArgs(client, 'ns', venue as never, map as never),
        field,
        'invalid'
      );
    });

    it('resolveMapArgs without a map anywhere → ContextError (missing)', () => {
      expectContextError(() => resolveMapArgs(bare, 'ns', 1), 'Map ID', 'missing');
    });
  });

  describe('B10: a malformed context id fails before any request', () => {
    it('zones.list({ venueId: NaN }) → ContextError (invalid), no request', async () => {
      const rec = recordRequests();
      const client = createRtlsClient({ apiKey: 'k', namespace: 'ns' });
      await expect(client.zones.list({ venueId: NaN })).rejects.toBeInstanceOf(ContextError);
      await expect(client.zones.list({ venueId: NaN })).rejects.toMatchObject({
        problem: 'invalid',
      });
      expect(rec.requests).toHaveLength(0);
    });
  });

  describe('splitCallOptions', () => {
    it('splits the 7 keys, keeps level in ctx and the rest (undefined values included)', () => {
      const signal = new AbortController().signal;
      const input = {
        namespace: 'ns',
        venueId: 1,
        mapId: 2,
        level: -1,
        signal,
        timeoutMs: 5,
        headers: { a: '1' },
        limit: 10,
        cursor: undefined,
      };
      const copy = { ...input, headers: { ...input.headers } };
      const { ctx, request, rest } = splitCallOptions(input);
      expect(ctx).toEqual({ namespace: 'ns', venueId: 1, mapId: 2, level: -1 });
      expect(request).toEqual({ signal, timeoutMs: 5, headers: { a: '1' } });
      expect(rest).toEqual({ limit: 10, cursor: undefined });
      expect(Object.prototype.hasOwnProperty.call(rest, 'cursor')).toBe(true);
      expect(input).toEqual(copy);
    });

    it('trailing request options win; headers are merged, trailing wins per header', () => {
      const { request } = splitCallOptions(
        { timeoutMs: 1, headers: { a: '1', b: '1' } },
        { timeoutMs: 2, headers: { b: '2' } }
      );
      expect(request).toEqual({ timeoutMs: 2, headers: { a: '1', b: '2' } });
    });

    it('header names are compared without case when merging', () => {
      const { request } = splitCallOptions(
        { headers: { 'X-Trace': '1' } },
        { headers: { 'x-trace': '2' } }
      );
      expect(request.headers).toEqual({ 'x-trace': '2' });
    });

    it('a trailing signal wins; undefined trailing keys do not erase the bag values', () => {
      const a = new AbortController().signal;
      const b = new AbortController().signal;
      expect(splitCallOptions({ signal: a, timeoutMs: 3 }, { signal: b }).request).toEqual({
        signal: b,
        timeoutMs: 3,
      });
      expect(splitCallOptions({ timeoutMs: 3 }, { timeoutMs: undefined }).request).toEqual({
        timeoutMs: 3,
      });
      expect(splitCallOptions(undefined, { headers: { h: '1' } }).request).toEqual({
        headers: { h: '1' },
      });
    });

    it('no options → empty parts', () => {
      expect(splitCallOptions()).toEqual({ ctx: {}, request: {}, rest: {} });
    });
  });

  describe('type guards', () => {
    it('isNamespaceArg: true for strings only', () => {
      expect(isNamespaceArg('my-namespace')).toBe(true);
      expect(isNamespaceArg('')).toBe(true);
      expect(isNamespaceArg(123)).toBe(false);
      expect(isNamespaceArg({ namespace: 'ns' })).toBe(false);
      expect(isNamespaceArg(null)).toBe(false);
      expect(isNamespaceArg(undefined)).toBe(false);
    });

    it('isVenueIdArg: true for numbers only', () => {
      expect(isVenueIdArg(123)).toBe(true);
      expect(isVenueIdArg(0)).toBe(true);
      expect(isVenueIdArg('123')).toBe(false);
      expect(isVenueIdArg({})).toBe(false);
      expect(isVenueIdArg(null)).toBe(false);
    });
  });

  describe('ContextError', () => {
    it('has the name ContextError and keeps field and suggestion', () => {
      const error = new ContextError('MyField', 'Do this instead');
      expect(error.name).toBe('ContextError');
      expect(error.field).toBe('MyField');
      expect(error.suggestion).toBe('Do this instead');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(RtlsError);
    });
  });
});
