// validateAlertRuleSet against the case table (P5 §8.1 V1–V21) and parity with the reference rule engine and
// template renderer pinned in devDependencies.
import { createRequire } from 'node:module';
import { Engine } from 'json-rules-engine';
import { describe, expect, it } from 'vitest';
import {
  ALERT_RULE_EVENT_TYPES,
  ALERT_RULE_OPERATORS,
  validateAlertRuleSet,
} from '../../../src/resources/alert-rules';
import { loadFixture } from '../../contract/fixtures';

interface ValidatorCase {
  id: string;
  label: string;
  rule?: unknown;
  set?: unknown;
  errors: string[];
  warnings: string[];
  firstPath: string | null;
  engine: 'throws' | 'rejects-at-run' | 'accepts';
  stricter?: true;
  firstRuleId?: string;
}

const CASES = (
  loadFixture('dashboards-rules', 'alert-rule-cases').body as { cases: ValidatorCase[] }
).cases;

/** The document a case describes: a whole set, or one rule wrapped as `{ name: '', rules: [rule] }`. */
function setOf(c: ValidatorCase): unknown {
  return 'rule' in c ? { name: '', rules: [c.rule] } : c.set;
}

const sorted = (codes: readonly string[]): string[] => [...codes].sort();

/** The template renderer ships no type definitions; only `render` is used. */
const mustache = createRequire(import.meta.url)('mustache') as {
  render(template: string, view: object): string;
};

const CUSTOM_OPERATORS = [
  'in',
  'notIn',
  'empty',
  'notEmpty',
  'afterDate',
  'afterDateInclusive',
  'beforeDate',
  'beforeDateInclusive',
];

type EngineOutcome = 'throws' | 'rejects-at-run' | 'accepts';

/**
 * The outcome of a rule set: a fresh engine with the custom operators, every enabled rule added, then one run. A
 * set whose `rules` is not an array is not loaded at all (the engine evaluates nothing).
 */
async function engineOutcome(set: unknown): Promise<EngineOutcome> {
  const rules = (set as { rules?: unknown } | null)?.rules;
  if (!Array.isArray(rules)) return 'accepts';
  const engine = new Engine([], { allowUndefinedFacts: true });
  for (const name of CUSTOM_OPERATORS) engine.addOperator(name, () => false);
  try {
    for (const r of rules as Array<{ disabled?: unknown }>) {
      if (!r.disabled) engine.addRule(r as never);
    }
  } catch (error) {
    // Whatever addRule throws is the 'throws' outcome; anything that is not an Error is a harness defect.
    if (!(error instanceof Error)) throw error;
    return 'throws';
  }
  try {
    await engine.run({});
    return 'accepts';
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return 'rejects-at-run';
  }
}

/** Runs `fn`; `true` when it throws an Error (anything else is rethrown). */
function failsWithError(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return true;
  }
}

/** `true` when the reference check fails: the document does not stay valid after substitution. */
function templateBreaks(set: unknown): boolean {
  let rendered = '';
  if (failsWithError(() => (rendered = mustache.render(JSON.stringify(set), {})))) return true;
  return failsWithError(() => JSON.parse(rendered));
}

