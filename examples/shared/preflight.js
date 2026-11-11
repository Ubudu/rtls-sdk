// Rule and linked-namespace preflight of the examples' write sections. Pure functions, no dependency and no I/O:
// the guarded runners and `preflightRules()` of config.js import this one implementation. Only indices, event types
// and counts leave these functions; rule content never does.
//
// Verdicts (a write section whose verdict is false ends as `SKIPPED: preflight …` and writes nothing):
// - ruleEngineSafe: no enabled rule whose action leaves the platform (any event type other than `message` and
//   `set_variable`) unless it is restricted to named assets.
// - positionSafe: every enabled rule is provably unmatched by a non-declared publish on a test MAC that has no
//   asset record, at a point outside all zones.
// - declaredPositionSafe: the same with `is_declared_position = true` and the facts of a test asset; any leaf on
//   the declaration facts or on test-asset facts counts as "may match". Implies positionSafe.
// - linkedNamespaceSafe: no asset of the namespace carries a `createdBy` naming another namespace.
//
// Two further leaves cannot match, each only in exactly this form:
// - `{ fact: 'external_id', operator: 'notEmpty', value: true }`, for positionSafe only: a test MAC without an asset
//   record has no external id. Never for declaredPositionSafe (a declared position carries the asset's facts).
// - `{ fact: 'time_in_zone', operator: 'greaterThan', value: N }`, N a finite number ≥ TIME_IN_ZONE_MIN_SECONDS, for
//   both, and only when the caller states both premises (`options` of evaluateAlertRules; absent → "may match"):
//   `freshTestMacs` is true (no earlier recorded run positioned a MAC of this run's test range), and
//   `positionsExpirationPeriod` is an integer from 1 to TIME_IN_ZONE_MAX_PERIOD_SECONDS. A test MAC first
//   positioned after the preflight cannot have been in a zone for longer than the time since then, so a caller that
//   passes the premises makes every verdict that depends on this leaf expire TIME_IN_ZONE_RUN_LIMIT_SECONDS after
//   its preflight began (`timeLimited` in preflight.json).
//
// Publish bodies: the leaves on `is_declared_position` and `is_virtual` count as "cannot match" only for a test
// publish whose body carries neither flag, no `origin`, `origin_detail` or `declared_location`, and no asset field,
// as the examples' publishes do; for a declared position, `is_virtual` also needs no test asset with
// `is_virtual: true`.
//
// Templates: a stored rule may hold template tags (`{{x}}`). The check reads every rule of the document, enabled or
// not: a rule whose conditions, keys or event type hold a tag, or that holds an unescaped tag (`{{{x}}}`, `{{&x}}`)
// anywhere, counts as enabled, unrestricted and "may match". A structural tag fails every verdict: a delimiter
// change, a partial, a tag left open in its string, a section or comment that does not close in the string it opens
// in, or an unescaped tag outside the rules. Tags that stay inside one string and are balanced there (a message text
// in `event.params`) do not count. A document whose braces are stored as `\u` escapes is not covered.

/** Event types whose action stays on the platform. */
const ON_PLATFORM_EVENTS = new Set(['message', 'set_variable']);
/** Facts whose `equal` / `in` restriction names assets (ruleEngineSafe). */
const ASSET_FACTS = new Set(['user_udid', 'user_name', 'external_id']);
/** Facts with `null` value for a test publish (no asset record), compared by `equal` / `in`. */
const NULL_STRING_FACTS = new Set(['user_udid', 'user_name', 'user_type', 'model', 'external_id']);
/** Facts that may match a declared position of a test asset (declaredPositionSafe). */
const DECLARED_MAY_MATCH_FACTS = new Set([
  'is_declared_position',
  'declaration_source',
  'user_name',
  'model',
  'user_tags',
  'external_id',
]);
/** `zone_id` values of a position outside every zone. */
const OUTSIDE_ZONE_IDS = new Set([0, '0', 'OUTSIDE_ALL_ZONES']);
const OUTSIDE_ZONE_NAME = 'OUTSIDE_ALL_ZONES';
/**
 * Smallest `value` (seconds) for which `time_in_zone greaterThan value` cannot match a test MAC, under the premises
 * of the module comment: with `freshTestMacs` no earlier recorded run positioned this run's MACs, and a verdict that
 * depends on this leaf is admitted for TIME_IN_ZONE_RUN_LIMIT_SECONDS after the preflight began only, so a test
 * MAC's time in a zone stays below this value while the verdict holds. Neither premise is assumed: without both,
 * the leaf may match.
 */
