// Types of examples/shared/preflight.js.

/** `message-rules-reach-notifications`. */
export declare const MESSAGE_RULES_WARNING: 'message-rules-reach-notifications';

/**
 * The template tags (`{{…}}`) of a JSON value, object keys included: `tags` when any string holds one;
 * `structural` for a delimiter change, a partial, or a tag, section or comment not closed in its string;
 * `unescaped` for `{{{x}}}` / `{{&x}}`.
 */
export declare function tagsOf(value: unknown): {
  tags: boolean;
  structural: boolean;
  unescaped: boolean;
};

/** A test MAC (separators and case ignored) or a name starting `sdk-test-`. */
export declare function isTestValue(value: string): boolean;

/** 3600: the smallest `N` for which `time_in_zone greaterThan N` can count as "cannot match". */
export declare const TIME_IN_ZONE_MIN_SECONDS: 3600;

/** 1800: seconds after the preflight began during which a verdict that depends on that leaf is admitted. */
export declare const TIME_IN_ZONE_RUN_LIMIT_SECONDS: 1800;

/**
 * The two premises of the `time_in_zone greaterThan N` leaf. The leaf counts as "cannot
 * match" only when `freshTestMacs` is `true` (no earlier recorded run positioned a MAC of this run's test range)
 * and `positionsExpirationPeriod` (as `client.settings.get()` reports it; an extra condition only) is an integer
 * from 1 to 60; otherwise, also when absent, it may match. A caller that passes
 * them makes the verdicts that hold only through the leaf expire TIME_IN_ZONE_RUN_LIMIT_SECONDS after its
 * preflight began.
 */
export interface EvaluateAlertRulesOptions {
  positionsExpirationPeriod?: unknown;
  freshTestMacs?: unknown;
}

/**
 * ruleEngineSafe, positionSafe and declaredPositionSafe of an alert-rule document; `blocking` holds the indices
 * and event types of the enabled rules that make ruleEngineSafe false (never rule content).
 */
export declare function evaluateAlertRules(
  doc: unknown,
  isTestValue?: (v: string) => boolean,
  options?: EvaluateAlertRulesOptions
): {
  ruleEngineSafe: boolean;
  positionSafe: boolean;
  declaredPositionSafe: boolean;
  blocking: { index: number; eventType: string }[];
};

/** `['message-rules-reach-notifications']` when notifications are on and an unrestricted message rule is enabled. */
export declare function preflightWarnings(
  doc: unknown,
  features: { notifications: boolean },
  isTestValue?: (v: string) => boolean
): 'message-rules-reach-notifications'[];

/** Assets whose `createdBy` names another namespace; count 0 → linkedNamespaceSafe. */
export declare function evaluateLinkedNamespace(
  assets: unknown,
  namespace: string
): { linkedNamespaceSafe: boolean; linkedCount: number };
