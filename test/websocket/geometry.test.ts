// Unit tests of the zone-0 rule guard of the live publisher suite (spec P8 §9.1 step 6, P8-T14).
import { describe, expect, it } from 'vitest';
import { evaluateAlertRules, TIME_IN_ZONE_MIN_SECONDS } from '../../examples/shared/preflight.js';
import {
  leafCannotMatch,
  ruleProvablyUnmatched,
  zoneZeroRuleGuard,
} from '../integration/websocket/geometry';

const leaf = (fact: string, operator: string, value: unknown) => ({ fact, operator, value });
const rule = (conditions: unknown, extra: Record<string, unknown> = {}) => ({
  conditions,
  event: { type: 'message', params: {} },
  ...extra,
});
const doc = (...rules: unknown[]) => ({ name: 'rules', rules });

describe('zone-0 rule guard', () => {
  it('ignores a disabled rule', () => {
    const v = zoneZeroRuleGuard(
      doc(rule({ all: [leaf('zone_id', 'equal', 0)] }, { disabled: true }))
    );
    expect(v).toEqual({ safe: true, mayMatch: [], invalidDocument: false });
  });

  it('an all root with zone_id equal 3 is unmatched', () => {
    expect(ruleProvablyUnmatched(rule({ all: [leaf('zone_id', 'equal', 3)] }))).toBe(true);
    expect(zoneZeroRuleGuard(doc(rule({ all: [leaf('zone_id', 'equal', 3)] }))).safe).toBe(true);
  });

  it('zone_id equal 0 may match', () => {
    const v = zoneZeroRuleGuard(doc(rule({ all: [leaf('zone_id', 'equal', 0)] })));
    expect(v).toEqual({ safe: false, mayMatch: [0], invalidDocument: false });
    expect(leafCannotMatch(leaf('zone_id', 'equal', '0'))).toBe(false);
    expect(leafCannotMatch(leaf('zone_id', 'equal', 'OUTSIDE_ALL_ZONES'))).toBe(false);
  });

  it('zone_id in [0, 5] may match; in [3, 5] cannot', () => {
    expect(ruleProvablyUnmatched(rule({ all: [leaf('zone_id', 'in', [0, 5])] }))).toBe(false);
    expect(leafCannotMatch(leaf('zone_id', 'in', [3, 5]))).toBe(true);
    expect(leafCannotMatch(leaf('zone_id', 'in', []))).toBe(false);
  });

  it("user_type equal 'forklift' is unmatched", () => {
    expect(ruleProvablyUnmatched(rule({ all: [leaf('user_type', 'equal', 'forklift')] }))).toBe(
      true
    );
  });

  it('user_udid in a list holding a test MAC may match', () => {
    const r = rule({ all: [leaf('user_udid', 'in', ['aabbccddeeff', '02:5D:4B:00:00:01'])] });
    expect(ruleProvablyUnmatched(r)).toBe(false);
    expect(leafCannotMatch(leaf('user_name', 'equal', 'sdk-test-abc'))).toBe(false);
    expect(leafCannotMatch(leaf('user_udid', 'in', ['aabbccddeeff']))).toBe(true);
  });

  it('an any root with one unknown fact may match; all cannot-match children are unmatched', () => {
    const mixed = rule({ any: [leaf('zone_id', 'equal', 3), leaf('battery', 'lessThan', 10)] });
    expect(ruleProvablyUnmatched(mixed)).toBe(false);
    const closed = rule({ any: [leaf('zone_id', 'equal', 3), leaf('zone_name', 'equal', 'Dock')] });
    expect(ruleProvablyUnmatched(closed)).toBe(true);
    expect(ruleProvablyUnmatched(rule({ any: [] }))).toBe(false);
  });

  it('a nested-only root may match', () => {
    const nested = rule({ all: [{ any: [leaf('zone_id', 'equal', 3)] }] });
    expect(ruleProvablyUnmatched(nested)).toBe(false);
    expect(ruleProvablyUnmatched(rule({ all: [], any: [] }))).toBe(false);
    expect(ruleProvablyUnmatched(rule(undefined))).toBe(false);
  });

  it('a document that is not { name, rules } may match', () => {
    for (const d of [null, [], 'rules', { rules: [] }, { name: 'x', rules: {} }, { name: 'x' }]) {
      expect(zoneZeroRuleGuard(d)).toEqual({ safe: false, mayMatch: [], invalidDocument: true });
    }
  });

  it('covers the remaining leaf forms', () => {
    expect(leafCannotMatch(leaf('zone_name', 'equal', 'OUTSIDE_ALL_ZONES'))).toBe(false);
    expect(leafCannotMatch(leaf('zone_name', 'in', ['Dock', 'Gate']))).toBe(true);
    expect(leafCannotMatch(leaf('zone_name', 'in', ['Dock', 'OUTSIDE_ALL_ZONES']))).toBe(false);
    expect(leafCannotMatch(leaf('zone_name', 'notEqual', 'Dock'))).toBe(false);
    expect(leafCannotMatch(leaf('zone_tags', 'contains', 'dock'))).toBe(true);
    expect(leafCannotMatch(leaf('user_tags', 'contains', ''))).toBe(false);
    expect(leafCannotMatch(leaf('is_virtual', 'equal', true))).toBe(true);
    expect(leafCannotMatch(leaf('is_declared_position', 'equal', false))).toBe(false);
    expect(leafCannotMatch(leaf('zone_id', 'notEqual', 3))).toBe(false);
    expect(leafCannotMatch({ fact: 'zone_id', operator: 'equal' })).toBe(false);
    expect(leafCannotMatch({ ...leaf('zone_id', 'equal', 3), path: '$.x' })).toBe(false);
    expect(leafCannotMatch('zone_id')).toBe(false);
    expect(leafCannotMatch(leaf('model', 'in', 'GenericTag'))).toBe(false);
  });

  it('reports the indices of the rules that may match', () => {
    const v = zoneZeroRuleGuard(
      doc(
        rule({ all: [leaf('zone_id', 'equal', 3)] }),
        rule({ all: [leaf('zone_id', 'equal', 0)] }),
        rule({ any: [leaf('speed', 'greaterThan', 2)] })
      )
    );
    expect(v.mayMatch).toEqual([1, 2]);
    expect(v.safe).toBe(false);
  });
});

