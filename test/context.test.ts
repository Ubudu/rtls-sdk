import { describe, it, expect } from 'vitest';
import {
  resolveContext,
  requireNamespace,
  requireVenueId,
  requireMapId,
  ContextError,
  isNamespaceArg,
  isVenueIdArg,
} from '../src/context';

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
      const result = resolveContext(defaults, undefined);

      expect(result).toEqual({ namespace: 'ns1' });
    });

    it('overrides namespace', () => {
      const defaults = { namespace: 'ns1', venueId: 1 };
      const overrides = { namespace: 'ns2' };

      expect(resolveContext(defaults, overrides)).toEqual({
        namespace: 'ns2',
        venueId: 1,
        mapId: undefined,
        level: undefined,
      });
    });

    it('overrides venueId', () => {
      const defaults = { namespace: 'ns1', venueId: 1 };
      const overrides = { venueId: 999 };

      expect(resolveContext(defaults, overrides).venueId).toBe(999);
    });

    it('overrides multiple values', () => {
      const defaults = { namespace: 'ns1', venueId: 1, mapId: 2, level: 3 };
      const overrides = { namespace: 'ns2', mapId: 200 };

      const result = resolveContext(defaults, overrides);
      expect(result.namespace).toBe('ns2');
      expect(result.venueId).toBe(1); // not overridden
      expect(result.mapId).toBe(200);
      expect(result.level).toBe(3); // not overridden
    });

    it('undefined override falls back to default', () => {
      const defaults = { namespace: 'ns1' };
      const overrides = { namespace: undefined };

      expect(resolveContext(defaults, overrides).namespace).toBe('ns1');
    });

    it('handles empty defaults', () => {
      const result = resolveContext({}, { namespace: 'ns1' });
      expect(result.namespace).toBe('ns1');
    });

    it('handles empty overrides', () => {
      const defaults = { namespace: 'ns1' };
      const result = resolveContext(defaults, {});
      expect(result.namespace).toBe('ns1');
    });
  });

  describe('requireNamespace', () => {
    it('returns context when namespace is present', () => {
      const ctx = { namespace: 'my-ns', venueId: 1 };
      const result = requireNamespace(ctx);

      expect(result.namespace).toBe('my-ns');
      expect(result.venueId).toBe(1);
    });

    it('throws ContextError when namespace is undefined', () => {
      expect(() => requireNamespace({})).toThrow(ContextError);
      expect(() => requireNamespace({})).toThrow(/Namespace is required/);
    });

    it('throws ContextError when namespace is empty string', () => {
      expect(() => requireNamespace({ namespace: '' })).toThrow(ContextError);
    });

    it('error message includes helpful suggestion', () => {
      try {
        requireNamespace({});
        expect.fail('Should have thrown');
      } catch (e) {
        expect((e as ContextError).suggestion).toContain('createRtlsClient');
        expect((e as ContextError).field).toBe('Namespace');
      }
    });
  });

  describe('requireVenueId', () => {
    it('returns context when venueId is present', () => {
      const ctx = { namespace: 'ns', venueId: 123 };
      const result = requireVenueId(ctx);

      expect(result.venueId).toBe(123);
    });

    it('accepts venueId of 0', () => {
      const ctx = { venueId: 0 };
      const result = requireVenueId(ctx);
      expect(result.venueId).toBe(0);
    });

    it('throws ContextError when venueId is undefined', () => {
      expect(() => requireVenueId({})).toThrow(ContextError);
      expect(() => requireVenueId({})).toThrow(/Venue ID is required/);
    });
  });

  describe('requireMapId', () => {
    it('returns context when mapId is present', () => {
      const ctx = { mapId: 456 };
      const result = requireMapId(ctx);

      expect(result.mapId).toBe(456);
    });

    it('throws ContextError when mapId is undefined', () => {
      expect(() => requireMapId({})).toThrow(ContextError);
      expect(() => requireMapId({})).toThrow(/Map ID is required/);
    });
  });

  describe('type guards', () => {
    describe('isNamespaceArg', () => {
      it('returns true for strings', () => {
        expect(isNamespaceArg('my-namespace')).toBe(true);
        expect(isNamespaceArg('')).toBe(true);
      });

      it('returns false for non-strings', () => {
        expect(isNamespaceArg(123)).toBe(false);
        expect(isNamespaceArg({})).toBe(false);
        expect(isNamespaceArg(null)).toBe(false);
        expect(isNamespaceArg(undefined)).toBe(false);
        expect(isNamespaceArg({ namespace: 'ns' })).toBe(false);
      });
    });

    describe('isVenueIdArg', () => {
      it('returns true for numbers', () => {
        expect(isVenueIdArg(123)).toBe(true);
        expect(isVenueIdArg(0)).toBe(true);
      });

      it('returns false for non-numbers', () => {
        expect(isVenueIdArg('123')).toBe(false);
        expect(isVenueIdArg({})).toBe(false);
        expect(isVenueIdArg(null)).toBe(false);
        expect(isVenueIdArg(undefined)).toBe(false);
      });
    });
  });

  describe('ContextError', () => {
    it('has correct name', () => {
      const error = new ContextError('Test', 'suggestion');
      expect(error.name).toBe('ContextError');
    });

    it('exposes field and suggestion', () => {
      const error = new ContextError('MyField', 'Do this instead');
      expect(error.field).toBe('MyField');
      expect(error.suggestion).toBe('Do this instead');
    });

    it('is instanceof Error', () => {
      const error = new ContextError('Test', 'suggestion');
      expect(error).toBeInstanceOf(Error);
    });
  });
});
