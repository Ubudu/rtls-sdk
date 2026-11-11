// Namespace configuration resources (LIVE-TESTING §4, P0 §6.2 config-cycle.ts + config-resources.ts).
// This module holds the pure parts that the guard needs for G6 and G9: which request writes which resource,
// `validateChange` (the bodies a cycle admits) and `isAbsent`. The cycle itself (lock, save, restore) is
// config-cycle.ts.
import { tagsOf } from '../../../examples/shared/preflight.js';
import { isPlainObject, T } from './policy';

export type ConfigResourceName =
  'alert-rules' | 'notification-cleanup-policy' | 'notification-tenant-config';

export const CONFIG_RESOURCES: Record<
  ConfigResourceName,
  { method: 'POST' | 'PUT'; template: string; path: string }
> = {
  'alert-rules': { method: 'POST', template: T.alertRules, path: '/alert_rules/{ns}' },
  'notification-cleanup-policy': {
    method: 'PUT',
    template: T.cleanupPolicy,
    path: '/notifications/{ns}/cleanup-policy',
  },
  'notification-tenant-config': {
    method: 'PUT',
    template: T.tenantConfig,
    path: '/notifications/{ns}/tenant-config',
  },
};

/** Metadata the server refreshes on every write; ignored by the comparisons of these resources. */
export const METADATA_KEYS: readonly string[] = ['updated_at', 'updatedAt', '__v'];

/** The configuration resource a request writes, else null (G9). */
export function configResourceOf(
  method: string,
  template: string | null
): ConfigResourceName | null {
  for (const [name, r] of Object.entries(CONFIG_RESOURCES)) {
    if (r.method === method && r.template === template) return name as ConfigResourceName;
  }
  return null;
}

/** Key-order-insensitive deep equality of JSON values; arrays order-sensitive. */
export function deepEqualJson(a: unknown, b: unknown, ignoreKeys: readonly string[] = []): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqualJson(item, b[i], ignoreKeys));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = (o: Record<string, unknown>): string[] =>
      Object.keys(o).filter((k) => o[k] !== undefined && !ignoreKeys.includes(k));
    const ka = keys(a);
    const kb = keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => Object.hasOwn(b, k) && deepEqualJson(a[k], b[k], ignoreKeys));
  }
  return Number.isNaN(a) && Number.isNaN(b);
}

export type AlertRulesChange =
  | { kind: 'equal' }
  | { kind: 'added'; rule: Record<string, unknown> }
  | { kind: 'removed-test'; removed: number };

function withoutRules(doc: Record<string, unknown>): Record<string, unknown> {
  const { rules: _rules, ...rest } = doc;
  return rest;
}

/**
 * How an alert-rule document `next` differs from `before`: equal; `before` plus exactly one disabled rule
 * whose id starts with `sdk-test-<runId>-` and that holds no mustache tag in any string or key (cycle mode);
 * `before` minus rules whose id starts with `sdk-test-`, all disabled (sweeper mode). Anything else → null.
 *
 * The added test rule must stay exactly as written, so it may hold no template tag, and a document with a
 * structural tag (a delimiter change, a section open across strings) admits no added rule.
 */
export function alertRulesChange(
  before: unknown,
  next: unknown,
  options: { runId: string; mode?: 'cycle' | 'sweeper' }
): AlertRulesChange | null {
  if (deepEqualJson(next, before)) return { kind: 'equal' };
  if (!isPlainObject(before) || !isPlainObject(next)) return null;
  const beforeRules = before.rules;
  const nextRules = next.rules;
  if (!Array.isArray(beforeRules) || !Array.isArray(nextRules)) return null;
  if (!deepEqualJson(withoutRules(next), withoutRules(before))) return null;
  if ((options.mode ?? 'cycle') === 'cycle') {
    if (nextRules.length !== beforeRules.length + 1) return null;
    if (tagsOf(next).structural) return null;
    const prefix = `sdk-test-${options.runId}-`;
    for (let i = 0; i < nextRules.length; i += 1) {
      const candidate: unknown = nextRules[i];
      const rest = nextRules.filter((_, j) => j !== i);
      if (
        isPlainObject(candidate) &&
        typeof candidate.id === 'string' &&
        candidate.id.startsWith(prefix) &&
        candidate.disabled === true &&
        !tagsOf(candidate).tags &&
        deepEqualJson(rest, beforeRules)
      ) {
        return { kind: 'added', rule: candidate };
      }
    }
    return null;
  }
  const isTestRule = (r: unknown): boolean =>
    isPlainObject(r) && typeof r.id === 'string' && r.id.startsWith('sdk-test-');
  const removed = beforeRules.filter(isTestRule);
  if (removed.length === 0) return null;
  if (!removed.every((r) => isPlainObject(r) && r.disabled === true)) return null;
  const kept = beforeRules.filter((r) => !isTestRule(r));
  return deepEqualJson(nextRules, kept) ? { kind: 'removed-test', removed: removed.length } : null;
}

/**
 * The bodies a cycle admits (G9). alert-rules: `alertRulesChange` not null. cleanup policy and tenant
 * config: the body deep-equals the before-image projected onto the keys the body carries (a key absent from
 * the before-image → reject; metadata keys ignored).
 */
export function validateChange(
  resource: ConfigResourceName,
  before: unknown,
  next: unknown,
  options: { runId: string; mode?: 'cycle' | 'sweeper' }
): boolean {
  if (resource === 'alert-rules') return alertRulesChange(before, next, options) !== null;
  if (!isPlainObject(before) || !isPlainObject(next)) return false;
  return Object.keys(next)
    .filter((k) => next[k] !== undefined && !METADATA_KEYS.includes(k))
    .every((k) => Object.hasOwn(before, k) && deepEqualJson(next[k], before[k], METADATA_KEYS));
}

/**
 * No stored value: alert rules not a plain object with a `rules` array; cleanup policy and tenant config
 * without `_id`, or a 403 (P6 §9.4).
 */
export function isAbsent(resource: ConfigResourceName, value: unknown, status = 200): boolean {
  if (resource === 'alert-rules') return !(isPlainObject(value) && Array.isArray(value.rules));
  return status === 403 || !isPlainObject(value) || !Object.hasOwn(value, '_id');
}
