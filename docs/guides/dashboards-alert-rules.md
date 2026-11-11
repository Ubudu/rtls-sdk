# Dashboards, alert rules, alerts, settings and health

This guide covers `client.dashboards`, `client.alertRules`, `client.alerts`, `client.settings` and
`client.health()`. Every namespace-scoped method takes its namespace from `options.namespace`, else from the
client's default context (`createRtlsClient({ apiKey, namespace })`), else it throws `ContextError` before any
request. Client-side input checks throw `ValidationError` (status `0`, `details` naming the offending fields)
before any request.

## Dashboards

### Identity and ownership

- A dashboard is identified by `_id` (a 24-hex id). There is **no `id` field**; `d.id` was always `undefined`.
- `created_by` holds the creator's username. A dashboard created through the SDK is an ordinary dashboard: it
  shows in the product UI like any other.
- `data` is the product UI's widget configuration (an array of widgets). Treat it as opaque; `create()` defaults
  it to `[]`. The SDK rejects `data: {}`: the server drops an empty object, and every later update of that
  dashboard fails with `Validation error`. So `data` is optional in `Dashboard`: dashboards stored with `{}`,
  including those created by 0.2.0 `create()` without `data`, come back without it.
- `dynamicVariables` on `update()`: absent = keep, `[]` = clear, `null` is rejected client-side (the server would
  clear them).
- Request bodies are limited to 100 kB by the server (`PayloadTooLargeError` above that).

### Lists

| Method | Route | Content |
|---|---|---|
| `list()` | `GET /dashboards` | created by the caller ∪ shared with the caller |
| `listCreated()` | `GET /dashboards/created` | created by the caller |
| `listShared()` | `GET /dashboards/shared` | shared with the caller (non-creator view) |
| `listSelected()` | `GET /dashboards/selected` | selected by the caller (several per namespace are possible) |

The namespace (per call or the client default) filters each list. Without a namespace (no client default and no
`options.namespace`) the list is not filtered by namespace. There is no pagination, sort or filter, and the order
is unspecified. `shared_with` and `selected_by` can be absent from a dashboard: treat them as optional.

### Single dashboard

`get(id)` reads one dashboard. `update(id, input)` changes only the keys you pass: `name`, `description`, `data`,
`dynamicVariables`, `shared_with` (replaces the whole list), `selected_by` (the usernames that selected the
dashboard, also replaced as a whole; `listSelected()` and the `selected` flag read it back) and
`application_namespace` (moves the dashboard to another namespace). `create()` also takes `shared_with` and
`selected_by`; `selected_by` keeps only the creator and the users the dashboard is shared with.

<!-- snippet: prelude=client -->
```ts
declare const id: string; // a dashboard _id

const dashboard = await client.dashboards.get(id);
console.log(dashboard.name, dashboard.selected);

// selected_by replaces the stored list: keep the existing entries.
const selectedBy = new Set([...(dashboard.selected_by ?? []), dashboard.created_by]);
await client.dashboards.update(id, { selected_by: [...selectedBy] });
const selected = await client.dashboards.listSelected();
console.log(selected.some((d) => d._id === id));
```

### Sharing

Being in `shared_with` grants view access; the permission `'edit'` grants editing. `'view'` is accepted by the
SDK and dropped before sending, because the server stores only `'edit'`. `share()` **merges** by username (an
existing entry gets the new permissions); `update(id, { shared_with })` **replaces** the whole list. Deleting,
sharing, unsharing and changing `shared_with` are creator-only. Sharing sends no notification.

<!-- snippet: prelude=client -->
```ts
const dashboard = await client.dashboards.create({
  name: 'Floor 1 overview',
  description: 'Live view of floor 1',
});
await client.dashboards.share(dashboard._id, { username: 'colleague', permissions: ['edit'] });
const updated = await client.dashboards.update(dashboard._id, { description: 'Floor 1, all zones' });
console.log(updated.shared_with?.map((s) => `${s.username}: ${s.permissions.join(',') || 'view'}`));
await client.dashboards.unshare(dashboard._id, 'colleague');
await client.dashboards.delete(dashboard._id);
```

The 0.2.0 form `share(id, username, { write: true })` still works (deprecated): `write: true` grants `'edit'`,
anything else grants view only.

### Errors

| Status | Message (server) | SDK error |
|---|---|---|
| 400 | `Invalid dashboard ID` (not an ObjectId) | `ValidationError` |
| 400 | `Missing required fields: …`, `Name cannot be empty`, `Validation error` (+ `details`) | `ValidationError` |
| 403 | `Access denied` (get) | `AuthorizationError` |
| 403 | `You do not have permission to edit this dashboard` | `AuthorizationError` |
| 403 | `Only the creator can delete the dashboard` / `… share …` / `… unshare …` / `… modify the shared_with list` | `AuthorizationError` |
| 404 | `Dashboard not found` | `NotFoundError` |
| 413 | body over 100 kB | `PayloadTooLargeError` |
| 500 | `Failed to … dashboard` | `ServerError` |

## Alert rules

### The document

