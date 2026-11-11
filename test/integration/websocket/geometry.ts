// Zone-0 rule guard of the WebSocket publisher suite (spec P8 §9.1 step 6). Pure: imports nothing from the
// harness (only the threshold constant of the shared preflight module). The shared preflight's `positionSafe` verdict
// is authoritative (G18 and `describeLive({ positions })`); this evaluation is a cross-check that can only add a
// skip, never relax the shared verdict.
//
// A test publish outside every zone reaches the rule engine with the facts zone_id = outside-all-zones,
// zone_name 'OUTSIDE_ALL_ZONES', zone_tags [], user_udid = a test MAC, null for user_name, user_type, user_tags,
// model and external_id, and false for is_declared_position and is_virtual. Every enabled rule must be provably
// unmatched by these facts.
//
// The two leaves of the owner decision (LIVE-TESTING §2.7, `examples/shared/preflight.js`) also cannot match, each
// only in exactly the shared form:
// - `{ fact: 'external_id', operator: 'notEmpty', value: true }`: the external id of a test MAC without an asset
//   record is null.
// - `{ fact: 'time_in_zone', operator: 'greaterThan', value: N }`, N a finite number ≥ TIME_IN_ZONE_MIN_SECONDS, and
//   only when the caller passes `timeInZone: true` (absent → may match): the shared `positionSafe` verdict is itself
//   time-limited, so the shared preflight found both premises of that leaf (fresh test MACs, the expiration period)
//   and G18 ends the verdict on every frame.
// Their premises for this suite: the frames carry only app_namespace, user_uuid, lat, lon, map_uuid and timestamp
// (no external_id, time_in_zone, origin, origin_detail, declared_location or is_virtual; asserted in LT-S1 and
// LT-S2), on two fresh test MACs of the run's range with no cached position and no asset record (the suite's
// existing-entity guard), one position per MAC.
import { TIME_IN_ZONE_MIN_SECONDS } from '../../../examples/shared/preflight.js';

const OUTSIDE_ZONE_IDS: ReadonlySet<unknown> = new Set([0, '0', 'OUTSIDE_ALL_ZONES']);
const OUTSIDE_ZONE_NAME = 'OUTSIDE_ALL_ZONES';
/** Facts that are null for a test MAC without an asset record (user_udid is the test MAC itself). */
const STRING_FACTS: ReadonlySet<string> = new Set([
  'user_udid',
  'user_name',
  'user_type',
  'model',
  'external_id',
]);

export interface ZoneZeroGuardOptions {
  /**
   * The `time_in_zone greaterThan N` leaf counts: the shared `positionSafe` verdict is time-limited (`timeLimited`
   * of preflight.json lists it). Absent or false: that leaf may match.
   */
  timeInZone?: boolean;
}

export interface ZoneZeroVerdict {
  /** true: every enabled rule is provably unmatched by a zone-0 test publish */
  safe: boolean;
  /** indices of the enabled rules that may match (never rule content) */
  mayMatch: number[];
  /** set when the document is not `{ name, rules: [...] }` */
  invalidDocument: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A value that a test publish could carry: a test MAC (separators and case ignored) or a test name. */
function looksLikeTestValue(value: string): boolean {
  const compact = value.replace(/[^0-9a-z]/gi, '').toLowerCase();
  return compact.startsWith('025d4b') || value.toLowerCase().startsWith('sdk-test-');
}

function nonEmptyStrings(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((v) => typeof v === 'string' && v !== '')
  );
}

/**
 * True when the leaf cannot match the facts of a zone-0 test publish (spec P8 §9.1 step 6, plus the two leaves of
 * the owner decision; see the module comment).
 */
export function leafCannotMatch(node: unknown, options: ZoneZeroGuardOptions = {}): boolean {
  if (!isRecord(node)) return false;
  for (const key of ['all', 'any', 'not', 'condition', 'path', 'params']) {
    if (node[key] !== undefined) return false;
  }
  const { fact, operator, value } = node;
  if (typeof fact !== 'string' || typeof operator !== 'string' || !Object.hasOwn(node, 'value'))
    return false;
  if (fact === 'zone_id') {
    const key = (v: unknown): boolean => typeof v === 'string' || typeof v === 'number';
    if (operator === 'equal') return key(value) && !OUTSIDE_ZONE_IDS.has(value);
    if (operator === 'in')
      return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((v) => key(v) && !OUTSIDE_ZONE_IDS.has(v))
      );
    return false;
  }
  if (fact === 'zone_name') {
    if (operator === 'equal') return typeof value === 'string' && value !== OUTSIDE_ZONE_NAME;
    if (operator === 'in') return nonEmptyStrings(value) && !value.includes(OUTSIDE_ZONE_NAME);
    return false;
  }
  if (fact === 'zone_tags' || fact === 'user_tags') {
    return operator === 'contains' && typeof value === 'string' && value !== '';
  }
  if (fact === 'time_in_zone') {
    return (
      options.timeInZone === true &&
      operator === 'greaterThan' &&
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= TIME_IN_ZONE_MIN_SECONDS
    );
  }
  if (fact === 'external_id' && operator === 'notEmpty') return value === true;
  if (STRING_FACTS.has(fact)) {
    const values = operator === 'equal' ? [value] : operator === 'in' ? value : null;
    return nonEmptyStrings(values) && values.every((v) => !looksLikeTestValue(v));
  }
  if (fact === 'is_declared_position' || fact === 'is_virtual') {
    return operator === 'equal' && value === true;
  }
  return false;
}

/**
 * Provably unmatched: an `all` root that directly holds a leaf that cannot match, or a non-empty `any` root whose
 * every direct child is such a leaf. Anything else (both roots, nested groups only, other facts or operators,
 * templated values) may match.
 */
export function ruleProvablyUnmatched(rule: unknown, options: ZoneZeroGuardOptions = {}): boolean {
  if (!isRecord(rule) || !isRecord(rule.conditions)) return false;
  const { all, any } = rule.conditions;
  const cannotMatch = (node: unknown): boolean => leafCannotMatch(node, options);
  if (all !== undefined && any !== undefined) return false;
  if (Array.isArray(all)) return all.some(cannotMatch);
  if (Array.isArray(any)) return any.length > 0 && any.every(cannotMatch);
  return false;
}

/** The zone-0 verdict of an alert-rule document (disabled rules ignored). */
export function zoneZeroRuleGuard(
  doc: unknown,
  options: ZoneZeroGuardOptions = {}
): ZoneZeroVerdict {
  if (!isRecord(doc) || typeof doc.name !== 'string' || !Array.isArray(doc.rules)) {
    return { safe: false, mayMatch: [], invalidDocument: true };
  }
  const mayMatch: number[] = [];
  doc.rules.forEach((rule: unknown, index: number) => {
    if (isRecord(rule) && rule.disabled) return;
    if (!ruleProvablyUnmatched(rule, options)) mayMatch.push(index);
  });
  return { safe: mayMatch.length === 0, mayMatch, invalidDocument: false };
}
