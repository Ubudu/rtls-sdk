# Upstream issues — rtls-api

Functional behaviour observed while aligning ubudu-rtls-sdk 0.3.0. The entries were observed with rtls-api 3.3.8,
and the SDK is built against the rtls-api 3.4.0 specification. Each entry keeps the stable id used by the SDK's
tests and documentation (`USI-P<n>-<m>`, where `P<n>` is the code in parentheses after the section title). Wire
terms only: methods, paths, query strings, status codes and response shapes. Kinds: `server` (the server behaves
wrongly or inconsistently), `spec` (the specification is wrong or silent and the server is right), `spec-gap` (a
parameter, status, content type or path of a wrapped operation is missing from the specification). Entries are
ordered by domain, then by impact, then by id; within a domain, entries without an impact rating follow the rated
ones, and an id marked "not recorded" comes last. An id marked "not recorded" was reserved and is kept so that ids
stay stable. Some entries are stated without detail.

Server routes absent from the specification and not used by the SDK are not listed here.

## Summary

120 entries.

| Id | Domain | Kind | Operation | Impact | SDK handling |
|---|---|---|---|---|---|
| USI-P0-4 | Specification | spec | `GET /api/spatial/assets/:namespace/nearest-to-point` … | breaks | workaround |
| USI-P0-2 | Specification | spec | 78 of the 176 operations | misleads | documented |
| USI-P0-1 | Specification | spec | all 176 operations of the specification | friction | none |
| USI-P0-3 | Specification | spec | 44 of the 176 operations | friction | none |
| USI-P1-1 | Core transport and errors | server | `GET /venues/{namespace}` … | — | documented |
| USI-P1-2 | Core transport and errors | server | `GET /venues/{namespace}?limit=1` | — | documented |
| USI-P1-3 | Core transport and errors | server | `GET /assets/{app_namespace}/{an unknown MAC}` | — | documented |
| USI-P1-4 | Core transport and errors | server | `GET /notifications/{namespace}?group_by=flat&limit=1` | — | workaround |
| USI-P1-5 | Core transport and errors | spec | `POST /assets/{app_namespace}/{mac_address}` | — | documented |
| USI-P1-6 | Core transport and errors | spec | `GET /spatial/assets/{namespace}/nearest-to-point` | — | documented |
| USI-P1-7 | Core transport and errors | spec | `GET /universal-filtering/documentation` | — | documented |
| USI-P1-11 | Core transport and errors | server | — | — | none |
| USI-P1-9 | Core transport and errors | — | `GET /notifications/{namespace}?group_by=flat&limit=1` | — | — |
| USI-P2-1 | Assets | server | `GET /assets/{app_namespace}` | — | workaround |
| USI-P2-2 | Assets | server | `POST /assets/{app_namespace}/{mac_address}` | — | workaround |
| USI-P2-3 | Assets | server | `GET /assets/{app_namespace}/{mac_address}` | — | documented |
| USI-P2-4 | Assets | server | `POST /assets/{app_namespace}` | — | workaround |
| USI-P2-5 | Assets | server | `DELETE /assets/{app_namespace}` | — | workaround |
| USI-P2-6 | Assets | server | — | — | none |
| USI-P2-7 | Assets | server | `GET /asset_history/{app_namespace}/{mac_address}` | — | workaround |
| USI-P2-8 | Assets | server | `POST /tag-actions/{appNamespace}` | — | documented |
| USI-P2-9 | Assets | server | `GET /data_filters_taxonomy/{app_namespace}` | — | workaround |
| USI-P2-10 | Assets | server | `POST /assets/{namespace}/bulk-declare` | — | workaround |
| USI-P2-11 | Assets | server | `POST /assets/{namespace}/bulk-clear-declared` | — | none |
| USI-P2-12 | Assets | server | `GET /assets/{namespace}/{mac_address}/documents/{documentId}` | — | workaround |
| USI-P2-13 | Assets | server | — | — | workaround |
| USI-P2-14 | Assets | server | `GET …/documents/{documentId}` | — | none |
| USI-P2-15 | Assets | server | `GET …/documents/{documentId}/download?version=thumbnail` | — | none |
| USI-P3-1 | Positions and spatial | server | `GET /spatial/zones/{namespace}/containing-point` … | breaks | documented |
| USI-P3-2 | Positions and spatial | server | `GET /spatial/pois/{namespace}/nearest-to-point` … | breaks | documented |
| USI-P3-6 | Positions and spatial | server | `POST /spatial/zones/{namespace}/analyze-custom` … | breaks | documented |
| USI-P3-3 | Positions and spatial | server | `GET /spatial/pois/{namespace}/statistics` | misleads | documented |
| USI-P3-7 | Positions and spatial | server | `GET containing-point` … | misleads | workaround |
| USI-P3-8 | Positions and spatial | server | `GET /api/spatial/assets/:namespace/nearest-to-point` | misleads | documented |
| USI-P3-10 | Positions and spatial | spec-gap | `Spatial Analysis` … | misleads | documented |
| USI-P3-12 | Positions and spatial | server | `Spatial Analysis` | misleads | documented |
| USI-P3-9 | Positions and spatial | server | `POST /es/query/{appNamespace}/{dataType}` | friction | documented |
| USI-P3-13 | Positions and spatial | server | `GET /spatial/zones/{namespace}/nearest-to-point` | friction | documented |
| USI-P4-3 | Venues and navigation | server | `GET /venues/{namespace}` … | breaks | workaround |
| USI-P4-4 | Venues and navigation | server | `GET /venues/{namespace}` … | breaks | workaround |
| USI-P4-7 | Venues and navigation | server | `POST` … | breaks | workaround |
| USI-P4-8 | Venues and navigation | spec | `POST /spatial/navigate/{namespace}/shortest-path` … | breaks | documented |
| USI-P4-13 | Venues and navigation | server | `POST /spatial/navigate/{namespace}/multi-stop` | breaks | documented |
| USI-P4-15 | Venues and navigation | server | `GET /spatial/navigate/{namespace}/evacuation/{nodeId}` | breaks | documented |
| USI-P4-1 | Venues and navigation | spec | `GET /venues/{namespace}` | misleads | documented |
| USI-P4-2 | Venues and navigation | server | `GET /venues/{namespace}/{venueId}` | misleads | documented |
| USI-P4-6 | Venues and navigation | server | `GET /venues/{namespace}/{venueId}/maps/{mapId}` … | misleads | documented |
| USI-P4-9 | Venues and navigation | server | `POST /spatial/navigate/{namespace}/shortest-path` … | misleads | documented |
| USI-P4-10 | Venues and navigation | server | `POST /spatial/navigate/{namespace}/shortest-path` … | misleads | documented |
| USI-P4-14 | Venues and navigation | server | `GET /spatial/navigate/{namespace}/nearest-poi/{nodeId}` | misleads | documented |
| USI-P4-16 | Venues and navigation | server | `GET /spatial/navigate/{namespace}/nearest-poi/{nodeId}` | misleads | documented |
| USI-P4-18 | Venues and navigation | server | `GET /es/zone_presence/{appNamespace}` | misleads | workaround |
| USI-P4-19 | Venues and navigation | server | `GET /venues/{namespace}` | misleads | documented |
| USI-P4-5 | Venues and navigation | server | `GET /venues/{namespace}/{venueId}/zones` … | friction | documented |
| USI-P4-11 | Venues and navigation | server | `POST /spatial/navigate/{namespace}/shortest-path` … | friction | workaround |
| USI-P4-20 | Venues and navigation | spec | `GET /venues/{namespace}/{venueId}/pois` … | friction | workaround |
| USI-P4-21 | Venues and navigation | server | `GET /venues/cache/stats` | friction | none |
| USI-P4-12 | Venues and navigation | server | `POST /spatial/navigate/{namespace}/accessible-path` | — | documented |
| USI-P4-17 | Venues and navigation | server | `POST /spatial/navigate/{namespace}/shortest-path` … | — | documented |
| USI-P5-1 | Dashboards, alert rules, settings | spec | `GET /alert_rules/{app_namespace}` … | harmful | documented |
| USI-P5-2 | Dashboards, alert rules, settings | server | `POST /alert_rules/{app_namespace}` | harmful | documented |
| USI-P5-3 | Dashboards, alert rules, settings | server | `POST /alert_rules/{app_namespace}` | harmful | documented |
| USI-P5-9 | Dashboards, alert rules, settings | server | `PUT /dashboards/{id}` | harmful | workaround |
| USI-P5-10 | Dashboards, alert rules, settings | server | `POST /dashboards` … | harmful | documented |
| USI-P5-5 | Dashboards, alert rules, settings | spec | `POST /dashboards/{id}/share` | friction | workaround |
| USI-P5-6 | Dashboards, alert rules, settings | spec | `/dashboards` | friction | documented |
| USI-P5-8 | Dashboards, alert rules, settings | server | `POST /dashboards` … | friction | workaround |
| USI-P5-11 | Dashboards, alert rules, settings | server and spec | `GET /es/alerts/{appNamespace}` | friction | documented |
| USI-P5-12 | Dashboards, alert rules, settings | spec | `GET /settings/{app_namespace}` | friction | documented |
| USI-P5-14 | Dashboards, alert rules, settings | server | `POST /alert_rules/{app_namespace}` … | friction | documented |
| USI-P5-4 | Dashboards, alert rules, settings | server | `POST /alert_rules/{app_namespace}` | — | workaround |
| USI-P5-7 | Dashboards, alert rules, settings | server | `POST /dashboards` … | — | documented |
| USI-P5-13 | Dashboards, alert rules, settings | spec | every operation of this domain | — | none |
| USI-P6-12 | Notifications | server | `GET /notifications/{namespace}/export` | data loss risk | documented |
| USI-P6-2 | Notifications | spec | `GET /notifications/{namespace}` | misleads | workaround |
| USI-P6-5 | Notifications | server | `POST /notifications/{namespace}/{id}/mute` … | misleads | documented |
| USI-P6-8 | Notifications | spec | `Notifications` | misleads | documented |
| USI-P6-10 | Notifications | server | `POST /notifications/{namespace}/bulk` … | misleads | documented |
| USI-P6-3 | Notifications | server | `GET /notifications/{namespace}/stream` | friction | documented |
| USI-P6-7 | Notifications | spec | `POST /notifications/{namespace}/send` | friction | documented |
| USI-P6-9 | Notifications | server | `PATCH /notifications/{namespace}/rules/{id}` … | friction | documented |
| USI-P6-14 | Notifications | server | `GET /notifications/{namespace}` … | friction | documented |
| USI-P6-1 | Notifications | server | `POST /notifications/{namespace}/send` | — | documented |
| USI-P6-4 | Notifications | server | `POST /notifications/{namespace}/bulk` | — | workaround |
| USI-P6-6 | Notifications | server | `PUT /notifications/{namespace}/cleanup-policy` | — | documented |
| USI-P6-11 | Notifications | server | `POST /notifications/{namespace}/saved-views` | — | documented |
| USI-P6-13 | Notifications | spec | all notification operations | — | documented |
| USI-P7-4 | ETL | server | `POST /etl/upload` | breaks | workaround |
| USI-P7-12 | ETL | server | `POST /etl/upload` | breaks | documented |
| USI-P7-16 | ETL | server | `POST /etl/upload` | breaks | documented |
| USI-P7-20 | ETL | server | `POST /etl/upload` … | breaks | documented |
| USI-P7-1 | ETL | spec | `GET /etl/mapping-profiles` … | misleads | workaround |
| USI-P7-2 | ETL | server | `POST /etl/upload` | misleads | documented |
| USI-P7-5 | ETL | server | `POST /etl/parse-excel-headers` | misleads | workaround |
| USI-P7-11 | ETL | server | `POST /etl/upload` … | misleads | documented |
| USI-P7-13 | ETL | server | `POST /etl/upload` | misleads | documented |
| USI-P7-18 | ETL | server | `POST /etl/parse-excel-headers` … | misleads | documented |
| USI-P7-3 | ETL | server | `POST /etl/upload` | friction | workaround |
| USI-P7-6 | ETL | server | `GET /etl/check-mappings` | friction | documented |
| USI-P7-7 | ETL | server | `POST /etl/mapping-profiles` | friction | workaround |
| USI-P7-8 | ETL | server | `GET /etl/mapping-profiles/{id}` … | friction | documented |
| USI-P7-14 | ETL | server | `POST /etl/mappings` … | friction | documented |
| USI-P7-15 | ETL | spec-gap | `GET /etl/activities` … | friction | documented |
| USI-P7-17 | ETL | server | `POST /etl/upload` … | friction | documented |
| USI-P7-19 | ETL | server | `POST /etl/upload` | friction | documented |
| USI-P7-9 | ETL | server | `GET /etl/activities` | — | workaround |
| USI-P7-10 | ETL | spec-gap | `GET /etl/activities` | — | documented |
| USI-P7-21 | ETL | server | `POST /etl/parse-excel-headers` … | — | none |
| USI-P8-11 | WebSocket | server | subscriber socket, alerts | breaks | documented |
| USI-P8-1 | WebSocket | server | `SUBSCRIBE` | misleads | documented |
| USI-P8-2 | WebSocket | server | `SUBSCRIBE` | misleads | documented |
| USI-P8-6 | WebSocket | server | subscriber and publisher sockets | misleads | documented |
| USI-P8-8 | WebSocket | server | subscriber socket, zone counter updates | misleads | documented |
| USI-P8-3 | WebSocket | server | `SUBSCRIBE` … | friction | workaround |
| USI-P8-4 | WebSocket | server | `SUBSCRIBE` | friction | documented |
| USI-P8-7 | WebSocket | server | subscriber socket, delivered messages | friction | documented |
| USI-P8-10 | WebSocket | spec | both sockets | friction | documented |
| USI-P8-5 | WebSocket | server | `SUBSCRIBE` … | — | documented |
| USI-P9-2 | Documentation and examples | server | — | — | workaround |
| USI-P9-1 | Documentation and examples | — | — | — | — |