export const TIME_IN_ZONE_MIN_SECONDS = 3600;
/**
 * How long (seconds after the preflight began) a verdict that depends on the `time_in_zone` leaf is admitted. Half of
 * TIME_IN_ZONE_MIN_SECONDS: the other half is a margin for processing delays between the first and the last
 * position on one MAC. The harness writes the end as `timeLimitedUntil`; preflightAllows() applies it.
 */
export const TIME_IN_ZONE_RUN_LIMIT_SECONDS = 1800;
/**
 * Largest `positionsExpirationPeriod` (seconds, as `client.settings.get()` reports it) for which the leaf above
 * counts. An extra condition only, not a proof: the bound rests on `freshTestMacs` and
 * TIME_IN_ZONE_RUN_LIMIT_SECONDS.
 */
const TIME_IN_ZONE_MAX_PERIOD_SECONDS = 60;
const TEST_MAC_RE = /^025d4b[0-9a-f]{6}$/;
const EVENT_TYPE_RE = /^[a-z][a-z0-9_]{0,39}$/;

/**
 * The mustache tags of one string (mustache syntax: `{{`, optional spaces, a type character, the name,
 * `}}`, or `}}}` for `{{{`). `structural` for a delimiter change, a partial, or a tag, section or comment not closed
 * in this string; `unescaped` when it holds `{{{x}}}` or `{{&x}}`.
 *
 * @param {string} text
 * @returns {{ tags: boolean; structural: boolean; unescaped: boolean }}
 */
function mustacheTags(text) {
  /** @type {string[]} */
  const sections = [];
  let tags = false;
  let unescaped = false;
  for (let i = text.indexOf('{{'); i >= 0; i = text.indexOf('{{', i)) {
    tags = true;
    let j = i + 2;
    while (j < text.length && /\s/.test(text.charAt(j))) j += 1;
    const type = text.charAt(j);
    if (type === '=' || type === '>') return { tags, structural: true, unescaped };
    const closer = type === '{' ? '}}}' : '}}';
    const close = text.indexOf(closer, j);
    if (close < 0) return { tags, structural: true, unescaped };
    const name = text.slice('#^/!&{'.includes(type) && type !== '' ? j + 1 : j, close).trim();
    if (type === '{' || type === '&') unescaped = true;
    if (type === '#' || type === '^') sections.push(name);
    else if (type === '/' && sections.pop() !== name) return { tags, structural: true, unescaped };
    i = close + closer.length;
  }
  return { tags, structural: sections.length > 0, unescaped };
}

/**
 * Every string of a JSON value, object keys included.
 *
 * @param {unknown} value
 * @param {(text: string) => void} visit
 */
function eachString(value, visit) {
  if (typeof value === 'string') visit(value);
  else if (Array.isArray(value)) for (const item of value) eachString(item, visit);
  else if (isObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      visit(key);
      eachString(item, visit);
    }
  }
}

/**
 * The tags of a JSON value, object keys included: any tag, a structural one, an unescaped one. The harness uses
 * it too (an added test rule must hold no tag at all).
 *
 * @param {unknown} value
 * @returns {{ tags: boolean; structural: boolean; unescaped: boolean }}
 */
export function tagsOf(value) {
  const out = { tags: false, structural: false, unescaped: false };
  eachString(value, (text) => {
    if (!text.includes('{{')) return;
    const t = mustacheTags(text);
    out.tags ||= t.tags;
    out.structural ||= t.structural;
    out.unescaped ||= t.unescaped;
  });
  return out;
}

/**
 * True for a tag in the rule's conditions, its keys or its event type, or an unescaped tag anywhere in it (the
 * message text of `event.params` aside).
 *
 * @param {unknown} rule
 */
function isTemplated(rule) {
  if (!isObject(rule)) return false;
  if (tagsOf(rule).unescaped) return true;
  const event = isObject(rule.event) ? { ...rule.event, params: undefined } : rule.event;
  return tagsOf({ ...rule, event }).tags;
}

/**
 * True for a structural tag anywhere or an unescaped tag outside the rules (see the module comment): every verdict
 * is false.
 *
 * @param {unknown} doc
 * @param {unknown[]} rules
 */