describe('validateAlertRuleSet case table', () => {
  it('holds every case id once', () => {
    const ids = CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['V1', 'V2', 'V11d', 'V12e', 'V13c', 'V15i', 'V20d', 'V21']) {
      expect(ids).toContain(id);
    }
  });

  it.each(CASES.map((c) => [c.id, c.label, c] as const))('%s %s', (_id, _label, c) => {
    const result = validateAlertRuleSet(setOf(c));
    expect(sorted(result.errors.map((i) => i.code))).toStrictEqual(sorted(c.errors));
    expect(sorted(result.warnings.map((i) => i.code))).toStrictEqual(sorted(c.warnings));
    // V21: valid is exactly "no errors"; severities match the list they are in
    expect(result.valid).toBe(result.errors.length === 0);
    expect(result.errors.every((i) => i.severity === 'error')).toBe(true);
    expect(result.warnings.every((i) => i.severity === 'warning')).toBe(true);
    const first = result.errors[0] ?? result.warnings[0];
    expect(first?.path ?? null).toBe(c.firstPath);
    expect(first?.ruleId).toBe(c.firstRuleId);
    for (const issue of [...result.errors, ...result.warnings]) {
      expect(issue.message.length).toBeGreaterThan(0);
    }
  });

  it('V1 the spec example rule is valid with no issue at all', () => {
    const c = CASES.find((x) => x.id === 'V1') as ValidatorCase;
    expect(validateAlertRuleSet(setOf(c))).toStrictEqual({ valid: true, errors: [], warnings: [] });
  });

  it('V14 a disabled rule turns rule-level errors into warnings, valid stays true', () => {
    const disabled = CASES.filter((c) => c.id.startsWith('V14-'));
    expect(disabled.length).toBeGreaterThanOrEqual(19);
    for (const c of disabled) {
      const result = validateAlertRuleSet(setOf(c));
      const original = CASES.find((x) => x.id === c.id.slice(4)) as ValidatorCase;
      expect({
        id: c.id,
        valid: result.valid,
        warnings: sorted(result.warnings.map((i) => i.code)),
      }).toStrictEqual({
        id: c.id,
        valid: true,
        warnings: sorted([...original.errors, ...original.warnings]),
      });
    }
  });

  it('V21 issues carry the rule id; a rule without a string id gives none', () => {
    const result = validateAlertRuleSet({
      name: '',
      rules: [
        { id: 'a', conditions: { all: [{ fact: 'zone_name', operator: 'equal' }] }, event: null },
        { id: 3, conditions: { all: [] }, event: { type: 'message' } },
      ],
    });
    expect(result.errors.map((i) => [i.code, i.path, i.ruleId])).toStrictEqual([
      ['EVENT_MISSING', 'rules[0].event', 'a'],
      ['CONDITION_VALUE_MISSING', 'rules[0].conditions.all[0]', 'a'],
      ['RULE_ID_MISSING', 'rules[1].id', undefined],
    ]);
    expect(result.warnings.map((i) => [i.code, i.ruleId])).toStrictEqual([
      ['COALESCENCE_MISSING', undefined],
    ]);
    expect('ruleId' in (result.errors[2] as object)).toBe(false);
  });

  it('collects every issue of a set instead of stopping at the first', () => {
    const result = validateAlertRuleSet({
      rules: [null, { id: 'x', conditions: { any: [{ not: {} }] }, event: {} }],
      decisions: [],
    });
    expect(result.errors.map((i) => i.code)).toStrictEqual([
      'SET_NAME_NOT_STRING',
      'RULE_NOT_OBJECT',
      'EVENT_TYPE_MISSING',
      'CONDITION_NOT_SUPPORTED',
    ]);
    expect(result.warnings.map((i) => i.code)).toStrictEqual([
      'LEGACY_DECISIONS',
      'COALESCENCE_MISSING',
    ]);
  });

  it('a set that cannot be serialised throws TypeError', () => {
    const circular: Record<string, unknown> = { name: '', rules: [] };
    circular.self = circular;
    expect(() => validateAlertRuleSet(circular)).toThrow(TypeError);
  });

  it('exports the 16 operators and the 5 event types, frozen', () => {
    expect(ALERT_RULE_OPERATORS).toHaveLength(16);
    expect(new Set(ALERT_RULE_OPERATORS).size).toBe(16);
    expect(ALERT_RULE_EVENT_TYPES).toStrictEqual([
      'message',
      'post_to_email',
      'post_to_callback_url',
      'set_variable',
      'delete_asset',
    ]);
    expect(Object.isFrozen(ALERT_RULE_OPERATORS)).toBe(true);
    expect(Object.isFrozen(ALERT_RULE_EVENT_TYPES)).toBe(true);
  });
});