## Specification (P0)

### USI-P0-4 — Two spatial asset paths in colon-parameter syntax with a duplicated `/api` prefix

- **Operation:** `GET /api/spatial/assets/:namespace/nearest-to-point`, `GET /api/spatial/assets/:namespace/nearest-realtime`
- **Kind:** spec
- **Observed:** the two paths are written as `/api/spatial/assets/:namespace/…` while the server URL is already
  `/api` and every other path uses `{param}` templates.
- **Expected:** `/spatial/assets/{namespace}/nearest-to-point` and `/spatial/assets/{namespace}/nearest-realtime`.
- **Impact:** breaks — a client generated from the specification calls `/api/api/spatial/assets/:namespace/…`
  with a literal `:namespace` segment.
- **SDK handling:** workaround: the live-test guard and the operation manifest normalise the `:param` form; the SDK
  calls the real paths through its path overrides (`src/generated/overrides.ts`).
- **Evidence:** vendored specification, counted by script.
- **Also reported as:** USI-P1-6 (functional side)

### USI-P0-2 — 78 operations declare no 2xx response schema

- **Operation:** 78 of the 176 operations (listed by `npm run manifest:report`)
- **Kind:** spec
- **Observed:** the 2xx responses of 78 operations have no `content` schema (no response body type).
- **Expected:** every 2xx response that returns a body declares its schema; an empty response declares none
  explicitly.
- **Impact:** misleads — a generated client types these responses as unknown or empty although most return
  JSON bodies.
- **SDK handling:** documented: the SDK hand-writes those types from the observed responses, and the test fixtures
  of those responses say where their shape comes from.
- **Evidence:** vendored specification, counted by script.

### USI-P0-1 — No operation has an `operationId`

- **Operation:** all 176 operations of the specification
- **Kind:** spec
- **Observed:** 0 of 176 operations carry an `operationId`.
- **Expected:** every operation has a unique `operationId` (OpenAPI 3.0 recommends it; client generators name
  methods and types after it).
- **Impact:** friction — generated clients and types can only be keyed by path and method, so a path change
  renames every generated name.
- **SDK handling:** none needed in the API: generated types are keyed by path; the operation manifest uses
  `"METHOD path"` ids.
- **Evidence:** vendored specification, counted by script (176 operations).

### USI-P0-3 — 44 operations list the same security scheme twice

- **Operation:** 44 of the 176 operations
- **Kind:** spec
- **Observed:** the `security` list of 44 operations names the same scheme twice.
- **Expected:** each acceptable scheme is listed once.
- **Impact:** friction — cosmetic; some generators emit duplicate parameters.
- **SDK handling:** none.
- **Evidence:** vendored specification, counted by script.

## Core transport and errors (P1)

### USI-P1-1 — Query parameters of the venue routes

- **SDK handling.** The SDK sends only the venue filter grammar (`serializeFilters(filters, 'venue')`) to the venue
  GET routes, with no paging, sort or universal filter keys, and filters, sorts and pages venue lists locally
  (`applyFilters`).

### USI-P1-2 — `limit` on the venue array routes caps `pagination.total`

- **Observed (needs a namespace with at least two venues; not reproduced live).** With `limit`, the venue list
  answers the page envelope, but `pagination.total` equals `limit` and `hasNext` is `false` whatever the real
  number of venues.
- **Reproduction.** On a namespace with at least two venues: `GET /venues/{namespace}?limit=1` →
  `pagination.total: 1`, `hasNext: false`.
- **Expected.** `total` counts every matching item and `hasNext` is true when more pages exist.
- **SDK workaround.** Venue listings are fetched whole and paginated locally; a live test asserts the current
  behaviour with `expectKnownServerIssue` when the namespace has more than one venue.

### USI-P1-3 — Error bodies come in many shapes; the spec declares one

- **Observed.** The spec declares only `{ "error": string }`. The server sends, depending on the route:
  `{error}`, `{error, message}`, `{error: {code, message?, details?}}`, `{error, code}`, `{error, details: string[]}`,
  `{error, details: string}`, `{error, violations}`, `{error, fields}`, `{success: false, error}`,
  `{message, …}`, `{status}`, objects with none of these keys, plain text with and without `Content-Type`
  (`404 Not Found\r\n`, `Error: …`, `JSON error: …`), text bodies on `502`/`504`, and empty bodies (for example a
  `404` for an unknown asset). A malformed JSON body, a JSON body above 100 kB and rejected uploads are answered
  with a non-JSON error body (a body above 100 kB answers `413`).
- **Reproduction.** `GET /assets/{app_namespace}/{an unknown MAC}` → `404` with an empty body;
  `POST /spatial/zones/{namespace}/analyze-custom` with a JSON body of about 105 kB → `413` with a non-JSON body;
  `GET /dashboards/{a malformed id}` → `400` `{"error":"Invalid dashboard ID"}`.
- **Expected.** One documented JSON error envelope (for example `{ error: { code, message, details } }`) for every
  error status, also for oversized, malformed and rejected request bodies, declared in the spec.
- **SDK workaround.** `createError` reads `message`, `apiCode` and `details` from every shape; a markup body gives
  only its first message line, and a `502`/`504` text body gives `Upstream service unavailable`.

### USI-P1-4 — CORS exposes only `X-Last-Positions-Source`

- **Observed.** Cross-origin responses list only `X-Last-Positions-Source` in `Access-Control-Expose-Headers`,
  so a browser on another origin cannot read `X-Total-Count`, `Retry-After` or `Content-Disposition`.
- **Reproduction.** Any cross-origin `GET /notifications/{namespace}?group_by=flat&limit=1` from a browser:
  `X-Total-Count` is not readable from script.
- **Expected.** `X-Total-Count`, `Retry-After` and `Content-Disposition` are exposed.
- **SDK workaround.** `readTotalCount` returns `undefined` when the header cannot be read (`OffsetPage.total` stays
  `undefined` and `paginateOffset` stops on a short page); a download without a readable `Content-Disposition` has no
  `filename`; a missing `Retry-After` falls back to the retry backoff.

### USI-P1-5 — Response schemas missing, wrong or unusable

- **Observed (spec and live).** 78 of the 176 operations declare no 2xx response content. Several operations declared
  as JSON answer text or nothing (the single-asset writes answer `Created` / `Updated` without a `Content-Type`, and a
  delete answers an empty 200). Objects declared without properties (the Elasticsearch query body and response, the
  notification facets) generate types that hold no field.
- **Reproduction.** Spec: the 2xx responses of `POST /assets/{app_namespace}/{mac_address}` and of
  `POST /es/query/{appNamespace}/{dataType}`.
- **Expected.** Every operation declares its real 2xx content type and schema.
- **SDK workaround.** Hand-written types where the spec is wrong; the transport's explicit-type form; the `'auto'`
  body parser returns text bodies as text and empty bodies as `undefined`.

### USI-P1-6 — Spatial asset paths are written in the wrong syntax

- **Observed (spec and live).** The spec lists `/api/spatial/assets/:namespace/nearest-to-point` and
  `/api/spatial/assets/:namespace/nearest-realtime`: colon-parameter syntax (`:namespace`), a doubled `/api` prefix,
  and `namespace` declared as a query parameter. The real routes are `GET /spatial/assets/{namespace}/nearest-to-point`
  and `GET /spatial/assets/{namespace}/nearest-realtime` (live 200).
- **Expected.** OpenAPI path templates relative to the server URL, with `namespace` as a path parameter.
- **SDK workaround.** `src/generated/overrides.ts` replaces both paths (`ExtraPaths`, `ReplacedSpecPaths`), and the
  spatial asset methods call the real routes.

### USI-P1-7 — The universal filter parameters are malformed in the spec

- **Observed.** `components.parameters.UniversalFilterParams` is an array instead of a Parameter Object, and no
  operation references it. The routes the universal filter applies to differ between the spec's description, the
  list returned by `GET /universal-filtering/documentation` and the routes that honour the filter (for example
  `GET /assets/{app_namespace}` honours only `key`/`value`, USI-P2-1).
- **Expected.** One parameter definition referenced by exactly the operations that apply the filter.
- **SDK workaround.** Documentation only; the SDK sends the universal grammar only where it applies and filters the
  asset list locally (`applyFilters`).

### USI-P1-11 — The universal `sort` has no defined order for mixed values

- **Observed (not reproduced live).** When the values of one sort key mix strings with numbers, or `null` with
  missing values, the order of the answer is not defined: `null` and missing values go to one end without an order
  between them, and the order can change between server versions. Strings alone sort in locale order.
- **Reproduction.** A universal route whose items hold `f: "b"`, `f: 1`, `f: "a"` (or `f: null` next to items without
  `f`), with `?sort=f:asc`.
- **Expected.** A total order: for example a fixed rank per type (numbers, strings, booleans, `null`, missing), then the
  value.
- **SDK workaround.** None needed for correctness; `applyFilters` sorts the same way for parity with the server, and
  the documentation states that such mixed keys have no defined order.

### USI-P1-9 — not recorded

Reserved for `X-Total-Count` / `X-Last-Positions-Source` missing from live responses. Both are present
(`GET /notifications/{namespace}?group_by=flat&limit=1` carries `X-Total-Count`, a bounded
`GET /es/last_positions/{appNamespace}` carries `X-Last-Positions-Source`), so there is no issue to report.

## Assets (P2)

### USI-P2-1 — The asset list ignores the universal query grammar

- **Observed (live).** `GET /assets/{app_namespace}` ignores `page`, `limit`, `sort`, `fields` and every
  `{field}:{op}` key, although the spec advertises universal filtering. It always answers the full bare array of the
  namespace. Only `key` and `value` (exact match on a dot path) are applied.
- **Reproduction.** `GET /assets/{app_namespace}?limit=2` → an array with every asset of the namespace.
- **Expected.** Paging, sorting, projection and the filter operators applied as documented, or the spec documents
  only `key`/`value`.
- **SDK workaround.** `assets.list()` sends only `key`/`value`; filters, sort, page, limit and fields are evaluated
  locally (`applyFilters`). Live check: `expectKnownServerIssue('USI-P2-1', …)` on a raw `?limit=2` read.

### USI-P2-2 — The asset upsert answers plain text and validates with 500

