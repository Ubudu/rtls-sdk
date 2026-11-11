# Live test harness

How to write a test that runs against the real RTLS API. The rules behind every helper (guarded runners,
tiers, budgets, test names and MACs, cleanup) are the live-testing rules summarised under "Live testing" in
the root `CLAUDE.md`; this page shows how to use them. Every TypeScript block below compiles
(`npm run docs:snippets`).

Live tests import from `../harness` (this folder's `index.ts`) and live in
`test/integration/<domain>/*.int.test.ts`. Run them with `npm run test:integration -- <domain>`.

## Requirements

- **Node.** The SDK itself supports Node `>=20.3.0`. The tooling (this harness, `tsx`, the example-mode
  preload, ESLint) needs **Node 20.19 or newer**. Live runs (integration runs and example write passes) use
  **Node 22 or newer**, because the WebSocket tests of the native global `WebSocket` skip on Node 20.
- **Credentials** come from `.env` at the repository root (`RTLS_API_KEY`, `APP_NAMESPACE`, optional
  `RTLS_BASE_URL`). The harness reads them; nothing prints them.
- **Tier flags** are set on the command line only, never in `.env`: `RTLS_IT_WRITES=1` (W),
  `RTLS_IT_CONFIG=1` (C), `RTLS_IT_SIDE_EFFECTS=1` (S). A tier or `RTLS_IT_INTERNAL_*` key found in `.env`
  stops the run with exit code 2.

```bash
npm run test:integration -- harness                     # tier R only
RTLS_IT_WRITES=1 npm run test:integration -- harness    # R and W
npm run test:integration:sweep -- --check              # residue left by any run (or a listing it cannot read)?
npm run test:integration:snapshot -- --label before    # state image of the namespace
npm run test:integration:scan -- --tracked             # credential or namespace values in tracked files?
```

Exit codes of the drivers and CLIs: 0 pass, 1 fail, 2 precondition (run lock or read slot not free, cumulative
cap, a tier key in `.env`), 3 credentials missing, 4 run aborted (a configuration restore failed).

## Tiers and `describeLive`

Every live test sits in a `describeLive(tier, name, fn, options)` block. The block is skipped (with its reason
in the title and in `report.json`) when credentials are missing, its tier flag is off, a `requires` tier is off,
a `feature` is off, the run was aborted, or a preflight verdict that its declared shape needs is false.

```ts
import { describeLive, rawRequest, requestLog } from '../harness';

describeLive('R', 'health', () => {
  it('answers OK', async () => {
    const r = await rawRequest('GET', '/health');
    expect(r.status).toBe(200);
    expect(requestLog()).toHaveLength(1);
  });
});
```

Options: `ruleEngine: true` for a block that writes assets (or otherwise reaches the alert-rule engine),
`positions: 'publish' | 'declared'` for a block that publishes or declares positions, `requires: ['W']` for an
S block that also writes entities, `feature: 'notifications' | 'etl'`. The options only turn a rejection into a
skip: the guard applies the preflight by request shape whatever a block declares, so state them whenever the
block sends such a request. Blocks nest; an inner block runs under its own tier and replays only its own
cleanups.

A block is bound to the async work it starts: a timer, an event handler, a socket callback or a queued request
runs under the tier of the block it was started in, and only while that block runs. Started in a block and run
after it ended (a reconnecting client of an R test that fires while a later S block runs), it is outside every
block, where only GETs pass (G4).

## Guards

Every request leaves through the guarded fetch: the configured host only, the run's namespace only, no
excluded or operator endpoint, writes only on the run's own entities, bounded Elasticsearch reads, at most
5 requests per second. A rejected request throws `GuardViolation` before any byte leaves and fails the run even
if the test catches it. `expectGuardViolation(rule, fn)` is the only way to expect one; it expects only what `fn`
raises before it returns (a timer or handler started inside `fn` that sends later is not expected). It counts as
an assertion, like `expectDeepEqualRedacted`, so a test whose only check is one of them passes
`expect.hasAssertions()`.

What a test must know when it writes:

- A name with the run prefix (`testName(label)`) admits a POST only on the create collections: `/dashboards`,
  `/notifications/{ns}/rules`, `/notifications/{ns}/saved-views`, `/etl/mapping-profiles`. An action on an entity
  (share, archive, pin) needs its id to be one this run created (tracked from the create's answer, or
  `trackCreated(id)`), a test MAC, or the made-up `000000000000000000000000`. A write keyed by the path MAC that
  creates or changes what the path names (the asset upsert `POST /assets/{ns}/{mac}`, the asset `PATCH`, the
  document upload) needs a test MAC in the path; a made-up id admits only reads and `DELETE` there.
- Outside `withExistingEntityGuard` a connection `POST` passes only with a string `channel` the server does not
  know (an absent channel is a G10 violation).
- A publish with `patch_asset_data` (`1`, `true`, `True`, `TRUE`) is also an asset write: it needs
  `linkedNamespaceSafe`, and each item carrying a `declared_location` adds one counted position, needs
  `declaredPositionSafe` and makes the request S + W.
- A method the spec does not declare for the path is rejected (G3), and a redirect is never followed: a 3xx
  answer is a G1 violation.
- The guard checks one snapshot of the request, taken when `fetch` is called (the URL string, the method, a copy
  of the headers, the body bytes), and sends exactly that snapshot: changing the URL object, the init, a
  `FormData` or a buffer after the call changes nothing on the wire.
- Every body other than a GET's is inspected: a stream body is read once and sent as those bytes, and a body that
  looks like JSON is checked as JSON whatever its content type. Only plain UTF-8 JSON passes (no byte-order mark,
  no NUL byte, a `charset` other than `utf-8` refused), or a multipart form on the three upload operations
  (documents, `parse-excel-headers`, ETL upload); a text or urlencoded body, a form elsewhere, a body the guard
  cannot read, and binary bytes are rejected (G6).
- A stream request (`Accept: text/event-stream` in any letter case, or a path that matches a `/stream` route,
  trailing slash or encoded segment included) needs `init.signal`, also when the first argument is a `Request`
  (G13); the guard adds a 120 s deadline.
- `targetApplications` (an asset's list of namespaces) may name only the run's namespace: every entry, in a body,
  an array item, a publish item, a query or form field (`targetApplications[]` too) and a WebSocket frame (G3,
  G16 for frames).
- `POST /etl/upload` carries `mappingProfileIds` (a JSON array of profiles this run created), `debugMode` and
  `file` once each, under these exact names. A writing upload (`debugMode` other than `'true'`, tier S) is
  admitted only for profiles whose `applicationId` is the namespace, whose key columns are mapped to
  `user_udid` only, and that map or default nothing under `declared_location` or `targetApplications`; the guard
  reads each profile first.

```ts
import { describeLive, expectGuardViolation, rawRequest } from '../harness';

describeLive('R', 'guard', () => {
  it('rejects a path that names no spec operation', async () => {
    await expectGuardViolation('G3', () => rawRequest('GET', '/assets/sdk-test-foreign'));
  });
});
```

Narrow the guard further with `withRequestGuard(denyAll | getOnly | predicate, fn)`: it returns the call's own
error and the attempted requests, so a test of a call the SDK refuses locally asserts both the error and
`attempts` of length 0 (a request the predicate rejects is a violation and fails the run). Compare live
documents with `expectDeepEqualRedacted` (its failure message lists paths and kinds of difference, never
values).

```ts
import { describeLive, expectDeepEqualRedacted, getOnly, rawRequest, withRequestGuard } from '../harness';

describeLive('R', 'request guard', () => {
  it('lists the requests a call attempted', async () => {
    const g = await withRequestGuard(getOnly, () => rawRequest('GET', '/health'));
    expect(g.error).toBeUndefined();
    expect(g.attempts.map((a) => [a.method, a.allowed])).toEqual([['GET', true]]);
  });

  it('compares two reads of the settings', async () => {
    const a = await rawRequest('GET', '/settings/{ns}');
    const b = await rawRequest('GET', '/settings/{ns}');
    expectDeepEqualRedacted(b.json, a.json, 'settings', { ignorePaths: ['updated_at'] });
  });
});
```

## Budgets

Positions, notifications, BLE tag actions and writing ETL uploads are counted by the guard itself, per run,
per domain and against the cumulative ledger of the work package; a unit over a limit is refused
(`BudgetExceeded`) and fails the run. Call `consumeBudget` only for an effect the guard cannot see.
Test MACs come from `testMac(n)` in your phase's block of `n`; names from `testName(label)`.

```ts
import { budgetReport, describeLive, testMac, testName } from '../harness';

describeLive('R', 'budgets', () => {
  it('reports used units and limits per budget', () => {
    expect(budgetReport().positions.limit).toBe(10);
    expect(testMac(0)).toMatch(/^025d4b[0-9a-f]{6}$/);
    expect(testName('label')).toMatch(/^sdk-test-[0-9a-f]{8}-label$/);
  });
});
```

## Cleanup and test assets

Register the undo of every creation; the block's `afterAll` replays its own entries (last in, first out), and
global teardown replays whatever is still pending and sweeps the run's residue. A replay only removes: a
`DELETE`, `bulk-clear-declared`, a notifications bulk delete (`action: 'delete'`) or a `PATCH` whose body is exactly
`{ enabled: false }` (anything else is a G4 violation), and outside a W, C or S block only a `DELETE` may be
registered. Global teardown applies the run's tier flags: no write without `RTLS_IT_WRITES=1`, no side effect at
all. `createTestAsset(n, label)` creates a test asset (and registers its deletion) in any block where W writes
are admitted.

```ts
import { createTestAsset, describeLive, rawRequest, registerCleanup, testName } from '../harness';

describeLive(
  'W',
  'test asset',
  () => {
    it('creates, reads and cleans up', async () => {
      const asset = await createTestAsset(1, 'readme');
      expect((await rawRequest('GET', `/assets/{ns}/${asset.mac}`)).status).toBe(200);
    });

    it('registers the undo of a dashboard it creates', async () => {
      const r = await rawRequest('POST', '/dashboards', { body: { name: testName('readme'), data: [] } });
      const id = (r.json as { _id: string })._id;
      registerCleanup({
        label: 'readme dashboard',
        request: { method: 'DELETE', path: `/dashboards/${id}` },
        verify: { path: `/dashboards/${id}` },
      });
      expect([200, 201]).toContain(r.status);
    });
  },
  { ruleEngine: true }
);
```

## Configuration cycles (tier C)

Namespace configuration (alert rules, notification cleanup policy, tenant configuration) is written only inside
`configCycle(ctx, resource, body)`. It takes the config lock, saves the before-image in the run's state folder,
skips when there is no stored value, admits only the bodies `validateChange` accepts (for alert rules: the
document read, or it plus one disabled `sdk-test-<runId>-` rule that holds no mustache tag `{{` in any string or
key, added to a document without a structural tag such as a delimiter change or a section open across strings)
and always restores and verifies the before-image. A failed restore aborts the run (exit code 4). Pass the document type explicitly.

```ts
import { configCycle, describeLive, rawRequest, testName } from '../harness';

interface AlertRuleDocument {
  name: string;
  rules: { id: string; disabled?: boolean }[];
}

describeLive('C', 'alert rules', () => {
  it('adds one disabled test rule and ends in the original document', async (ctx) => {
    await configCycle<AlertRuleDocument>(ctx, 'alert-rules', async (cycle) => {
      const rule = {
        id: testName('rule'),
        disabled: true,
        conditions: { all: [] },
        event: { type: 'message', params: {} },
      };
      const next = { ...cycle.before, rules: [...cycle.before.rules, rule] };
      expect((await rawRequest('POST', '/alert_rules/{ns}', { body: next })).status).toBe(200);
      expect((await cycle.read()).rules).toHaveLength(cycle.before.rules.length + 1);
    });
  });
});
```

Upserts keyed by something other than a test name (notification connections per channel, recipient
mappings) run inside `withExistingEntityGuard`: the test skips when an entry already matches, activating the
run-scoped allowlist entries it names, and recipient mappings are checked again after the body. Recipient
mappings also need the config lock: `withConfigLock(() => withExistingEntityGuard(ctx, 'recipient-mappings', …))`.
The body deletes what it created in its own `finally`, inside the guard.

## Known server issues

Assert today's (defective) behaviour inside `expectKnownServerIssue(id, description, currentBehaviour)` with
the `USI-P<n>-<m>` id of your phase's upstream fragment. When the assertions stop holding, the test fails with
an instruction to update the SDK workaround, the test and `UPSTREAM-ISSUES.md`. The callback must be inline and
hold a strong assertion (`rtls-test/no-weak-only-assertions`): a `toBeDefined()` alone would keep passing once
the server is fixed. The id and the behaviour in the block are illustrative.

```ts
import { describeLive, expectKnownServerIssue, rawRequest } from '../harness';

describeLive('R', 'known issue', () => {
  it('documents the current behaviour of an unknown asset', async () => {
    await expectKnownServerIssue('USI-P2-1', 'an unknown asset answers 404 with an empty body', async () => {
      const r = await rawRequest('GET', '/assets/{ns}/025d4b000000');
      expect(r.status).toBe(404);
      expect(r.text).toBe('');
    });
  });
});
```

## Recording fixtures

In a run started with `--record`, `recordFixture(domain, name, response, note?)` writes
`test/fixtures/<domain>/<name>.json` in the fixture envelope, scrubbed of user ids, e-mail addresses, tokens,
the key and the namespace. A body the spec accepts is stored as `_source: 'spec'`; any other needs a note and
is stored as `_source: 'live'`. Navigation graph diagnostics and routes are never recorded; without `--record`
the call returns `false` and writes nothing.

```ts
import { describeLive, rawRequest, recordFixture } from '../harness';

describeLive('R', 'record', () => {
  it('records the health answer', async () => {
    const r = await rawRequest('GET', '/health');
    expect(r.status).toBe(200);
    await recordFixture('core', 'health.ok', {
      operation: 'GET /health',
      status: r.status,
      headers: r.headers,
      body: r.json,
    });
  });
});
```

## Recording observations in the run report

Live tests do not print. An observation that the phase report needs (a status, a count, a content type, whether
an assumption held) goes to `report.json.facts` through `recordFact(name, value)`. Only booleans, finite numbers,
`null` and media-type strings are accepted, and never a value that contains the key or the namespace, so a fact
cannot carry a credential, an identifier or a response body.

```ts
import { describeLive, rawRequest, recordFact } from '../harness';

describeLive('R', 'facts', () => {
  it('records the content type of the health answer', async () => {
    const r = await rawRequest('GET', '/health');
    expect(r.status).toBe(200);
    recordFact('health.contentType', r.headers.get('content-type'));
  });
});
```

## Discovery and the safe publish point

Tests discover ids at run time and never hard-code them. `discover()` returns the first venue, its first map
with a uuid and bounds, the union of the venue zones and the map's own features, a point inside a zone and a
path node; `safePublishPoint(discovery)` returns a point outside every zone and at least 10 m from every edge,
or `null` (then the block skips with "no safe publish point"). Examples use the same functions from
`examples/shared/discover.js`.

```ts
import { describeLive, discover, safePublishPoint } from '../harness';

describeLive('R', 'discovery', () => {
  it('finds a map and a publish point', async (ctx) => {
    const d = await discover();
    expect(d.mapUuid).not.toBe('');
    const point = safePublishPoint(d);
    if (point === null) {
      ctx.skip('no safe publish point');
      return;
    }
    expect(point.level).toBe(d.level);
  });
});
```

## Example mode (processes outside vitest)

Examples and other scripts run under the same guards through the preload, which also maps the `ws` module to
the guarded WebSocket class for ESM and CommonJS:

```bash
node --import "$PWD/test/integration/harness/preload.mjs" examples/javascript/02-assets.js
npx tsx --import "$PWD/test/integration/harness/preload.mjs" examples/typescript/02-assets.ts
```

A process is read-only unless its arguments contain `--write`; a read-only process holds one of the two read
slots unless its `RTLS_IT_INTERNAL_LOCK_TOKEN` belongs to a run that holds the run lock or a slot. A `--write`
process needs the run lock held with that token (otherwise it exits 2 before any request) and computes the
run's preflight once before the example's code runs. Write sections run in gates only through
`npm run examples:check -- <ids> --write` and `npm run examples:all -- --write`, which take the locks and pass
the token; `npm run ts` and `npm run js` start an example without the guard.
