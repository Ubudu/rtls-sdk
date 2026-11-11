import { describe, expect, it } from 'vitest';
import { diffRedacted, expectDeepEqualRedacted, RedactedAssertionError } from './assert';
import { countAssertion } from './assertion-count';

const SECRET_MAIL = 'person@example.com';
const SECRET_HEX = 'a'.repeat(20) + 'b'.repeat(20);

function failure(fn: () => void): RedactedAssertionError {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
    if (!(error instanceof RedactedAssertionError)) throw error;
  }
  if (!(caught instanceof RedactedAssertionError))
    throw new Error('expected a RedactedAssertionError');
  return caught;
}

describe('expectDeepEqualRedacted', () => {
  it('counts as an assertion on its own (expect.hasAssertions in the setup file)', () => {
    expectDeepEqualRedacted({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }, 'same');
  });

  it('ignores key order', () => {
    expect(() =>
      expectDeepEqualRedacted(
        { a: 1, b: { c: [1, 2], d: 'x' } },
        { b: { d: 'x', c: [1, 2] }, a: 1 },
        'same'
      )
    ).not.toThrow();
    expect(diffRedacted({ a: 1, b: 2 }, { b: 2, a: 1 })).toEqual([]);
  });

  it('is order-sensitive for arrays', () => {
    expect(diffRedacted([1, 2], [2, 1])).toEqual([
      { path: '[0]', kind: 'value' },
      { path: '[1]', kind: 'value' },
    ]);
    expect(() =>
      expectDeepEqualRedacted({ rules: ['a', 'b'] }, { rules: ['b', 'a'] }, 'rules')
    ).toThrow(RedactedAssertionError);
  });

  it('ignorePaths takes dotted paths with [n] and [*] / * wildcards', () => {
    const actual = {
      rules: [
        { id: 'r1', updated_at: 2 },
        { id: 'r2', updated_at: 3 },
      ],
      meta: { v: 1, w: 9 },
    };
    const expected = {
      rules: [
        { id: 'r1', updated_at: 1 },
        { id: 'r2', updated_at: 1 },
      ],
      meta: { v: 1, w: 8 },
    };
    expect(diffRedacted(actual, expected)).toHaveLength(3);
    expect(
      diffRedacted(actual, expected, { ignorePaths: ['rules[*].updated_at', 'meta.w'] })
    ).toEqual([]);
    expect(
      diffRedacted(actual, expected, { ignorePaths: ['rules[0].updated_at', 'meta.*'] })
    ).toEqual([{ path: 'rules[1].updated_at', kind: 'value' }]);
  });

  it('lists path and kind for missing, extra, changed type and changed value, without any value', () => {
    const actual = {
      mail: SECRET_MAIL,
      hex: SECRET_HEX,
      extra: SECRET_MAIL,
      typed: SECRET_HEX,
      list: [SECRET_MAIL],
    };
    const expected = {
      mail: `x${SECRET_MAIL}`,
      hex: SECRET_HEX,
      missing: SECRET_HEX,
      typed: { v: SECRET_HEX },
      list: [SECRET_MAIL, SECRET_HEX],
    };
    const error = failure(() => expectDeepEqualRedacted(actual, expected, 'label-x'));
    expect(error.message).toBe(
      [
        'label-x: 5 differences',
        'extra extra',
        'list[1] missing',
        'mail value',
        'missing missing',
        'typed type',
      ].join('\n')
    );
    expect(error.message).not.toContain(SECRET_MAIL);
    expect(error.message).not.toContain(SECRET_HEX);
    expect(JSON.stringify(error)).not.toContain(SECRET_MAIL);
    expect(error).not.toHaveProperty('actual');
    expect(error).not.toHaveProperty('expected');
  });

  it('prints at most 20 difference lines', () => {
    const many = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [`k${String(i).padStart(2, '0')}`, i])
    );
    const error = failure(() => expectDeepEqualRedacted(many, {}, 'many'));
    const lines = error.message.split('\n');
    expect(lines[0]).toBe('many: 30 differences');
    expect(lines).toHaveLength(21);
    expect(error.differences).toHaveLength(30);
  });
});

describe('countAssertion', () => {
  it('raises vitest’s assertion count by one and is a no-op without vitest’s global expect', () => {
    const key = Symbol.for('expect-global');
    const g = globalThis as Record<PropertyKey, unknown>;
    const before = expect.getState().assertionCalls;
    countAssertion();
    const after = expect.getState().assertionCalls;
    const saved = g[key];
    delete g[key];
    try {
      countAssertion();
    } finally {
      g[key] = saved;
    }
    expect(after - before).toBe(1);
    expect(expect.getState().assertionCalls).toBe(after + 1);
  });
});
