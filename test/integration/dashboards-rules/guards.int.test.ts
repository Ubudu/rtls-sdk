// Tier R, Demo Factory (P5 §9.6 L-G1–L-G3): the client-side guards and the alert-rule validator, run live so
// that live line coverage reaches them. Every call runs inside a request guard (deny-all or GET-only): a guard
// defect is rejected before anything leaves the process and fails the run. The replace() and saveRules() calls
// below are rejected locally; the only requests they may make are GETs. No rule content is printed.
import { beforeAll } from 'vitest';
import {
  ContextError,
  ValidationError,
  type AlertRule,
  type AlertRuleSet,
  type CreateDashboardInput,
  type RtlsClient,
  type UpdateDashboardInput,
} from '../../../src';
import { loadFixture } from '../../contract/fixtures';
import {
  createLiveClient,
  denyAll,
  describeLive,
  getOnly,
  runId,
  testName,
  withRequestGuard,
} from '../harness';

const ZERO_ID = '000000000000000000000000';

interface RuleCase {
  id: string;
  rule?: unknown;
  set?: unknown;
  errors: string[];
  warnings: string[];
}

const CASES = (loadFixture('dashboards-rules', 'alert-rule-cases').body as { cases: RuleCase[] })
  .cases;

function isRecord(value: unknown): value is { [key: string]: unknown } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The rules a case adds to the stored set, or null when the case is a whole set that cannot be merged. */
function caseRules(c: RuleCase): unknown[] | null {
  if (c.rule !== undefined) return [c.rule];
  const set = c.set;
  if (isRecord(set) && Array.isArray(set.rules) && typeof set.name === 'string') return set.rules;
  return null;
}

/** The codes that appear in no `details` line of the ValidationError (all of them for another error). */
function missingCodes(error: unknown, codes: readonly string[]): string[] {
  const details = error instanceof ValidationError ? (error.details ?? []) : [];
  return codes.filter((code) => !details.some((line) => line.includes(code)));
}

/** `true` for a ValidationError whose `details` name every code. */
function detailsHold(error: unknown, codes: readonly string[]): boolean {
  return error instanceof ValidationError && missingCodes(error, codes).length === 0;
}

/** Rule T of §9.4: disabled, matches no stored MAC, no template. */
function ruleT(): AlertRule {
  const id = runId();
  return {
    id: `sdk-test-${id}-rule`,
    disabled: true,
    conditions: {
      all: [{ fact: 'user_udid', operator: 'equal', value: `sdk-test-${id}-never` }],
    },
    event: {
      type: 'message',
      params: {
        title: `sdk-test-${id}`,
        text: 'SDK integration test rule, disabled, safe to delete',
        style: 'info',
        duration: 1000,
        coalescence: 3600,
        coalescence_group: `sdk-test-${id}`,
      },
    },
  };
}

