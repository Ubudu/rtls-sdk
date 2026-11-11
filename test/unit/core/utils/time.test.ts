import { afterEach, describe, it, expect, vi } from 'vitest';
import { resolveTimeRange, toEpochMs, type TimeInput } from '../../../../src/utils/time';
import { ValidationError } from '../../../../src/errors';

const MS = 1718983010000; // 2024-06-21T15:16:50.000Z
const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

describe('time helpers (P1 §6.7, src/utils/time.ts)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('toEpochMs', () => {
    it.each<[string, TimeInput, number]>([
      ['a Date', new Date('2024-06-21T15:16:50.000Z'), MS],
      ['epoch ms (number, as is)', MS, MS],
      ['0', 0, 0],
      ['a negative number (before 1970)', -1000, -1000],
      ['a fractional number (as is)', 1.5, 1.5],
      ["a digit string '1718983010000'", '1718983010000', MS],
      ["a negative digit string '-5'", '-5', -5],
      ['an ISO string', '2024-06-21T15:16:50Z', MS],
      ['an ISO string with an offset', '2024-06-21T17:16:50+02:00', MS],
      ['a date-only ISO string (UTC midnight)', '2024-06-21', Date.UTC(2024, 5, 21)],
    ])('%s', (_name, input, expected) => {
      expect(toEpochMs(input)).toBe(expected);
    });

    it.each<[string, unknown]>([
      ['an invalid Date', new Date('not a date')],
      ['NaN', NaN],
      ['Infinity', Infinity],
      ['a garbage string', 'yesterday-ish'],
      ['an empty string', ''],
      ['a decimal string that is not a date', '12.5.7x'],
      ['null (from JavaScript)', null],
      ['a boolean (from JavaScript)', true],
      ['an object (from JavaScript)', {}],
    ])('%s → ValidationError with status 0', (_name, input) => {
      expect(() => toEpochMs(input as TimeInput)).toThrow(ValidationError);
      expect(() => toEpochMs(input as TimeInput)).toThrow(
        expect.objectContaining({ status: 0, code: 'VALIDATION_ERROR', details: ['time'] })
      );
    });
  });

  describe('resolveTimeRange', () => {
    it('{} → the last 24 hours up to now', () => {
      expect(resolveTimeRange({}, { now: NOW })).toStrictEqual({ from: NOW - DAY, to: NOW });
    });

    it('now defaults to Date.now()', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW);
      expect(resolveTimeRange({})).toStrictEqual({ from: NOW - DAY, to: NOW });
    });

    it('{ from } only → to = now', () => {
      expect(resolveTimeRange({ from: MS }, { now: NOW })).toStrictEqual({ from: MS, to: NOW });
    });

    it('{ to } only → from = to − window', () => {
      expect(resolveTimeRange({ to: MS }, { now: NOW })).toStrictEqual({ from: MS - DAY, to: MS });
    });

    it('both bounds → as given, each converted with toEpochMs', () => {
      expect(
        resolveTimeRange({ from: new Date(MS - 5), to: String(MS) }, { now: NOW })
      ).toStrictEqual({ from: MS - 5, to: MS });
      expect(resolveTimeRange({ from: '2024-06-21T15:16:50Z', to: MS + 1 })).toStrictEqual({
        from: MS,
        to: MS + 1,
      });
    });

    it('from === to is accepted', () => {
      expect(resolveTimeRange({ from: MS, to: MS })).toStrictEqual({ from: MS, to: MS });
    });

    it('from > to → ValidationError with status 0', () => {
      const run = (): unknown => resolveTimeRange({ from: MS + 1, to: MS });
      expect(run).toThrow(ValidationError);
      expect(run).toThrow(
        expect.objectContaining({
          status: 0,
          details: ['from'],
          message: expect.stringMatching(/is after to/),
        })
      );
    });

    it('{ from } after now → ValidationError', () => {
      expect(() => resolveTimeRange({ from: NOW + 1 }, { now: NOW })).toThrow(
        expect.objectContaining({ status: 0, details: ['from'] })
      );
    });

    it('a custom window applies to {} and to { to }', () => {
      const hour = 3_600_000;
      expect(resolveTimeRange({}, { now: NOW, defaultWindowMs: hour })).toStrictEqual({
        from: NOW - hour,
        to: NOW,
      });
      expect(resolveTimeRange({ to: MS }, { defaultWindowMs: hour })).toStrictEqual({
        from: MS - hour,
        to: MS,
      });
      expect(resolveTimeRange({}, { now: NOW, defaultWindowMs: 0 })).toStrictEqual({
        from: NOW,
        to: NOW,
      });
    });

    it('undefined and null bounds count as not given', () => {
      expect(
        resolveTimeRange({ from: undefined, to: null as unknown as TimeInput }, { now: NOW })
      ).toStrictEqual({ from: NOW - DAY, to: NOW });
    });

    it.each<[string, { from?: unknown; to?: unknown }, string]>([
      ['an invalid from', { from: 'nope' }, 'from'],
      ['an invalid to', { to: NaN }, 'to'],
      ['an invalid Date to', { from: MS, to: new Date('x') }, 'to'],
    ])('%s → ValidationError naming the bound', (_name, range, detail) => {
      expect(() => resolveTimeRange(range as { from?: TimeInput; to?: TimeInput })).toThrow(
        expect.objectContaining({ status: 0, code: 'VALIDATION_ERROR', details: [detail] })
      );
    });

    it.each<[string, { defaultWindowMs?: unknown; now?: unknown }, string]>([
      ['a negative window', { defaultWindowMs: -1 }, 'defaultWindowMs'],
      ['a NaN window', { defaultWindowMs: NaN }, 'defaultWindowMs'],
      ['an infinite window', { defaultWindowMs: Infinity }, 'defaultWindowMs'],
      ['a string now', { now: '1' }, 'now'],
      ['a NaN now', { now: NaN }, 'now'],
    ])('%s → ValidationError naming the option', (_name, options, detail) => {
      expect(() =>
        resolveTimeRange({}, options as { defaultWindowMs?: number; now?: number })
      ).toThrow(expect.objectContaining({ status: 0, details: [detail] }));
    });

    it.each([null, undefined, 'last day'])('a range that is %j → ValidationError', (range) => {
      expect(() => resolveTimeRange(range as never)).toThrow(
        expect.objectContaining({ status: 0, details: ['range'] })
      );
    });
  });
});
