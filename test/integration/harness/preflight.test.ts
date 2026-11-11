import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  evaluateAlertRules,
  evaluateLinkedNamespace,
  preflightWarnings,
  TIME_IN_ZONE_MIN_SECONDS,
  TIME_IN_ZONE_RUN_LIMIT_SECONDS,
} from '../../../examples/shared/preflight.js';
import { setActiveHarness } from './active';
import { FakeApi } from './fake-api';
import { recordLedger } from './ledger.mjs';
import { isRunTestMac, RUN_RANGE_DIGITS, testMac } from './names';
import { failedVerdicts, preflightAllows, type PreflightVerdicts } from './policy';
import {
  computePreflight,
  evaluatePreflight,
  freshTestMacs,
  pickVerdicts,
  writePreflightFile,
} from './preflight';
import { makeHarness, SAFE_PREFLIGHT, TEST_NS, TEST_RUN_ID, tempDir } from './unit-support';

afterEach(() => setActiveHarness(null));

type Rule = Record<string, unknown>;
const leaf = (fact: string, operator: string, value: unknown): Rule => ({ fact, operator, value });
const rule = (type: string, conditions: Rule, extra: Rule = {}): Rule => ({
  id: `r-${type}`,
  conditions,
  event: { type, params: {} },
  ...extra,
});
const doc = (...rules: Rule[]): Rule => ({ name: 'Demo rules', rules });
/** A message rule whose root `all` holds exactly `node` (the position verdicts depend on it alone). */
const msgAll = (...nodes: Rule[]): Rule => rule('message', { all: nodes });

describe('evaluateAlertRules: document forms', () => {
  it('reads { name, rules }, { decisions }, a bare array and {}', () => {
    const unsafe = rule('post_to_email', { all: [leaf('zone_id', 'equal', 3)] });
    expect(evaluateAlertRules(doc(unsafe)).ruleEngineSafe).toBe(false);
    expect(evaluateAlertRules({ decisions: [unsafe] }).ruleEngineSafe).toBe(false);
    expect(evaluateAlertRules([unsafe]).ruleEngineSafe).toBe(false);
    expect(evaluateAlertRules({})).toEqual({
      ruleEngineSafe: true,
      positionSafe: false,
      declaredPositionSafe: false,
      blocking: [],
    });
    // the stored form with a safe rule is safe for every verdict
    expect(evaluateAlertRules(doc(msgAll(leaf('zone_id', 'equal', 3))))).toEqual({
      ruleEngineSafe: true,
      positionSafe: true,
      declaredPositionSafe: true,
      blocking: [],
    });
  });

  it('a rules value that is not an array fails every verdict', () => {
    expect(evaluateAlertRules({ name: 'x', rules: { a: 1 } })).toEqual({
      ruleEngineSafe: false,
      positionSafe: false,
      declaredPositionSafe: false,
      blocking: [],
    });
  });
});

describe('evaluateAlertRules: ruleEngineSafe', () => {
  it('ignores disabled rules', () => {
    const r = rule('post_to_callback_url', { all: [] }, { disabled: true });
    expect(evaluateAlertRules(doc(r)).ruleEngineSafe).toBe(true);
    // a truthy disabled other than true counts as enabled
    expect(evaluateAlertRules(doc({ ...r, disabled: 'yes' })).ruleEngineSafe).toBe(false);
  });

  it('an unrestricted post_to_email rule is unsafe and listed by index and type', () => {
    const result = evaluateAlertRules(
      doc(
        msgAll(leaf('zone_id', 'equal', 1)),
        rule('post_to_email', { all: [leaf('zone_id', 'equal', 2)] })
      )
    );
    expect(result.ruleEngineSafe).toBe(false);
    expect(result.blocking).toEqual([{ index: 1, eventType: 'post_to_email' }]);
  });

  it('restricted by `all` + a user_udid `equal` leaf naming a real asset → safe', () => {
    const restricted = rule('post_to_email', {
      all: [leaf('user_udid', 'equal', 'aabbccddeeff'), leaf('zone_id', 'equal', 4)],
    });
    expect(evaluateAlertRules(doc(restricted)).ruleEngineSafe).toBe(true);
    const byName = rule('delete_asset', {
      all: [leaf('user_name', 'in', ['forklift 1', 'forklift 2'])],
    });
    expect(evaluateAlertRules(doc(byName)).ruleEngineSafe).toBe(true);
    // a restriction that names a test MAC or a test name does not restrict
    const toTest = rule('post_to_email', {
      all: [leaf('user_udid', 'equal', '02:5D:4B:00:00:01')],
    });
    expect(evaluateAlertRules(doc(toTest)).ruleEngineSafe).toBe(false);
    const toTestName = rule('post_to_email', {
      all: [leaf('external_id', 'in', ['x', 'sdk-test-1'])],
    });
    expect(evaluateAlertRules(doc(toTestName)).ruleEngineSafe).toBe(false);
  });

  it('a restriction under `any` (or ignored because `any` wins) → unsafe', () => {
    const underAny = rule('post_to_email', { any: [leaf('user_udid', 'equal', 'aabbccddeeff')] });
    expect(evaluateAlertRules(doc(underAny)).ruleEngineSafe).toBe(false);
    const both = rule('post_to_email', {
      all: [leaf('user_udid', 'equal', 'aabbccddeeff')],
      any: [leaf('zone_id', 'equal', 1)],
    });
    expect(evaluateAlertRules(doc(both)).ruleEngineSafe).toBe(false);
  });

  it('an unknown or missing event type → unsafe', () => {
    const sms = rule('send_sms', { all: [leaf('zone_id', 'equal', 1)] });
    expect(evaluateAlertRules(doc(sms)).blocking).toEqual([{ index: 0, eventType: 'send_sms' }]);
    const noEvent = { id: 'x', conditions: { all: [] } };
    expect(evaluateAlertRules(doc(noEvent)).blocking).toEqual([{ index: 0, eventType: 'unknown' }]);
  });

  it('message and set_variable rules are safe', () => {
    const result = evaluateAlertRules(
      doc(rule('message', { any: [] }), rule('set_variable', { all: [] }))
    );
    expect([result.ruleEngineSafe, result.blocking]).toEqual([true, []]);
  });

  it('an enabled unrestricted message rule with notifications on → safe plus the warning', () => {
    const d = doc(rule('message', { all: [leaf('zone_id', 'equal', 7)] }));
    expect(evaluateAlertRules(d).ruleEngineSafe).toBe(true);
    expect(preflightWarnings(d, { notifications: true })).toEqual([
      'message-rules-reach-notifications',
    ]);
    expect(preflightWarnings(d, { notifications: false })).toEqual([]);
    const restricted = doc(rule('message', { all: [leaf('user_udid', 'equal', 'aabbccddeeff')] }));
    expect(preflightWarnings(restricted, { notifications: true })).toEqual([]);
    const disabled = doc(rule('message', { all: [] }, { disabled: true }));
    expect(preflightWarnings(disabled, { notifications: true })).toEqual([]);
  });
});