function structurallyTemplated(doc, rules) {
  if (tagsOf(doc).structural) return true;
  const outside = Array.isArray(doc)
    ? []
    : Object.entries(/** @type {Record<string, unknown>} */ (doc)).filter(
        ([, value]) => value !== rules
      );
  return tagsOf(Object.fromEntries(outside)).unescaped;
}

/** Preflight warning: `message` events reach the notification center. */
export const MESSAGE_RULES_WARNING = 'message-rules-reach-notifications';

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {string} value
 * @returns {string}
 */
function macLike(value) {
  return value.replace(/[:.-]/g, '').toLowerCase();
}

/**
 * Default test-value rule: a test MAC (separators and case ignored) or a name starting `sdk-test-`.
 *
 * @param {string} value
 * @returns {boolean}
 */
export function isTestValue(value) {
  return TEST_MAC_RE.test(macLike(value)) || value.startsWith('sdk-test-');
}

/**
 * Wider test-value rule: any value starting with `025d4b` (separators and case ignored) or `sdk-test-`.
 *
 * @param {string} value
 * @returns {boolean}
 */
function startsLikeTest(value) {
  return macLike(value).startsWith('025d4b') || value.toLowerCase().startsWith('sdk-test-');
}

/**
 * The rule list of a stored document: a non-empty `rules` array wins; otherwise `decisions` when present (also next
 * to an empty `rules`); a bare array is read as the list. `null` (an unknown shape, which fails every verdict) when
 * `rules` is present (not null or undefined) and not an array, or when `rules` is absent, null or empty and
 * `decisions` is present and not an array; next to a non-empty `rules` array, `decisions` is not read.
 *
 * @param {unknown} doc
 * @returns {unknown[] | null}
 */
function rulesOf(doc) {
  if (Array.isArray(doc)) return doc;
  if (!isObject(doc)) return [];
  const present = (/** @type {unknown} */ v) => v !== undefined && v !== null;
  const { rules, decisions } = doc;
  if (present(rules) && !Array.isArray(rules)) return null;
  if (Array.isArray(rules) && rules.length > 0) return rules;
  if (present(decisions)) return Array.isArray(decisions) ? decisions : null;
  return Array.isArray(rules) ? rules : [];
}

/**
 * True for the stored form `{ name, rules: [...] }` (the only form positionSafe and declaredPositionSafe accept).
 *
 * @param {unknown} doc
 */
function isStoredDocument(doc) {
  return isObject(doc) && typeof doc.name === 'string' && Array.isArray(doc.rules);
}

/**
 * @param {unknown} rule
 */
function isDisabled(rule) {
  return isObject(rule) && rule.disabled === true;
}

/**
 * Event type for the report: a plain identifier, else `other` (never an arbitrary string from the document).
 *
 * @param {unknown} rule
 * @returns {string}
 */
function eventTypeOf(rule) {
  const event = isObject(rule) ? rule.event : undefined;
  const type = isObject(event) ? event.type : undefined;
  if (typeof type !== 'string' || type === '') return 'unknown';
  return EVENT_TYPE_RE.test(type) ? type : 'other';
}

/**
 * The root group of a rule's conditions: `any` wins over `all` when both are present.
 *
 * @param {unknown} rule
 * @returns {{ kind: 'all' | 'any'; nodes: unknown[] } | null}
 */
function rootOf(rule) {
  const conditions = isObject(rule) ? rule.conditions : undefined;
  if (!isObject(conditions)) return null;
  if (conditions.any !== undefined) {
    return Array.isArray(conditions.any) ? { kind: 'any', nodes: conditions.any } : null;
  }
  if (conditions.all !== undefined) {
    return Array.isArray(conditions.all) ? { kind: 'all', nodes: conditions.all } : null;
  }
  return null;
}

/**
 * A plain leaf `{ fact, operator, value }` (no nested group, no `path` or `params`, no `not`), else null.
 *
 * @param {unknown} node
 * @returns {{ fact: string; operator: string; value: unknown } | null}
 */
function plainLeaf(node) {
  if (!isObject(node)) return null;
  for (const key of ['all', 'any', 'not', 'condition', 'path', 'params']) {
    if (node[key] !== undefined) return null;
  }
  if (typeof node.fact !== 'string' || typeof node.operator !== 'string') return null;
  if (!Object.hasOwn(node, 'value')) return null;
  return { fact: node.fact, operator: node.operator, value: node.value };
}