A namespace stores **one** alert-rule document, `{ name, rules }` (`AlertRuleSet`). Every write replaces it
whole: there is no version or ETag, so the last writer wins. The rule engine re-reads the document on every
position event.

A rule (`AlertRule`):

| Key | Meaning |
|---|---|
| `id` | non-empty string, unique in the set (the rule editor uses a UUID) |
| `conditions` | `{ all: [...] }` or `{ any: [...] }`; nodes are groups or leaves `{ fact, operator, value, path? }` |
| `event` | `{ type, params }`: what happens when the rule matches |
| `disabled` | `true` skips the rule; the editor enables a rule by deleting the key |
| `priority` | optional integer ≥ 1 |

A leaf always needs the `value` key, also for `empty` / `notEmpty` (`value: null` is fine).

### Facts, operators, event types

| Kind | Values |
|---|---|
| Rule-editor facts | `user_name`, `user_type`, `user_tags`, `user_udid`, `external_id`, `zone_count`, `zone_id`, `zone_name`, `zone_tags`, `time_in_zone`, `enter_zone`, `exit_zone`, `position_cache_expired`, `battery_percent`, `TAG_DISAPPEARED`, `TAG_APPEARED`, `is_declared_position`, `declaration_source`, `declared_poi_name`, `declared_poi_id`, `declared_device_id`, `declared_device_name`, `declared_venue_id`, `is_virtual` |
| Engine facts | `app_namespace`, `model`, `color`, `path`, `visit_id`, `start_ts`, `exit_ts`, `user_data`, `zone_color` (and every raw position field) |
| Operators (`ALERT_RULE_OPERATORS`) | `equal`, `notEqual`, `lessThan`, `lessThanInclusive`, `greaterThan`, `greaterThanInclusive`, `in`, `notIn`, `contains`, `doesNotContain`, `empty`, `notEmpty`, `afterDate`, `afterDateInclusive`, `beforeDate`, `beforeDateInclusive` |
| Event types (`ALERT_RULE_EVENT_TYPES`) and their `params` | every type: `title`, `coalescence`, `coalescence_group`; in addition `message`: `text`, `style`, `duration`; `post_to_email`: `text`, `receiver`; `post_to_callback_url`: `callback_url`; `set_variable`: `property`, `action`, `value`; `delete_asset`: nothing more |

The `AlertRule` type (used by `upsertRule()` and `replace()`) requires every listed parameter, as the rule editor
writes them. The validator is more lenient: a missing `coalescence` / `coalescence_group` is only a warning
(`COALESCENCE_MISSING`).

Custom asset fields are written `{ fact: 'user_data', path: '$.<field>' }`. A fact named `user_data.<field>`
does not exist and never matches (the validator warns).

Templating: rule texts may hold template tags filled in from the position facts, so `{{user_name}}` in a title or
`coalescence_group: 'door_{{user_udid}}'` (one coalescence window per asset) work. Use plain `{{name}}` tags and keep
each tag and section inside one string; `validateAlertRuleSet` checks the template syntax of every rule before each
SDK write. A template syntax error (an unclosed `{{`, an unbalanced `{{#x}}…{{/x}}`) and a `{{=` delimiter change
are errors (`TEMPLATE_UNBALANCED`, `TEMPLATE_UNSUPPORTED`); the unescaped forms `{{{x}}}`, `{{&x}}` and `{{>x}}`
give the warning `TEMPLATE_RAW`.

### What stops all alerting

| Cause | Effect | Validator code |
|---|---|---|
| a bare array, `{}` or `{ name }` stored (what 0.2.0 `saveRules` wrote) | no rule is evaluated | `SET_NOT_OBJECT`, `SET_RULES_NOT_ARRAY`, `SET_NAME_NOT_STRING` |
| one **enabled** rule the engine cannot add (no `event`/`conditions` key, leaf without `fact`/`operator`/`value`, `not` node, `all: {}`, `priority ≤ 0`, a `null` entry) | every rule of the namespace stops | `EVENT_MISSING`, `CONDITIONS_MISSING`, `CONDITION_*`, `PRIORITY_INVALID`, `RULE_NOT_OBJECT` |
| an unknown operator or a falsy `conditions` | no rule fires for that event | `CONDITION_OPERATOR_UNKNOWN`, `CONDITIONS_MISSING` |

`validateAlertRuleSet(set)` is pure (no network) and returns `{ valid, errors, warnings }`. **Errors** block every
SDK write; **warnings** (`FACT_DOTTED_USER_DATA`, `EVENT_TYPE_UNKNOWN`, `COALESCENCE_MISSING`, `TEMPLATE_RAW`,
`LEGACY_DECISIONS`) do not. Defects of a `disabled` rule are reported as warnings, except template errors and id
errors (`RULE_ID_MISSING`, `RULE_ID_DUPLICATE`). The
validator is stricter than the engine for a root with both `all` and `any`, `event: null`, `event.type: ''` and a
`priority` of `0`, a non-integer or a non-number: the engine accepts those silently, the SDK refuses them. It also
reports `TEMPLATE_UNBALANCED` for a section opened in one string and closed in another
(`title: '{{#zone_name}}in'`, `text: 'x{{/zone_name}}'`).

