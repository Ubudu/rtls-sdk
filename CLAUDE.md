# CLAUDE.md

Guidance for coding agents working in this repository.

## Project overview

**ubudu-rtls-sdk** 0.3.0: the TypeScript SDK of the Ubudu RTLS REST and WebSocket API, built against the vendored
OpenAPI spec of API 3.4.0 (`spec/rtls-api.swagger.json`; its exact version label is in `spec/spec.lock.json`). Scope rule: the SDK wraps what helps an API client,
not every operation of the API; `spec/manifest/` records the decision (wrap or exclude, with a reason) for each
operation.

## Commands

Node versions: consumers `>=20.3.0` (`engines.node`); development tooling needs Node 20.19 or later; CI runs the
latest 20.x, 22.x and 24.x; live runs use Node 22 or later. Bun 1.4.4 is checked as a consumer runtime only
(`npm run test:pack`).

```bash
npm ci                          # install (runs `npm run generate` through `prepare`)
npm run generate                # src/generated/schema.ts from the vendored spec (no network)
npm run build                   # generate + tsup → dist/ (ESM, CJS, .d.ts)
npm run dev                     # tsup --watch

npm test                        # unit tests (vitest, MSW)
npm run test:watch
npm run test:coverage           # unit coverage with the per-file floors
npm run test:contract           # fixtures vs spec, operation manifest
npm run manifest:report
npm run test:pack               # build, pack, import the tarball under Node and Bun
npm run test:ws                 # WebSocket unit tests
npm run test:ws:watch

npm run test:integration -- <domain>            # live tests (guarded; see "Live testing")
npm run test:integration:sweep -- --check       # list leftovers of test runs
npm run test:integration:snapshot -- --label <name> [--compare <name>]
npm run test:integration:scan
npm run coverage:live:check

npm run lint                    # ESLint (per-phase baseline)
npm run lint:fix
npm run format                  # Prettier --write (whole tree)
npm run format:check
npm run typecheck               # src, tests, scripts, examples

npm run spec:check              # vendored spec normalised, lock file and schema in sync
npm run spec:update             # refresh the vendored spec from the live API (manual)
npm run spec:drift              # vendored vs live spec report (informational)

npm run docs:snippets [-- <files>]   # every ts/js block of the docs compiles
npm run docs:links                   # relative and repository links resolve
npm run docs:api                     # TypeDoc → docs/api/reference
npm run docs:api:check
npm run docs:coverage                # docs/api/endpoint-coverage.{md,json} from the manifest
npm run docs:coverage:check
npm run docs:endpoint-coverage       # alias of docs:coverage

npm run examples:install             # npm ci in examples/
npm run examples:check -- <ids>      # build, then run examples read-only through the guard
npm run examples:all                 # build, then the whole example catalogue

npm run ci:offline                   # the full offline gate of CI
```

Lifecycle scripts: `prepare` runs `npm run generate` on install, `prepublishOnly` runs `npm run build`. In
`examples/`, `npm run ts -- <file>` and `npm run js -- <file>` start one example without the guard; they are never
used for a live gate run.

Run Prettier on the files you changed (`npx prettier --write <files>`) rather than `npm run format` when other
work is in progress in the tree.

## Architecture

- `src/client/`: `RtlsClient` / `createRtlsClient` (`index.ts`, `base.ts`: options, credentials, default
  context, scoped clients `forNamespace` / `forVenue` / `forMap` / `withContext`), the transport (`transport.ts`:
  `request`, `requestWithResponse`, `upload`, `download`, `stream`; timeouts, signals, error mapping), retries
  (`retry.ts`, opt-in), typed paths (`paths.ts`), `ResourceBase` (`resource.ts`). `client.raw` is the
  openapi-fetch client for operations the SDK does not wrap.
- `src/resources/`: one class per domain, reached as `client.<resource>` (`assets`, `assetDocuments`,
  `assetTree`, `dataModels`, `declaredLocations`, `tagActions`, `positions`, `spatial`, `venues`, `zones`,
  `navigation`, `dashboards`, `alerts`, `alertRules`, `settings`, `notifications`, `etl`) plus `client.health()`.
  Deprecated root delegates: `getSettings()`, `esQuery()`, `sendTagActions()`.
- `src/types/<domain>.ts`: hand-written domain types where the spec is wrong or loose, each spec defect noted in
  a comment; `src/types.ts` holds core types (`Page`, `OffsetPage`, filter types, `Schema<K>`).
- `src/generated/`: `schema.ts` (generated, never edited) and `overrides.ts` (`ExtraPaths` for real routes the
  spec documents wrongly).
- `src/utils/`: pagination (`paginatePages`, `paginateOffset`, `collectAll`), filters (`filters`,
  `combineFilters`, `serializeFilters`, `applyFilters`), MAC helpers, time conversion, SSE parsing, files.
- `src/errors.ts`: `RtlsError` and its subclasses (real HTTP `status`, SDK `code`, server `apiCode`).
- `src/websocket/`: `RtlsWebSocketSubscriber`, `RtlsWebSocketPublisher`, `RtlsWebSocketClient` (`ws` on Node 20).

## Code generation

`npm run generate` reads only the vendored spec; nothing is fetched at install or build time. `npm run
spec:update` is the one deliberate refresh (then `npm run generate && npm run spec:check`); `npm run spec:drift`
is informational.

## Tests

