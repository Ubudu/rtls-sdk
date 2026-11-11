/**
 * Fired alerts (`client.alerts.list`) and the deprecated 0.2.0 alert-rule methods, which delegate to
 * `client.alertRules`.
 *
 * @module resources/alerts
 */
import type { BaseClient, RequestOptions } from '../client/base';
import { ResourceBase } from '../client/resource';
import type { CallContext } from '../context';
import { ValidationError } from '../errors';
import type { AlertEvent, AlertRule, AlertRuleSet, ListAlertsOptions } from '../types/alerts';
import { splitCallOptions } from '../utils/args';
import { resolveTimeRange } from '../utils/time';
import { AlertRulesResource } from './alert-rules';

export type { GetAlertsOptions } from '../types/alerts';

/** The largest `size` the SDK sends (the default Elasticsearch result window). */
const MAX_SIZE = 10_000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The options bag of the legacy positional forms `(namespace, …, requestOptions?)`. */
function legacyBag<T extends object>(
  namespace: string,
  options: T | undefined
): T & CallContext & RequestOptions {
  return { ...options, namespace } as T & CallContext & RequestOptions;
}

/** Fired alerts and the deprecated alert-rule methods. */
export class AlertsResource extends ResourceBase {
  /** Stateless delegate for the deprecated rule methods. */
  private readonly rules: AlertRulesResource;

  /**
   * Public, so `new XResource(client)` keeps working; the client creates every resource, so the constructor is not
   * part of the documented surface.
   * @internal
   */
  constructor(client: BaseClient) {
    super(client);
    this.rules = new AlertRulesResource(client);
  }

  // ─── List alerts ────────────────────────────────────────────────────────────

  /**
   * Fired alerts of the namespace (`GET /es/alerts/{appNamespace}`), newest first. The range is inclusive and
   * defaults to the last 24 hours (only `timestampFrom` → up to now; only `timestampTo` → the 24 hours before it).
   * `set_variable` events are never returned; there is no pagination: `size` (1…10 000, server default 100) caps
   * the result.
   *
   * @param options `timestampFrom` / `timestampTo` (`Date`, epoch ms or a date string), `size`, per-call
   *   `namespace` and request options
   * @throws {ValidationError} status 0 for `size` outside 1…10 000 or not an integer, an invalid bound, or
   *   `timestampFrom` after `timestampTo` (nothing is sent)
   * @throws {ContextError} when no namespace is given or set (nothing is sent)
   * @example
   * ```typescript
   * const alerts = await client.alerts.list({ timestampFrom: Date.now() - 7 * 86_400_000, size: 50 });
   * for (const a of alerts) console.log(new Date(a.timestamp).toISOString(), a.event.type, a.event.title);
   * ```
   */
  async list(options?: ListAlertsOptions & CallContext & RequestOptions): Promise<AlertEvent[]>;
  /** @deprecated since 0.3.0 — 0.2.0 two-object form: pass the request options in `options`. */
  async list(
    options: (ListAlertsOptions & CallContext & RequestOptions) | undefined,
    requestOptions: RequestOptions
  ): Promise<AlertEvent[]>;
  /** Legacy positional form: explicit namespace. */
  async list(
    namespace: string,
    options?: ListAlertsOptions,
    requestOptions?: RequestOptions
  ): Promise<AlertEvent[]>;
  async list(
    arg1?: string | (ListAlertsOptions & CallContext & RequestOptions),
    arg2?: ListAlertsOptions | RequestOptions,
    arg3?: RequestOptions
  ): Promise<AlertEvent[]> {
    const [bag, trailing] =
      typeof arg1 === 'string'
        ? [legacyBag(arg1, arg2 as ListAlertsOptions | undefined), arg3]
        : [arg1, arg2 as RequestOptions | undefined];
    const { ctx, request, rest } = splitCallOptions<ListAlertsOptions>(bag, trailing);
    const { from, to } = resolveTimeRange({ from: rest.timestampFrom, to: rest.timestampTo });
    const size = rest.size ?? undefined;
    if (
      size !== undefined &&
      !(typeof size === 'number' && Number.isInteger(size) && size >= 1 && size <= MAX_SIZE)
    ) {
      throw new ValidationError(
        `alerts.list: size must be an integer from 1 to ${MAX_SIZE}, not ${String(size)}`,
        undefined,
        { status: 0, details: ['size'] }
      );
    }
    return await this.transport.request<AlertEvent[]>('GET', '/es/alerts/{appNamespace}', {
      params: { appNamespace: this.ns(ctx) },
      query: { timestampFrom: String(from), timestampTo: String(to), size },
      ...request,
    });
  }