<!-- snippet: prelude=client -->
```ts
import { randomUUID } from 'node:crypto';
import { validateAlertRuleSet } from 'ubudu-rtls-sdk';

const set = await client.alertRules.get();
const check = validateAlertRuleSet(set);
for (const issue of [...check.errors, ...check.warnings]) {
  console.log(issue.severity, issue.code, issue.path);
}

// Read-modify-write: add a disabled rule, enable it later.
const id = randomUUID();
await client.alertRules.upsertRule({
  id,
  disabled: true,
  conditions: { all: [{ fact: 'zone_name', operator: 'equal', value: 'Loading dock' }] },
  event: {
    type: 'message',
    params: {
      title: '{{user_name}} entered the loading dock',
      text: 'Entered the loading dock',
      style: 'info',
      duration: 5000,
      coalescence: 300,
      coalescence_group: 'dock_{{user_udid}}',
    },
  },
});
await client.alertRules.setRuleEnabled(id, true);
await client.alertRules.removeRule(id);
```

`upsertRule`, `removeRule` and `setRuleEnabled` read the document, change one rule, validate the **whole**
result and write it back. A set that holds an error in any rule, also one the call did not touch, can only be
written with `replace()`. They refuse to touch a stored document that is not in the `{ name, rules }` format.
Any JavaScript read-modify-write rewrites integers outside ±(2^53−1) with rounded values.

Enabled rules have side effects on the next position event: in-app alerts, e-mails, HTTP callbacks, asset data
changes and asset deletion.

### Backup and restore

<!-- snippet: prelude=client -->
```ts
const backup = await client.alertRules.get();
try {
  // … changes …
} finally {
  // skipValidation exists only to write a backup back unchanged.
  await client.alertRules.replace(backup, { skipValidation: true });
}
```

The restore is verbatim only when the stored document is canonical (`{ name: <string>, rules: <array> }`):
`get()` normalises every other shape. Restoring a backup of a stored bare array or legacy document writes
`{ name, rules }` instead, and its rules, which never fired, start firing on the next position event (see
"Migrating from `alerts.saveRules`" below).

### Migrating from `alerts.saveRules`

0.2.0 `saveRules(rules)` posted a bare array, which the engine ignores: no rule of such a namespace has fired
since. `alertRules.get()` shows those rules as `{ name: '', rules }`. Review them (they start firing again once
restored), then write the set with `alertRules.replace(set)`. The read-modify-write helpers refuse to touch a
bare-array document. `alerts.getRules()` and `alerts.saveRules()` remain as deprecated delegates; `saveRules`
now writes `{ name, rules }`, validated.

## Alert history

`alerts.list()` reads `GET /es/alerts/{namespace}`: without a range it returns the last 24 hours, with only
`timestampFrom` it ends now, with only `timestampTo` it starts 24 hours earlier. Bounds accept `Date`, epoch
milliseconds or a date string. `size` is an integer from 1 to 10 000 (server default 100). Events come newest
first, without pagination, and `set_variable` events are never returned.

<!-- snippet: prelude=client -->
```ts
const events = await client.alerts.list({ timestampFrom: Date.now() - 7 * 86_400_000, size: 50 });
for (const e of events) console.log(new Date(e.timestamp).toISOString(), e.event.type, e.event.title);
```

## Settings

`client.settings.get()` returns the namespace settings (`NamespaceSettings`): the stored, free-form document plus
`positionsExpirationPeriod` (seconds, server default 60) and `accuracy` (server default
`{ accuracy_meter: 5, show: false }`), which are always present. `tagActions` holds the product UI's tag-action
switches. The SDK only reads settings: writing them replaces the whole namespace configuration, an operator task.
The document may hold namespace identifiers; do not log it. `client.getSettings()` is a deprecated delegate.

<!-- snippet: prelude=client -->
```ts
const settings = await client.settings.get();
console.log(settings.positionsExpirationPeriod, settings.accuracy.accuracy_meter);
```

## Health

`client.health()` calls the public `GET /health` and resolves `{ status: 'OK' }`. When the database is not
ready the server answers 503 and the SDK throws `ServiceUnavailableError` whose message is the server's status
text. It is not retried by default.

<!-- snippet: prelude=client -->
```ts
import { ServiceUnavailableError } from 'ubudu-rtls-sdk';

try {
  await client.health();
} catch (error) {
  if (error instanceof ServiceUnavailableError) console.log('not ready:', error.message);
  else throw error;
}
```

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Alert rules stopped firing | A bare array was stored (0.2.0 `saveRules`), or an enabled rule is invalid. Run `validateAlertRuleSet(await client.alertRules.get())` and fix the reported paths. |
| A share gave view access only | 0.2.0 sent permissions as an object. Use `share(id, { username, permissions: ['edit'] })`. |
| `Invalid dashboard ID` | The id is not a 24-hex `_id` (there is no `id` field). |
| 403 on update, delete or share | Only the creator deletes, shares and changes `shared_with`; editing needs the creator or `'edit'`. |