- **Observed.** `POST /assets/{app_namespace}/{mac_address}` answers `201` with the body `Created` for a new asset
  and `200` with `Updated` for an existing one, both without `Content-Type`, instead of the documented `Asset` JSON.
  `user_udid` must be in the body; it is not taken from the path. Validation failures answer `500` with a text body
  (`Error: user_name is required, must be a string, and cannot be empty`, `Error: user_udid is required…`,
  `Error: Invalid asset data`, `Error: The payload must be an object`).
- **Reproduction.** `POST /assets/{app_namespace}/{mac}` with `{"user_name":"x"}` and no `user_udid` → `500`
  `Error: user_udid is required…`; with `user_udid` set → `201 Created` (no Content-Type).
- **Expected.** `201`/`200` with the stored `Asset` as JSON; `user_udid` taken from the path; `400` for invalid input.
- **SDK workaround.** `assets.create()` sends `user_udid` (the normalised path MAC), parses the text reply and
  returns the stored asset through a follow-up `GET`; it validates `user_name`, `data` and `user_udid` locally.

### USI-P2-3 — Single-asset error bodies are not documented

- **Observed (live).** `GET /assets/{app_namespace}/{mac_address}` for an unknown MAC answers `404` with an empty
  body and no `Content-Type`; `PATCH` and `DELETE` answer `404` with the text `404 Not Found\r\n` and no
  `Content-Type`. `DELETE` of an existing asset answers `200` with an empty body (`Content-Length: 0`). The spec
  documents none of these bodies.
- **Reproduction.** `PATCH /assets/{app_namespace}/<unknown mac>` with `{"color":"#000000"}` → `404`
  `404 Not Found\r\n`.
- **Expected.** A JSON error body (`{"error": …}`) as on the other routes, and the documented `204`/`200` shapes.
- **SDK workaround.** The error mapper turns empty and text `404` bodies into `NotFoundError`; `assets.delete()`
  parses the reply as text and resolves `undefined`.

### USI-P2-4 — The batch save answers an array of saved assets and skips invalid items silently

- **Observed.** `POST /assets/{app_namespace}` answers `200` with an array of the saved assets, with the fields the
  server sets added, not the documented `BatchSaveResult`. Items without `user_udid` or failing validation are
  skipped without a trace in the answer, and the batch is not atomic.
- **Reproduction.** `POST /assets/{app_namespace}` with `[{"user_udid":"<mac>","user_name":"a"},{"user_name":"b"}]`
  → `200` with one saved asset.
- **Expected.** A per-item result (saved, skipped with a reason), and validation before any write.
- **SDK workaround.** `assets.batchSave()` returns `Asset[]` and validates every item (`user_udid` a valid MAC,
  `user_name` a non-empty string, `data` a plain object) before sending; `BatchSaveResult` is deprecated.

### USI-P2-5 — Batch delete of assets

- **SDK workaround.** `assets.batchDelete()` does not use the batch route `DELETE /assets/{app_namespace}`: it sends
  one `DELETE /assets/{app_namespace}/{mac_address}` per MAC, in input order, and aggregates `{deleted, not_found}`
  (a `404` puts the MAC in `not_found`; the first other error is rethrown and the remaining MACs are not sent), with
  an unchanged public contract.

### USI-P2-6 — Every asset write drops a stored `maintenance` value

- **Observed.** Create, update, batch save, declare and clear store the asset without its `maintenance` field.
- **Reproduction.** Store an asset with `maintenance`, then `PATCH` any other field → `maintenance` is gone.
- **Expected.** Fields the request does not touch are preserved.
- **SDK workaround.** None possible; `maintenance` is typed as server-owned (not writable through `AssetInput`) and
  the guide says it is dropped on write.

### USI-P2-7 — Asset history ignores its time range

- **Observed (live).** `GET /asset_history/{app_namespace}/{mac_address}` ignores `start_time` and `end_time` and
  always answers the newest entries, at most 1000 (live: 1000 for a busy asset). `timestamp` is unix seconds as a
  decimal string, and `user` is not always present.
- **Reproduction.** `GET /asset_history/{app_namespace}/<mac>?start_time=<now + 1 d ms>&end_time=<now + 2 d ms>` →
  the asset's entries, not `[]`.
- **Expected.** Entries inside the range only, with paging past 1000; `timestamp` as documented.
- **SDK workaround.** `assets.getHistory()` sends the range (forward-compatible) and filters the entries locally by
  their seconds timestamp; the JSDoc says only the newest 1000 entries are reachable. Live check:
  `expectKnownServerIssue('USI-P2-7', …)` on a raw read with a future range.

### USI-P2-8 — Tag actions: `results` is an array, `success` is undocumented, partial failure answers 500

- **Observed (live).** `POST /tag-actions/{appNamespace}` answers `{message, tagCount, results, success}` where
  `results` is an array (spec: object) and `success` is not documented. When any item fails, the whole request
  answers `500` with that same body (`success: false`).
- **Reproduction.** `POST /tag-actions/{appNamespace}` with `[{"macAddress":"<mac without an ESL asset>",
  "action":"ptlBlue","duration":1}]` → `500` `{"message":"Some actions failed","tagCount":1,"results":[{"action":
  "ptlBlue","success":false,"statusCode":400,"error":"…ESL-only…"}],"success":false}`.
- **Expected.** `200` (or `207`) with per-item results; `results` and `success` documented.
- **SDK workaround.** `tagActions.send()` resolves a `500` whose body has a `results` array and a boolean `success`
  (the caller reads `success` and `results`); other errors are thrown.

### USI-P2-9 — The data-model taxonomy answers `[]` when nothing is stored

- **Observed.** `GET /data_filters_taxonomy/{app_namespace}` answers `[]` for a namespace without a stored
  taxonomy, while the spec describes a default set.
- **Reproduction.** On a namespace without a taxonomy: `GET /data_filters_taxonomy/{app_namespace}` → `[]`.
- **Expected.** The documented default set, or the spec documents `[]`.
- **SDK workaround.** `dataModels.get()` returns the stored array unchanged (possibly empty).

### USI-P2-10 — Declared-location routes normalise MACs, asset keys are verbatim

- **Observed.** `POST /assets/{namespace}/bulk-declare` and `POST /assets/{namespace}/bulk-clear-declared`
  normalise each MAC to 12 lowercase hex characters before addressing the asset, while the asset routes keep the
  path MAC exactly as written. An asset created under a MAC with separators or upper case can never be declared
  (`DL_004`) or cleared (`DL_017`).
- **Reproduction.** Create an asset under `02:5D:4B:00:00:01`, then bulk-declare it → `DL_004`.
- **Expected.** One MAC form everywhere (normalised keys on write, or verbatim lookups).
- **SDK workaround.** The SDK normalises every MAC it sends (path and body), so assets it creates are always
  reachable; the migration guide says assets written under other keys by another client are not.

### USI-P2-11 — Bulk clear skips unresolved identifiers silently; `DL_016` is broader than documented

- **Observed.** `POST /assets/{namespace}/bulk-clear-declared` skips invalid MACs and external ids that resolve to
  no asset without a result row, so `success + failed` can be lower than the number of identifiers sent. `DL_016`
  is documented as "virtual MAC collision" but is answered for any failure to create a virtual asset.
- **Reproduction.** `POST /assets/{namespace}/bulk-clear-declared` with `{"external_ids":["<unknown id>"]}` →
  `200 {"success":0,"failed":0,"results":[]}`.
- **Expected.** One result row per identifier (`not_found`), and `DL_016` documented as it is used.
- **SDK workaround.** None in code; the JSDoc and the guide say unknown external ids get no result row.

### USI-P2-12 — Asset documents: undocumented and missing fields, unreachable status

- **Observed (the `virus_scan_*` part live).** `GET /assets/{namespace}/{mac_address}/documents/{documentId}` lacks
  the documented `virus_scan_status`, `virus_scan_date` and `virus_scan_engine`. The upload, list and delete
  responses have no schema in the spec. The list reads undocumented `sortBy`/`sortOrder` query parameters. A
  disallowed MIME type answers `400`; the documented `415` is not reachable at upload time.
- **Reproduction.** Upload a PNG, wait for the job, then `GET …/documents/{documentId}` → no `virus_scan_status`.
- **Expected.** The documented fields present; schemas for the three responses; `sortBy`/`sortOrder` documented;
  `415` for an unsupported type, or the spec documents `400`.
- **SDK workaround.** `AssetDocument` types the fields the server sends; the job result carries the scan state;
  `listPage()` accepts a `limit` from 1 to 500 and sends no sort parameters. Live check:
  `expectKnownServerIssue('USI-P2-12', …)` asserts `virus_scan_status` is absent from the document metadata.

### USI-P2-13 — Uploads above about 16 MiB fail with a 400 that is not a size error

- **Observed (not reproduced live).** Uploads above about 16 MiB fail with a `400` whose message is not a size
  error, although the documented PDF limit is 50 MB.