// The two leaves of the owner decision (LIVE-TESTING §2.7), with the variants of the shared preflight's tests
// (test/integration/harness/preflight.test.ts); `timeInZone: true` stands for a time-limited shared positionSafe.
const EXT = leaf('external_id', 'notEmpty', true);
const TIZ = leaf('time_in_zone', 'greaterThan', 3600);
const TIMED = { timeInZone: true };
const msgAll = (...nodes: unknown[]) => rule({ all: nodes });

const EXT_OPERATORS = [
  ['empty', 'empty', true],
  ['empty false', 'empty', false],
  ['notEqual', 'notEqual', ''],
  ['equal null', 'equal', null],
  ['in', 'in', ['']],
  ['notIn', 'notIn', ['x']],
  ['NotEmpty (case)', 'NotEmpty', true],
  ['notempty (case)', 'notempty', true],
] as const;
const TIZ_OPERATORS = [
  'greaterThanInclusive',
  'lessThan',
  'lessThanInclusive',
  'equal',
  'notEqual',
  'GreaterThan',
] as const;
const EXT_REFUSED_VALUES: readonly unknown[] = [
  false,
  0,
  1,
  'true',
  '',
  null,
  { fact: 'user_udid' },
  '{{external_id}}',
];
const TIZ_REFUSED_VALUES: readonly unknown[] = [
  3599,
  600,
  0,
  -1,
  '3600',
  '7200',
  true,
  false,
  null,
  [7200],
  { fact: 'battery_percent' },
  '{{time_in_zone}}',
  Number.NaN,
  Number.POSITIVE_INFINITY,
];
const TIZ_ACCEPTED_VALUES = [3600, 3600.5, 86400, 1e9] as const;
const OTHER_FACTS = [
  leaf('user_udid', 'notEmpty', true),
  leaf('user_name', 'notEmpty', true),
  leaf('model', 'notEmpty', true),
  leaf('zone_name', 'notEmpty', true),
  leaf('zone_count', 'greaterThan', 3600),
  leaf('timestamp', 'greaterThan', 3600),
  leaf('battery_percent', 'greaterThan', 7200),
];
const WRAPPED = [
  { not: EXT },
  { not: TIZ },
  { all: [EXT, TIZ] },
  { any: [TIZ] },
  { ...EXT, path: '$.x' },
  { ...TIZ, path: '$.x' },
  { ...TIZ, params: { zone: 1 } },
  { ...EXT, condition: 'shared' },
  { ...TIZ, fact: '{{f}}' },
];