describe('evaluateAlertRules: positionSafe (P8 §9.1 step 6 cases)', () => {
  const position = (r: Rule): boolean => evaluateAlertRules(doc(r)).positionSafe;

  it('a disabled rule is ignored', () => {
    expect(
      position(rule('message', { all: [leaf('zone_id', 'equal', 0)] }, { disabled: true }))
    ).toBe(true);
  });

  it('`all` with `zone_id equal 3` → unmatched; `zone_id equal 0` → may match', () => {
    expect(position(msgAll(leaf('zone_id', 'equal', 3)))).toBe(true);
    expect(position(msgAll(leaf('zone_id', 'equal', 0)))).toBe(false);
    expect(position(msgAll(leaf('zone_id', 'equal', '0')))).toBe(false);
    expect(position(msgAll(leaf('zone_id', 'equal', 'OUTSIDE_ALL_ZONES')))).toBe(false);
  });

  it('`zone_id in [0, 5]` → may match; `in [3, 5]` → unmatched', () => {
    expect(position(msgAll(leaf('zone_id', 'in', [0, 5])))).toBe(false);
    expect(position(msgAll(leaf('zone_id', 'in', [3, 5])))).toBe(true);
  });

  it('`all` holding one cannot-match leaf next to a may-match leaf → unmatched', () => {
    expect(position(msgAll(leaf('battery', 'lessThan', 10), leaf('zone_id', 'equal', 3)))).toBe(
      true
    );
    expect(position(msgAll(leaf('battery', 'lessThan', 10), leaf('zone_id', 'equal', 0)))).toBe(
      false
    );
  });

  it("`user_type equal 'forklift'` → unmatched", () => {
    expect(position(msgAll(leaf('user_type', 'equal', 'forklift')))).toBe(true);
  });

  it('`user_udid in` a list holding a 025d4b… MAC → may match', () => {
    expect(position(msgAll(leaf('user_udid', 'in', ['aabbccddeeff', '025d4b123456'])))).toBe(false);
    expect(position(msgAll(leaf('user_udid', 'in', ['aabbccddeeff', '112233445566'])))).toBe(true);
  });

  it('`any` with one unknown fact → may match; `any` of cannot-match leaves → unmatched', () => {
    expect(
      position(
        rule('message', { any: [leaf('zone_id', 'equal', 3), leaf('battery', 'lessThan', 10)] })
      )
    ).toBe(false);
    expect(
      position(
        rule('message', { any: [leaf('zone_id', 'equal', 3), leaf('zone_name', 'equal', 'Dock')] })
      )
    ).toBe(true);
  });

  it('a nested-only root → may match', () => {
    expect(position(msgAll({ any: [leaf('zone_id', 'equal', 3)] }))).toBe(false);
  });

  it('a templated value or a leaf with `path` → may match', () => {
    expect(position(msgAll(leaf('zone_id', 'equal', { fact: 'home_zone' })))).toBe(false);
    expect(position(msgAll({ ...leaf('zone_id', 'equal', 3), path: '$.id' }))).toBe(false);
  });

  it('a document that is not { name, rules } → positionSafe false', () => {
    const r = msgAll(leaf('zone_id', 'equal', 3));
    expect(evaluateAlertRules([r]).positionSafe).toBe(false);
    expect(evaluateAlertRules({ decisions: [r] }).positionSafe).toBe(false);
    expect(evaluateAlertRules({ rules: [r] }).positionSafe).toBe(false);
  });

  it('the remaining cannot-match leaves: zone_name, zone_tags, is_virtual', () => {
    expect(position(msgAll(leaf('zone_name', 'in', ['Dock', 'Gate'])))).toBe(true);
    expect(position(msgAll(leaf('zone_name', 'equal', 'OUTSIDE_ALL_ZONES')))).toBe(false);
    expect(position(msgAll(leaf('zone_tags', 'contains', 'cold')))).toBe(true);
    expect(position(msgAll(leaf('zone_tags', 'contains', '')))).toBe(false);
    expect(position(msgAll(leaf('is_virtual', 'equal', true)))).toBe(true);
    expect(position(msgAll(leaf('is_virtual', 'equal', false)))).toBe(false);
  });
});

describe('evaluateAlertRules: declaredPositionSafe', () => {
  it('a message rule whose `all` holds `is_declared_position equal true` → positionSafe true, declared false', () => {
    const result = evaluateAlertRules(doc(msgAll(leaf('is_declared_position', 'equal', true))));
    expect([result.positionSafe, result.declaredPositionSafe]).toEqual([true, false]);
  });

  it.each([
    ['model equal sdk-test', leaf('model', 'equal', 'sdk-test')],
    ['user_tags contains sdk-test', leaf('user_tags', 'contains', 'sdk-test')],
    ['a declared_* leaf', leaf('declared_zone_id', 'equal', 3)],
    ['declaration_source', leaf('declaration_source', 'equal', 'operator')],
    ['user_name', leaf('user_name', 'equal', 'forklift 1')],
    ['external_id', leaf('external_id', 'in', ['ext-1'])],
  ])('%s → may match a declared test asset', (_name, node) => {
    expect(evaluateAlertRules(doc(msgAll(node))).declaredPositionSafe).toBe(false);
  });

  it('`zone_id equal 3` → unmatched for both; declaredPositionSafe implies positionSafe', () => {
    expect(evaluateAlertRules(doc(msgAll(leaf('zone_id', 'equal', 3))))).toEqual(
      expect.objectContaining({ positionSafe: true, declaredPositionSafe: true })
    );
    const mayMatch = evaluateAlertRules(doc(msgAll(leaf('zone_id', 'equal', 0))));
    expect([mayMatch.positionSafe, mayMatch.declaredPositionSafe]).toEqual([false, false]);
  });
});

const EXT = leaf('external_id', 'notEmpty', true);
const TIZ = leaf('time_in_zone', 'greaterThan', 3600);
const BOTH = { positionSafe: true, declaredPositionSafe: true };
const NONE = { positionSafe: false, declaredPositionSafe: false };
const PUBLISH_ONLY = { positionSafe: true, declaredPositionSafe: false };
/** Both premises of the time_in_zone leaf hold: a 60 s period and no earlier positions on the run's MAC range. */
const BOUNDED = { positionsExpirationPeriod: 60, freshTestMacs: true };
const positionVerdicts = (d: unknown, options: Record<string, unknown> = BOUNDED) => {
  const { positionSafe, declaredPositionSafe } = evaluateAlertRules(d, undefined, options);
  return { positionSafe, declaredPositionSafe };
};