- **Reproduction.** Not run (live tests never upload more than 15 MB).
- **Expected.** Either the documented 50 MB limit works, or the limit is documented and answered with `413`.
- **SDK workaround.** `assetDocuments.upload()` rejects PDFs above 15 728 640 bytes locally (images keep the
  server's 10 485 760 bytes).

### USI-P2-14 — A document whose processing failed stays listed without versions

- **Observed.** A document whose processing fails for a reason other than a detected virus remains in the list and
  in `GET …/documents/{documentId}` with `availableVersions: []`; neither exposes the processing status.
- **Reproduction.** Upload a file whose processing fails, then list the documents → the document with
  `availableVersions: []`.
- **Expected.** The failed document hidden, or a processing status on the metadata.
- **SDK workaround.** None in code; the types document `availableVersions` as `[]` while pending or after a failure.

### USI-P2-15 — The PDF `thumbnail` is a one-page PDF

- **Observed.** For a PDF, the `thumbnail` version is the first page as a one-page PDF (`application/pdf`), not the
  "200px thumbnail" image the spec describes; it is missing when the PDF cannot be parsed.
- **Reproduction.** Upload a PDF, wait for the job, then `GET …/documents/{documentId}/download?version=thumbnail`
  → `Content-Type: application/pdf`.
- **Expected.** An image thumbnail as documented, or the spec documents the PDF rendition.
- **SDK workaround.** None needed in code; `download()` returns the stored content type and the JSDoc and the guide
  describe the rendition.

## Positions and spatial (P3)

### USI-P3-1 — Zone GET queries return no zones

- **Operation:** `GET /spatial/zones/{namespace}/containing-point`, `GET /spatial/zones/{namespace}/nearest-to-point`,
  `GET /spatial/zones/{namespace}/within-radius`
- **Kind:** server
- **Observed:** a valid point inside a zone → 200 JSON with the expected envelope, but `containing_zones` / `zones`
  is always an empty array, while the counter `total_zones` still counts the zones found.
- **Expected:** the zones that contain, are nearest to, or lie within the radius of the point, as the operation
  descriptions state.
- **Impact:** breaks — the three zone lookups are unusable; an integrator sees "no zone" for a point that is inside
  one.
- **SDK handling:** documented in JSDoc and guide; the guide recommends `spatial.analyzeCustomZones()` over the
  features of `zones.list()` and `spatial.zoneDistances()`, which compute correctly.
- **Evidence:** live tests of `test/integration/positions-spatial/spatial.int.test.ts` (containing point, nearest
  zones, zones within a radius) asserting it via `expectKnownServerIssue`.

### USI-P3-2 — POI GET queries return no POIs

- **Operation:** `GET /spatial/pois/{namespace}/nearest-to-point`, `GET /spatial/pois/{namespace}/within-radius`,
  `GET /spatial/pois/{namespace}/by-tag`
- **Kind:** server
- **Observed:** the result is empty as in USI-P3-1, and venue POIs, which are GeoJSON Features carrying
  `coordinates` and `tags` under `properties`, are not matched by the location search or the tag filter; matching
  POIs are skipped.
- **Expected:** the POIs nearest to the point, within the radius, or carrying the tag.
- **Impact:** breaks — the three POI lookups cannot return a venue POI.
- **SDK handling:** documented in JSDoc and guide; the guide recommends `venues.listPois({ tag })` and
  `spatial.analyzeCustomPois()` over the features of `venues.listPois()`.
- **Evidence:** unit fixture only (not reproduced live): the venue of the test namespace lists no POI, so the live
  empty results of `spatial.int.test.ts` (shape assertions only) do not by themselves show the defect.

### USI-P3-6 — POST spatial routes reject a coordinate of exactly 0

- **Operation:** `POST /spatial/zones/{namespace}/analyze-custom`, `POST /spatial/zones/{namespace}/calculate-distances`,
  `POST /spatial/pois/{namespace}/analyze-custom`
- **Kind:** server
- **Observed:** a `reference_point` with `lat` or `lon` equal to `0` → 400 `{"error":"Reference point with lat and
  lon is required"}`; a custom POI with a 0 coordinate is silently dropped from the analysis.
- **Expected:** 0 is a valid latitude (equator) and longitude (prime meridian).
- **Impact:** breaks — sites on the equator or the Greenwich meridian cannot be analysed.
- **SDK handling:** documented in JSDoc and guide.
- **Evidence:** live test `test/integration/positions-spatial/spatial.int.test.ts › a 0 coordinate is rejected by the
  POST routes` asserting it via `expectKnownServerIssue`.

### USI-P3-3 — POI statistics leave `tags` and `venues` empty

- **Operation:** `GET /spatial/pois/{namespace}/statistics`
- **Kind:** server
- **Observed:** `total_pois` and `levels` count the venue POIs, but `tags` and `venues` stay `{}` for GeoJSON
  Feature POIs.
- **Expected:** counts per tag and per venue.
- **Impact:** misleads — a dashboard built on `tags` shows no tag usage.
- **SDK handling:** documented in JSDoc and guide.
- **Evidence:** unit fixture only (not reproduced live: the venue of the test namespace lists no POI, and the live
  test asserts that the counts agree at 0).

### USI-P3-7 — Out-of-range coordinates and missing options answer 500

- **Operation:** the five zone routes (`GET containing-point`, `nearest-to-point`, `within-radius`,
  `POST calculate-distances`, `analyze-custom`), the POI GET routes and `POST /spatial/pois/{namespace}/analyze-custom`
- **Kind:** server
- **Observed:** a latitude outside −90…90 or a longitude outside −180…180 → 500 `{"error": …}`; custom-POI
  `within-radius` without `options.radius`, and an unknown `operation`, → 500.
- **Expected:** 400 with a validation message, as for the other invalid parameters of the same routes.
- **Impact:** misleads — a client error is reported as a server failure and may be retried.
- **SDK handling:** workaround: the SDK validates coordinates and the custom-POI radius locally and throws
  `ValidationError` (status 0) before any request.
- **Evidence:** unit fixture only (the SDK prevents the request live; the live tests of `spatial.int.test.ts` assert
  the local rejection).

### USI-P3-8 — Nearest assets: the fallback search finds nothing and `max_age` is applied after `limit`

- **Operation:** `GET /api/spatial/assets/:namespace/nearest-to-point` (real path
  `/spatial/assets/{namespace}/nearest-to-point`)
- **Kind:** server
- **Observed:** when no last known position is left after filtering, the operation falls back to a search of the
  position history that yields no assets; `max_age` filters the last known positions after `limit` has cut the
  list, so fewer than `limit` fresh assets can come back while more exist.
- **Expected:** the `limit` nearest assets that satisfy `max_age`; a fallback that returns stored positions.
- **Impact:** misleads — results can be short or empty although matching assets exist.
- **SDK handling:** documented in JSDoc and guide (pass `maxAge`, and a larger `limit` when the result must hold
  `limit` fresh assets).
- **Evidence:** unit fixture only (not deterministically reachable live).

### USI-P3-10 — Response schemas and request constraints missing from the spec

- **Operation:** the ten zone and POI operations of `Spatial Analysis`; `POST /spatial/zones/{namespace}/analyze-custom`,
  `POST /spatial/pois/{namespace}/analyze-custom`; `GET /cache/{app_namespace}/positions` and
  `…/positions/{mac_address}`; `GET /es/last_positions/{appNamespace}`, `GET /es/position_history/{appNamespace}`;
  `POST /es/query/{appNamespace}/{dataType}`; `GET /spatial/assets/{namespace}/nearest-to-point` and
  `…/nearest-realtime`
- **Kind:** spec-gap
- **Observed:** no 200 schema for the ten zone/POI operations; the analyze-custom bodies mark no property as
  required; `CachedAssetPosition` lacks `user_uuid` and `user_type`; `AssetPosition` lacks `origin_detail`,
  `declared_location`, `is_virtual`, `battery_percent` and `span`; `SpatialAssetItem.zone` lacks `tags` (a string
  array on every item of both live nearest-asset fixtures); the `/es/query` description does not say that some query
  constructs are rejected with 400, that `size` has a default and an upper limit, or that a search can come back
  partial and without `hits.total`.
- **Expected:** every 2xx body and request constraint described.
- **Impact:** misleads — generated types are empty or incomplete, and valid-looking queries are rejected or
  silently truncated.
- **SDK handling:** hand-written result and option types (`SpatialAssetItem` extends the generated schema with
  `zone.tags`); the query rules a client meets are documented in JSDoc and guide.
- **Evidence:** contract test (`npm run test:contract -- --phase P3`; fixtures the spec cannot describe carry a note
  on their source); `spatial-assets-nearest.json` / `spatial-assets-realtime.json` (validate as `_source: spec`
  because the schema allows extra properties) and a nearest-assets unit test.

### USI-P3-12 — Spatial zone and POI queries use only the first venue

- **Operation:** the ten zone and POI operations of `Spatial Analysis`
- **Kind:** server
- **Observed:** the routes read the zones and POIs of the namespace's first venue only and take no venue parameter;
  when the venue data cannot be read they answer with sample geometry that is not the namespace's, instead of an
  error.
- **Expected:** a venue parameter (or every venue), and an error when the geometry cannot be read.
- **Impact:** misleads — in a multi-venue namespace the other venues are invisible, and a backend error looks like
  valid data.
- **SDK handling:** documented in the guide.
- **Evidence:** unit fixture only (the test namespace has one venue; `spatial.int.test.ts` records the venue count).

### USI-P3-9 — `POST /es/query` answers 500 for an invalid data type

- **Operation:** `POST /es/query/{appNamespace}/{dataType}`
- **Kind:** server
- **Observed:** an unknown `dataType` → 500 `{"error":"Invalid dataType: …"}`.
- **Expected:** 400 for an unknown path value.
- **Impact:** friction — a typo looks like a server failure.
- **SDK handling:** `EsDataType` is the spec enum (`alerts`, `positions`, `zone_visits`), so a typed call cannot
  send another value; documented in JSDoc and guide.
- **Evidence:** live test `test/integration/positions-spatial/query.int.test.ts › an invalid data type answers 500`
  asserting it via `expectKnownServerIssue`.

### USI-P3-13 — `limit` on zone nearest-to-point is applied twice; `hasMore` is not meaningful

- **Operation:** `GET /spatial/zones/{namespace}/nearest-to-point`
- **Kind:** server
- **Observed:** `limit` cuts the list once in the search and once in the response pagination, so `hasMore` does not
  say whether more zones exist.
- **Expected:** one cut; `hasMore` true only when more zones match.
- **Impact:** friction — `hasMore` cannot drive paging.
- **SDK handling:** `hasMore` is optional in the result types and documented as not meaningful there.
- **Evidence:** unit fixture only (hidden live by USI-P3-1).

## Venues and navigation (P4)

### USI-P4-3 — Paging keys change the body of the venue list and maps

- **Operation:** `GET /venues/{namespace}`, `GET /venues/{namespace}/{venueId}/maps`
- **Kind:** server
- **Observed:** with `limit` or `page` the array becomes `{ data, pagination: { page, limit, total, totalPages, hasNext, hasPrev } }`,
  with `total` computed on the already-sliced page; a `page` key also empties the result; `order` is overridden;
  sort combined with paging is page-local; `offset` alone caps the result at 100.
- **Expected:** one body shape per operation, totals over the whole result, documented paging keys.
- **Impact:** breaks — paging through venues or maps gives wrong totals and wrongly ordered pages.
- **SDK handling:** workaround in `venues.list`, `venues.listMaps`: no paging or sort key is ever sent; the
  envelope is still unwrapped defensively.
- **Evidence:** live capture (raw `limit=1` → envelope); fixture `venues-list-envelope.json`; unit test of the
  envelope unwrapping.

### USI-P4-4 — Documented query shorthands empty the result on venue routes

- **Operation:** `GET /venues/{namespace}`, `…/{venueId}/maps`, `…/zones`, `…/pois`, `…/paths`
- **Kind:** server
- **Observed:** a key other than the filter forms and the paging keys (`logic`, `type`, `level`, `fields`, a
  `field:op:value` key, …) is not honoured: the answer is an empty result; `logic=AND` therefore empties the
  result.
- **Expected:** the documented `type` (POIs) and `level` (paths) shorthands and `logic` work; unknown keys are ignored or rejected.
- **Impact:** breaks — the spec-documented shorthands return nothing.
- **SDK handling:** workaround: the SDK sends only `filters=<JSON>`; `level`, `tag`, `nodeType` shorthands are
  translated to `properties.*` filters; no OR offered.
- **Evidence:** unit tests of the venue routes (the unrecognised keys are absent from every request); live filter
  tests of `venues.int.test.ts` and `zones.int.test.ts`.

### USI-P4-7 — Navigation without `venueId` routes on a sample graph

- **Operation:** all `POST`/`GET /spatial/navigate/{namespace}/…` routing operations
- **Kind:** server
- **Observed:** without `venueId` the server routes on a sample graph and still answers `dataSource: 'real'`; with a
  `venueId` that names no venue, node-id calls answer 500 and coordinate calls 404.
- **Expected:** `venueId` documented and required, or the namespace's venue used; `dataSource` truthful; an unknown
  venue reported as such.
- **Impact:** breaks — a client following the spec receives routes over a graph that is not its site.
- **SDK handling:** workaround: every navigation method sends `venueId` (call or client) and throws `ContextError` without it.
- **Evidence:** unit tests of the navigation resource (every request asserted to carry `venueId`).

### USI-P4-8 — Navigation spec components are stale

- **Operation:** `POST /spatial/navigate/{namespace}/shortest-path`, `…/accessible-path`, `…/multi-stop`, `GET …/nearest-poi/{nodeId}`, `GET …/evacuation/{nodeId}`, `GET /venues/{namespace}/{venueId}/paths`
- **Kind:** spec
- **Observed:** request and response components are `$ref`s with ignored sibling properties, so generated types do
  not match the bodies; orphan `PathNode`/`PathSegment` components; the paths operation documents no segment property.
- **Expected:** request and response schemas that describe the wire bodies.
- **Impact:** breaks — generated clients send and read the wrong fields.
- **SDK handling:** hand-written types (`src/types/navigation.ts`, `src/types/geojson.ts`), each commented.
- **Evidence:** vendored specification; fixtures `shortest-path.json`, `multi-stop.json`, `paths.json`.

### USI-P4-13 — Multi-stop: failing and silent algorithm behaviour

- **Operation:** `POST /spatial/navigate/{namespace}/multi-stop`
- **Kind:** server
- **Observed:** `algorithm: 'genetic'` (in the spec enum) → 404 `{ success: false, message }`; unknown algorithm
  values silently run nearest-neighbour; failed legs are skipped under `success: true`; `dataSource` is always
  `'real'`; with `optimizeOrder` and `returnToStart`, `multiStopInfo.roundTripInfo.returnDistance` is 0 while
  `distance` includes the return; `accessibilityProfile` ignored.
- **Expected:** every documented algorithm works, unknown values are rejected, failed legs fail the call, the return distance is reported.
- **Impact:** breaks — a documented option always fails and a gapped route reports success.
- **SDK handling:** `genetic` not offered (`TspAlgorithm`); quirks documented in JSDoc and guide.
- **Evidence:** live tests `navigation.int.test.ts › multiStop genetic fails` and `… round trip ends at A; returnDistance is 0 …` via `expectKnownServerIssue`.

### USI-P4-15 — Evacuation usually finds no exit

- **Operation:** `GET /spatial/navigate/{namespace}/evacuation/{nodeId}`
- **Kind:** server
- **Observed:** emergency-exit nodes of the venue's path graph are not found as exits, so the call usually answers
  404 `{ success: false, message: 'No evacuation routes available', critical: true }`; `preferStairs`, `maxExits`,
  `accessible` ignored; response differs from the spec; `venueId` (undocumented) needed.
- **Expected:** emergency-exit nodes of the path graph are found; documented parameters apply.
- **Impact:** breaks — evacuation routing is unavailable on venues whose exits are path nodes.
- **SDK handling:** documented; `NavigationFailureBody.critical` typed; `venueId` always sent.
- **Evidence:** live test `navigation.int.test.ts › evacuationRoute: …` via `expectKnownServerIssue`.

### USI-P4-1 — Venue list items lack the advertised `location` and `metadata`

- **Operation:** `GET /venues/{namespace}`
- **Kind:** spec
- **Observed:** 200 array of `{ id, name, address, coordinates, hasMetadata, lastUpdated, statistics }`; no item
  carries `location` or `metadata`.
- **Expected:** the item schema and the filter examples of the operation name `location` and `metadata`.
- **Impact:** misleads — code written from the spec reads fields that never exist, and filters on them never match.
- **SDK handling:** `VenueSummary` types the returned keys only; documented in the guide.
- **Evidence:** live test `venues.int.test.ts › list: typed items, no location/metadata, …` via `expectKnownServerIssue`.

### USI-P4-2 — Unknown venue id answers 200 with a stub

- **Operation:** `GET /venues/{namespace}/{venueId}`
- **Kind:** server
- **Observed:** an id that names no venue → 200 `{ id, statistics: { zones: 0, pois: 0, pathNodes: 0, pathSegments: 0, floors: [] } }`.
- **Expected:** 404, as the spec documents.
- **Impact:** misleads — a typo in a venue id looks like an empty venue.
- **SDK handling:** documented in JSDoc and guide; `VenueDetails.name` and `coordinates` optional; not converted.
- **Evidence:** live test `venues.int.test.ts › get: details of the discovered venue; unknown id answers the stub` via `expectKnownServerIssue`; fixture `venue-unknown.json`.

### USI-P4-6 — Map-level zones and POIs serve a sample dataset

- **Operation:** `GET /venues/{namespace}/{venueId}/maps/{mapId}`, `…/maps/{mapId}/zones`, `…/maps/{mapId}/pois`
- **Kind:** server
- **Observed:** a real venue map → zones `{ type: 'FeatureCollection', features: [], total: 0 }`, POIs
  `{ items: [], total: 0 }` (not GeoJSON); the single-map route answers 404 `{ error: 'Map not found' }`.
- **Expected:** the venue's own map data, POIs as GeoJSON like the venue-level route.
- **Impact:** misleads — the routes look empty for every real namespace.
- **SDK handling:** `zones.listByMap*`, `venues.listMapPois` deprecated with the replacement named;
  `listMapPoisAsArray` removed; the single-map route is not wrapped.
- **Evidence:** live tests `venues.int.test.ts › listMapPois: …` and `zones.int.test.ts › listByMap / listByMapAsArray: …` via `expectKnownServerIssue`.

### USI-P4-9 — Route options are ignored

- **Operation:** `POST /spatial/navigate/{namespace}/shortest-path`, `…/accessible-path`
- **Kind:** server
- **Observed:** only `walkingSpeed` and `returnToStart` change the result; `algorithm`, `accessibilityProfile`,
  `avoidElevators`, `avoidStairs`, `useClosestNode`, `simplify` have no effect.
- **Expected:** the documented options apply, or are not documented.
- **Impact:** misleads — an integrator believes stairs or elevators are avoided.
- **SDK handling:** the ignored options are not offered (`ShortestPathRequest` has none of them).
- **Evidence:** type test of `ShortestPathRequest`; unit test asserting the exact request body.

### USI-P4-10 — Unknown node id answers 500; snapping failure carries a misleading error code

- **Operation:** `POST /spatial/navigate/{namespace}/shortest-path`, `…/accessible-path`
- **Kind:** server
- **Observed:** an unknown start or end node id → 500 `{ error: 'Start node <id> not found' }` / `'End node <id> not found'`;
  a point with no node within 100 m → 404 `{ success: false, message: 'No node found near start position (…)', error: 'Navigation service not initialized' }`.
- **Expected:** 400 for an unknown node, as the spec documents; an error code that names the failure.
- **Impact:** misleads — a client error is reported as a server failure and may be retried.
- **SDK handling:** `ServerError` / `NotFoundError` with the message from `message` (the code in `apiCode`); documented.
- **Evidence:** live test `navigation.int.test.ts › shortestPath unknown node answers 500` via `expectKnownServerIssue`; fixtures `nav-500-unknown-node.json`, `nav-404-snap.json`.

### USI-P4-14 — Nearest POI matches the first tag and can miss POI nodes

- **Operation:** `GET /spatial/navigate/{namespace}/nearest-poi/{nodeId}`
- **Kind:** server
- **Observed:** `poiType` is matched against a POI's first tag (or a path node's `poi_type`), plus `all`/`any`, not
  the documented node types; `maxResults`, `maxDistance`, `accessibilityProfile` ignored; the response differs from
  the spec; `venueId` (undocumented) is needed; intermittently the POI nodes are missing →
  404 `{ success: false, message: 'No POIs of type <t> found' }`.