describeLive('R', 'P5 guards', () => {
  let client: RtlsClient;
  let bare: RtlsClient;

  beforeAll(() => {
    client = createLiveClient();
    bare = createLiveClient({ namespace: null });
  });

  it('L-G1 every client-side guard throws before any request (deny-all)', async () => {
    const d = (): RtlsClient['dashboards'] => client.dashboards;
    const rejects = async (
      call: () => Promise<unknown>,
      details: string[],
      type: typeof ValidationError | typeof ContextError = ValidationError
    ): Promise<void> => {
      const p = call();
      await expect(p).rejects.toBeInstanceOf(type);
      await expect(p).rejects.toMatchObject({ status: 0, details });
    };
    const createCases: [unknown, string[]][] = [
      [{ name: '' }, ['name']],
      [{ name: '  ' }, ['name']],
      [{ name: 42 }, ['name']],
      [{ name: 'x', description: 5 }, ['description']],
      [{ name: 'x', data: 'x' }, ['data']],
      [{ name: 'x', dynamicVariables: 'x' }, ['dynamicVariables']],
      [{ name: 'x', dynamicVariables: [1] }, ['dynamicVariables[0]']],
      [{ name: 'x', shared_with: [{ username: '' }] }, ['shared_with[0].username']],
      [
        { name: 'x', shared_with: [{ username: 'u', permissions: ['admin'] }] },
        ['shared_with[0].permissions[0]'],
      ],
      [{ name: 'x', selected_by: [''] }, ['selected_by[0]']],
      [{ name: 'x', selected_by: 'u' }, ['selected_by']],
      [{ name: 'x', shared_with: 'u' }, ['shared_with']],
      [{ name: 'x', shared_with: ['u'] }, ['shared_with[0]']],
      [
        { name: 'x', shared_with: [{ username: 'u', permissions: 'edit' }] },
        ['shared_with[0].permissions'],
      ],
      [null, ['input']],
    ];
    const updateCases: [unknown, string[]][] = [
      [{ dynamicVariables: null }, ['dynamicVariables']],
      [{ application_namespace: '' }, ['application_namespace']],
      [{ name: null }, ['name']],
      [{ description: null }, ['description']],
      [{ data: null }, ['data']],
      [{ data: 'x' }, ['data']],
      [null, ['input']],
    ];
    const unshareCases: [unknown, string[]][] = [
      [[], ['usernames']],
      ['', ['usernames[0]']],
      [[''], ['usernames[0]']],
      [[1], ['usernames[0]']],
      [null, ['usernames']],
    ];
    const run = await withRequestGuard(denyAll, async () => {
      await rejects(() => d().get(''), ['id']);
      await rejects(() => d().delete(''), ['id']);
      const noNamespace = bare.dashboards.create({ name: testName('guard') });
      await expect(noNamespace).rejects.toBeInstanceOf(ContextError);
      for (const [input, details] of createCases) {
        await rejects(() => d().create(input as CreateDashboardInput), details);
      }
      for (const [input, details] of updateCases) {
        await rejects(() => d().update(ZERO_ID, input as UpdateDashboardInput), details);
      }
      await rejects(() => d().share(ZERO_ID, []), ['users']);
      await rejects(
        () => d().share(ZERO_ID, { username: 'u', permissions: ['admin' as 'edit'] }),
        ['users[0].permissions[0]']
      );
      await rejects(() => d().share(ZERO_ID, '', { write: true }), ['username']);
      for (const [usernames, details] of unshareCases) {
        await rejects(() => d().unshare(ZERO_ID, usernames as string[]), details);
      }
      const now = Date.now();
      await rejects(
        () => client.alerts.list({ timestampFrom: now, timestampTo: now - 1000, size: 1 }),
        ['from']
      );
      await rejects(() => client.alerts.list({ size: 1.5 }), ['size']);
      await rejects(() => client.alerts.list({ size: 10001 }), ['size']);
      await rejects(() => client.alertRules.upsertRule({ ...ruleT(), id: '' }), ['rule.id']);
      await rejects(() => client.alertRules.removeRule(''), ['ruleId']);
      await rejects(
        () => client.alertRules.setRuleEnabled('x', 'yes' as unknown as boolean),
        ['enabled']
      );
    });
    expect(run.error).toBeUndefined();
    expect(run.attempts).toHaveLength(0);
  });

  it('L-G2 replace() refuses every validator error case and the kitchen-sink set (deny-all)', async () => {
    const B = await client.alertRules.get();
    const errorCases = CASES.filter((c) => c.errors.length > 0);
    expect(errorCases.length).toBeGreaterThan(0);
    const failed: string[] = [];
    const run = await withRequestGuard(denyAll, async () => {
      for (const c of errorCases) {
        const rules = caseRules(c);
        const set = rules === null ? c.set : { ...B, rules: [...B.rules, ...rules] };
        const outcome = await withRequestGuard(denyAll, () =>
          client.alertRules.replace(set as AlertRuleSet)
        );
        if (!detailsHold(outcome.error, c.errors)) failed.push(c.id);
      }
    });
    expect(run.error).toBeUndefined();
    expect(failed, 'L-G2 cases not refused with their codes').toStrictEqual([]);
    expect(run.attempts).toHaveLength(0);

    const sinkCases = CASES.filter((c) => c.errors.length + c.warnings.length > 0);
    const sinkRules = sinkCases.flatMap((c) => caseRules(c) ?? []);
    const codes = new Set(sinkCases.filter((c) => caseRules(c) !== null).flatMap((c) => c.errors));
    // The template check is one whole-document error: the scan stops at the first problem, so the sink reports
    // TEMPLATE_UNBALANCED or TEMPLATE_UNSUPPORTED, whichever its combined text hits first.
    const template = ['TEMPLATE_UNBALANCED', 'TEMPLATE_UNSUPPORTED'];
    for (const code of template) codes.delete(code);
    // `decisions: []` adds the one set-level warning (LEGACY_DECISIONS) to the sink; deny-all, so nothing is sent.
    const sink = await withRequestGuard(denyAll, () =>
      client.alertRules.replace({
        ...B,
        decisions: [],
        rules: [...B.rules, ...(sinkRules as AlertRule[])],
      } as AlertRuleSet)
    );
    expect(sink.error).toBeInstanceOf(ValidationError);
    expect(missingCodes(sink.error, [...codes]), 'L-G2 kitchen-sink codes').toStrictEqual([]);
    expect(
      template.some((code) => detailsHold(sink.error, [code])),
      'L-G2 kitchen-sink template error'
    ).toBe(true);
    expect(sink.attempts).toHaveLength(0);
  });

  it('L-G3 the read-modify-write helpers refuse after their GET only (GET-only)', async () => {
    const B = await client.alertRules.get();
    const errorRule = caseRules(CASES.find((c) => c.id === 'V2') as RuleCase)?.[0] as AlertRule;
    const invalid = {
      ...ruleT(),
      id: testName('guard'),
      disabled: false,
      conditions: { all: [{ fact: 'user_udid', operator: 'equal' }] },
    } as unknown as AlertRule;
    const run = await withRequestGuard(getOnly, async () => {
      const upsert = client.alertRules.upsertRule(invalid);
      await expect(upsert).rejects.toBeInstanceOf(ValidationError);
      await expect(upsert).rejects.toSatisfy((e: unknown) =>
        detailsHold(e, ['CONDITION_VALUE_MISSING'])
      );
      await expect(client.alertRules.removeRule(testName('absent'))).rejects.toBeInstanceOf(
        ValidationError
      );
      await expect(
        client.alertRules.setRuleEnabled(testName('absent'), false)
      ).rejects.toBeInstanceOf(ValidationError);
      const save = client.alerts.saveRules([...B.rules, errorRule]);
      await expect(save).rejects.toBeInstanceOf(ValidationError);
      await expect(save).rejects.toSatisfy((e: unknown) =>
        detailsHold(e, ['CONDITION_VALUE_MISSING'])
      );
    });
    expect(run.error).toBeUndefined();
    expect(run.attempts.length).toBeGreaterThan(0);
    expect(run.attempts.every((a) => a.method === 'GET' && a.allowed)).toBe(true);
  });
});