describe('evaluateAlertRules: the two conditions a test publish cannot meet (LIVE-TESTING §2.7, owner decision)', () => {
  const evaluate = (d: unknown) => evaluateAlertRules(d, undefined, BOUNDED);
  const verdicts = (...rules: Rule[]) => positionVerdicts(doc(...rules));

  it('the Demo Factory rule shape (`all` of both leaves, in-app message) → every verdict true, warning kept', () => {
    const d = doc(msgAll(EXT, TIZ));
    expect(evaluate(d)).toEqual({
      ruleEngineSafe: true,
      positionSafe: true,
      declaredPositionSafe: true,
      blocking: [],
    });
    expect(preflightWarnings(d, { notifications: true })).toEqual([
      'message-rules-reach-notifications',
    ]);
  });

  it('each leaf alone: external_id counts for publishes only, time_in_zone for both', () => {
    expect(verdicts(msgAll(EXT))).toEqual(PUBLISH_ONLY);
    expect(verdicts(msgAll(TIZ))).toEqual(BOTH);
    // next to a may-match leaf, one cannot-match leaf still decides an `all` root
    expect(verdicts(msgAll(leaf('battery_percent', 'lessThan', 10), EXT))).toEqual(PUBLISH_ONLY);
    expect(verdicts(msgAll(leaf('battery_percent', 'lessThan', 10), TIZ))).toEqual(BOTH);
  });

  it('`any` instead of `all`: every child must be a cannot-match leaf', () => {
    expect(verdicts(rule('message', { any: [EXT, TIZ] }))).toEqual(PUBLISH_ONLY);
    expect(verdicts(rule('message', { any: [TIZ, leaf('zone_id', 'equal', 3)] }))).toEqual(BOTH);
    expect(
      verdicts(rule('message', { any: [EXT, leaf('battery_percent', 'lessThan', 10)] }))
    ).toEqual(NONE);
    expect(verdicts(rule('message', { any: [TIZ, leaf('zone_id', 'equal', 0)] }))).toEqual(NONE);
  });

  it.each([
    ['empty', 'empty', true],
    ['empty false', 'empty', false],
    ['notEqual', 'notEqual', ''],
    ['equal null', 'equal', null],
    ['in', 'in', ['']],
    ['notIn', 'notIn', ['x']],
    ['NotEmpty (case)', 'NotEmpty', true],
    ['notempty (case)', 'notempty', true],
  ])('external_id operator variant %s → may match', (_name, operator, value) => {
    expect(verdicts(msgAll(leaf('external_id', operator, value)))).toEqual(NONE);
  });

  it.each([
    ['greaterThanInclusive', 'greaterThanInclusive'],
    ['lessThan', 'lessThan'],
    ['lessThanInclusive', 'lessThanInclusive'],
    ['equal', 'equal'],
    ['notEqual', 'notEqual'],
    ['GreaterThan (case)', 'GreaterThan'],
  ])('time_in_zone operator variant %s → may match', (_name, operator) => {
    expect(verdicts(msgAll(leaf('time_in_zone', operator, 7200)))).toEqual(NONE);
  });

  it.each([
    ['false (matches a missing external id)', false],
    ['0', 0],
    ['1', 1],
    ["'true'", 'true'],
    ["''", ''],
    ['null', null],
    ['a fact reference', { fact: 'user_udid' }],
    ['a template', '{{external_id}}'],
  ])('external_id notEmpty with value %s → may match', (_name, value) => {
    expect(verdicts(msgAll(leaf('external_id', 'notEmpty', value)))).toEqual(NONE);
  });

  it.each([
    ['3599 (below the threshold)', 3599],
    ['600', 600],
    ['0', 0],
    ['-1', -1],
    ["'3600' (a string)", '3600'],
    ["'7200' (a string)", '7200'],
    ['true', true],
    ['false', false],
    ['null', null],
    ['an array', [7200]],
    ['a fact reference', { fact: 'battery_percent' }],
    ['a template', '{{time_in_zone}}'],
  ])('time_in_zone greaterThan with value %s → may match', (_name, value) => {
    expect(verdicts(msgAll(leaf('time_in_zone', 'greaterThan', value)))).toEqual(NONE);
  });

  it.each([
    ['3600 (the threshold)', 3600],
    ['3600.5', 3600.5],
    ['86400', 86400],
    ['1e9', 1e9],
  ])('time_in_zone greaterThan with value %s → unmatched for both', (_name, value) => {
    expect(verdicts(msgAll(leaf('time_in_zone', 'greaterThan', value)))).toEqual(BOTH);
  });

  it('a negation wrapper, a nested group, `path`, `params` or a templated rule → may match', () => {
    expect(verdicts(msgAll({ not: EXT }))).toEqual(NONE);
    expect(verdicts(msgAll({ not: TIZ }))).toEqual(NONE);
    expect(verdicts(msgAll({ all: [EXT, TIZ] }))).toEqual(NONE);
    expect(verdicts(msgAll({ any: [TIZ] }))).toEqual(NONE);
    expect(verdicts(msgAll({ ...EXT, path: '$.x' }))).toEqual(NONE);
    expect(verdicts(msgAll({ ...TIZ, path: '$.x' }))).toEqual(NONE);
    expect(verdicts(msgAll({ ...TIZ, params: { zone: 1 } }))).toEqual(NONE);
    expect(verdicts(msgAll({ ...EXT, condition: 'shared' }))).toEqual(NONE);
    // a tag anywhere in the conditions makes the whole rule templated, both leaves included
    expect(verdicts(msgAll(EXT, TIZ, leaf('zone_name', 'equal', '{{zone_name}}')))).toEqual(NONE);
    expect(verdicts(msgAll({ ...TIZ, fact: '{{f}}' }))).toEqual(NONE);
  });

  it('an off-platform action: ruleEngineSafe is decided as before, the leaves only affect the position verdicts', () => {
    expect(evaluate(doc(rule('post_to_email', { all: [EXT, TIZ] })))).toEqual({
      ruleEngineSafe: false,
      positionSafe: true,
      declaredPositionSafe: true,
      blocking: [{ index: 0, eventType: 'post_to_email' }],
    });
    // the external_id leaf restricts nothing (only equal / in on asset facts do)
    expect(evaluate(doc(rule('delete_asset', { all: [EXT] }))).blocking).toEqual([
      { index: 0, eventType: 'delete_asset' },
    ]);
    const restricted = rule('post_to_callback_url', {
      all: [leaf('user_udid', 'equal', 'aabbccddeeff'), EXT, TIZ],
    });
    expect(evaluate(doc(restricted))).toEqual({
      ruleEngineSafe: true,
      positionSafe: true,
      declaredPositionSafe: true,
      blocking: [],
    });
  });

  it('every rule counts: the two leaves do not hide another enabled rule that may match', () => {
    expect(verdicts(msgAll(EXT, TIZ), msgAll(leaf('zone_id', 'equal', 0)))).toEqual(NONE);
    expect(verdicts(msgAll(EXT, TIZ), msgAll(EXT))).toEqual(PUBLISH_ONLY);
    // a disabled rule stays ignored
    expect(verdicts(msgAll(TIZ), rule('message', { all: [] }, { disabled: true }))).toEqual(BOTH);
  });

  it('regressions: the shapes that were unsafe before are still unsafe', () => {
    for (const r of [
      msgAll(leaf('zone_id', 'equal', 0)),
      msgAll(leaf('zone_id', 'in', [0, 5])),
      msgAll(leaf('battery_percent', 'lessThan', 10)),
      msgAll(leaf('external_id', 'equal', 'sdk-test-x')),
      msgAll(leaf('external_id', 'in', [])),
      msgAll(leaf('user_udid', 'in', ['025d4b123456'])),
      msgAll(leaf('is_virtual', 'equal', false)),
      msgAll({ any: [leaf('zone_id', 'equal', 3)] }),
      rule('message', {
        any: [leaf('zone_id', 'equal', 3), leaf('battery_percent', 'lessThan', 10)],
      }),
      rule('message', { any: [] }),
      rule('message', { all: [] }),
      { id: 'no-conditions', event: { type: 'message', params: {} } },
    ]) {
      expect(verdicts(r)).toEqual(NONE);
    }
    expect(evaluate([msgAll(EXT, TIZ)]).positionSafe).toBe(false);
    expect(evaluate({ rules: [msgAll(EXT, TIZ)] }).positionSafe).toBe(false);
    expect(evaluate({ name: '{{#x}}', rules: [msgAll(EXT, TIZ)] })).toEqual({
      ruleEngineSafe: false,
      positionSafe: false,
      declaredPositionSafe: false,
      blocking: [],
    });
  });

  it.each([
    ['user_udid notEmpty true', leaf('user_udid', 'notEmpty', true)],
    ['user_name notEmpty true', leaf('user_name', 'notEmpty', true)],
    ['model notEmpty true', leaf('model', 'notEmpty', true)],
    ['zone_name notEmpty true', leaf('zone_name', 'notEmpty', true)],
    ['zone_count greaterThan 3600', leaf('zone_count', 'greaterThan', 3600)],
    ['timestamp greaterThan 3600', leaf('timestamp', 'greaterThan', 3600)],
    ['battery_percent greaterThan 7200', leaf('battery_percent', 'greaterThan', 7200)],
  ])(
    'the same operator and value on another fact (%s) → may match, with both premises held',
    (_name, node) => {
      expect(verdicts(msgAll(node))).toEqual(NONE);
      expect(verdicts(rule('message', { any: [node] }))).toEqual(NONE);
    }
  );
});

