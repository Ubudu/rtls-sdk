/**
 * Alert-rule, rule-validation and alert-event types (hand-written). They replace the generated `AlertRule`,
 * which does not describe the stored rule (spec defect USI-P5-1: the spec's `AlertRule` lists
 * `id, name, type, enabled, conditions, actions`; the rule editor and the rule engine read
 * `id, conditions, event, disabled?, priority?`).
 *
 * @module types/alerts
 */

/**
 * A condition operator the rule engine knows: the 10 engine operators plus the custom ones registered by the
 * server (16 distinct names). Any other operator makes the rule fail when it is evaluated.
 * Replaces the untyped `conditions: object` of the spec's `AlertRule` (USI-P5-1).
 */
export type AlertRuleOperator =
  | 'equal'
  | 'notEqual'
  | 'lessThan'
  | 'lessThanInclusive'
  | 'greaterThan'
  | 'greaterThanInclusive'
  | 'in'
  | 'notIn'
  | 'contains'
  | 'doesNotContain'
  | 'empty'
  | 'notEmpty'
  | 'afterDate'
  | 'afterDateInclusive'
  | 'beforeDate'
  | 'beforeDateInclusive';

/**
 * The facts a condition can read: the 24 facts of the rule editor and 9 more exposed by the engine. Every raw
 * position field is a fact too, so the condition type also accepts any string. Custom taxonomy fields are read with
 * `{ fact: 'user_data', path: '$.<field>' }`; a fact named `user_data.<field>` does not exist.
 * Not described by the spec (USI-P5-1).
 */
export type AlertRuleFact =
  | 'user_name'
  | 'user_type'
  | 'user_tags'
  | 'user_udid'
  | 'external_id'
  | 'zone_count'
  | 'zone_id'
  | 'zone_name'
  | 'zone_tags'
  | 'time_in_zone'
  | 'enter_zone'
  | 'exit_zone'
  | 'position_cache_expired'
  | 'battery_percent'
  | 'TAG_DISAPPEARED'
  | 'TAG_APPEARED'
  | 'is_declared_position'
  | 'declaration_source'
  | 'declared_poi_name'
  | 'declared_poi_id'
  | 'declared_device_id'
  | 'declared_device_name'
  | 'declared_venue_id'
  | 'is_virtual'
  | 'app_namespace'
  | 'model'
  | 'color'
  | 'path'
  | 'visit_id'
  | 'start_ts'
  | 'exit_ts'
  | 'user_data'
  | 'zone_color';

/**
 * A leaf condition. The `value` key is required by the engine even for `empty` / `notEmpty` (`value: null` is
 * fine); a leaf without it makes the engine reject the whole namespace's rules.
 * Replaces the untyped `conditions: object` of the spec's `AlertRule` (USI-P5-1).
 */
export interface AlertRuleCondition {
  // `string & {}` keeps editor completion for the known facts while accepting raw position fields.
  fact: AlertRuleFact | (string & {});
  operator: AlertRuleOperator;
  value: unknown;
  /** JSONPath into the fact value, e.g. `'$.battery'` with fact `'user_data'`. */
  path?: string;
  model?: string;
  params?: Record<string, unknown>;
  priority?: number;
}

/**
 * A group of conditions: exactly one of `all` / `any` (there is no `not` group).
 * Not described by the spec (USI-P5-1).
 */
export type AlertRuleConditionGroup =
  { all: AlertRuleNode[]; priority?: number } | { any: AlertRuleNode[]; priority?: number };

/** A node of the condition tree: a leaf or a nested group (USI-P5-1). */
export type AlertRuleNode = AlertRuleCondition | AlertRuleConditionGroup;

/** The event types of the rule editor (the spec's `actions` array does not exist on the server; USI-P5-1). */
export type AlertRuleEventType =
  'message' | 'post_to_email' | 'post_to_callback_url' | 'set_variable' | 'delete_asset';

/**
 * Parameters every event type carries. `coalescence` (seconds) and `coalescence_group` (often templated with
 * `{{user_udid}}`) throttle repeated alerts. Not described by the spec (USI-P5-1).
 */
export interface AlertRuleEventCommon {
  title: string;
  coalescence: number;
  coalescence_group: string;
}

/**
 * What an enabled rule does when its conditions match: an in-app message, an e-mail, an HTTP callback, an asset
 * data change or an asset deletion. Replaces the spec's `actions` (USI-P5-1).
 */
export type AlertRuleEvent =
  | {
      type: 'message';
      params: AlertRuleEventCommon & {
        text: string;
        style: 'info' | 'success' | 'warning' | 'error';
        duration: number;
      };
    }
  | { type: 'post_to_email'; params: AlertRuleEventCommon & { text: string; receiver: string } }
  | { type: 'post_to_callback_url'; params: AlertRuleEventCommon & { callback_url: string } }
  | {
      type: 'set_variable';
      params: AlertRuleEventCommon & {
        property: { key: string; model: string };
        action: 'set' | 'add' | 'subtract';
        value: string | number;
      };
    }
  | { type: 'delete_asset'; params: AlertRuleEventCommon };