describe('parity with the reference rule engine and template renderer', () => {
  it.each(CASES.map((c) => [c.id, c.engine, c] as const))(
    '%s engine outcome is %s',
    async (_id, engine, c) => {
      expect(await engineOutcome(setOf(c))).toBe(engine);
    }
  );

  // A delimiter change (TEMPLATE_UNSUPPORTED) stops the scan, so those cases are left out here.
  it.each(
    CASES.filter((c) => !c.errors.includes('TEMPLATE_UNSUPPORTED')).map((c) => [c.id, c] as const)
  )('%s the reference check fails exactly when TEMPLATE_UNBALANCED is reported', (_id, c) => {
    const unbalanced = validateAlertRuleSet(setOf(c)).errors.some(
      (i) => i.code === 'TEMPLATE_UNBALANCED'
    );
    expect(templateBreaks(setOf(c))).toBe(unbalanced);
  });

  it('V15c and V15l: a tag left open in one string fails the reference check without a renderer error', () => {
    for (const id of ['V15c', 'V15l']) {
      const set = setOf(CASES.find((c) => c.id === id) as ValidatorCase);
      expect(() => mustache.render(JSON.stringify(set), {})).not.toThrow();
      expect({ id, breaks: templateBreaks(set) }).toStrictEqual({ id, breaks: true });
    }
  });

  it('SDK-stricter: a section opened in one string and closed in another is reported', () => {
    const set = {
      name: '',
      rules: [
        {
          id: 'span',
          conditions: { all: [{ fact: 'zone_name', operator: 'equal', value: 'Dock' }] },
          event: {
            type: 'message',
            params: {
              title: '{{#zone_name}}in',
              text: 'x{{/zone_name}}',
              coalescence: 1,
              coalescence_group: 'g',
            },
          },
        },
      ],
    };
    const { errors } = validateAlertRuleSet(set);
    expect(errors.map((i) => i.code)).toStrictEqual(['TEMPLATE_UNBALANCED']);
    // Not the equivalence of the case table: the document stays valid after substitution...
    expect(templateBreaks(set)).toBe(false);
    const params = (s: unknown) =>
      (s as { rules: Array<{ event: { params: Record<string, unknown> } }> }).rules[0]?.event
        .params;
    // ...yet the substituted document differs from the written one.
    expect(params(JSON.parse(mustache.render(JSON.stringify(set), {})))).not.toHaveProperty('text');
    expect(errors[0]?.message).toMatch(/^a template tag or section spans several JSON values \(/);
    expect(errors[0]?.message).not.toMatch(/^template syntax error/);
  });

  it('a template that does not scan as one text gets the "template syntax error" message', () => {
    const set = {
      name: '{{#zone_name}}',
      rules: [],
    };
    expect(templateBreaks(set)).toBe(true);
    const { errors } = validateAlertRuleSet(set);
    expect(errors.map((i) => i.code)).toStrictEqual(['TEMPLATE_UNBALANCED']);
    expect(errors[0]?.message).toBe('template syntax error: section "zone_name" is never closed');
  });

  it('every engine failure of an enabled rule is a validator error', () => {
    const failing = CASES.filter((c) => c.engine !== 'accepts');
    expect(failing.length).toBeGreaterThan(20);
    expect(
      failing.filter((c) => validateAlertRuleSet(setOf(c)).valid).map((c) => c.id)
    ).toStrictEqual([]);
  });

  it('the SDK is stricter than the engine exactly for V7, V11b, V11d, V12c, V12d and V12e', () => {
    const stricter = CASES.filter((c) => c.stricter === true).map((c) => c.id);
    expect(stricter).toStrictEqual(['V7', 'V11b', 'V11d', 'V12c', 'V12d', 'V12e']);
    for (const c of CASES.filter((x) => x.stricter === true)) {
      expect({ id: c.id, engine: c.engine, hasErrors: c.errors.length > 0 }).toStrictEqual({
        id: c.id,
        engine: 'accepts',
        hasErrors: true,
      });
    }
  });
});