describe('evaluateAlertRules: the checked premises of the time_in_zone leaf (positionsExpirationPeriod, freshTestMacs)', () => {
  const DEMO = doc(msgAll(EXT, TIZ));

  it('without options (no period read, no ledger) the leaf may match: the Demo Factory rule is safe for publishes only', () => {
    expect(positionVerdicts(doc(msgAll(TIZ)), {})).toEqual(NONE);
    expect(positionVerdicts(DEMO, {})).toEqual(PUBLISH_ONLY);
    expect(evaluateAlertRules(DEMO)).toEqual({
      ruleEngineSafe: true,
      positionSafe: true,
      declaredPositionSafe: false,
      blocking: [],
    });
  });

  it.each([
    ['1', 1],
    ['30', 30],
    ['60 (the largest)', 60],
  ])('period %s with fresh test MACs → unmatched for both', (_name, period) => {
    const options = { positionsExpirationPeriod: period, freshTestMacs: true };
    expect(positionVerdicts(doc(msgAll(TIZ)), options)).toEqual(BOTH);
    expect(positionVerdicts(DEMO, options)).toEqual(BOTH);
  });

  it.each([
    ['61', 61],
    ['120', 120],
    ['3600', 3600],
    ['86400', 86400],
    ['604800 (the API example)', 604800],
    ['0', 0],
    ['-60', -60],
    ['60.5', 60.5],
    // review round 3: non-integer periods inside 1–60, which only the integer check rejects
    ['30.5', 30.5],
    ['59.9', 59.9],
    ['1.5', 1.5],
    ["'60' (a string)", '60'],
    ['NaN', Number.NaN],
    ['null', null],
    ['absent', undefined],
    ['true', true],
  ])(
    'period %s → may match (time_in_zone alone false for both; Demo Factory publishes only)',
    (_name, period) => {
      const options = { positionsExpirationPeriod: period, freshTestMacs: true };
      expect(positionVerdicts(doc(msgAll(TIZ)), options)).toEqual(NONE);
      expect(positionVerdicts(DEMO, options)).toEqual(PUBLISH_ONLY);
    }
  );

  it.each([
    ['false (an earlier run positioned a MAC of the range)', false],
    ['absent', undefined],
    ["'true'", 'true'],
    ['1', 1],
  ])('freshTestMacs %s with a 60 s period → may match', (_name, fresh) => {
    const options = { positionsExpirationPeriod: 60, freshTestMacs: fresh };
    expect(positionVerdicts(doc(msgAll(TIZ)), options)).toEqual(NONE);
    expect(positionVerdicts(DEMO, options)).toEqual(PUBLISH_ONLY);
  });

  it('the premises widen nothing else: ruleEngineSafe, the other leaves and the other operators are unchanged', () => {
    expect(
      evaluateAlertRules(doc(rule('post_to_email', { all: [TIZ] })), undefined, BOUNDED)
    ).toEqual({
      ruleEngineSafe: false,
      positionSafe: true,
      declaredPositionSafe: true,
      blocking: [{ index: 0, eventType: 'post_to_email' }],
    });
    expect(
      positionVerdicts(doc(msgAll(leaf('time_in_zone', 'greaterThanInclusive', 7200))))
    ).toEqual(NONE);
    expect(positionVerdicts(doc(msgAll(leaf('time_in_zone', 'greaterThan', 3599))))).toEqual(NONE);
    expect(positionVerdicts(doc(msgAll(leaf('zone_id', 'equal', 0))))).toEqual(NONE);
  });
});