  // ─── Deprecated alert-rule methods ───────────────────────────────────────────

  /**
   * The namespace's alert-rule document, normalised to `{ name, rules }`; same request and result as
   * `client.alertRules.get()`.
   *
   * @deprecated since 0.3.0 — use `client.alertRules.get()`.
   * @throws {ContextError} when no namespace is given or set (nothing is sent)
   * @example
   * ```typescript
   * const set = await client.alertRules.get();
   * ```
   */
  async getRules(options?: CallContext & RequestOptions): Promise<AlertRuleSet>;
  /** @deprecated since 0.3.0 — use `client.alertRules.get({ namespace })`. */
  async getRules(namespace: string, requestOptions?: RequestOptions): Promise<AlertRuleSet>;
  async getRules(
    arg1?: string | (CallContext & RequestOptions),
    arg2?: RequestOptions
  ): Promise<AlertRuleSet> {
    return await this.rules.get(typeof arg1 === 'string' ? legacyBag(arg1, arg2) : arg1);
  }

  /**
   * Saves alert rules, always as the `{ name, rules }` document and always validated. A rule set (an object with a
   * `rules` array) is written as it is (`client.alertRules.replace()`). An array of rules reads the stored document
   * first and writes `{ ...stored extra keys, name: stored name, rules }` (full replace of the rules; a legacy
   * `decisions` key is dropped). SDK 0.2.0 posted the bare array here, which stopped every rule of the namespace.
   *
   * @deprecated since 0.3.0 — use `client.alertRules.replace()` or `upsertRule` / `removeRule` / `setRuleEnabled`.
   * @throws {ValidationError} status 0 when the resulting set is invalid (nothing is written)
   * @throws {ContextError} when no namespace is given or set (nothing is sent)
   * @example
   * ```typescript
   * const set = await client.alertRules.get();
   * await client.alertRules.replace({ ...set, rules: set.rules });
   * ```
   */
  async saveRules(
    rules: AlertRule[] | AlertRuleSet,
    options?: CallContext & RequestOptions
  ): Promise<void>;
  /** @deprecated since 0.3.0 — use `client.alertRules.replace(set, { namespace })`. */
  async saveRules(
    namespace: string,
    rules: AlertRule[] | AlertRuleSet,
    requestOptions?: RequestOptions
  ): Promise<void>;
  async saveRules(
    arg1: string | AlertRule[] | AlertRuleSet,
    arg2?: AlertRule[] | AlertRuleSet | (CallContext & RequestOptions),
    arg3?: RequestOptions
  ): Promise<void> {
    const [rules, bag] =
      typeof arg1 === 'string'
        ? [arg2 as AlertRule[] | AlertRuleSet, legacyBag(arg1, arg3)]
        : [arg1, arg2 as (CallContext & RequestOptions) | undefined];
    const { ctx, request } = splitCallOptions(bag);
    const options = { ...ctx, ...request };
    if (!Array.isArray(rules)) {
      await this.rules.replace(rules, options);
      return;
    }
    const stored = await this.transport.request<unknown>('GET', '/alert_rules/{app_namespace}', {
      params: { app_namespace: this.ns(ctx) },
      ...request,
    });
    let base: Record<string, unknown> = {};
    if (isPlainObject(stored)) {
      const { decisions: _dropped, ...rest } = stored;
      base = rest;
    }
    await this.rules.replace(
      { ...base, name: typeof base.name === 'string' ? base.name : '', rules },
      options
    );
  }
}