/**
 * @param {unknown} value
 * @returns {value is string[]}
 */
function nonEmptyStrings(value) {
  return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string');
}

/**
 * ruleEngineSafe restriction: `conditions.all` (with no `any`) holds a leaf on an asset fact with `equal`/`in`
 * and string value(s), none of which is a test value.
 *
 * @param {unknown} rule
 * @param {(v: string) => boolean} testValue
 */
function isRestricted(rule, testValue) {
  const root = rootOf(rule);
  if (!root || root.kind !== 'all') return false;
  return root.nodes.some((node) => {
    const leaf = plainLeaf(node);
    if (!leaf || !ASSET_FACTS.has(leaf.fact)) return false;
    if (leaf.operator === 'equal') {
      return typeof leaf.value === 'string' && !testValue(leaf.value);
    }
    if (leaf.operator === 'in') {
      return nonEmptyStrings(leaf.value) && leaf.value.every((v) => !testValue(v));
    }
    return false;
  });
}

/**
 * @param {unknown} value
 */
function isPrimitiveKey(value) {
  return typeof value === 'string' || typeof value === 'number';
}

/**
 * True when both premises of the `time_in_zone` leaf hold (module comment): an integer period from 1 to
 * TIME_IN_ZONE_MAX_PERIOD_SECONDS and `freshTestMacs === true`.
 *
 * @param {EvaluateOptions} options
 */
function timeInZoneBounded(options) {
  const period = options.positionsExpirationPeriod;
  return (
    options.freshTestMacs === true &&
    typeof period === 'number' &&
    Number.isInteger(period) &&
    period >= 1 &&
    period <= TIME_IN_ZONE_MAX_PERIOD_SECONDS
  );
}

/**
 * @typedef {{ positionsExpirationPeriod?: unknown; freshTestMacs?: unknown }} EvaluateOptions
 * @typedef {{ declared: boolean; testValue: (v: string) => boolean; timeInZone: boolean }} LeafContext
 */

/**
 * A leaf that cannot match the facts of a test publish outside every zone (a zone other than "outside all zones",
 * an asset value that is not a test value, and the `external_id` and `time_in_zone` leaves of the module comment). With `declared`, leaves on declaration facts and test-asset facts
 * (the `external_id notEmpty` leaf included) never count as "cannot match". `timeInZone`: both premises of the
 * `time_in_zone` leaf hold.
 *
 * @param {unknown} node
 * @param {LeafContext} context
 */
function cannotMatch(node, { declared, testValue, timeInZone }) {
  const leaf = plainLeaf(node);
  if (!leaf) return false;
  const { fact, operator, value } = leaf;
  if (declared && (DECLARED_MAY_MATCH_FACTS.has(fact) || fact.startsWith('declared_')))
    return false;
  if (fact === 'zone_id') {
    if (operator === 'equal') return isPrimitiveKey(value) && !OUTSIDE_ZONE_IDS.has(value);
    if (operator === 'in') {
      return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((v) => isPrimitiveKey(v) && !OUTSIDE_ZONE_IDS.has(v))
      );
    }
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
      timeInZone &&
      operator === 'greaterThan' &&
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= TIME_IN_ZONE_MIN_SECONDS
    );
  }
  // reached for publishes only: with `declared`, external_id returned "may match" above
  if (fact === 'external_id' && operator === 'notEmpty') return value === true;
  if (NULL_STRING_FACTS.has(fact)) {
    const values = operator === 'equal' ? [value] : operator === 'in' ? value : null;
    return (
      nonEmptyStrings(values) &&
      values.every((v) => v !== '' && !startsLikeTest(v) && !testValue(v))
    );
  }
  if (fact === 'is_declared_position' || fact === 'is_virtual') {
    // rests on the publish bodies of the module comment
    return operator === 'equal' && value === true;
  }
  return false;
}

/**
 * Provably unmatched: an `all` root that directly holds a leaf that cannot match, or a non-empty `any` root whose
 * every direct child is such a leaf. Anything else (nested groups only, other facts or operators, templated
 * values, an invalid root) may match.
 *
 * @param {unknown} rule
 * @param {LeafContext} context
 */
