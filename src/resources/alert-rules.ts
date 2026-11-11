/**
 * The alert-rule document of a namespace (`client.alertRules`) and its client-side validator.
 *
 * The server stores whatever JSON it receives and evaluates the `rules` array of the `{ name, rules }` document on
 * every position event. It does not validate the document (USI-P5-2), and one rule the engine cannot load disables
 * every rule of the namespace (USI-P5-3). Every SDK write therefore runs {@link validateAlertRuleSet} first.
 *
 * @module resources/alert-rules
 */
import type { RequestOptions } from '../client/base';
import { ResourceBase } from '../client/resource';
import type { CallContext } from '../context';
import { ValidationError } from '../errors';
import type {
  AlertRule,
  AlertRuleEventType,
  AlertRuleIssue,
  AlertRuleIssueCode,
  AlertRuleOperator,
  AlertRuleSet,
  AlertRuleValidationResult,
} from '../types/alerts';
import { splitCallOptions } from '../utils/args';

/** The 16 condition operators the rule engine knows (10 engine operators plus the server's custom ones). */
export const ALERT_RULE_OPERATORS: readonly AlertRuleOperator[] = Object.freeze([
  'equal',
  'notEqual',
  'lessThan',
  'lessThanInclusive',
  'greaterThan',
  'greaterThanInclusive',
  'in',
  'notIn',
  'contains',
  'doesNotContain',
  'empty',
  'notEmpty',
  'afterDate',
  'afterDateInclusive',
  'beforeDate',
  'beforeDateInclusive',
]);

/** The 5 event types of the rule editor. */
export const ALERT_RULE_EVENT_TYPES: readonly AlertRuleEventType[] = Object.freeze([
  'message',
  'post_to_email',
  'post_to_callback_url',
  'set_variable',
  'delete_asset',
]);

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

// ─── Template scanner (template tag grammar) ────────────────────────────────