describe('evaluateAlertRules: `rules` and `decisions` as the engine reads them', () => {
  const offPlatform = rule('post_to_email', { all: [] });

  it('an empty `rules` next to `decisions`: the decisions are evaluated (every verdict false here)', () => {
    const d = { name: 'n', rules: [], decisions: [offPlatform] };
    expect(evaluateAlertRules(d, undefined, BOUNDED)).toEqual({
      ruleEngineSafe: false,
      positionSafe: false,
      declaredPositionSafe: false,
      blocking: [{ index: 0, eventType: 'post_to_email' }],
    });
    const withAny = { name: 'n', rules: [], decisions: [rule('delete_asset', { any: [] })] };
    expect(evaluateAlertRules(withAny).blocking).toEqual([{ index: 0, eventType: 'delete_asset' }]);
    expect(
      preflightWarnings(
        { name: 'n', rules: [], decisions: [rule('message', { all: [] })] },
        { notifications: true }
      )
    ).toEqual(['message-rules-reach-notifications']);
  });

  it('`rules: null` next to `decisions`: the decisions are evaluated', () => {
    expect(
      evaluateAlertRules({ name: 'n', rules: null, decisions: [offPlatform] }).blocking
    ).toEqual([{ index: 0, eventType: 'post_to_email' }]);
  });

  it('a non-empty `rules` decides; `decisions` is then not evaluated (as the engine does)', () => {
    const d = { name: 'n', rules: [msgAll(leaf('zone_id', 'equal', 3))], decisions: [offPlatform] };
    expect(evaluateAlertRules(d)).toEqual({
      ruleEngineSafe: true,
      positionSafe: true,
      declaredPositionSafe: true,
      blocking: [],
    });
  });

  it('a `decisions` value that is not an array fails every verdict when `rules` is empty, null or absent', () => {
    for (const decisions of [{ a: 1 }, 'x', 3]) {
      for (const d of [
        { name: 'n', rules: [], decisions },
        { name: 'n', rules: null, decisions },
        { name: 'n', decisions },
      ]) {
        expect(evaluateAlertRules(d)).toEqual({
          ruleEngineSafe: false,
          positionSafe: false,
          declaredPositionSafe: false,
          blocking: [],
        });
      }
    }
  });

  // review round 3: next to a non-empty `rules`, the engine never reads `decisions`, whatever its shape
  it('a non-empty `rules` decides also next to a `decisions` value that is not an array', () => {
    const safe = msgAll(leaf('zone_id', 'equal', 3));
    for (const decisions of ['x', { a: 1 }, 3]) {
      expect(evaluateAlertRules({ name: 'n', rules: [safe], decisions })).toEqual({
        ruleEngineSafe: true,
        positionSafe: true,
        declaredPositionSafe: true,
        blocking: [],
      });
    }
    expect(
      evaluateAlertRules({ name: 'n', rules: [rule('post_to_email', { all: [] })], decisions: 'x' })
    ).toEqual({
      ruleEngineSafe: false,
      positionSafe: false,
      declaredPositionSafe: false,
      blocking: [{ index: 0, eventType: 'post_to_email' }],
    });
  });

  it('both lists empty, or neither present: nothing to evaluate', () => {
    expect(evaluateAlertRules({ name: 'n', rules: [], decisions: [] }).ruleEngineSafe).toBe(true);
    expect(evaluateAlertRules({ name: 'n', rules: [] }).positionSafe).toBe(true);
  });
});

describe('evaluateAlertRules: template tags in the rule document', () => {
  const ALL_FALSE = {
    ruleEngineSafe: false,
    positionSafe: false,
    declaredPositionSafe: false,
  };
  it('a templated condition value may match: a webhook restricted by {{user_udid}} blocks, positions are unsafe', () => {
    const restrictedByTemplate = rule('webhook', {
      all: [leaf('user_udid', 'equal', '{{user_udid}}')],
    });
    expect(evaluateAlertRules(doc(restrictedByTemplate))).toEqual({
      ...ALL_FALSE,
      blocking: [{ index: 0, eventType: 'webhook' }],
    });
    // a message rule on a templated zone_name: on-platform, but it may match every publish
    const zone = msgAll(leaf('zone_name', 'equal', '{{zone_name}}'));
    expect(evaluateAlertRules(doc(zone))).toEqual({
      ruleEngineSafe: true,
      positionSafe: false,
      declaredPositionSafe: false,
      blocking: [],
    });
  });

  it('a templated rule counts as enabled, also with disabled: true', () => {
    const disabledTemplate = rule(
      'post_to_email',
      { all: [leaf('user_udid', 'equal', 'a{{user_name}}')] },
      { disabled: true }
    );
    expect(evaluateAlertRules(doc(disabledTemplate))).toEqual({
      ...ALL_FALSE,
      blocking: [{ index: 0, eventType: 'post_to_email' }],
    });
    expect(
      preflightWarnings(
        doc(
          rule('message', { all: [leaf('zone_id', 'equal', '{{zone_id}}')] }, { disabled: true })
        ),
        {
          notifications: true,
        }
      )
    ).toEqual(['message-rules-reach-notifications']);
  });

  it('a structural tag fails every verdict', () => {
    const safe = msgAll(leaf('zone_id', 'equal', 3));
    // a section opened in one string and closed in another
    const hidden = rule(
      'post_to_email',
      { all: [leaf('zone_id', 'equal', 3)] },
      { a: '{{#is_virtual}}', disabled: true, b: '{{/is_virtual}}' }
    );
    expect(evaluateAlertRules(doc(safe, hidden))).toEqual({ ...ALL_FALSE, blocking: [] });
    for (const name of [
      '{{#is_virtual}}',
      '{{^x}}',
      '{{/x}}',
      '{{! unclosed comment',
      '{{=<% %>=}}',
      '{{> partial}}',
      '{{{raw}}}',
      '{{ x',
    ]) {
      expect(evaluateAlertRules({ name, rules: [safe] })).toEqual({ ...ALL_FALSE, blocking: [] });
    }
  });

  it('plain tags inside one string: a message text in event.params keeps the verdicts', () => {
    const text = rule(
      'message',
      { all: [leaf('zone_id', 'equal', 3)] },
      {
        event: {
          type: 'message',
          params: { text: '{{#user_name}}Hi {{user_name}}{{/user_name}} {{! note }}' },
        },
      }
    );
    const restrictedWebhook = rule(
      'webhook',
      { all: [leaf('user_udid', 'equal', 'aabbccddeeff'), leaf('zone_id', 'equal', 3)] },
      { event: { type: 'webhook', params: { body: 'asset {{user_udid}} in {{zone_name}}' } } }
    );
    expect(evaluateAlertRules(doc(text, restrictedWebhook))).toEqual({
      ruleEngineSafe: true,
      positionSafe: true,
      declaredPositionSafe: true,
      blocking: [],
    });
    // an unescaped (triple) tag: the rule counts as templated
    const unescaped = rule(
      'webhook',
      { all: [leaf('user_udid', 'equal', 'aabbccddeeff')] },
      { event: { type: 'webhook', params: { body: '{{{zone_name}}}' } } }
    );
    expect(evaluateAlertRules(doc(unescaped))).toEqual({
      ...ALL_FALSE,
      blocking: [{ index: 0, eventType: 'webhook' }],
    });
  });

  it('a document that is neither an object nor an array (a raw template string) fails every verdict', () => {
    for (const raw of ['{"name":"x","rules":[{"disabled":{{flag}}}]}', 42, true]) {
      expect(evaluateAlertRules(raw)).toEqual({ ...ALL_FALSE, blocking: [] });
    }
  });
});

