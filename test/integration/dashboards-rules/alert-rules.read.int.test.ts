// P5 §9.3 L-R1…L-R3: the namespace's alert rules read live (tier R). Rules can hold e-mail receivers and callback
// URLs: only shapes, counts, issue codes and paths are asserted or printed, and documents are compared with the
// redacted deep-equality assertion.
import { validateAlertRuleSet, type AlertRuleSet } from '../../../src';
import { createLiveClient, describeLive, expectDeepEqualRedacted, getHarness } from '../harness';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

describeLive('R', 'P5 alert-rules read', () => {
  it('L-R1 alertRules.get() is a non-empty canonical { name, rules } set', async () => {
    const set = await createLiveClient().alertRules.get();
    expect(typeof set.name).toBe('string');
    expect(Array.isArray(set.rules)).toBe(true);
    expect(set.rules.length).toBeGreaterThan(0);
    const malformed = set.rules.filter((rule) => {
      const c: unknown = rule.conditions;
      const roots = isPlainObject(c) ? ['all', 'any'].filter((k) => Array.isArray(c[k])) : [];
      const groups = isPlainObject(c) ? ['all', 'any'].filter((k) => c[k] !== undefined) : [];
      const type: unknown = (rule.event as { type?: unknown } | null)?.type;
      return !(
        typeof rule.id === 'string' &&
        rule.id !== '' &&
        roots.length === 1 &&
        groups.length === 1 &&
        typeof type === 'string' &&
        type !== ''
      );
    });
    expect(malformed.length).toBe(0);
  });

  it('L-R2 alerts.getRules() (both forms) and alertRules.get({ namespace }) return the same set', async () => {
    const client = createLiveClient();
    const namespace = getHarness().env.namespace;
    const reference: AlertRuleSet = await client.alertRules.get();
    expectDeepEqualRedacted(await client.alerts.getRules(), reference, 'L-R2 alerts.getRules()');
    expectDeepEqualRedacted(
      await client.alerts.getRules(namespace),
      reference,
      'L-R2 alerts.getRules(namespace)'
    );
    expectDeepEqualRedacted(
      await client.alertRules.get({ namespace }),
      reference,
      'L-R2 alertRules.get({ namespace })'
    );
  });

  it('L-R3 the live rule set has no validator error', async () => {
    const set = await createLiveClient().alertRules.get();
    const result = validateAlertRuleSet(set);
    // Only codes and paths are printed on failure.
    expect({
      note: 'live alert rules would disable alerting or the validator is wrong: investigate, do not weaken',
      errors: result.errors.map((issue) => `${issue.path} ${issue.code}`),
    }).toStrictEqual({
      note: 'live alert rules would disable alerting or the validator is wrong: investigate, do not weaken',
      errors: [],
    });
    expect(result.valid).toBe(true);
  });
});