const OPEN_TAG = /\{\{\s*/;
const CLOSE_TAG = /\s*\}\}/;
const CLOSE_CURLY = /\s*\}\}\}/;
const CURLY = /\s*\}/;
const TAG_TYPE = /#|\^|\/|>|\{|&|=|!/;
const WHITE = /\s*/;
const RAW_TAG = /\{\{\s*[{&>]/;
const JSON_STRING = /"(?:[^"\\]|\\.)*"/g;

/** The outcome of scanning a template: the first rendering failure, or a delimiter change. */
interface TemplateScan {
  unbalanced?: string;
  unsupported: boolean;
}

/**
 * Scans `template` with the template tag grammar: an unclosed tag, an unclosed or unopened section and a
 * section closed by another name are syntax errors. A `{{=` delimiter change stops the scan (the rest cannot be
 * validated).
 */
function scanTemplate(template: string): TemplateScan {
  const sections: string[] = [];
  let tail = template;
  const scan = (re: RegExp): string => {
    const match = re.exec(tail);
    if (match?.index !== 0) return '';
    tail = tail.slice(match[0].length);
    return match[0];
  };
  const scanUntil = (re: RegExp): string => {
    const index = tail.search(re);
    const match = index === -1 ? tail : tail.slice(0, index);
    tail = tail.slice(match.length);
    return match;
  };
  while (tail !== '') {
    scanUntil(OPEN_TAG);
    if (!scan(OPEN_TAG)) break;
    const type = scan(TAG_TYPE) || 'name';
    scan(WHITE);
    if (type === '=') return { unsupported: true };
    let value: string;
    if (type === '{') {
      value = scanUntil(CLOSE_CURLY);
      scan(CURLY);
      scanUntil(CLOSE_TAG);
    } else {
      value = scanUntil(CLOSE_TAG);
    }
    if (!scan(CLOSE_TAG)) return { unbalanced: 'a "{{" tag is never closed', unsupported: false };
    if (type === '#' || type === '^') {
      sections.push(value);
    } else if (type === '/') {
      const open = sections.pop();
      if (open === undefined) {
        return { unbalanced: `section "${value}" is closed but never opened`, unsupported: false };
      }
      if (open !== value) {
        return { unbalanced: `section "${open}" is closed by "${value}"`, unsupported: false };
      }
    }
  }
  const open = sections.pop();
  return open === undefined
    ? { unsupported: false }
    : { unbalanced: `section "${open}" is never closed`, unsupported: false };
}

/**
 * Scans every string literal of the serialised document on its own: every tag and section must open and close
 * inside one string (USI-P5-4). A tag or section left open in one string is reported, also when later text of the
 * document would close it.
 */
function scanDocument(text: string): TemplateScan {
  for (const [literal] of text.matchAll(JSON_STRING)) {
    const scan = scanTemplate(literal.slice(1, -1));
    if (scan.unsupported || scan.unbalanced !== undefined) return scan;
  }
  return { unsupported: false };
}

// ─── Validator ──────────────────────────────────────────────────────────────

/** Collects the issues of one validation run. */
class IssueCollector {
  readonly errors: AlertRuleIssue[] = [];
  readonly warnings: AlertRuleIssue[] = [];

  add(
    severity: 'error' | 'warning',
    code: AlertRuleIssueCode,
    message: string,
    path: string,
    ruleId?: string
  ): void {
    const issue: AlertRuleIssue = { severity, code, message, path };
    if (ruleId !== undefined) issue.ruleId = ruleId;
    (severity === 'error' ? this.errors : this.warnings).push(issue);
  }
}

/** The checks of one rule; structural findings are errors in an enabled rule and warnings in a disabled one. */
class RuleChecker {
  constructor(
    private readonly issues: IssueCollector,
    private readonly severity: 'error' | 'warning',
    private readonly ruleId: string | undefined
  ) {}

  structural(code: AlertRuleIssueCode, message: string, path: string): void {
    this.issues.add(this.severity, code, message, path, this.ruleId);
  }

  warning(code: AlertRuleIssueCode, message: string, path: string): void {
    this.issues.add('warning', code, message, path, this.ruleId);
  }

  event(event: unknown, path: string): void {
    if (!isPlainObject(event)) {
      this.structural('EVENT_MISSING', 'the rule has no event object', path);
      return;
    }
    const type = event.type;
    if (!isNonEmptyString(type)) {
      this.structural(
        'EVENT_TYPE_MISSING',
        'event.type must be a non-empty string',
        `${path}.type`
      );
    } else if (!(ALERT_RULE_EVENT_TYPES as readonly string[]).includes(type)) {
      this.warning(
        'EVENT_TYPE_UNKNOWN',
        `event type "${type}" is not one of ${ALERT_RULE_EVENT_TYPES.join(', ')}`,
        `${path}.type`
      );
    }
    const params = event.params;
    const coalesced =
      isPlainObject(params) &&
      typeof params.coalescence === 'number' &&
      params.coalescence >= 1 &&
      isNonEmptyString(params.coalescence_group);
    if (!coalesced) {
      this.warning(
        'COALESCENCE_MISSING',
        'event.params.coalescence (a number >= 1) and coalescence_group (a non-empty string) throttle repeated alerts',
        `${path}.params`
      );
    }
  }

  conditions(conditions: unknown, path: string): void {
    if (!isPlainObject(conditions)) {
      this.structural('CONDITIONS_MISSING', 'the rule has no conditions object', path);
      return;
    }
    const keys = (['all', 'any'] as const).filter((key) => conditions[key] !== undefined);
    if (keys.length !== 1) {
      this.structural(
        'CONDITIONS_ROOT_INVALID',
        'conditions must hold exactly one of "all" or "any"',
        path
      );
    }
    for (const key of keys) this.group(conditions[key], `${path}.${key}`);
  }

  group(nodes: unknown, path: string): void {
    if (!Array.isArray(nodes)) {
      this.structural('CONDITION_GROUP_NOT_ARRAY', 'a condition group must be an array', path);
      return;
    }
    nodes.forEach((node, index) => this.node(node, `${path}[${index}]`));
  }

  node(node: unknown, path: string): void {
    if (!isPlainObject(node) || node.not !== undefined) {
      this.structural(
        'CONDITION_NOT_SUPPORTED',
        'a condition must be an object; "not" is not supported by the rule engine',
        path
      );
      return;
    }
    const keys = (['all', 'any'] as const).filter((key) => node[key] !== undefined);
    if (keys.length > 0) {
      for (const key of keys) this.group(node[key], `${path}.${key}`);
      return;
    }
    if (node.fact === undefined && node.condition !== undefined) {
      this.structural(
        'CONDITION_NOT_SUPPORTED',
        'shared conditions ("condition") are not supported by the rule engine',
        path
      );
      return;
    }
    this.leaf(node, path);
  }

  leaf(node: PlainObject, path: string): void {
    if (node.fact === undefined) {
      this.structural('CONDITION_FACT_MISSING', 'the condition has no "fact" key', path);
    } else if (typeof node.fact === 'string' && node.fact.startsWith('user_data.')) {
      this.warning(
        'FACT_DOTTED_USER_DATA',
        `fact "${node.fact}" never matches; use { fact: 'user_data', path: '$.${node.fact.slice(10)}' }`,
        path
      );
    }
    if (node.operator === undefined) {
      this.structural('CONDITION_OPERATOR_MISSING', 'the condition has no "operator" key', path);
    } else if (!(ALERT_RULE_OPERATORS as readonly unknown[]).includes(node.operator)) {
      this.structural(
        'CONDITION_OPERATOR_UNKNOWN',
        `operator ${JSON.stringify(node.operator)} is not known to the rule engine`,
        path
      );
    }
    if (node.value === undefined) {
      this.structural(
        'CONDITION_VALUE_MISSING',
        'the condition has no "value" key (required even for empty / notEmpty; null is fine)',
        path
      );
    }
  }
}

/**
 * Checks an alert-rule document against the rule format the SDK documents (the `{ name, rules }` set, each rule's
 * `id`, `event` and `conditions`, the `ALERT_RULE_OPERATORS`) and against the template tag syntax. Pure; sends
 * nothing. Every issue is collected.
 *
 * Errors block every SDK write: anything that makes the engine throw while loading the rules (which disables every
 * rule of the namespace), a template syntax error, a set that is not `{ name, rules }`. In a rule with a truthy
 * `disabled`, rule-level errors become warnings (the engine skips it), except template errors, which are errors in
 * every rule (USI-P5-4). The validator is stricter than the engine for a root with both `all` and `any`,
 * `event: null`, `event.type: ''` and a `priority` of 0, a non-integer or a non-number.
 *
 * @param ruleSet the document to check (any value)
 * @returns `{ valid, errors, warnings }`; `valid` is `errors.length === 0`; each issue has a `path` such as
 *   `'rules[2].conditions.all[0]'` and the `ruleId` of its rule
 * @throws {TypeError} when the value cannot be serialised to JSON (circular structure, BigInt)
 * @example
 * ```typescript
 * import { validateAlertRuleSet } from 'ubudu-rtls-sdk';
 *
 * const result = validateAlertRuleSet({ name: '', rules: [] });
 * for (const issue of result.errors) console.log(issue.path, issue.code);
 * ```
 */
export function validateAlertRuleSet(ruleSet: unknown): AlertRuleValidationResult {
  const issues = new IssueCollector();
  if (!isPlainObject(ruleSet)) {
    issues.add('error', 'SET_NOT_OBJECT', 'the rule set must be an object { name, rules }', '');
    return { valid: false, errors: issues.errors, warnings: issues.warnings };
  }
  if (typeof ruleSet.name !== 'string') {
    issues.add('error', 'SET_NAME_NOT_STRING', 'name must be a string ("" when unset)', 'name');
  }
  if (ruleSet.decisions !== undefined) {
    issues.add(
      'warning',
      'LEGACY_DECISIONS',
      'the legacy "decisions" key is ignored while "rules" is non-empty',
      'decisions'
    );
  }
  if (Array.isArray(ruleSet.rules)) {
    checkRules(ruleSet.rules, issues);
  } else {
    issues.add('error', 'SET_RULES_NOT_ARRAY', 'rules must be an array', 'rules');
  }
  const text = JSON.stringify(ruleSet);
  const template = scanDocument(text);
  if (template.unsupported) {
    issues.add('error', 'TEMPLATE_UNSUPPORTED', 'a "{{=" delimiter change cannot be validated', '');
  } else if (template.unbalanced !== undefined) {
    // Scanned as one text the document may still scan: the tag or section then spans several JSON values.
    const spans = scanTemplate(text).unbalanced === undefined;
    issues.add(
      'error',
      'TEMPLATE_UNBALANCED',
      spans
        ? `a template tag or section spans several JSON values (${template.unbalanced} within one string); each tag and section must open and close inside one string`
        : `template syntax error: ${template.unbalanced}`,
      ''
    );
  }
  if (RAW_TAG.test(text)) {
    issues.add(
      'warning',
      'TEMPLATE_RAW',
      'unescaped tag forms ({{{…}}}, {{&…}}, {{>…}}) insert text without escaping and can make the rule document invalid; use plain {{name}} tags',
      ''
    );
  }
  return { valid: issues.errors.length === 0, errors: issues.errors, warnings: issues.warnings };
}

function checkRules(rules: unknown[], issues: IssueCollector): void {
  const seen = new Set<string>();
  rules.forEach((rule, index) => {
    const path = `rules[${index}]`;
    if (!isPlainObject(rule)) {
      issues.add('error', 'RULE_NOT_OBJECT', 'a rule must be an object', path);
      return;
    }
    const ruleId = typeof rule.id === 'string' ? rule.id : undefined;
    if (!isNonEmptyString(rule.id)) {
      issues.add('error', 'RULE_ID_MISSING', 'id must be a non-empty string', `${path}.id`, ruleId);
    } else if (seen.has(rule.id)) {
      issues.add(
        'error',
        'RULE_ID_DUPLICATE',
        `id "${rule.id}" is used twice`,
        `${path}.id`,
        ruleId
      );
    } else {
      seen.add(rule.id);
    }
    const checker = new RuleChecker(issues, rule.disabled ? 'warning' : 'error', ruleId);
    const priority = rule.priority;
    if (priority !== undefined && !(Number.isInteger(priority) && (priority as number) >= 1)) {
      checker.structural(
        'PRIORITY_INVALID',
        'priority must be an integer >= 1',
        `${path}.priority`
      );
    }
    checker.event(rule.event, `${path}.event`);
    checker.conditions(rule.conditions, `${path}.conditions`);
  });
}

function invalidSetError(result: AlertRuleValidationResult): ValidationError {
  return new ValidationError(
    `Alert rule set is invalid: ${result.errors.length} error(s)`,
    undefined,
    {
      status: 0,
      details: result.errors.map(
        (issue) => `${issue.path === '' ? '' : `${issue.path} `}${issue.code}: ${issue.message}`
      ),
    }
  );
}

function assertValid(ruleSet: unknown): void {
  const result = validateAlertRuleSet(ruleSet);
  if (!result.valid) throw invalidSetError(result);
}

function argumentError(message: string, detail: string): ValidationError {
  return new ValidationError(message, undefined, { status: 0, details: [detail] });
}

// ─── Normaliser ─────────────────────────────────────────────────────────────

/** How the stored document maps to `{ name, rules }`; only `canonical` may be modified by the helpers. */
type StoredShape = 'canonical' | 'legacy-decisions' | 'array' | 'other';

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** The normalisation rows N1–N6: never throws, whatever was stored. */
function normalise(stored: unknown): { set: AlertRuleSet; shape: StoredShape } {
  if (Array.isArray(stored)) {
    return { set: { name: '', rules: stored as AlertRule[] }, shape: 'array' };
  }
  if (!isPlainObject(stored)) return { set: { name: '', rules: [] }, shape: 'other' };
  if (Object.keys(stored).length === 0) return { set: { name: '', rules: [] }, shape: 'canonical' };
  const name = str(stored.name);
  const legacy = Array.isArray(stored.decisions) && stored.decisions.length > 0;
  if (Array.isArray(stored.rules) && !(stored.rules.length === 0 && legacy)) {
    return { set: { ...stored, name, rules: stored.rules as AlertRule[] }, shape: 'canonical' };
  }
  if (legacy) {
    const { decisions, ...rest } = stored;
    return { set: { ...rest, name, rules: decisions as AlertRule[] }, shape: 'legacy-decisions' };
  }
  const { rules: _ignored, ...rest } = stored;
  return { set: { ...rest, name, rules: [] }, shape: 'other' };
}

// ─── Resource ───────────────────────────────────────────────────────────────

/**
 * Read and write the namespace's alert rules (`GET`/`POST /alert_rules/{app_namespace}`).
 *
 * Every write is a full replace of the document; there is no version or ETag, so concurrent writers lose updates
 * (last writer wins, USI-P5-2). A write takes effect on the next position event, and enabled rules have side
 * effects: in-app alerts, e-mails, HTTP callbacks, asset data changes and asset deletion.
 */
export class AlertRulesResource extends ResourceBase {
  /**
   * The namespace's alert-rule document, normalised to `{ name, rules }` (read-only; never throws on an odd stored
   * shape): nothing stored → `{ name: '', rules: [] }`; a legacy `decisions` document → its decisions as `rules`; a
   * bare array (written by SDK 0.2.0, no rule fires) → `{ name: '', rules: <array> }`; anything else →
   * `rules: []`. Extra top-level keys are kept.
   *
   * @param options per-call `namespace` (else the client default) and request options
   * @throws {ContextError} when no namespace is given or set (nothing is sent)
   * @throws {AuthenticationError} 401; {@link ServerError} 500 on a store error
   * @example
   * ```typescript
   * const set = await client.alertRules.get();
   * console.log(set.rules.length, 'rules');
   * ```
   */
  async get(options?: CallContext & RequestOptions): Promise<AlertRuleSet> {
    const { ctx, request } = splitCallOptions(options);
    return normalise(await this.readStored(this.ns(ctx), request)).set;
  }

  /**
   * Replaces the whole document with `ruleSet`, sent unchanged. Unless `skipValidation` is set,
   * {@link validateAlertRuleSet} runs first and any error throws before a request is sent.
   *
   * Full replace, last writer wins; enabled rules start firing on the next position event (in-app alerts, e-mails,
   * HTTP callbacks, asset changes and deletions). Integers outside ±(2^53−1) read from the store were already
   * rounded by `JSON.parse` and are written back rounded. `skipValidation` exists only to restore a backup
   * verbatim. A backup taken with {@link AlertRulesResource.get} is the stored document only when that document
   * is canonical (`{ name: <string>, rules: <array> }`): `get()` normalises every other shape, so restoring it
   * writes `{ name, rules }` in place of a stored bare array or legacy document, and rules that never fired start
   * firing on the next position event.
   *
   * @param ruleSet the complete `{ name, rules }` document
   * @param options per-call `namespace`, request options, and `skipValidation`
   * @throws {ValidationError} status 0 with one `details` entry per validation error (nothing is sent); status 400
   *   `Invalid alert rules` from the server
   * @throws {ContextError} when no namespace is given or set (nothing is sent)
   * @example
   * ```typescript
   * const backup = await client.alertRules.get(); // the stored document if it is canonical { name, rules }
   * // … later, write it back unvalidated:
   * await client.alertRules.replace(backup, { skipValidation: true });
   * ```
   */
  async replace(
    ruleSet: AlertRuleSet,
    options?: CallContext & RequestOptions & { skipValidation?: boolean }
  ): Promise<void> {
    const { ctx, request, rest } = splitCallOptions(options);
    if (rest.skipValidation !== true) assertValid(ruleSet);
    await this.write(this.ns(ctx), request, ruleSet);
  }

  /**
   * Adds `rule`, or replaces the stored rule with the same `id` at its index (read-modify-write), and returns the
   * written set. Other rules, their order, `name` and extra top-level keys are kept; a legacy `decisions` key is
   * dropped. The resulting set is validated: an error in any rule, including one this call did not touch, blocks
   * the write (such a set can only be written with `replace()`).
   *
   * No concurrency check (the server has no version): a change saved by someone else between the read and the
   * write is lost. Integers outside ±(2^53−1) in the stored document are written back rounded.
   *
   * @param rule the rule; `id` is required (for example `crypto.randomUUID()`)
   * @throws {ValidationError} status 0 for a rule without `id` (nothing is sent), a stored document that is not in
   *   the `{ name, rules }` format, or an invalid resulting set (only the read is sent)
   * @throws {ContextError} when no namespace is given or set (nothing is sent)
   * @example
   * ```typescript
   * await client.alertRules.upsertRule({
   *   id: crypto.randomUUID(),
   *   disabled: true,
   *   conditions: { all: [{ fact: 'zone_name', operator: 'equal', value: 'Dock' }] },
   *   event: { type: 'message', params: { title: 'Dock', text: '{{user_name}} at the dock', style: 'info',
   *     duration: 2000, coalescence: 60, coalescence_group: 'dock_{{user_udid}}' } },
   * });
   * ```
   */
  async upsertRule(rule: AlertRule, options?: CallContext & RequestOptions): Promise<AlertRuleSet> {
    if (!isPlainObject(rule) || !isNonEmptyString(rule.id)) {
      throw argumentError('upsertRule: rule.id must be a non-empty string', 'rule.id');
    }
    return await this.modify(options, (rules) => {
      const index = indexOfRule(rules, rule.id);
      if (index === -1) rules.push(rule);
      else rules[index] = rule;
    });
  }

  /**
   * Removes the rule with this id (read-modify-write) and returns the written set. The resulting set is validated
   * like {@link AlertRulesResource.upsertRule}; no concurrency check; integers outside ±(2^53−1) are written back
   * rounded.
   *
   * @throws {ValidationError} status 0 for an empty id (nothing is sent), an unknown id, a stored document that is
   *   not `{ name, rules }` or an invalid resulting set (only the read is sent)
   * @throws {ContextError} when no namespace is given or set (nothing is sent)
   * @example
   * ```typescript
   * await client.alertRules.removeRule('4c60fcf9-54f0-4d8a-bf8e-6e5f82b5c939');
   * ```
   */
  async removeRule(ruleId: string, options?: CallContext & RequestOptions): Promise<AlertRuleSet> {
    checkRuleId(ruleId, 'removeRule');
    return await this.modify(options, (rules) => {
      rules.splice(requireRule(rules, ruleId), 1);
    });
  }

  /**
   * Enables or disables the rule with this id (read-modify-write) and returns the written set: `false` sets
   * `disabled: true`; `true` deletes the `disabled` key (the rule editor's convention). Always writes, even when
   * nothing changes. The resulting set is validated like {@link AlertRulesResource.upsertRule}, so enabling a rule
   * the engine cannot load is refused; no concurrency check; integers outside ±(2^53−1) are written back rounded.
   *
   * @throws {ValidationError} status 0 for an empty id or a non-boolean `enabled` (nothing is sent), an unknown id,
   *   a stored document that is not `{ name, rules }` or an invalid resulting set (only the read is sent)
   * @throws {ContextError} when no namespace is given or set (nothing is sent)
   * @example
   * ```typescript
   * await client.alertRules.setRuleEnabled('4c60fcf9-54f0-4d8a-bf8e-6e5f82b5c939', false);
   * ```
   */
  async setRuleEnabled(
    ruleId: string,
    enabled: boolean,
    options?: CallContext & RequestOptions
  ): Promise<AlertRuleSet> {
    checkRuleId(ruleId, 'setRuleEnabled');
    if (typeof enabled !== 'boolean') {
      throw argumentError('setRuleEnabled: enabled must be a boolean', 'enabled');
    }
    return await this.modify(options, (rules) => {
      const rule = rules[requireRule(rules, ruleId)] as PlainObject;
      if (enabled) {
        delete rule.disabled;
      } else {
        rule.disabled = true;
      }
    });
  }

  /** Reads the stored document as it is (any JSON; `undefined` for an empty body). */
  private async readStored(namespace: string, request: RequestOptions): Promise<unknown> {
    return await this.transport.request<unknown>('GET', '/alert_rules/{app_namespace}', {
      params: { app_namespace: namespace },
      ...request,
    });
  }

  /** Full replace; the server answers 200 with an empty body. */
  private async write(namespace: string, request: RequestOptions, body: unknown): Promise<void> {
    await this.transport.request<void>('POST', '/alert_rules/{app_namespace}', {
      params: { app_namespace: namespace },
      body,
      ...request,
    });
  }

  /**
   * The read-modify-write cycle of the helpers: read the stored set, refuse a set not in the `{ name, rules }`
   * format, apply the change, validate the result, then write it.
   */
  private async modify(
    options: (CallContext & RequestOptions) | undefined,
    change: (rules: unknown[]) => void
  ): Promise<AlertRuleSet> {
    const { ctx, request } = splitCallOptions(options);
    const namespace = this.ns(ctx);
    const { set, shape } = normalise(await this.readStored(namespace, request));
    if (shape !== 'canonical') {
      throw argumentError(
        'Stored alert rules are not in the {name, rules} format',
        `stored alert rules are not in the {name, rules} format (${shape}); inspect with alertRules.get() and write the intended set with replace()`
      );
    }
    const { decisions: _dropped, ...base } = structuredClone(set);
    const next = base as AlertRuleSet;
    change(next.rules);
    assertValid(next);
    await this.write(namespace, request, next);
    return next;
  }
}

function indexOfRule(rules: readonly unknown[], ruleId: string): number {
  return rules.findIndex((rule) => isPlainObject(rule) && rule.id === ruleId);
}

function requireRule(rules: readonly unknown[], ruleId: string): number {
  const index = indexOfRule(rules, ruleId);
  if (index === -1) {
    throw argumentError(`No stored alert rule has the id "${ruleId}"`, 'ruleId');
  }
  return index;
}

function checkRuleId(ruleId: unknown, method: string): void {
  if (!isNonEmptyString(ruleId)) {
    throw argumentError(`${method}: ruleId must be a non-empty string`, 'ruleId');
  }
}