describe('evaluateLinkedNamespace', () => {
  it('assets whose createdBy all equal the namespace → true, linkedCount 0', () => {
    expect(
      evaluateLinkedNamespace([{ user_udid: 'a', createdBy: TEST_NS }, { user_udid: 'b' }], TEST_NS)
    ).toEqual({ linkedNamespaceSafe: true, linkedCount: 0 });
  });

  it('one other string → false, linkedCount 1; a non-string createdBy is ignored', () => {
    expect(
      evaluateLinkedNamespace(
        [{ createdBy: TEST_NS }, { createdBy: 'other-ns' }, { createdBy: 42 }, { createdBy: null }],
        TEST_NS
      )
    ).toEqual({ linkedNamespaceSafe: false, linkedCount: 1 });
  });

  it('a list that is not an array is unsafe', () => {
    expect(evaluateLinkedNamespace({ data: [] }, TEST_NS)).toEqual({
      linkedNamespaceSafe: false,
      linkedCount: 0,
    });
  });
});

describe('preflight output', () => {
  it('holds indices, event types and the count only (no rule content)', () => {
    const secret = 'ops-team@example.org';
    const d = doc(
      rule(
        'post_to_email',
        { all: [leaf('zone_id', 'equal', 9)] },
        { event: { type: 'post_to_email', params: { receiver: secret } } }
      ),
      rule('weird type with spaces', { all: [] })
    );
    const result = evaluatePreflight({
      alertRules: d,
      assets: [{ createdBy: 'linked-ns-value' }],
      namespace: TEST_NS,
      notifications: true,
    });
    const text = JSON.stringify(result);
    expect(text).not.toContain(secret);
    expect(text).not.toContain('linked-ns-value');
    expect(text).not.toContain('weird type');
    expect(result.verdicts.blocking).toEqual([
      { index: 0, eventType: 'post_to_email' },
      { index: 1, eventType: 'other' },
    ]);
    expect(Object.keys(result.verdicts).sort()).toEqual([
      'blocking',
      'declaredPositionSafe',
      'linkedCount',
      'linkedNamespaceSafe',
      'positionSafe',
      'ruleEngineSafe',
    ]);
    expect(result.verdicts.linkedCount).toBe(1);
  });
});