| Path | Content |
|---|---|
| `test/unit/core/**` | transport, errors, context, utils |
| `test/resources/<domain>/**` | resource unit tests: the real request builders against MSW, asserting the sent request and the typed result |
| `test/mocks/handlers/<domain>.ts` | MSW handlers |
| `test/fixtures/<domain>/*.json` | response fixtures; each has `"_source": "spec" \| "live" \| "server-code"` (and `_operation` where required) |
| `test/contract/**` | fixtures validated against the spec; operation manifest check |
| `test/types/<domain>.test-d.ts` | type-level tests (compiled by `npm run typecheck`) |
| `test/integration/harness/**` | live-test harness: guards, tiers, budgets, cleanup, locks, sweeper |
| `test/integration/<domain>/*.int.test.ts` | live tests, each declaring its tier |
| `test/websocket/**` | WebSocket unit and live tests |
| `test/docs/**` | documentation tooling tests |

Every wrapped operation is listed in `spec/manifest/<phase>.json` with its SDK method, unit test, live test and
tier; `npm run test:contract` fails on any gap.

## Live testing

- Live tests and examples reach the API only through the guarded runners (`npm run test:integration`,
  `npm run examples:check`, `npm run examples:all`); never with `curl` or an unguarded script.
- Only the namespace configured in `.env` (`APP_NAMESPACE`, `RTLS_API_KEY`, optional `RTLS_BASE_URL`) is used.
  Never print, log or copy credentials, `.env` values or response bodies.
- Tiers: R (read-only, always), W (`RTLS_IT_WRITES=1`: creates and deletes test entities), C
  (`RTLS_IT_CONFIG=1`: namespace configuration, restored by the harness), S (`RTLS_IT_SIDE_EFFECTS=1`: publishes
  positions, sends notifications, BLE actions, ETL uploads). Tier variables go on the command line only, never
  into `.env`.
- Budgets per run (positions, notifications, BLE actions, ETL uploads) are enforced by the harness and a ledger;
  a refused run is never worked around.
- Everything a test creates is named `sdk-test-<runId>-<label>`; test MACs start with `025d4b`
  (`testMac(n)`). Cleanup runs in reverse order; the sweeper (`npm run test:integration:sweep`) finds leftovers.
- Never write settings, the asset tree or the data model of the namespace. Alert rules are written only inside
  the harness's config cycle.
- Known server issues are asserted with `expectKnownServerIssue(id, description, currentBehaviour)`.

## Coding conventions

- Default context: namespace, venue, map and level come from the call, else the client, else `ContextError`.
- The last parameter of every method is `options?: CallContext & RequestOptions`
  (`{ namespace, venueId, mapId, level, signal, timeoutMs, headers }`).
- Request and response fields keep the wire casing (snake_case where the server uses it); SDK-only options are
  camelCase.
- Method names: `list` (array), `listPage` (`Page<T>` or `OffsetPage<T>`), `iterate` (async iterator), `get`,
  `create`, `update`, `delete`, `replace` (full-document write).
- Elasticsearch-backed reads always send a time range (default: the last 24 hours).
- Known shapes get real types: no `Record<string, unknown>` where the shape is known.
- Retries are opt-in and never apply to non-idempotent calls (`notifications.send`, publishing, tag actions).

## Docs and examples

- Guides in `docs/guides/`, recipes in `docs/recipes/`, API reference in `docs/api/`; examples in
  `examples/typescript` and `examples/javascript` (same number and name, same output).
- One concept per code block; blocks compile (`npm run docs:snippets`); directives on the line above a fence:
  `<!-- snippet: skip -->`, `<!-- snippet: prelude=client -->`, `<!-- snippet: continue -->`.
- Public docs never name the test namespace, user ids or credentials, never contain server source paths, use
  only `025d4b…` MACs and rounded fake coordinates in illustrative output, and never describe authorisation,
  authentication or data-isolation behaviour of the server.
- Public documents link only to public files: never into the internal work-package folder under `docs/`.
  Illustrative output is scrubbed; no dates except release dates in `CHANGELOG.md`; one spelling (British or
  American) per file.
- Examples import only from `ubudu-rtls-sdk` and `examples/shared`, wrap their body in `runExample()`, are
  read-only by default and write only with `--write`. Their first line is
  `// Write section: tier <W|C|S|none>; budget positions=<n> notifications=<n> ble=<n> etl=<n>; read skips <none|cat,cat>`.
- Output markers read by the runners: `DONE <id>-<name>` as the last line (printed by `runExample`),
  `SKIPPED: <category> <text>` (categories `feature-off`, `role`, `tier`, `no-fixture`, `preflight`), and a
  `BUDGET positions=… notifications=… ble=… etl=…` line right after each budgeted call of a write section.
- A write section runs only through `npm run examples:check -- <ids> --write` or `npm run examples:all -- --write`
  (TypeScript twin, tier variables on the command line); JavaScript twins run read-only.
- `examples/catalogue.json` describes every example; `node examples/run-all.mjs --write-index` regenerates the
  index of `examples/README.md` and `--check-index` checks it.

## Commits

- Commits are authored by the configured git user; conventional messages (`feat(assets): …`, `fix(core): …`,
  `test(…)`, `docs(…)`).
- No co-author lines, no links and no tool names in commit messages.

## Documentation index

- [Documentation index](docs/README.md)
- [Getting started](docs/guides/getting-started.md)
- [Migration to 0.3](docs/guides/migration-0.3.md)
- [Error handling](docs/guides/error-handling.md)
- [Pagination and filtering](docs/guides/pagination-filtering.md)
- [Assets](docs/guides/assets.md)
- [Positions and spatial](docs/guides/positions-spatial.md)
- [Venues and navigation](docs/guides/venues-navigation.md)
- [Dashboards and alert rules](docs/guides/dashboards-alert-rules.md)
- [Notifications](docs/guides/notifications.md)
- [ETL](docs/guides/etl.md)
- [WebSocket](docs/guides/websocket.md)
- [Recipes](docs/recipes/README.md)
- [API reference](docs/api/README.md)
- [Examples](examples/README.md)
- [Release setup](docs/guides/release-setup.md)
