// Write section: tier C; budget positions=0 notifications=0 ble=0 etl=0; read skips none
/**
 * Example 15: alert rules.
 *
 * Read-only: reads the namespace's alert-rule set and prints, per rule, its id, event type, whether it is enabled
 * and whether its coalescence group is per asset (`{{user_udid}}`); never receivers, callback URLs, texts or
 * condition values. Prints the validator's findings (code and path), counts the alerts of the last 24 hours by
 * event type and style, and reads the namespace settings (key count, position expiry and accuracy only).
 *
 * With `--write` (tier C): keeps the set in memory as a backup, adds one disabled test rule, keeps it disabled with
 * `setRuleEnabled(id, false)` (the call always writes), shows what the validator says about an invalid enabled rule
 * (no write), removes the test rule and checks that the stored set equals the backup again. A failure before
 * anything changed fails as usual (exit 1). After a change it writes the backup back and checks it: when the stored
 * set equals the backup again the failure is reported with exit 1; when it still differs, or the restore request
 * fails, the example exits with code 4 (configuration restore failed). Nothing is written to a file.
 *
 * Run through the guarded runner: `npm run examples:check -- 15` (read-only) or
 * `RTLS_IT_WRITES=1 RTLS_IT_CONFIG=1 npm run examples:check -- 15 --write`.
 */
import { validateAlertRuleSet, type AlertEvent, type AlertRule } from 'ubudu-rtls-sdk';
import { runExample, skip, testName } from '../shared/config.js';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** JSON paths where `a` and `b` differ, ignoring key order (paths only, never values). */
function differingPaths(a: unknown, b: unknown, path = '$'): string[] {
  if (Object.is(a, b)) return [];
  if (Array.isArray(a) && Array.isArray(b)) {
    const out: string[] = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      out.push(...differingPaths(a[i], b[i], `${path}[${i}]`));
    }
    return out;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    return keys.flatMap((k) =>
      Object.hasOwn(a, k) && Object.hasOwn(b, k)
        ? differingPaths(a[k], b[k], `${path}.${k}`)
        : [`${path}.${k}`]
    );
  }
  return [path];
}

/** Integers beyond ±(2^53−1) were already rounded by JSON.parse; writing them back would store the rounded value. */
function hasUnsafeIntegers(value: unknown): boolean {
  if (typeof value === 'number') return Number.isInteger(value) && !Number.isSafeInteger(value);
  if (Array.isArray(value)) return value.some(hasUnsafeIntegers);
  return isPlainObject(value) && Object.values(value).some(hasUnsafeIntegers);
}

function countBy(
  alerts: readonly AlertEvent[],
  key: (a: AlertEvent) => string
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const a of alerts) counts[key(a)] = (counts[key(a)] ?? 0) + 1;
  return counts;
}

/** Prints the failure line and exits with code 4 (the stored rules still differ from the backup). */
async function exitRestoreFailed(message: string): Promise<never> {
  await new Promise<void>((done) => {
    process.stdout.write(`FAILED 15-alert-rules: ${message}\n`, () => done());
  });
  process.exit(4);
}