describe('zone-0 rule guard: the two leaves of the owner decision', () => {
  it('uses the shared threshold', () => {
    expect(TIME_IN_ZONE_MIN_SECONDS).toBe(3600);
  });

  it('the Demo Factory rule shape (`all` of both leaves) is unmatched, with or without the time_in_zone leaf', () => {
    const d = doc(msgAll(EXT, TIZ));
    expect(zoneZeroRuleGuard(d)).toEqual({ safe: true, mayMatch: [], invalidDocument: false });
    expect(zoneZeroRuleGuard(d, TIMED)).toEqual({
      safe: true,
      mayMatch: [],
      invalidDocument: false,
    });
  });

  it('external_id notEmpty true cannot match; time_in_zone counts only with timeInZone', () => {
    expect(leafCannotMatch(EXT)).toBe(true);
    expect(leafCannotMatch(TIZ)).toBe(false);
    expect(leafCannotMatch(TIZ, {})).toBe(false);
    expect(leafCannotMatch(TIZ, { timeInZone: false })).toBe(false);
    expect(leafCannotMatch(TIZ, TIMED)).toBe(true);
    // next to a may-match leaf, one cannot-match leaf still decides an `all` root
    const battery = leaf('battery_percent', 'lessThan', 10);
    expect(ruleProvablyUnmatched(msgAll(battery, EXT))).toBe(true);
    expect(ruleProvablyUnmatched(msgAll(battery, TIZ))).toBe(false);
    expect(ruleProvablyUnmatched(msgAll(battery, TIZ), TIMED)).toBe(true);
  });

  it('`any` instead of `all`: every child must be a cannot-match leaf', () => {
    expect(ruleProvablyUnmatched(rule({ any: [EXT, TIZ] }))).toBe(false);
    expect(ruleProvablyUnmatched(rule({ any: [EXT, TIZ] }), TIMED)).toBe(true);
    expect(ruleProvablyUnmatched(rule({ any: [TIZ, leaf('zone_id', 'equal', 3)] }), TIMED)).toBe(
      true
    );
    const battery = leaf('battery_percent', 'lessThan', 10);
    expect(ruleProvablyUnmatched(rule({ any: [EXT, battery] }), TIMED)).toBe(false);
    expect(ruleProvablyUnmatched(rule({ any: [TIZ, leaf('zone_id', 'equal', 0)] }), TIMED)).toBe(
      false
    );
  });

  it.each(EXT_OPERATORS)('external_id operator variant %s → may match', (_name, op, value) => {
    expect(leafCannotMatch(leaf('external_id', op, value), TIMED)).toBe(false);
  });

  it.each(TIZ_OPERATORS)('time_in_zone operator variant %s → may match', (op) => {
    expect(leafCannotMatch(leaf('time_in_zone', op, 7200), TIMED)).toBe(false);
  });

  it.each(EXT_REFUSED_VALUES.map((v) => [String(JSON.stringify(v)), v] as const))(
    'external_id notEmpty with value %s → may match',
    (_name, value) => {
      expect(leafCannotMatch(leaf('external_id', 'notEmpty', value), TIMED)).toBe(false);
    }
  );

  it.each(TIZ_REFUSED_VALUES.map((v) => [String(v), v] as const))(
    'time_in_zone greaterThan with value %s → may match',
    (_name, value) => {
      expect(leafCannotMatch(leaf('time_in_zone', 'greaterThan', value), TIMED)).toBe(false);
    }
  );

  it.each(TIZ_ACCEPTED_VALUES)(
    'time_in_zone greaterThan %s → unmatched with timeInZone only',
    (value) => {
      expect(leafCannotMatch(leaf('time_in_zone', 'greaterThan', value), TIMED)).toBe(true);
      expect(leafCannotMatch(leaf('time_in_zone', 'greaterThan', value))).toBe(false);
    }
  );

  it('a negation wrapper, a nested group, `path`, `params`, `condition` or a templated fact → may match', () => {
    for (const node of WRAPPED) {
      expect(leafCannotMatch(node, TIMED)).toBe(false);
      expect(ruleProvablyUnmatched(msgAll(node), TIMED)).toBe(false);
    }
  });

  it('the same operator and value on another fact → may match', () => {
    for (const node of OTHER_FACTS) {
      expect(leafCannotMatch(node, TIMED)).toBe(false);
      expect(ruleProvablyUnmatched(rule({ any: [node] }), TIMED)).toBe(false);
    }
  });

  it('every rule counts: the two leaves do not hide another enabled rule that may match', () => {
    const v = zoneZeroRuleGuard(doc(msgAll(EXT, TIZ), msgAll(leaf('zone_id', 'equal', 0))), TIMED);
    expect(v).toEqual({ safe: false, mayMatch: [1], invalidDocument: false });
    expect(zoneZeroRuleGuard(doc(msgAll(TIZ), msgAll(EXT))).mayMatch).toEqual([0]);
  });

  it('pinned to the shared evaluator: the same positionSafe verdict for every variant', () => {
    const BOUNDED = { positionsExpirationPeriod: 60, freshTestMacs: true };
    const rules: unknown[] = [
      msgAll(EXT),
      msgAll(TIZ),
      msgAll(EXT, TIZ),
      msgAll(leaf('battery_percent', 'lessThan', 10), EXT),
      msgAll(leaf('battery_percent', 'lessThan', 10), TIZ),
      rule({ any: [EXT, TIZ] }),
      rule({ any: [TIZ, leaf('zone_id', 'equal', 3)] }),
      rule({ any: [EXT, leaf('battery_percent', 'lessThan', 10)] }),
      rule({ any: [TIZ, leaf('zone_id', 'equal', 0)] }),
      ...EXT_OPERATORS.map(([, op, value]) => msgAll(leaf('external_id', op, value))),
      ...TIZ_OPERATORS.map((op) => msgAll(leaf('time_in_zone', op, 7200))),
      ...EXT_REFUSED_VALUES.map((v) => msgAll(leaf('external_id', 'notEmpty', v))),
      ...TIZ_REFUSED_VALUES.map((v) => msgAll(leaf('time_in_zone', 'greaterThan', v))),
      ...TIZ_ACCEPTED_VALUES.map((v) => msgAll(leaf('time_in_zone', 'greaterThan', v))),
      ...WRAPPED.map((node) => msgAll(node)),
      ...OTHER_FACTS.map((node) => msgAll(node)),
      ...OTHER_FACTS.map((node) => rule({ any: [node] })),
    ];
    for (const r of rules) {
      const shared = evaluateAlertRules(doc(r), undefined, BOUNDED).positionSafe;
      const sharedUntimed = evaluateAlertRules(doc(r)).positionSafe;
      expect({ rule: r, local: ruleProvablyUnmatched(r, TIMED) }).toEqual({
        rule: r,
        local: shared,
      });
      expect({ rule: r, local: ruleProvablyUnmatched(r) }).toEqual({
        rule: r,
        local: sharedUntimed,
      });
    }
  });
});