function provablyUnmatched(rule, context) {
  const root = rootOf(rule);
  if (!root) return false;
  if (root.kind === 'all') return root.nodes.some((n) => cannotMatch(n, context));
  return root.nodes.length > 0 && root.nodes.every((n) => cannotMatch(n, context));
}

/**
 * The three rule verdicts of an alert-rule document. Disabled rules (`disabled === true`)
 * are ignored, unless templated. `blocking` lists the enabled rules that make ruleEngineSafe false, by index and
 * event type only. A document that is neither an object nor an array (a raw template string), a rule list of an
 * unknown shape, or a structural template fails every verdict. `options` carries the two premises of the
 * `time_in_zone` leaf (module comment); without them that leaf may match. A caller that passes them makes the
 * verdicts that hold only through that leaf expire after TIME_IN_ZONE_RUN_LIMIT_SECONDS (module comment).
 *
 * @param {unknown} doc
 * @param {(v: string) => boolean} [testValue]
 * @param {EvaluateOptions} [options]
 * @returns {{ ruleEngineSafe: boolean; positionSafe: boolean; declaredPositionSafe: boolean; blocking: { index: number; eventType: string }[] }}
 */
export function evaluateAlertRules(doc, testValue = isTestValue, options = {}) {
  const unsafe = {
    ruleEngineSafe: false,
    positionSafe: false,
    declaredPositionSafe: false,
    blocking: [],
  };
  if (!Array.isArray(doc) && !isObject(doc)) return unsafe;
  const rules = rulesOf(doc);
  if (rules === null || structurallyTemplated(doc, rules)) return unsafe;
  /** @type {{ index: number; eventType: string }[]} */
  const blocking = [];
  let positionSafe = isStoredDocument(doc);
  let declaredPositionSafe = positionSafe;
  const timeInZone = timeInZoneBounded(options ?? {});
  /** @type {LeafContext} */
  const publish = { declared: false, testValue, timeInZone };
  /** @type {LeafContext} */
  const declared = { declared: true, testValue, timeInZone };
  rules.forEach((rule, index) => {
    const templated = isTemplated(rule);
    if (isDisabled(rule) && !templated) return;
    const eventType = eventTypeOf(rule);
    if (!ON_PLATFORM_EVENTS.has(eventType) && (templated || !isRestricted(rule, testValue))) {
      blocking.push({ index, eventType });
    }
    if (templated || !provablyUnmatched(rule, publish)) positionSafe = false;
    if (templated || !provablyUnmatched(rule, declared)) declaredPositionSafe = false;
  });
  return {
    ruleEngineSafe: blocking.length === 0,
    positionSafe,
    declaredPositionSafe: declaredPositionSafe && positionSafe,
    blocking,
  };
}

/**
 * Warnings of the preflight: `message-rules-reach-notifications` when the notification feature is
 * on and at least one enabled, unrestricted rule has `event.type === 'message'`.
 *
 * @param {unknown} doc
 * @param {{ notifications: boolean }} features
 * @param {(v: string) => boolean} [testValue]
 * @returns {('message-rules-reach-notifications')[]}
 */
export function preflightWarnings(doc, features, testValue = isTestValue) {
  if (!features.notifications) return [];
  const rules = (Array.isArray(doc) || isObject(doc) ? rulesOf(doc) : null) ?? [];
  const structural = structurallyTemplated(doc, rules);
  const reaches = rules.some((rule) => {
    if (eventTypeOf(rule) !== 'message') return false;
    if (structural || isTemplated(rule)) return true;
    return !isDisabled(rule) && !isRestricted(rule, testValue);
  });
  return reaches ? [MESSAGE_RULES_WARNING] : [];
}

/**
 * linkedNamespaceSafe (a heuristic): counts the assets whose `createdBy` is a string other than the namespace.
 * Count 0 → safe. A list that is not an array is an unknown shape and is unsafe. Only the count is returned.
 *
 * @param {unknown} assets
 * @param {string} namespace
 * @returns {{ linkedNamespaceSafe: boolean; linkedCount: number }}
 */
export function evaluateLinkedNamespace(assets, namespace) {
  if (!Array.isArray(assets)) return { linkedNamespaceSafe: false, linkedCount: 0 };
  const linkedCount = assets.filter(
    (asset) =>
      isObject(asset) && typeof asset.createdBy === 'string' && asset.createdBy !== namespace
  ).length;
  return { linkedNamespaceSafe: linkedCount === 0, linkedCount };
}