- **Expected:** the documented parameters and response; POI lookups that answer consistently.
- **Impact:** misleads — documented type values never match.
- **SDK handling:** `NearestPoiOptions.poiType` documented as first tag or `all`; `venueId` always sent.
- **Evidence:** live test `navigation.int.test.ts › nearestPoi 'all': …` via `expectKnownServerIssue`.

### USI-P4-16 — Level-0 POIs are placed on level −1 in the routing graph

- **Operation:** `GET /spatial/navigate/{namespace}/nearest-poi/{nodeId}`
- **Kind:** server
- **Observed:** POI nodes of level 0 are placed on level −1, so level-0 lookups and routes to them misbehave.
- **Expected:** POI nodes keep their level.
- **Impact:** misleads — ground-floor POIs are reported on the wrong floor.
- **SDK handling:** documented in the guide.
- **Evidence:** unit fixture only (not reproduced live: the test namespace has no POI).

### USI-P4-18 — Zone presence returns one asset and narrows by key oddly

- **Operation:** `GET /es/zone_presence/{appNamespace}`
- **Kind:** server
- **Observed:** the result holds one asset only: the one whose udid equals `value` (without `value`, the asset with
  the most position records); a `key` other than `user.udid` returns `[]`; `value` must equal the stored udid
  exactly (12 lowercase hex); the slot zone comes from an arbitrary position of the slot; calendar intervals fail
  with 500; the summary says "assets"; no 200 schema is documented.
- **Expected:** the documented multi-asset timeline, `key` honoured, case-insensitive MACs, a 200 schema.
- **Impact:** misleads — callers expect several assets and get one.
- **SDK handling:** MAC normalised; `key` deprecated; intervals checked locally; `ZonePresenceSlot` typed.
- **Evidence:** live test `zones.int.test.ts › getPresence semantics: …` via `expectKnownServerIssue`; fixture `zone-presence.json`.

### USI-P4-19 — Venue list answers 200 `[]` when the venue data cannot be read

- **Operation:** `GET /venues/{namespace}`
- **Kind:** server
- **Observed:** a server-side failure to read the venue data is reported as 200 with an empty array.
- **Expected:** a 5xx status.
- **Impact:** misleads — an outage looks like a namespace without venues.
- **SDK handling:** documented; not detectable client-side.
- **Evidence:** unit fixture only (not reproduced live).

### USI-P4-5 — GeoJSON venue routes ignore paging and sort without a filter

- **Operation:** `GET /venues/{namespace}/{venueId}/zones`, `…/pois`, `…/paths`
- **Kind:** server
- **Observed:** without a filter the full collection is returned and `limit`, `offset`, `sort`, `order` are ignored;
  with a filter `total` (and with paging `hasMore`) is added.
- **Expected:** paging and sort apply whether or not a filter is present.
- **Impact:** friction — a client cannot page a large collection unless it also filters.
- **SDK handling:** no paging offered on these methods; `total?`/`hasMore?` typed optional.
- **Evidence:** live capture of the zone collection; fixtures `zones.json`, `zones-filtered.json`.

### USI-P4-11 — Start point with latitude or longitude 0 is read as a node id

- **Operation:** `POST /spatial/navigate/{namespace}/shortest-path`, `…/accessible-path`
- **Kind:** server
- **Observed:** `start: { lat: 0, lon: 2.3 }` (or `lon: 0`) → 500 `{ error: 'Start node … not found' }`: the point is
  handled as if it were a node id.
- **Expected:** a coordinate start with a zero component is routed like any other point.
- **Impact:** friction — sites on the equator or the prime meridian cannot route from a point.
- **SDK handling:** workaround: rejected locally with `ValidationError` before any request.
- **Evidence:** unit test of the local guard; live test `navigation.int.test.ts › local guards: …`.

### USI-P4-20 — Spec hygiene on POI and navigation parameters

- **Operation:** `GET /venues/{namespace}/{venueId}/pois`, `GET /spatial/navigate/{namespace}/nearest-poi/{nodeId}`, `GET …/evacuation/{nodeId}`, `POST …/multi-stop`
- **Kind:** spec
- **Observed:** garbled examples on the nearest-POI and evacuation parameters; the `waypoints` alias of `stops` is
  undocumented; the POI `id` is typed string while the server emits the numeric external id when set, else the internal id.
- **Expected:** accurate examples, documented aliases, `id` typed `number | string`.
- **Impact:** friction — generated types reject numeric POI ids.
- **SDK handling:** `POIProperties.id: number | string`; the SDK sends `stops` only.
- **Evidence:** fixture `pois.json` (written by hand: no live POI body is available); vendored specification.

### USI-P4-21 — `GET /venues/cache/stats` is expected to be unreachable

- **Operation:** `GET /venues/cache/stats`
- **Kind:** server
- **Observed:** not observed live: the operation was not called. In the specification the path also matches the
  venue-details operation `GET /venues/{namespace}/{venueId}` (`cache` as the namespace, `stats` as the venue id),
  so a request is expected to reach that operation instead.
- **Expected:** the response the specification documents for this route.
- **Impact:** friction — the documented route is expected not to be callable.
- **SDK handling:** none (the SDK does not wrap this operation).
- **Evidence:** vendored specification; not called live.

### USI-P4-12 — Accessible routing gives no reliable guarantee

- **Operation:** `POST /spatial/navigate/{namespace}/accessible-path`
- **Kind:** server
- **SDK handling:** the SDK documents that this operation gives no reliable accessibility guarantee and excludes it
  from client retries.

### USI-P4-17 — Snapping and POI lookups intermittently fail for valid input

- **Operation:** `POST /spatial/navigate/{namespace}/shortest-path`, `…/multi-stop`, `GET …/nearest-poi/{nodeId}`
- **Kind:** server
- **SDK handling:** the SDK documents a single retry of these calls for valid input, and its examples validate each
  route before use.

## Dashboards, alert rules, settings (P5)

### USI-P5-1 — `AlertRule` schema does not describe the stored rule

- **Operation:** `GET /alert_rules/{app_namespace}`, `POST /alert_rules/{app_namespace}`
- **Kind:** spec
- **Observed:** the spec's `AlertRule` has `id, name, type, enabled, conditions, actions` and the POST body is
  typed as an array; the stored and evaluated document is `{ name, rules }` with rules `{ id, conditions, event,
  disabled?, priority? }`. The spec's own GET example already uses the real shape and fails its own schema.
- **Expected:** a `{ name, rules }` schema with the rule shape the server evaluates.
- **Impact:** harmful — a client generated from the spec writes a bare array, which switches off every rule of
  the namespace (what SDK 0.2.0 did).
- **SDK handling:** hand-written `AlertRule` / `AlertRuleSet` types; `alerts.saveRules` writes `{ name, rules }`.
- **Evidence:** vendored specification; unit tests of the alert-rule resource; live test
  `alert-rules.read.int.test.ts`.