/**
 * One stored alert rule. The rule editor enables a rule by deleting `disabled`; a truthy `disabled` makes the
 * engine skip it. Replaces the spec's `AlertRule` schema (`id, name, type, enabled, conditions, actions`), which
 * does not describe the stored rule (USI-P5-1). Unknown keys written by the editor are preserved.
 */
export interface AlertRule {
  id: string;
  conditions: AlertRuleConditionGroup;
  event: AlertRuleEvent;
  disabled?: boolean;
  priority?: number;
  [key: string]: unknown;
}

/**
 * The alert-rule document of a namespace (`GET`/`POST /alert_rules/{app_namespace}`): `{ name, rules }`, `name`
 * `''` when unset. Extra top-level keys are preserved by the SDK. The spec types the POST body as an array of the
 * wrong `AlertRule` (USI-P5-1); a bare array stops every rule of the namespace.
 */
export interface AlertRuleSet {
  name: string;
  rules: AlertRule[];
  [key: string]: unknown;
}

/**
 * The issue codes of `validateAlertRuleSet`. Errors block every SDK write; warnings never do.
 * Not part of the spec: the server does not validate rule documents (USI-P5-2).
 */
export type AlertRuleIssueCode =
  // errors (block writes)
  | 'SET_NOT_OBJECT'
  | 'SET_NAME_NOT_STRING'
  | 'SET_RULES_NOT_ARRAY'
  | 'RULE_NOT_OBJECT'
  | 'RULE_ID_MISSING'
  | 'RULE_ID_DUPLICATE'
  | 'TEMPLATE_UNBALANCED'
  | 'TEMPLATE_UNSUPPORTED'
  | 'EVENT_MISSING'
  | 'EVENT_TYPE_MISSING'
  | 'CONDITIONS_MISSING'
  | 'CONDITIONS_ROOT_INVALID'
  | 'CONDITION_GROUP_NOT_ARRAY'
  | 'CONDITION_NOT_SUPPORTED'
  | 'CONDITION_FACT_MISSING'
  | 'CONDITION_OPERATOR_MISSING'
  | 'CONDITION_VALUE_MISSING'
  | 'CONDITION_OPERATOR_UNKNOWN'
  | 'PRIORITY_INVALID'
  // warnings only
  | 'FACT_DOTTED_USER_DATA'
  | 'EVENT_TYPE_UNKNOWN'
  | 'COALESCENCE_MISSING'
  | 'TEMPLATE_RAW'
  | 'LEGACY_DECISIONS';

/** One finding of `validateAlertRuleSet` (client-side check; the server has none, USI-P5-2). */
export interface AlertRuleIssue {
  severity: 'error' | 'warning';
  code: AlertRuleIssueCode;
  message: string;
  /** Where the issue is, e.g. `'rules[2].conditions.all[0]'`; `''` for the whole document. */
  path: string;
  /** The `id` of the rule the issue is in, when that rule has a string id. */
  ruleId?: string;
}

/** The result of `validateAlertRuleSet`: `valid` is `errors.length === 0` (USI-P5-2). */
export interface AlertRuleValidationResult {
  valid: boolean;
  errors: AlertRuleIssue[];
  warnings: AlertRuleIssue[];
}

/**
 * Options of `alerts.list`: the time range (`Date`, epoch ms or a date string; default the last 24 hours) and
 * `size` (1…10 000; server default 100). The spec makes both bounds required numbers-as-strings (USI-P5-11).
 */
export interface ListAlertsOptions {
  timestampFrom?: Date | number | string;
  timestampTo?: Date | number | string;
  size?: number;
}

/** @deprecated since 0.3.0 — use {@link ListAlertsOptions}. */
export type GetAlertsOptions = ListAlertsOptions;

/** The parameters of a fired alert event (the rule's `event.params` after templating; untyped in the spec). */
export interface AlertEventParams {
  title?: string;
  text?: string;
  style?: string;
  duration?: number;
  coalescence?: number;
  coalescence_group?: string;
  [key: string]: unknown;
}

/**
 * One fired alert (`GET /es/alerts/{appNamespace}`), newest first; `set_variable` events are never returned.
 * The spec's item schema omits `zone`, and `event.params` / `event.style` can be `null` (USI-P5-11).
 */
export interface AlertEvent {
  /** Epoch milliseconds. */
  timestamp: number;
  map_uuid?: string;
  event: {
    type: string;
    /** `params.title`, else `params.text`, else `'no_title'`. */
    title: string;
    style: string | null;
    params: AlertEventParams | null;
  };
  user: {
    udid?: string;
    external_id?: string;
    name?: string;
    type?: string | null;
    tags?: string[];
    device_info?: { model?: string | null };
    data: Record<string, unknown>;
  };
  zone: { id?: number; name?: string; tags?: string[]; color?: string };
}