describe('computePreflight (global setup)', () => {
  it('reads alert rules and assets raw, writes preflight.json and returns the verdicts and the warning', async () => {
    const api = new FakeApi().install();
    api.alertRules = doc(rule('message', { all: [leaf('zone_id', 'equal', 0)] }));
    api.assets = [{ user_udid: 'aabbccddeeff', createdBy: TEST_NS }];
    const { h, stateDir } = makeHarness({ preflight: null });
    const result = await computePreflight(h, { notifications: true });
    expect(result).toEqual({
      verdicts: {
        ruleEngineSafe: true,
        positionSafe: false,
        declaredPositionSafe: false,
        linkedNamespaceSafe: true,
        linkedCount: 0,
        blocking: [],
      },
      warnings: ['message-rules-reach-notifications'],
    });
    expect(JSON.parse(readFileSync(join(stateDir, 'preflight.json'), 'utf8'))).toEqual(
      result.verdicts
    );
    expect(api.log.map((r) => `${r.method} ${r.path}`)).toEqual([
      `GET /alert_rules/${TEST_NS}`,
      `GET /assets/${TEST_NS}`,
      `GET /settings/${TEST_NS}`,
    ]);
  });

  it('the time_in_zone leaf counts only with a period of at most 60 s read from the settings and fresh test MACs', async () => {
    const demo = doc(msgAll(EXT, TIZ));
    const declaredWith = async (
      settings: unknown,
      runs: { runId: string; positions: number }[] = [],
      status?: number
    ): Promise<boolean> => {
      const api = new FakeApi().install();
      api.alertRules = demo;
      api.assets = [];
      api.settings = settings;
      if (status !== undefined) api.status = { settings: status };
      const { h } = makeHarness({ preflight: null });
      // a ledger with history: an earlier run of another range that positioned nothing
      const ledgerRuns = [{ runId: 'eeee0001', positions: 0 }, ...runs];
      for (const run of ledgerRuns) {
        recordLedger(
          run.runId,
          'integration',
          { R: true, W: true, C: false, S: true },
          { positions: run.positions },
          {
            ledgerPath: h.ledgerPath,
          }
        );
      }
      const { verdicts } = await computePreflight(h, { notifications: false });
      expect(verdicts.positionSafe).toBe(true);
      return verdicts.declaredPositionSafe;
    };
    expect(await declaredWith({ positionsExpirationPeriod: 60 })).toBe(true);
    // the period: larger, a string, absent, or a failed read
    expect(await declaredWith({ positionsExpirationPeriod: 61 })).toBe(false);
    expect(await declaredWith({ positionsExpirationPeriod: 86400 })).toBe(false);
    expect(await declaredWith({ positionsExpirationPeriod: '60' })).toBe(false);
    expect(await declaredWith({ map: {} })).toBe(false);
    expect(await declaredWith({ positionsExpirationPeriod: 60 }, [], 500)).toBe(false);
    // the ledger: an earlier run with the same first four hex digits that positioned, or this run id reused
    const prefix = TEST_RUN_ID.slice(0, 4);
    expect(
      await declaredWith({ positionsExpirationPeriod: 60 }, [
        { runId: `${prefix}0000`, positions: 1 },
      ])
    ).toBe(false);
    expect(
      await declaredWith({ positionsExpirationPeriod: 60 }, [{ runId: TEST_RUN_ID, positions: 2 }])
    ).toBe(false);
    // the same prefix without positions, or another prefix with positions, leaves the MACs fresh
    expect(
      await declaredWith({ positionsExpirationPeriod: 60 }, [
        { runId: `${prefix}0000`, positions: 0 },
      ])
    ).toBe(true);
    expect(
      await declaredWith({ positionsExpirationPeriod: 60 }, [{ runId: 'ffff0000', positions: 5 }])
    ).toBe(true);
  });

  it('freshTestMacs: an unreadable ledger is not fresh', () => {
    const dir = tempDir('ledger');
    const path = join(dir, 'ledger.json');
    recordLedger(
      'eeee0001',
      'integration',
      { R: true, W: false, C: false, S: false },
      {},
      {
        ledgerPath: path,
      }
    );
    expect(freshTestMacs(TEST_RUN_ID, path)).toBe(true);
    writeFileSync(path, '{"version":2}');
    expect(freshTestMacs(TEST_RUN_ID, path)).toBe(false);
  });

  // review round 2: a ledger without history (wiped, or a clone that never ran) must not read as "fresh"
  it('freshTestMacs: a ledger with no history is not fresh (no file, or only the entry this run created)', () => {
    const tiers = { R: true, W: true, C: false, S: true };
    const path = join(tempDir('ledger'), 'ledger.json');
    expect(freshTestMacs(TEST_RUN_ID, path)).toBe(false);
    // what global setup writes before the preflight: the run's own entry with zero counts
    recordLedger(TEST_RUN_ID, 'integration', tiers, {}, { ledgerPath: path });
    expect(freshTestMacs(TEST_RUN_ID, path)).toBe(false);
    // any other recorded run is history; one of the same range that positioned is not fresh
    recordLedger('eeee0001', 'examples', tiers, {}, { ledgerPath: path });
    expect(freshTestMacs(TEST_RUN_ID, path)).toBe(true);
    recordLedger(
      `${TEST_RUN_ID.slice(0, 4)}0001`,
      'examples',
      tiers,
      { positions: 1 },
      {
        ledgerPath: path,
      }
    );
    expect(freshTestMacs(TEST_RUN_ID, path)).toBe(false);
  });

  // review round 3: the ledger check uses the same four digits as the run's MAC range (RUN_RANGE_DIGITS)
  it('freshTestMacs: only an entry with the same first four run-id digits counts, as the MAC range of G18 (e)', () => {
    const tiers = { R: true, W: true, C: false, S: true };
    expect(RUN_RANGE_DIGITS).toBe(4);
    const freshWith = (other: string): boolean => {
      const path = join(tempDir('ledger'), 'ledger.json');
      recordLedger('eeee0001', 'examples', tiers, {}, { ledgerPath: path });
      recordLedger(other, 'examples', tiers, { positions: 1 }, { ledgerPath: path });
      return freshTestMacs(TEST_RUN_ID, path);
    };
    // TEST_RUN_ID 3fa9c0de: positions under 3fa9… are this run's range, under 3fa8… or …3fa9 another one
    expect(freshWith('3fa90000')).toBe(false);
    expect(freshWith('3fa9ffff')).toBe(false);
    expect(freshWith('3fa8c0de')).toBe(true);
    expect(freshWith('3f00c0de')).toBe(true);
    expect(freshWith('c0de3fa9')).toBe(true);
    // the ledger range and the G18 range agree for every one of these ids
    for (const other of ['3fa90000', '3fa8c0de', 'c0de3fa9']) {
      expect(freshWith(other)).toBe(!isRunTestMac(testMac(1, other), TEST_RUN_ID));
    }
  });

  it('computePreflight after a lost ledger: the time_in_zone leaf may match (declaredPositionSafe false)', async () => {
    const api = new FakeApi().install();
    api.alertRules = doc(msgAll(EXT, TIZ));
    api.assets = [];
    api.settings = { positionsExpirationPeriod: 60 };
    const { h } = makeHarness({ preflight: null });
    // no ledger file at all
    expect((await computePreflight(h, { notifications: false, replace: true })).verdicts).toEqual(
      expect.objectContaining({ positionSafe: true, declaredPositionSafe: false })
    );
    // the order of global setup: the run's own entry first, then the preflight
    recordLedger(
      h.runId,
      'integration',
      { R: true, W: true, C: false, S: true },
      {},
      {
        ledgerPath: h.ledgerPath,
      }
    );
    expect((await computePreflight(h, { notifications: false, replace: true })).verdicts).toEqual(
      expect.objectContaining({ positionSafe: true, declaredPositionSafe: false })
    );
  });

  // review round 2: the reported period does not prove the engine's, so the bound is the run's own length
  it('a verdict that holds only through the time_in_zone leaf is time-limited from the preflight start', () => {
    const startedAt = Date.parse('2026-11-11T10:00:00.000Z');
    const fresh = {
      assets: [],
      namespace: TEST_NS,
      notifications: false,
      settings: { positionsExpirationPeriod: 60 },
      freshTestMacs: true,
      startedAt,
    };
    const end = new Date(startedAt + TIME_IN_ZONE_RUN_LIMIT_SECONDS * 1000).toISOString();
    expect(TIME_IN_ZONE_RUN_LIMIT_SECONDS).toBe(1800);
    expect(TIME_IN_ZONE_RUN_LIMIT_SECONDS * 2).toBeLessThanOrEqual(TIME_IN_ZONE_MIN_SECONDS);
    // the Demo Factory rule: publishes rest on the external_id leaf, declared positions on time_in_zone
    const demo = evaluatePreflight({ ...fresh, alertRules: doc(msgAll(EXT, TIZ)) }).verdicts;
    expect(demo).toEqual(
      expect.objectContaining({
        positionSafe: true,
        declaredPositionSafe: true,
        timeLimited: ['declaredPositionSafe'],
        timeLimitedUntil: end,
      })
    );
    // time_in_zone alone: both verdicts rest on it
    expect(evaluatePreflight({ ...fresh, alertRules: doc(msgAll(TIZ)) }).verdicts).toEqual(
      expect.objectContaining({
        timeLimited: ['positionSafe', 'declaredPositionSafe'],
        timeLimitedUntil: end,
      })
    );
    // no verdict needs the leaf, or the leaf does not count: no limit
    for (const verdicts of [
      evaluatePreflight({ ...fresh, alertRules: doc(msgAll(leaf('zone_id', 'equal', 3))) })
        .verdicts,
      evaluatePreflight({ ...fresh, alertRules: doc(msgAll(EXT, TIZ)), freshTestMacs: false })
        .verdicts,
      evaluatePreflight({ ...fresh, alertRules: null }).verdicts,
    ]) {
      expect(verdicts).not.toHaveProperty('timeLimited');
      expect(verdicts).not.toHaveProperty('timeLimitedUntil');
    }
    // G18 and describeLive (failedVerdicts) and the examples (preflightAllows): admitted before the end only
    const before = startedAt + TIME_IN_ZONE_RUN_LIMIT_SECONDS * 1000 - 1;
    const after = startedAt + TIME_IN_ZONE_RUN_LIMIT_SECONDS * 1000;
    expect(failedVerdicts(demo, 'declared', before)).toEqual([]);
    expect(failedVerdicts(demo, 'declared', after)).toEqual(['declaredPositionSafe']);
    expect(failedVerdicts(demo, 'publish', after)).toEqual([]);
    for (const until of [null, undefined, 'not a time', 1]) {
      const broken = { ...demo, timeLimitedUntil: until } as unknown as PreflightVerdicts;
      expect(failedVerdicts(broken, 'declared', before)).toEqual(['declaredPositionSafe']);
    }
    const realNow = Date.now();
    const running = { ...demo, timeLimitedUntil: new Date(realNow + 60_000).toISOString() };
    const ended = { ...demo, timeLimitedUntil: new Date(realNow - 1).toISOString() };
    expect([preflightAllows(running, 'declared'), preflightAllows(ended, 'declared')]).toEqual([
      true,
      false,
    ]);
  });

  it('computePreflight writes the time limit to preflight.json, counted from before its first read', async () => {
    const api = new FakeApi().install();
    api.alertRules = doc(msgAll(EXT, TIZ));
    api.assets = [];
    api.settings = { positionsExpirationPeriod: 60 };
    const { h, stateDir } = makeHarness({ preflight: null });
    recordLedger(
      'eeee0001',
      'integration',
      { R: true, W: false, C: false, S: false },
      {},
      {
        ledgerPath: h.ledgerPath,
      }
    );
    const before = Date.now();
    const { verdicts } = await computePreflight(h, { notifications: false, replace: true });
    const after = Date.now();
    const file = JSON.parse(readFileSync(join(stateDir, 'preflight.json'), 'utf8'));
    expect(file).toEqual(verdicts);
    expect(file.timeLimited).toEqual(['declaredPositionSafe']);
    const until = Date.parse(file.timeLimitedUntil);
    expect(until).toBeGreaterThanOrEqual(before + TIME_IN_ZONE_RUN_LIMIT_SECONDS * 1000);
    expect(until).toBeLessThanOrEqual(after + TIME_IN_ZONE_RUN_LIMIT_SECONDS * 1000);
    // the file round-trips through the harness reader
    expect(pickVerdicts(file)).toEqual(file);
  });

  // review round 3: the start must be taken before the first read, not after the reads
  it('computePreflight: the time limit counts from before the first read, also when the reads take long', async () => {
    const api = new FakeApi().install();
    api.alertRules = doc(msgAll(EXT, TIZ));
    api.assets = [];
    api.settings = { positionsExpirationPeriod: 60 };
    const { h, stateDir } = makeHarness({ preflight: null });
    recordLedger(
      'eeee0001',
      'integration',
      { R: true, W: false, C: false, S: false },
      {},
      { ledgerPath: h.ledgerPath }
    );
    const READ_DELAY_MS = 600_000;
    const realNow = Date.now.bind(Date);
    const spy = vi.spyOn(Date, 'now');
    // while the alert-rule read is answered, the clock jumps by READ_DELAY_MS (a slow first read)
    api.onRequest = (r) => {
      if (r.path === `/alert_rules/${TEST_NS}`)
        spy.mockImplementation(() => realNow() + READ_DELAY_MS);
    };
    try {
      const before = realNow();
      await computePreflight(h, { notifications: false, replace: true });
      const after = realNow();
      const file = JSON.parse(readFileSync(join(stateDir, 'preflight.json'), 'utf8'));
      expect(file.timeLimited).toEqual(['declaredPositionSafe']);
      const start = Date.parse(file.timeLimitedUntil) - TIME_IN_ZONE_RUN_LIMIT_SECONDS * 1000;
      expect(start).toBeGreaterThanOrEqual(before);
      expect(start).toBeLessThanOrEqual(after);
    } finally {
      spy.mockRestore();
    }
  });

  // review round 3: a `timeLimited` of an unknown shape never leaves a position verdict standing
  it('a timeLimited that is present and not an array fails both position verdicts (pickVerdicts, failedVerdicts)', () => {
    const later = new Date(Date.now() + 3_600_000).toISOString();
    for (const timeLimited of ['declaredPositionSafe', { 0: 'positionSafe' }, null, 1, true]) {
      const file = { ...SAFE_PREFLIGHT, timeLimited, timeLimitedUntil: later };
      expect(pickVerdicts(file)).toEqual({
        ...SAFE_PREFLIGHT,
        positionSafe: false,
        declaredPositionSafe: false,
      });
      const raw = file as unknown as PreflightVerdicts;
      expect(failedVerdicts(raw, 'publish')).toEqual(['positionSafe']);
      expect(failedVerdicts(raw, 'declared')).toEqual(['declaredPositionSafe']);
      expect(failedVerdicts(raw, 'assets')).toEqual([]);
    }
    // an array is read as before: a listed verdict holds until its end, an unknown name is ignored
    const listed = {
      ...SAFE_PREFLIGHT,
      timeLimited: ['declaredPositionSafe', 'other'],
      timeLimitedUntil: later,
    } as unknown as PreflightVerdicts;
    expect(failedVerdicts(listed, 'declared')).toEqual([]);
    expect(pickVerdicts(listed)).toEqual({
      ...SAFE_PREFLIGHT,
      timeLimited: ['declaredPositionSafe'],
      timeLimitedUntil: later,
    });
  });

  it('evaluatePreflight: the settings and freshTestMacs reach the evaluator; a failed settings read keeps the leaf "may match"', () => {
    const base = {
      alertRules: doc(msgAll(TIZ)),
      assets: [],
      namespace: TEST_NS,
      notifications: false,
    };
    const declared = (extra: Record<string, unknown>) =>
      evaluatePreflight({ ...base, ...extra }).verdicts.declaredPositionSafe;
    expect(declared({ settings: { positionsExpirationPeriod: 60 }, freshTestMacs: true })).toBe(
      true
    );
    expect(declared({ settings: null, freshTestMacs: true })).toBe(false);
    expect(declared({ settings: [60], freshTestMacs: true })).toBe(false);
    expect(declared({ settings: { positionsExpirationPeriod: 60 } })).toBe(false);
    expect(declared({})).toBe(false);
  });

  it('a failed read gives unsafe verdicts (fail closed)', async () => {
    const api = new FakeApi().install();
    api.status.alertRules = 500;
    const { h } = makeHarness({ preflight: null });
    const result = await computePreflight(h, { notifications: false });
    expect(result.verdicts).toEqual(
      expect.objectContaining({
        ruleEngineSafe: false,
        positionSafe: false,
        declaredPositionSafe: false,
      })
    );
    api.status = { assets: 403 };
    const second = makeHarness({ preflight: null });
    expect(
      (await computePreflight(second.h, { notifications: false })).verdicts.linkedNamespaceSafe
    ).toBe(false);
  });

  it('an existing preflight.json of the run id is kept (first writer wins)', async () => {
    new FakeApi().install();
    const { h, stateDir } = makeHarness({ preflight: null });
    const earlier = { ...SAFE_PREFLIGHT, positionSafe: false };
    expect(writePreflightFile(stateDir, earlier)).toEqual(earlier);
    const result = await computePreflight(h, { notifications: false });
    expect(result.verdicts).toEqual(earlier);
    expect(existsSync(join(stateDir, 'preflight.json'))).toBe(true);
  });

  it('with replace (global setup) a preflight.json left by an earlier run of the same run id is recomputed', async () => {
    const api = new FakeApi().install();
    api.alertRules = doc(rule('post_to_email', { all: [leaf('zone_id', 'equal', 0)] }));
    const { h, stateDir } = makeHarness({ preflight: null });
    writePreflightFile(stateDir, SAFE_PREFLIGHT);
    const result = await computePreflight(h, { notifications: false, replace: true });
    expect(result.verdicts).toEqual(
      expect.objectContaining({ ruleEngineSafe: false, positionSafe: false })
    );
    expect(JSON.parse(readFileSync(join(stateDir, 'preflight.json'), 'utf8'))).toEqual(
      result.verdicts
    );
  });
});