### USI-P5-2 — Alert-rule writes are neither validated nor versioned

- **Operation:** `POST /alert_rules/{app_namespace}`
- **Kind:** server
- **Observed:** any JSON is stored: a bare array, `{}` or one malformed enabled rule silently stops all alerting.
  There is no version or ETag, so concurrent writers lose updates.
- **Expected:** a 400 for a document the server cannot evaluate; an optimistic-concurrency token.
- **Impact:** harmful — one bad write disables alerting with a 200 answer.
- **SDK handling:** blocking client-side validation (`validateAlertRuleSet`) before every write; last-writer-wins
  documented in the guide and the JSDoc.
- **Evidence:** unit tests of `validateAlertRuleSet`; not reproduced live.

### USI-P5-3 — One invalid rule disables every rule of the namespace

- **Operation:** `POST /alert_rules/{app_namespace}` (effect on evaluation)
- **Kind:** server
- **Observed:** when one enabled rule of the set cannot be evaluated, no rule of the namespace fires for that
  event.
- **Expected:** an invalid rule is skipped and reported; the others keep firing.
- **Impact:** harmful — a single mistake in the rule editor or an API write stops all alerts.
- **SDK handling:** `validateAlertRuleSet` rejects, before every write, each rule shape that stops evaluation.
- **Evidence:** unit tests of `validateAlertRuleSet`; not reproduced live.

### USI-P5-9 — `PUT` clears `dynamicVariables` for any non-array value

- **Operation:** `PUT /dashboards/{id}`
- **Kind:** server
- **Observed:** a present `dynamicVariables` that is not an array, `null` included, clears the variables.
- **Expected:** 400 for a non-array value; only `[]` clears.
- **Impact:** harmful — a `null` from a careless client deletes dashboard configuration.
- **SDK handling:** the SDK rejects `null` (and every non-array) client-side.
- **Evidence:** unit tests of `dashboards.update`; not reproduced live.

### USI-P5-10 — A dashboard created with `data: {}` becomes un-updatable

- **Operation:** `POST /dashboards`, `PUT /dashboards/{id}`
- **Kind:** server
- **Observed:** a dashboard created with `data: {}` is returned without a `data` key, and every later update then
  fails with `Validation error`. Reproduced live.
- **Expected:** `data: {}` is stored as given, or rejected at create time.
- **Impact:** harmful — a dashboard that cannot be saved again.
- **SDK handling:** `create()` defaults `data` to `[]`; `create()` and `update()` reject `data: {}` client-side;
  `Dashboard.data` is optional, because documents stored with `{}` (0.2.0 `create()` sent it by default) have none.
- **Evidence:** live test `dashboards.write.int.test.ts`.

### USI-P5-5 — Share permission `'view'` is in the spec enum but rejected

- **Operation:** `POST /dashboards/{id}/share`
- **Kind:** spec
- **Observed:** the spec enum is `['view', 'edit']`; the server accepts only `'edit'`, so `permissions: ['view']`
  gives 400 `Validation error`. Reproduced live.
- **Expected:** the enum lists only the values the server accepts.
- **Impact:** friction — following the spec gives a 400.
- **SDK handling:** the SDK accepts `'view' | 'edit'`, drops `'view'` and sends `'edit'` only when it is given.
- **Evidence:** unit tests of `dashboards.share`; live test `dashboards.write.int.test.ts`.

### USI-P5-6 — Dashboard schema differs from the response

- **Operation:** every `/dashboards` operation
- **Kind:** spec
- **Observed:** `data` is typed `object` while the product UI stores an array of widgets; `dynamicVariables` items
  are untyped; `__v`, the share-entry `_id`, `selected` and `can_edit` are undocumented; `shared_with` and
  `selected_by` are absent from some responses, which the schema does not say.
- **Expected:** the schema of the returned document, including the computed fields and the optional keys.
- **Impact:** friction — generated types reject real responses.
- **SDK handling:** hand-written `Dashboard` types.
- **Evidence:** vendored specification; dashboard fixtures; live test `dashboards.read.int.test.ts`.

### USI-P5-8 — Malformed or oversized bodies on `/dashboards` get a non-JSON error

- **Operation:** `POST /dashboards`, `PUT /dashboards/{id}`
- **Kind:** server
- **Observed:** malformed JSON (400) and a body over 100 kB (413) answer with a non-JSON body.
- **Expected:** the `{ error }` JSON body of every other error.
- **Impact:** friction — clients must parse two error formats.
- **SDK handling:** the transport maps 413 to `PayloadTooLargeError` without markup in the message.
- **Evidence:** unit tests of the dashboard resource; not reproduced live.

### USI-P5-11 — `GET /es/alerts`: `size` handling and response schema

- **Operation:** `GET /es/alerts/{appNamespace}`
- **Kind:** server and spec
- **Observed:** `size=0` silently becomes 100 and invalid values are not rejected with 400; the item schema omits
  `zone`; the exclusion of `set_variable` events is undocumented.
- **Expected:** 400 for an invalid `size`; `zone` in the schema; the exclusion documented.
- **Impact:** friction
- **SDK handling:** `size` validated client-side (integer 1…10 000; the upper bound is an SDK limit); `AlertEvent`
  typed with `zone`.
- **Evidence:** unit tests of `alerts.list`; live test `alerts-settings-health.int.test.ts`.

### USI-P5-12 — `GET /settings`: undocumented key and defaults

- **Operation:** `GET /settings/{app_namespace}`
- **Kind:** spec
- **Observed:** the response carries `tagActions`, which the spec does not list, and the spec omits the server
  defaults (`positionsExpirationPeriod` 60 s, `accuracy` `{ accuracy_meter: 5, show: false }`).
- **Expected:** `tagActions` and the defaults documented.
- **Impact:** friction
- **SDK handling:** `NamespaceSettings` typed with `tagActions`; JSDoc states the defaults.
- **Evidence:** vendored specification; live test `alerts-settings-health.int.test.ts` (key names and types only).

### USI-P5-14 — Some error bodies carry no `Content-Type`

- **Operation:** `POST /alert_rules/{app_namespace}`, `GET /settings/{app_namespace}` and some other routes
- **Kind:** server
- **Observed:** error bodies of these operations are plain text without a `Content-Type` header.
- **Expected:** `text/plain`, or the `{ error }` JSON body of the rest of the API.
- **Impact:** friction — clients cannot tell the body format from the headers.
- **SDK handling:** the transport reads a body without `Content-Type` as text (`message` = text).
- **Evidence:** a read-only request answering 404 without `Content-Type`; unit tests of the alert-rule resource.

### USI-P5-4 — Template syntax in alert rules

- **Operation:** `POST /alert_rules/{app_namespace}`
- **Kind:** server
- **SDK handling:** `validateAlertRuleSet` checks the template syntax of every rule before each write.

### USI-P5-7 — Type checks on dashboard fields

- **Operation:** `POST /dashboards`, `PUT /dashboards/{id}`, `POST /dashboards/{id}/unshare`
- **Kind:** server
- **SDK handling:** client-side guards check the type of every dashboard text field and user name before the
  request.

### USI-P5-13 — Operation metadata in the specification

- **Operation:** every operation of this domain
- **Kind:** spec
- **SDK handling:** none needed. Details are not published here.

## Notifications (P6)

### USI-P6-12 — Export truncates at 10 000 rows without a signal

- **Operation:** `GET /notifications/{namespace}/export`
- **Kind:** server
- **Observed:** CSV and JSON exports stop at 10 000 rows with no header, status or marker; `limit`, `offset` and
  `group_by` are ignored.
- **Expected:** a truncation signal (header or status) or paging.
- **Impact:** data loss risk — for consumers that treat the export as complete.
- **Reproduction:** export a namespace with more than 10 000 matching items.
- **SDK handling:** JSDoc on `export`; the guide recommends `iterate()` for complete reads.

### USI-P6-2 — The list defaults to thread roll-ups; filters and grouping are undocumented

- **Operation:** `GET /notifications/{namespace}`
- **Kind:** spec
- **Observed:** without `group_by` the list returns group rows (`group_key`, `item_ids`, `count`, …), while the
  specification declares an array of notifications. The filters `zone`, `asset`, `thread_key`, `pinned`, `from`,
  `to` and the `group_by` values (`thread`, `type`, `zone`, `asset`, `flat`) are not documented. A grouped
  response covers only the current page of items.
- **Expected:** the default response matches the declared schema (or the declared schema describes the group
  rows), and every accepted parameter is documented, including that groups cover one page.
- **Impact:** misleads — a generated client mis-types the default response; grouped counts look like totals.
- **Reproduction:** `await client.transport.request<unknown>('GET', '/notifications/{namespace}', { params: { namespace } })`
  returns group rows.
- **SDK handling:** `list()` always sends `group_by=flat`; `listGroups()` is typed separately and documents the
  one-page scope.

### USI-P6-5 — Mute and snooze are markers only

- **Operation:** `POST /notifications/{namespace}/{id}/mute`, `POST /notifications/{namespace}/{id}/snooze`,
  `POST /notifications/{namespace}/bulk` (`mute`, `snooze`)
- **Kind:** server
- **Observed:** a snoozed item is neither hidden nor resurfaced; `snooze_until` is only stored. Muting sets a
  `muted` flag and suppresses nothing: the `until` of the per-item mute route has no effect, there is no unmute,
  and no operation removes a per-item mute. Muted and snoozed items stay in the default list and in
  `unread_count`.
- **Expected:** snoozed items are hidden from the default list until `snooze_until` and then resurface unread;
  muted threads produce no new unread items until `until`; both can be undone.
- **Impact:** misleads — the names promise behaviour the server does not implement.
- **Reproduction:** `await client.notifications.snooze(id, Date.now() + 600_000);` then
  `await client.notifications.list()` still contains the item.
- **SDK handling:** per-item mute is not wrapped (it cannot be undone); `snooze()` and the bulk `mute` / `snooze`
  actions are documented as markers. Live: `inbox.int.test.ts`.

### USI-P6-8 — Specification gaps in the notification operations

- **Operation:** the 39 `Notifications` operations
- **Kind:** spec
- **Observed:** 10 operations lack a `requestBody`; 9 responses are untyped; 8 object fields have no properties
  (`zone`, `asset`, `mission`, `params`, …); 4 response objects carry stray keys (bulk 400, send 429,
  connections 400, tenant-config PUT 200); 401, 404, 413 and 500 responses are missing; the bulk description is
  stale; the stream response is typed as `string`.
- **Expected:** every operation documents its body, its responses and their schemas.
- **Impact:** misleads — generated clients cannot call most write operations with a typed body.
- **Reproduction:** read `spec/rtls-api.swagger.json` (vendored) under the `Notifications` tag.
- **SDK handling:** hand-written types in `src/types/notifications.ts`; fixtures that differ from the
  specification name their source in `_source`.

### USI-P6-10 — Bulk acknowledge with `filter.kind` acknowledges direct messages

- **Operation:** `POST /notifications/{namespace}/bulk` (`acknowledge`)
- **Kind:** server
- **Observed:** bulk `acknowledge` is restricted to actionable kinds (alert, mission) unless the filter sets
  `kind`; then it acknowledges any kind, including direct messages, which the single-item route refuses with 409
  `not_actionable`.
- **Expected:** bulk and single-item acknowledge apply the same rule.
- **Impact:** misleads — direct messages end up acknowledged, which the UI never allows.
- **Reproduction:** `bulk({ filter: { kind: 'direct_message', thread_key }, action: 'acknowledge' })` reports the
  direct messages as affected.
- **SDK handling:** JSDoc on `bulk`.

### USI-P6-3 — The stream's `unread_count` event carries no counts

- **Operation:** `GET /notifications/{namespace}/stream`
- **Kind:** server
- **Observed:** the `unread_count` event carries `{ action, affected }` of a bulk change, and only bulk changes
  emit it; single-item changes, sends and bulk undo do not signal a count change.
- **Expected:** the event carries the new counts (`{ unread, needs_action }`) and is emitted on every change of
  them.
