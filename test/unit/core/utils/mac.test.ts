import { describe, it, expect } from 'vitest';
import { formatMac, isValidMac, normalizeMac } from '../../../../src/utils/mac';
import { ValidationError } from '../../../../src/errors';

describe('MAC helpers (P1 §6.7, D9)', () => {
  describe('normalizeMac', () => {
    it.each([
      ['AA:BB:CC:DD:EE:FF', 'aabbccddeeff'],
      ['aa-bb-cc-dd-ee-ff', 'aabbccddeeff'],
      ['aabb.ccdd.eeff', 'aabbccddeeff'],
      ['AABBCCDDEEFF', 'aabbccddeeff'],
      ['025d4b3fA901', '025d4b3fa901'],
    ])('%s → %s', (input, expected) => {
      expect(normalizeMac(input)).toBe(expected);
    });

    it.each([
      ['11 hex characters', 'aabbccddeef'],
      ['13 hex characters', 'aabbccddeeff0'],
      ['non-hex characters', 'zz:bb:cc:dd:ee:ff'],
      ['an empty string', ''],
      ['a space separator', 'aa bb cc dd ee ff'],
      ['surrounding whitespace', ' aabbccddeeff'],
    ])('%s → ValidationError with status 0', (_name, input) => {
      expect(() => normalizeMac(input)).toThrow(ValidationError);
      expect(() => normalizeMac(input)).toThrow(
        expect.objectContaining({ status: 0, code: 'VALIDATION_ERROR', details: ['mac'] })
      );
    });

    it.each([null, undefined, 42, {}])(
      'a non-string from JavaScript (%j) → ValidationError naming its type',
      (input) => {
        expect(() => normalizeMac(input as never)).toThrow(
          expect.objectContaining({
            status: 0,
            message: expect.stringMatching(/Invalid MAC address/),
          })
        );
      }
    );
  });

  describe('formatMac', () => {
    it('defaults to ":" and uppercase', () => {
      expect(formatMac('aabbccddeeff')).toBe('AA:BB:CC:DD:EE:FF');
    });

    it("separator '-'", () => {
      expect(formatMac('aa:bb:cc:dd:ee:ff', { separator: '-' })).toBe('AA-BB-CC-DD-EE-FF');
    });

    it("separator ''", () => {
      expect(formatMac('aa-bb-cc-dd-ee-ff', { separator: '' })).toBe('AABBCCDDEEFF');
    });

    it('lowercase', () => {
      expect(formatMac('AABBCCDDEEFF', { uppercase: false })).toBe('aa:bb:cc:dd:ee:ff');
      expect(formatMac('AABB.CCDD.EEFF', { separator: '', uppercase: false })).toBe('aabbccddeeff');
    });

    it('an invalid MAC → ValidationError', () => {
      expect(() => formatMac('nope')).toThrow(ValidationError);
    });

    it('round-trips with normalizeMac', () => {
      expect(normalizeMac(formatMac('025d4b3fa901'))).toBe('025d4b3fa901');
    });
  });

  describe('isValidMac', () => {
    it.each(['AA:BB:CC:DD:EE:FF', 'aa-bb-cc-dd-ee-ff', 'aabb.ccdd.eeff', 'AABBCCDDEEFF'])(
      '%s → true',
      (input) => {
        expect(isValidMac(input)).toBe(true);
      }
    );

    it.each([
      ['11 hex', 'aabbccddeef'],
      ['zz', 'zzbbccddeeff'],
      ['empty', ''],
      ['a number', 0xaabbccddeeff],
      ['null', null],
      ['undefined', undefined],
      ['an object', { mac: 'aabbccddeeff' }],
      ['an array', ['aabbccddeeff']],
    ])('%s → false, never throws', (_name, input) => {
      expect(isValidMac(input)).toBe(false);
    });
  });
});