await runExample('15-alert-rules', async ({ client, config, log, signal }) => {
  // ─── Read-only part ──────────────────────────────────────────────────────────
  const set = await client.alertRules.get({ signal });
  log(`alert rules: ${set.rules.length} rule(s)`);
  for (const rule of set.rules) {
    const event: unknown = rule.event;
    const type = isPlainObject(event) ? String(event.type) : 'none';
    const params = isPlainObject(event) && isPlainObject(event.params) ? event.params : {};
    const group = params.coalescence_group;
    const perAsset = typeof group === 'string' && group.includes('{{user_udid}}');
    log(
      `  ${String(rule.id)} event=${type} enabled=${!rule.disabled} perAssetCoalescence=${perAsset}`
    );
  }

  const check = validateAlertRuleSet(set);
  log(`validation: ${check.errors.length} error(s), ${check.warnings.length} warning(s)`);
  for (const issue of [...check.errors, ...check.warnings]) {
    log(`  ${issue.severity} ${issue.code} at ${issue.path === '' ? '(document)' : issue.path}`);
  }

  // The default range is the last 24 hours; `size` caps the result (newest first).
  const alerts = await client.alerts.list({ size: 20, signal });
  log(`alerts in the last 24 h (at most 20): ${alerts.length}`);
  log(`  by event type: ${JSON.stringify(countBy(alerts, (a) => a.event.type))}`);
  log(`  by style: ${JSON.stringify(countBy(alerts, (a) => String(a.event.style)))}`);

  // Namespace settings: the document may hold namespace identifiers, so only the key count and two values.
  const settings = await client.settings.get({ signal });
  log(
    `settings: ${Object.keys(settings).length} key(s); positions expire after ${settings.positionsExpirationPeriod} s; accuracy ${settings.accuracy.accuracy_meter} m`
  );

  if (!config.write) return;

  // ─── Write part (tier C) ─────────────────────────────────────────────────────
  // 1. Refuse to write unless the stored set can be written back exactly.
  if (set.rules.length === 0) skip('no-fixture', 'the namespace has no stored alert rules');
  if (Object.hasOwn(set, 'decisions')) {
    throw new Error('refusing to write: the stored rules hold a legacy decisions key');
  }
  if (set.rules.some((r) => typeof r.id === 'string' && r.id.startsWith('sdk-test-'))) {
    throw new Error('refusing to write: a sdk-test- rule is already stored (run the sweeper)');
  }
  if (!check.valid) throw new Error('refusing to write: the stored rules have validator errors');
  if (hasUnsafeIntegers(set)) {
    throw new Error('refusing to write: the stored rules hold integers beyond ±(2^53−1)');
  }

  // 2. The backup stays in memory only.
  const backup = structuredClone(set);
  const ruleId = testName('ex15-rule');
  try {
    // 3. One disabled rule whose condition cannot match. A stored document that is not { name, rules } is
    //    refused by upsertRule before anything is written.
    const testRule: AlertRule = {
      id: ruleId,
      disabled: true,
      conditions: { all: [{ fact: 'user_udid', operator: 'equal', value: `${ruleId}-never` }] },
      event: {
        type: 'message',
        params: {
          title: ruleId,
          text: 'SDK example 15 rule, disabled, safe to delete',
          style: 'info',
          duration: 1000,
          coalescence: 3600,
          coalescence_group: ruleId,
        },
      },
    };
    const written = await client.alertRules.upsertRule(testRule, { signal });
    const added = written.rules.find((r) => r.id === ruleId);
    log(
      `added ${ruleId}: disabled=${added?.disabled === true}; ${written.rules.length} rule(s) stored`
    );
    // setRuleEnabled() is a read-modify-write that always writes; `false` keeps the test rule disabled.
    const kept = await client.alertRules.setRuleEnabled(ruleId, false, { signal });
    log(
      `setRuleEnabled(false): disabled=${kept.rules.find((r) => r.id === ruleId)?.disabled === true}`
    );

    // 4. Pure: what the validator says about an enabled rule whose condition has no `value`. Never written.
    const invalid = {
      id: testName('ex15-invalid'),
      conditions: { all: [{ fact: 'zone_name', operator: 'equal' }] },
      event: {
        type: 'message',
        params: { title: 'invalid', coalescence: 60, coalescence_group: 'x' },
      },
    } as unknown as AlertRule;
    const preview = validateAlertRuleSet({ ...set, rules: [...set.rules, invalid] });
    log(`an invalid enabled rule would be refused with ${preview.errors.length} error(s):`);
    for (const issue of preview.errors) log(`  ${issue.code} at ${issue.path}`);

    // 5. Remove the test rule; the stored set must equal the backup again (key order ignored).
    const after = await client.alertRules.removeRule(ruleId, { signal });
    const reread = await client.alertRules.get({ signal });
    const differences = [...differingPaths(after, backup), ...differingPaths(reread, backup)];
    if (differences.length > 0) {
      throw new Error(`stored rules differ from the backup at ${differences.join(', ')}`);
    }
    log(`removed ${ruleId}; the stored rules equal the backup`);
  } catch (error) {
    // 6. Nothing changed (for example the helper refused a stored document that is not { name, rules }): plain
    //    failure, exit 1. Otherwise write the backup back verbatim and check it: restored → the failure is
    //    reported (exit 1); still different, or the restore request failed → exit 4.
    const changed = await client.alertRules.get().then(
      (stored) => differingPaths(stored, backup).length > 0,
      () => true
    );
    if (!changed) throw error;
    log(`failure (${error instanceof Error ? error.name : 'error'}): restoring the backup`);
    let remaining: string[] | undefined;
    try {
      await client.alertRules.replace(backup, { skipValidation: true });
      remaining = differingPaths(await client.alertRules.get(), backup);
    } catch (restoreError) {
      log(`restore failed (${restoreError instanceof Error ? restoreError.name : 'error'})`);
    }
    if (remaining === undefined || remaining.length > 0) {
      if (remaining !== undefined) log(`restore differs at ${remaining.join(', ')}`);
      await exitRestoreFailed(error instanceof Error ? error.message : 'unknown error');
    }
    log('backup restored');
    throw error;
  }
});
