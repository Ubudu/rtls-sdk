// P5 §9.4 C0–C7: the alert-rule write path live (tier C, RTLS_IT_CONFIG=1), LIVE-TESTING §4 protocol. Every write
// runs inside configCycle (config lock, saved before-image, restore in finally) and inside a request guard that
// admits only GET /alert_rules/{ns} and a POST whose body deep-equals B, B + T or B + T2. T and T2 are disabled
// `sdk-test-<runId>-` rules whose condition cannot match. Documents are compared with the redacted, key-order-
// insensitive assertion only; no rule content is printed. Writes: 7 (C2, C3 ×2, C4, C5, C6, C7), at most 1 restore.
import { validateAlertRuleSet, type AlertRule, type AlertRuleSet } from '../../../src';
import {
  configCycle,
  createLiveClient,
  describeLive,
  diffRedacted,
  expectDeepEqualRedacted,
  getHarness,
  runId,
  testName,
  withRequestGuard,
  type GuardedRequest,
} from '../harness';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const deepEqual = (a: unknown, b: unknown): boolean => diffRedacted(a, b).length === 0;

/** Integers that `JSON.parse` already rounded (outside ±(2^53−1)); writing them back would store the rounded value. */
function unsafeIntegers(value: unknown): number {
  if (typeof value === 'number')
    return Number.isInteger(value) && !Number.isSafeInteger(value) ? 1 : 0;
  if (Array.isArray(value)) return value.reduce((n: number, v) => n + unsafeIntegers(v), 0);
  if (isPlainObject(value)) {
    return Object.values(value).reduce((n: number, v) => n + unsafeIntegers(v), 0);
  }
  return 0;
}

/** The first C0 condition `B` fails, or null (condition names only, never values). */
function c0Failure(b: unknown): string | null {
  if (!isPlainObject(b)) return 'stored alert rules are not an object';
  if (typeof b.name !== 'string') return 'stored name is not a string';
  if (!Array.isArray(b.rules) || b.rules.length === 0)
    return 'stored rules are not a non-empty array';
  if (Object.hasOwn(b, 'decisions')) return 'stored document has a legacy decisions key';
  const residue = b.rules.some(
    (r) => isPlainObject(r) && typeof r.id === 'string' && r.id.startsWith('sdk-test-')
  );
  if (residue) return 'sdk-test- rule residue: run the sweeper';
  const errors = validateAlertRuleSet(b).errors;
  if (errors.length > 0) {
    return `validator errors, escalate to the owner: ${errors.map((e) => `${e.path} ${e.code}`).join('; ')}`;
  }
  if (unsafeIntegers(b) > 0)
    return 'stored rules hold integers beyond ±(2^53−1): escalate to the owner';
  return null;
}

/** The only rule this file ever adds (P5 §9.4). */
function testRule(title: string): AlertRule {
  const tag = `sdk-test-${runId()}`;
  return {
    id: testName('rule'),
    disabled: true,
    conditions: { all: [{ fact: 'user_udid', operator: 'equal', value: `${tag}-never` }] },
    event: {
      type: 'message',
      params: {
        title,
        text: 'SDK integration test rule, disabled, safe to delete',
        style: 'info',
        duration: 1000,
        coalescence: 3600,
        coalescence_group: tag,
      },
    },
  };
}

describeLive('C', 'P5 alert-rules config', () => {
  it('C0–C7 read, write back, add, update, disable and remove one disabled test rule; restore checked', async (ctx) => {
    const client = createLiveClient();
    const namespace = getHarness().env.namespace;
    const T = testRule(`sdk-test-${runId()}`);
    const T2 = testRule(`sdk-test-${runId()}-v2`);

    await configCycle<AlertRuleSet>(
      ctx,
      'alert-rules',
      async (cycle) => {
        const B = cycle.before;
        const failure = c0Failure(B);
        // C0 guard: no write happens when the stored document is not safe to write back. The gate counts a C0 stop
        // as a failure, so the step fails (naming the condition only) instead of skipping.
        if (failure !== null) throw new Error(`P5 C0 guard failed, no write made: ${failure}`);

        const withT: AlertRuleSet = { ...B, rules: [...B.rules, T] };
        const withT2: AlertRuleSet = { ...B, rules: [...B.rules, T2] };
        const allowed = (r: GuardedRequest): boolean => {
          if (r.template !== '/alert_rules/{app_namespace}') return false;
          if (r.method === 'GET') return true;
          return (
            r.method === 'POST' &&
            (deepEqual(r.body, B) || deepEqual(r.body, withT) || deepEqual(r.body, withT2))
          );
        };

        const guarded = await withRequestGuard(allowed, async () => {
          // C1
          const S = await client.alertRules.get();
          expectDeepEqualRedacted(S, B, 'C1 alertRules.get() = before-image');
          // C2
          expect(await client.alertRules.replace(S)).toBeUndefined();
          expectDeepEqualRedacted(await cycle.read(), B, 'C2 after replace(S)');
          // C3
          expect(await client.alerts.saveRules(S.rules)).toBeUndefined();
          expectDeepEqualRedacted(await cycle.read(), B, 'C3 after saveRules(S.rules)');
          expect(await client.alerts.saveRules(namespace, S)).toBeUndefined();
          expectDeepEqualRedacted(await cycle.read(), B, 'C3 after saveRules(namespace, S)');
          // C4
          const W = await client.alertRules.upsertRule(T);
          expect(W.rules.length).toBe(B.rules.length + 1);
          expectDeepEqualRedacted(W.rules[W.rules.length - 1], T, 'C4 last rule = T');
          expectDeepEqualRedacted(await cycle.read(), withT, 'C4 stored = B + T');
          // C5
          await client.alertRules.upsertRule(T2);
          expectDeepEqualRedacted(await cycle.read(), withT2, 'C5 stored = B + T2 (same index)');
          // C6
          await client.alertRules.setRuleEnabled(T.id, false);
          expectDeepEqualRedacted(await cycle.read(), withT2, 'C6 stored unchanged (disabled)');
          // C7
          const removed = await client.alertRules.removeRule(T.id);
          expectDeepEqualRedacted(removed, B, 'C7 returned set = B');
          expectDeepEqualRedacted(await cycle.read(), B, 'C7 stored = B');
        });
        // withRequestGuard returns the body's error: rethrow it so configCycle restores and the test fails.
        if (guarded.error !== undefined) throw guarded.error;
        expect(guarded.attempts.filter((a) => !a.allowed)).toHaveLength(0);
        expect(guarded.attempts.filter((a) => a.method === 'POST')).toHaveLength(7);
      },
      { restoreWith: (b) => client.alertRules.replace(b, { skipValidation: true }) }
    );
  });
});