- **Impact:** friction — a badge must re-fetch `unreadCount()` on several event types.
- **Reproduction:** keep a `stream({ signal })` open and run `bulk({ thread_key, action: 'read' })`; the event
  data is `{ action: 'read', affected: n }`.
- **SDK handling:** typed as sent; the guide re-fetches `unreadCount()` on `unread_count`, `state`, `item` and
  `reconnected`. Live: `inbox.int.test.ts`.

### USI-P6-7 — `/send` ignores context fields and most recipient types

- **Operation:** `POST /notifications/{namespace}/send`
- **Kind:** spec
- **Observed:** `zone`, `asset` and `rule_id` in the body are ignored, so sent items cannot be filtered or
  grouped by zone or asset. Recipients of type `role`, `team` and `agent` are accepted by the schema but not
  resolved (only `user` is). `kind` is required by the specification but defaults to `direct_message`;
  `mission_id` and `event_type` are accepted but undocumented.
- **Expected:** the specification documents what the route resolves and accepts; context fields are either
  stored or rejected.
- **Impact:** friction — callers expect zone grouping and role fan-out that never happen.
- **Reproduction:** `send({ recipients: [{ target_type: 'role', id: 'r' }] } as never)` answers 400
  `no_resolvable_recipients`.
- **SDK handling:** the types expose only what works (`target_type: 'user'`, no `zone` / `asset`); the guide puts
  context in `params`.

### USI-P6-9 — Rule PATCH cannot clear `channels` and replaces `match`; mapping PATCH answers undocumented 400

- **Operation:** `PATCH /notifications/{namespace}/rules/{id}`, `PATCH /notifications/{namespace}/recipient-mappings/{id}`
- **Kind:** server
- **Observed:** `channels: []` in a rule PATCH is ignored (the channels stay); `match` is replaced wholesale
  rather than merged. A recipient-mapping PATCH answers 400 on invalid values, which the specification does not
  declare.
- **Expected:** `channels: []` clears the channels (or is rejected); the merge semantics and the 400 response are
  documented.
- **Impact:** friction — a rule's channels cannot be removed without deleting the rule.
- **Reproduction:** `const r = await client.notifications.rules.update(id, { channels: [] }); r.channels // unchanged`
- **SDK handling:** JSDoc on `rules.update` and `recipientMappings.update`. Live: `settings.int.test.ts`.

### USI-P6-14 — CORS exposes only one custom header

- **Operation:** `GET /notifications/{namespace}` (`X-Total-Count`), `POST /notifications/{namespace}/send`
  (`Retry-After`)
- **Kind:** server
- **Observed:** cross-origin browsers cannot read `X-Total-Count` or `Retry-After`; only one custom header is
  exposed.
- **Expected:** both headers are listed in `Access-Control-Expose-Headers`.
- **Impact:** friction — in a browser on another origin `listPage().total` is `undefined` and a rate-limit error
  has no retry delay.
- **Reproduction:** `listPage()` from a web page on another origin.
- **SDK handling:** `OffsetPage.total` and `RateLimitError.retryAfter` are optional; JSDoc.

### USI-P6-1 — `source` of sent items

- **Operation:** `POST /notifications/{namespace}/send`
- **Kind:** server
- **SDK handling:** `NotificationItem.source` is typed and documented with the values the server sets.

### USI-P6-4 — Bulk filter validation

- **Operation:** `POST /notifications/{namespace}/bulk`
- **Kind:** server
- **SDK handling:** `bulk()` validates every filter before sending and refuses an invalid or non-selective filter
  with `ValidationError`.

### USI-P6-6 — Cleanup-policy writes

- **Operation:** `PUT /notifications/{namespace}/cleanup-policy`
- **Kind:** server
- **SDK handling:** `cleanupPolicy.replace()` requires both fields as integers ≥ 1 on every write, and the JSDoc and
  the guide describe the write as permanent.

### USI-P6-11 — Saved-view queries

- **Operation:** `POST /notifications/{namespace}/saved-views`
- **Kind:** server
- **SDK handling:** `savedViews.create()` types `query` with the list filters and converts `from` / `to` to epoch
  milliseconds.

### USI-P6-13 — Recipient of self-sends

- **Operation:** all notification operations
- **Kind:** spec
- **SDK handling:** `sendToSelf()` resolves the caller's user id once per namespace and caches it.

## ETL (P7)

### USI-P7-4 — CSV byte-order mark is not stripped

- **Operation:** `POST /etl/upload`
- **Kind:** server
- **Observed:** a CSV starting with a UTF-8 byte-order mark (Excel "CSV UTF-8") gets a first column name with the
  mark prepended; every row then fails with `Missing key columns in row: <column>`.
- **Expected:** a leading byte-order mark is ignored.
- **Impact:** breaks — the default CSV export of a common spreadsheet tool imports nothing.
- **SDK handling:** workaround in the file-part builder: a leading byte-order mark is removed from CSV input.
- **Evidence:** not reproduced live; the live ETL tests (`test/integration/etl/read.int.test.ts`,
  `lifecycle.int.test.ts`) send a byte-order mark through the SDK and assert the stripped result.

### USI-P7-12 — Numeric transforms write 0 for blank cells; dates stored as epoch milliseconds

- **Operation:** `POST /etl/upload`
- **Kind:** server
- **Observed:** `toNumber`, `toInteger`, `toFloat` and `round` write `0` for a blank or unparseable cell
  (overwriting the stored value); dates are stored as epoch-millisecond numbers; an invalid `toDate` value
  becomes `''`.
- **Expected:** blank cells leave the field unchanged; a documented date representation; invalid dates reported.
- **Impact:** breaks — a partially filled file silently zeroes numeric fields.
- **SDK handling:** documented in the guide.
- **Evidence:** not reproduced live (it would write assets).

### USI-P7-16 — Key matching is raw

- **Operation:** `POST /etl/upload`
- **Kind:** server
- **Observed:** a row matches an asset only when the raw cell equals the asset's value at the key mapping's target
  path exactly: no trim, no transformation, case- and whitespace-sensitive; a key column that is no mapping's
  `sourceColumn` matches nothing.
- **Expected:** key cells normalised like mapped values; a profile with an unusable key column refused on save.
- **Impact:** breaks — `02:5D:4B:…` in a file never matches the stored `025d4b…`; every row is unassociated.
- **SDK handling:** documented (guide: use `normalizeMac()` for MAC keys).
- **Evidence:** not reproduced live.

### USI-P7-20 — A blank line fails a whole CSV import while the preview accepts it

- **Operation:** `POST /etl/upload`, `POST /etl/parse-excel-headers`
- **Kind:** server
- **Observed:** a blank line anywhere in a CSV (including a doubled trailing newline) makes the import fail for
  every profile with `Invalid Record Length: columns length is N, got 1 on line M` inside a 201 (`rowsProcessed`
  0); the header preview skips blank lines and succeeds on the same file. A single trailing newline is fine.
- **Expected:** blank lines skipped by the import as by the preview.
- **Impact:** breaks — a file that previews correctly imports nothing.
- **SDK handling:** documented (guide "Files"); the SDK does not rewrite CSV content.
- **Evidence:** not reproduced live (it would add residue).

### USI-P7-1 — ETL schemas of the specification do not match the server

- **Operation:** `GET /etl/mapping-profiles`, `GET /etl/mappings`, `POST /etl/mapping-profiles`,
  `GET|PUT|DELETE /etl/mapping-profiles/{id}`, `POST /etl/upload`, `GET /etl/activities`
- **Kind:** spec
- **Observed:** `MappingProfile` declares `createdBy`, `dateCreated` and `status` (never returned), a required
  `applicationId` (optional on the server) and `mappings` as `Record<string, string>` (real values are objects
  `{ sourceColumn, transformation?, required?, type?, sourceFormat? }`); the declared `UploadResult` shape does not
  exist (the 201 body is `{ _id, filename, status, userId, success, debugMode, results: { totalRows, debugMode,
  processedProfiles[] }, created_at }`); activity enums list `import|export` and `asset|location`, which never
  occur (real: `create|update|delete|upload`, `mapping|file`); response sets miss 403, 404 and 409. Imports only
  update existing assets; they never create one.
- **Expected:** schemas and response sets that match the returned bodies.
- **Impact:** misleads — a client generated from the specification mistypes every ETL response.
- **SDK handling:** workaround: hand-written types in `src/types/etl.ts`, checked against the returned bodies by
  the fixtures and the live tests.
- **Evidence:** live tests `test/integration/etl/read.int.test.ts` and `lifecycle.int.test.ts` (shape assertions
  on the real bodies).

### USI-P7-2 — Upload 201 is not an outcome signal; server-side failures answer 400

- **Operation:** `POST /etl/upload`
- **Kind:** server
- **Observed:** a processed upload answers 201 with `success: true` and `status: 'completed'` whatever happened;
  file-level and row-level failures appear only in `results.processedProfiles[].errors`; a failure outside the
  per-profile processing answers 400 `{ error }`.
- **Expected:** a status or flag that reflects the outcome; 5xx for server-side failures.
- **Impact:** misleads — an integrator who checks the status code or `success` misses failed rows and files.
- **SDK handling:** documented in TSDoc and the guide (three-line totals over `processedProfiles`).
- **Evidence:** live test `test/integration/etl/lifecycle.int.test.ts` (201 `completed` with a row error); the 400
  case is not reproduced live.

### USI-P7-5 — Header preview detects CSV only by MIME type

- **Operation:** `POST /etl/parse-excel-headers`
- **Kind:** server
- **Observed:** the preview reads the file as CSV only when the file part's MIME type is exactly `text/csv`; with
  any other type (also with a `.csv` name) it reads the file as a spreadsheet, and the values it infers can differ
  from what the import reads. The upload also accepts the `.csv` name.
- **Expected:** the preview and the upload choose the file format the same way.
- **Impact:** misleads — the preview can show values the import will not read.
- **SDK handling:** workaround: the SDK sets the part's MIME type from the extension.
- **Evidence:** not reproduced live.

### USI-P7-11 — Dry-run counters do not predict the real import

- **Operation:** `POST /etl/upload` (`debugMode: 'true'`)
- **Kind:** server
- **Observed:** a dry run counts every row that passes mapping and validation in `rowsChanged`; `unassociated` is
  always 0 (rows are not matched against assets).
- **Expected:** counters that state they only count valid rows, or a dry run that matches rows against assets.
- **Impact:** misleads — a dry run of a file whose keys match no asset reports every row as changed.
- **SDK handling:** documented in TSDoc (`dryRun`) and the guide.
- **Evidence:** live test `test/integration/etl/lifecycle.int.test.ts` (dry runs report rows of no existing asset
  in `rowsChanged`, with `unassociated` 0).

### USI-P7-13 — `rowsSkipped` mixes two meanings; unmatched rows count as succeeded

- **Operation:** `POST /etl/upload`
- **Kind:** server
- **Observed:** `rowsSkipped` counts both rows without a key column and matched rows without a difference;
  rows that match no asset are counted in `unassociated` and treated as succeeded.
- **Expected:** separate counters for invalid rows and unchanged rows.
- **Impact:** misleads — a file with broken keys can look like a no-op re-import.
- **SDK handling:** documented in the guide (counter table).
- **Evidence:** not reproduced live.

### USI-P7-18 — Header preview shows formatted Excel values, the import reads raw values

- **Operation:** `POST /etl/parse-excel-headers`, `POST /etl/upload`
- **Kind:** server
- **Observed:** the preview returns formatted cell strings (dates as displayed, blank header cells dropped); the
  import reads raw values (dates as Excel serial numbers).
- **Expected:** the preview shows what the import will read.
- **Impact:** misleads — a preview that looks right can import different values.
- **SDK handling:** documented in the guide.
- **Evidence:** not reproduced live.

### USI-P7-3 — Upload file-type check is case-sensitive

- **Operation:** `POST /etl/upload`
- **Kind:** server
- **Observed:** a file named `*.XLSX` or `*.CSV` sent with a MIME type the server does not recognise → 201 with the
  per-profile error `Unsupported file type. Please upload Excel or CSV files.`
