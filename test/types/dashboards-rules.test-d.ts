// Type-level tests of the dashboards-rules domain (P5 §8.3). Not collected by vitest (the unit config excludes
// test/types/**); `npm run typecheck` compiles this file, so every `expectTypeOf` and every `@ts-expect-error`
// below is checked by the compiler.
import { expectTypeOf } from 'vitest';
import type {
  AlertEvent,
  AlertRule,
  AlertRuleCondition,
  AlertRuleSet,
  CreateDashboardData,
  CreateDashboardInput,
  Dashboard,
  DashboardData,
  DashboardShare,
  NamespaceSettings,
  RtlsClient,
  SharePermissions,
  UpdateDashboardData,
  UpdateDashboardInput,
} from '../../src';

declare const client: RtlsClient;
declare const id: string;

// ─── Dashboard ────────────────────────────────────────────────────────────────

expectTypeOf<Dashboard['_id']>().toEqualTypeOf<string>();
expectTypeOf<'id' extends keyof Dashboard ? true : false>().toEqualTypeOf<false>();
expectTypeOf<Dashboard['shared_with']>().toEqualTypeOf<DashboardShare[] | undefined>();
// USI-P5-10: a dashboard stored with data {} comes back without data.
expectTypeOf<Dashboard['data']>().toEqualTypeOf<DashboardData | undefined>();
expectTypeOf<DashboardShare['permissions']>().toEqualTypeOf<'edit'[]>();
expectTypeOf<CreateDashboardData>().toEqualTypeOf<CreateDashboardInput>();
expectTypeOf<UpdateDashboardData>().toEqualTypeOf<UpdateDashboardInput>();

expectTypeOf(client.dashboards.list()).toEqualTypeOf<Promise<Dashboard[]>>();
expectTypeOf(client.dashboards.list('ns')).toEqualTypeOf<Promise<Dashboard[]>>();
expectTypeOf(client.dashboards.list(undefined, { timeoutMs: 1 })).toEqualTypeOf<
  Promise<Dashboard[]>
>();
expectTypeOf(client.dashboards.listSelected({ namespace: 'ns' })).toEqualTypeOf<
  Promise<Dashboard[]>
>();
expectTypeOf(client.dashboards.get(id)).toEqualTypeOf<Promise<Dashboard>>();
expectTypeOf(client.dashboards.create({ name: 'n' })).toEqualTypeOf<Promise<Dashboard>>();
expectTypeOf(client.dashboards.update(id, { dynamicVariables: [] })).toEqualTypeOf<
  Promise<Dashboard>
>();
expectTypeOf(client.dashboards.delete(id)).toEqualTypeOf<Promise<void>>();
expectTypeOf(client.dashboards.unshare(id, 'u')).toEqualTypeOf<Promise<Dashboard>>();
expectTypeOf(client.dashboards.unshare(id, ['a', 'b'])).toEqualTypeOf<Promise<Dashboard>>();

// @ts-expect-error null is rejected (it would clear the variables on the server)
void client.dashboards.update(id, { dynamicVariables: null });
// @ts-expect-error create needs a name
void client.dashboards.create({ data: [] });
// @ts-expect-error the only permissions are 'view' and 'edit'
void client.dashboards.share(id, { username: 'u', permissions: ['admin'] });

// Both share overloads compile; the legacy one needs its permissions argument.
expectTypeOf(client.dashboards.share(id, { username: 'u', permissions: ['edit'] })).toEqualTypeOf<
  Promise<Dashboard>
>();
expectTypeOf(client.dashboards.share(id, [{ username: 'u' }], { timeoutMs: 1 })).toEqualTypeOf<
  Promise<Dashboard>
>();
const legacy: SharePermissions = { write: true };
expectTypeOf(client.dashboards.share(id, 'u', legacy)).toEqualTypeOf<Promise<Dashboard>>();
expectTypeOf(client.dashboards.share(id, 'u', { write: true }, { timeoutMs: 1 })).toEqualTypeOf<
  Promise<Dashboard>
>();
// @ts-expect-error the legacy overload needs its permissions argument
void client.dashboards.share(id, 'u');

// ─── Alert rules ──────────────────────────────────────────────────────────────

// @ts-expect-error a bare array is not a rule set (the 0.2.0 outage)
void client.alertRules.replace([]);
// @ts-expect-error a rule set needs its name
void client.alertRules.replace({ rules: [] });
expectTypeOf(client.alertRules.replace({ name: '', rules: [] })).toEqualTypeOf<Promise<void>>();
expectTypeOf(client.alertRules.get()).toEqualTypeOf<Promise<AlertRuleSet>>();

// @ts-expect-error the `value` key is required, also for empty/notEmpty
const noValue: AlertRuleCondition = { fact: 'user_udid', operator: 'notEmpty' };
void noValue;
const withValue: AlertRuleCondition = { fact: 'user_udid', operator: 'notEmpty', value: null };
void withValue;

// ─── Alerts, settings ─────────────────────────────────────────────────────────

expectTypeOf(client.alerts.list()).toEqualTypeOf<Promise<AlertEvent[]>>();
expectTypeOf(client.alerts.getRules()).toEqualTypeOf<Promise<AlertRuleSet>>();
expectTypeOf(client.alerts.saveRules([] as AlertRule[])).toEqualTypeOf<Promise<void>>();
expectTypeOf(client.settings.get()).toEqualTypeOf<Promise<NamespaceSettings>>();