- **Expected:** extension checks ignore case.
- **Impact:** friction — files exported with upper-case extensions are refused silently inside a 201.
- **SDK handling:** workaround in `etl.upload` / `etl.parseHeaders`: the extension is lower-cased and the MIME
  type set from it.
- **Evidence:** not reproduced live; the live ETL tests send an upper-case extension through the SDK and assert the
  lower-cased name.

### USI-P7-6 — check-mappings repair hints only consider legacy mappings

- **Operation:** `GET /etl/check-mappings`
- **Kind:** server
- **Observed:** `potentialKeyColumns` and `fixable` only reflect string-valued (legacy) mappings, so they are
  always `[]` / `false` for profiles with object mappings; `valid` only means "has at least one key column".
- **Expected:** hints that reflect the current mapping format.
- **Impact:** friction — the diagnostic never suggests a fix for current profiles.
- **SDK handling:** operation not wrapped; the guide shows the client-side check
  `profiles.filter(p => p.keyColumns.length === 0)`.
- **Evidence:** not reproduced live (operation not wrapped).

### USI-P7-7 — Profile create validation errors answer 500 and leave an orphan activity entry

- **Operation:** `POST /etl/mapping-profiles`
- **Kind:** server
- **Observed:** a body that fails validation (empty name, missing mappings) → 500 `{ error }` with a validation
  message; the activity log still lists a `create` entry for the failed create.
- **Expected:** 400 for validation errors; no activity entry for a failed create.
- **Impact:** friction — clients cannot tell bad input from a server failure; the activity log lists creates that
  never happened.
- **SDK handling:** workaround in `mappingProfiles.create`: `name` and `mappings` are validated locally.
- **Evidence:** not reproduced live (it would add residue).

### USI-P7-8 — A malformed profile id answers 500

- **Operation:** `GET /etl/mapping-profiles/{id}`, `DELETE /etl/mapping-profiles/{id}` (400 on `PUT`)
- **Kind:** server
- **Observed:** an id that is not 24 hexadecimal characters → 500 JSON `{ error }` on GET and DELETE, 400 on PUT.
- **Expected:** 404 `Mapping profile not found`, as for an unknown well-formed id.
- **Impact:** friction — a typo in an id looks like a server failure.
- **SDK handling:** documented; the SDK forwards the error class of the status.
- **Evidence:** live test `test/integration/etl/read.int.test.ts` (get of a malformed id), through
  `expectKnownServerIssue`.

### USI-P7-14 — Legacy `/etl/mappings` write aliases differ from the canonical routes

- **Operation:** `POST /etl/mappings`, `PUT /etl/mappings/{id}`, `DELETE /etl/mappings/{id}`
- **Kind:** server
- **Observed:** `POST /etl/mappings` answers 200 instead of 201, adds a `status` field that later reads never
  return and answers a generic 500 for every error; `PUT` and `DELETE` answer a generic 500 for most errors.
- **Expected:** aliases with the status codes of `/etl/mapping-profiles`, or their removal from the specification.
- **Impact:** friction — two write APIs for one resource with different error behaviour.
- **SDK handling:** aliases not wrapped.
- **Evidence:** not reproduced live (operations not wrapped).

### USI-P7-15 — Activity entries and stored import data cannot be removed

- **Operation:** `GET /etl/activities`, `DELETE /etl/mapping-profiles/{id}`, `POST /etl/upload`
- **Kind:** spec-gap
- **Observed:** no operation deletes activity entries or the data a writing import keeps; deleting a profile leaves
  that data in place.
- **Expected:** retention or delete operations for both.
- **Impact:** friction — test and trial imports leave permanent traces.
- **SDK handling:** documented; the live tests record these entries as accepted residue.
- **Evidence:** live test `test/integration/etl/lifecycle.int.test.ts` (activity entries of the deleted profile are
  still listed).

### USI-P7-17 — CSV delimiter fixed to comma

- **Operation:** `POST /etl/upload`, `POST /etl/parse-excel-headers`
- **Kind:** server
- **Observed:** semicolon-separated exports parse as one column; every row is then skipped.
- **Expected:** delimiter detection or a delimiter parameter.
- **Impact:** friction — locale-dependent spreadsheet exports import nothing.
- **SDK handling:** documented (guide: preview the file first).
- **Evidence:** not reproduced live.

### USI-P7-19 — Imports are synchronous with no job id

- **Operation:** `POST /etl/upload`
- **Kind:** server
- **Observed:** the response arrives when the whole file is processed; a client timeout or disconnect does not
  cancel the import, and there is no id to poll before the response.
- **Expected:** an asynchronous job with an id and a status route, or server-side cancellation.
- **Impact:** friction — large imports need long client timeouts, and a retry after a timeout imports twice.
- **SDK handling:** long default timeout (600 s), never retried; the guide says to check `activities` before
  resubmitting.
- **Evidence:** not reproduced live.

### USI-P7-9 — Activities query parameters

- **Operation:** `GET /etl/activities`
- **Kind:** server
- **SDK handling:** workaround in `activities.listPage` / `iterate`: the SDK validates the paging and search
  parameters before sending.

### USI-P7-10 — Activity log listing

- **Operation:** `GET /etl/activities`
- **Kind:** spec-gap
- **SDK handling:** the SDK types the activity entries from the returned bodies; the specification's enums for them
  do not match (see USI-P7-1).

### USI-P7-21 — ETL file input

- **Operation:** `POST /etl/parse-excel-headers`, `POST /etl/upload`
- **Kind:** server
- **SDK handling:** none. Details are not published here.

## WebSocket (P8)

### USI-P8-11 — Alerts raised from zone events carry no tag id

- **Endpoint:** subscriber socket, alerts
- **Kind:** server
- **Observed:** an alert raised by a rule that a zone event triggered has no `user_udid` and no `user_type`.
- **Expected:** the alert names the tag whose zone event triggered it.
- **Impact:** breaks — such alerts cannot be attributed to a tag.
- **SDK handling:** `user_udid` and `user_type` are optional; the guide says to correlate through the zone event.
- **Live test:** not live (rules are not fired on purpose); `test/integration/websocket/subscriber.int.test.ts`
  validates alert shapes on live traffic when an alert occurs.

### USI-P8-1 — A re-SUBSCRIBE keeps the first type filter but confirms

- **Endpoint:** subscriber socket, `SUBSCRIBE`
- **Kind:** server
- **Observed:** a second `SUBSCRIBE` on a subscribed connection ignores its new `data_type_filter` (the first mask
  stays) and is confirmed anyway.
- **Expected:** a second `SUBSCRIBE` replaces the subscription, or is answered with an error.
- **Impact:** misleads — a client that changes its subscription keeps receiving the old kinds.
- **SDK handling:** every change is sent as `UNSUBSCRIBE` then `SUBSCRIBE` (a short gap is documented).
- **Live test:** `test/integration/websocket/subscriber.int.test.ts` (known issues on raw frames),
  `expectKnownServerIssue('USI-P8-1', …)`.

### USI-P8-2 — `map_uuid` in SUBSCRIBE is ignored

- **Endpoint:** subscriber socket, `SUBSCRIBE`
- **Kind:** server
- **Observed:** a `SUBSCRIBE` with a `map_uuid` still delivers positions of every map.
- **Expected:** the map restricts delivery, or the field is rejected.
- **Impact:** misleads — clients that sent it believed they were filtering.
- **SDK handling:** the field is not sent; the optional `mapUuid` filters typed events on the client.
- **Live test:** `test/integration/websocket/subscriber.int.test.ts` (known issues on raw frames),
  `expectKnownServerIssue('USI-P8-2', …)`.

### USI-P8-6 — No acknowledgement or error frame

- **Endpoint:** subscriber and publisher sockets
- **Kind:** server
- **Observed:** neither socket ever sends an error frame; invalid publisher frames and positions without a
  `map_uuid` are dropped silently; `UNSUBSCRIBE` and `FILTER_MGT` get no reply.
- **Expected:** an acknowledgement or an error for each command and published position.
- **Impact:** misleads — a dropped position cannot be detected by the publisher.
- **SDK handling:** client-side validation; the guide points to the acknowledged HTTP publish.
- **Live test:** not live (it would spend position budget on a dropped frame).

### USI-P8-8 — `is_synthetic_exit` set on every full-Feature counter

- **Endpoint:** subscriber socket, zone counter updates
- **Kind:** server
- **Observed:** every counter update that carries the full zone Feature has `is_synthetic_exit: true`, whether or
  not a synthetic exit caused it.
- **Expected:** the flag is set only for synthetic exits.
- **Impact:** misleads — the flag cannot be used to tell expiry-driven counter changes apart.
- **SDK handling:** documented.
- **Live test:** not live (observed on live traffic during development, not asserted).

### USI-P8-3 — Only five filter strings exist

- **Endpoint:** subscriber socket, `SUBSCRIBE` `data_type_filter`
- **Kind:** server
- **Observed:** only `POSITIONS`, `ZONES_ENTRIES_EVENTS`, `ZONE_STATS_EVENTS`, `ALERTS` and `ASSETS` are
  recognised; unknown strings are skipped silently; tag-lost events and the refetch hints arrive only without a
  filter; an empty array delivers nothing.
- **Expected:** every delivered kind has a filter value; unknown values and an empty list are reported.
- **Impact:** friction — a client that wants tag-lost events must take every kind.
- **SDK handling:** `[]` maps to ALL; the guide documents which kinds need ALL.
- **Live test:** not live (needs frames the SDK never sends; modelled by the unit fake server).

### USI-P8-4 — The confirmation names neither types nor tags

- **Endpoint:** subscriber socket, reply to `SUBSCRIBE`
- **Kind:** server
- **Observed:** the reply is exactly `{ app_namespace, action: 'subscribeEvent' }`.
- **Expected:** the reply states the accepted types and tag filter.
- **Impact:** friction — a client cannot check what the server accepted.
- **SDK handling:** `subscribe()` resolves with the request it sent.
- **Live test:** `test/integration/websocket/subscriber.int.test.ts` (connect and subscribe),
  `expectKnownServerIssue('USI-P8-4', …)`.

### USI-P8-7 — The tag is named differently per kind, and some kinds have no timestamp

- **Endpoint:** subscriber socket, delivered messages
- **Kind:** server
- **Observed:** the tag is `user_udid` in zone, alert and tag-lost events but `user_uuid` in positions; alerts and
  asset events carry no `timestamp`.
- **Expected:** one field name for the tag across kinds, and a timestamp on every event.
- **Impact:** friction — consumers must special-case each kind.
- **SDK handling:** the types follow the wire.
- **Live test:** `test/integration/websocket/publisher.int.test.ts` (zone event after the test publish, when the
  platform raises one), `expectKnownServerIssue('USI-P8-7', …)`.

### USI-P8-10 — The WebSocket protocol is not documented

- **Endpoint:** both sockets
- **Kind:** spec
- **Observed:** the API specification does not describe the WebSocket endpoints; the command field is `type`, and
  descriptions that name it `command` or use other filter names are out of date.
- **Expected:** the protocol is documented with the REST API.
- **Impact:** friction — integrators reverse-engineer the frames.
- **SDK handling:** the WebSocket guide documents the protocol.
- **Live test:** not live.

### USI-P8-5 — Subscription filter validation

- **Endpoint:** subscriber socket
- **Kind:** server
- **SDK handling:** the SDK validates subscription types and tag ids before sending.

## Documentation and examples (P9)

### USI-P9-2 — feature-off `404` has a non-JSON body

- **Observed (wire):** a domain that is switched off for the namespace answers `404` with a non-JSON body
  instead of a JSON error envelope.
- **Expected:** a JSON body such as `{ "error": "<feature> is not enabled" }`, ideally a distinct status or error
  code, so clients can tell "feature off" from "resource not found".
- **SDK handling:** the transport maps the status to `NotFoundError` and keeps the text body in `error.body`; the
  error-handling guide ("Detecting a disabled feature") shows how to detect the case (`NotFoundError` whose `body`
  is a string); the geofence-alert-to-notification recipe skips with `SKIPPED: feature-off` on it.
- **How observed:** not reproduced live (the domains used by the recipes are enabled in the test namespace).

### USI-P9-1 — not recorded

- Reserved; the finding is recorded as USI-P1-4.
