# API reference

The SDK's API reference is generated from the sources, so it always matches the published package. This page
explains how it is organised, maps each resource to its reference page and guide, and lists the shared utilities.

## How the reference is organised

- [Generated reference](reference/README.md) (TypeDoc, Markdown): one page per exported class, function,
  interface, type alias and variable of `ubudu-rtls-sdk`, under `reference/classes/`, `reference/functions/`,
  `reference/interfaces/`, `reference/type-aliases/` and `reference/variables/`. Deprecated members are marked
  there with their replacement.
- [Endpoint coverage](endpoint-coverage.md): every operation of the rtls-api 3.4.0 specification with the SDK
  method that wraps it, or the reason it is excluded.
- The [guides](../README.md) explain each domain with compiled examples; start with
  [Getting started](../guides/getting-started.md).

Every resource is a property of the client created by `createRtlsClient()`. Methods take their required
arguments first and an optional options object last; the options object also carries the per-call context
(`namespace`, `venueId`, `mapId`, `level`) and the request options (`signal`, `timeoutMs`, `headers`).

<!-- snippet: prelude=client -->
```ts
const venues = await client.venues.list({ timeoutMs: 10_000 });
const zones = await client.zones.list({ venueId: venues[0].id, level: 0 });
console.log(zones.features.length);
```

## Resources

| Client property | Reference page | Guide |
|---|---|---|
| the client itself (`health()`, context, scoped clients, `createWebSocket()`) | [`RtlsClient`](reference/classes/RtlsClient.md), [`createRtlsClient`](reference/functions/createRtlsClient.md), [`RtlsClientOptions`](reference/interfaces/RtlsClientOptions.md) | [Getting started](../guides/getting-started.md) |
| `assets` | [`AssetsResource`](reference/classes/AssetsResource.md) | [Assets](../guides/assets.md) |
| `assetDocuments` | [`AssetDocumentsResource`](reference/classes/AssetDocumentsResource.md) | [Assets: documents](../guides/assets.md#6-documents) |
| `assetTree`, `dataModels` | [`AssetTreeResource`](reference/classes/AssetTreeResource.md), [`DataModelsResource`](reference/classes/DataModelsResource.md) | [Assets: asset tree and data models](../guides/assets.md#5-asset-tree-and-data-models) |
| `declaredLocations` | [`DeclaredLocationsResource`](reference/classes/DeclaredLocationsResource.md) | [Assets: declared locations](../guides/assets.md#7-declared-locations) |
| `tagActions` | [`TagActionsResource`](reference/classes/TagActionsResource.md) | [Assets: tag actions](../guides/assets.md#8-tag-actions) |
| `positions` | [`PositionsResource`](reference/classes/PositionsResource.md) | [Positions and spatial analysis](../guides/positions-spatial.md) |
| `spatial` | [`SpatialResource`](reference/classes/SpatialResource.md) | [Positions and spatial analysis](../guides/positions-spatial.md#7-zones) |
| `venues` | [`VenuesResource`](reference/classes/VenuesResource.md) | [Venues, maps, zones and navigation](../guides/venues-navigation.md#2-venues) |
| `zones` | [`ZonesResource`](reference/classes/ZonesResource.md) | [Venues: zones](../guides/venues-navigation.md#4-zones) |
| `navigation` | [`NavigationResource`](reference/classes/NavigationResource.md) | [Venues: navigation](../guides/venues-navigation.md#8-navigation) |
| `dashboards` | [`DashboardsResource`](reference/classes/DashboardsResource.md) | [Dashboards](../guides/dashboards-alert-rules.md#dashboards) |
| `alertRules` | [`AlertRulesResource`](reference/classes/AlertRulesResource.md) | [Alert rules](../guides/dashboards-alert-rules.md#alert-rules) |
| `alerts` | [`AlertsResource`](reference/classes/AlertsResource.md) | [Alert history](../guides/dashboards-alert-rules.md#alert-history) |
| `settings` | [`SettingsResource`](reference/classes/SettingsResource.md) | [Settings](../guides/dashboards-alert-rules.md#settings) |
| `notifications` (with `rules`, `connections`, `savedViews`, `cleanupPolicy`, `admin`) | [`NotificationsResource`](reference/classes/NotificationsResource.md) | [Notifications](../guides/notifications.md) |
| `etl` (with `mappingProfiles`, `activities`) | [`EtlResource`](reference/classes/EtlResource.md) | [ETL imports](../guides/etl.md) |
| WebSocket clients | [`RtlsWebSocketSubscriber`](reference/classes/RtlsWebSocketSubscriber.md), [`RtlsWebSocketPublisher`](reference/classes/RtlsWebSocketPublisher.md), [`RtlsWebSocketClient`](reference/classes/RtlsWebSocketClient.md) | [WebSocket streaming](../guides/websocket.md) |
| Errors | [`RtlsError`](reference/classes/RtlsError.md) and its subclasses | [Error handling](../guides/error-handling.md) |

## Shared utilities

All are exported from `ubudu-rtls-sdk`.

| Utility | What it does |
|---|---|
| [`normalizeMac`](reference/functions/normalizeMac.md) | Returns a MAC as the 12 lowercase hex characters the server stores; throws `ValidationError` for an invalid MAC. `formatMac` and `isValidMac` format and test one; `normalizeMacAddress` and `isValidMacAddress` are deprecated aliases of `normalizeMac` and `isValidMac`. |
| [`toEpochMs`](reference/functions/toEpochMs.md) | Converts a `Date`, an epoch in milliseconds or a date string to epoch milliseconds. |
| [`filters`](reference/variables/filters.md), [`filter`](reference/functions/filter.md) | Builders of the filter DSL (`equals`, `contains`, `between`, `in`, …); `filter(field, operator, value)` builds one from an operator name and `combineFilters` merges several. See [Pagination and filtering: filter DSL](../guides/pagination-filtering.md#6-filter-dsl). |
| [`applyFilters`](reference/functions/applyFilters.md) | Applies filters, sort, field selection and paging locally, with the server's semantics, to a list the server returns whole. |
| [`serializeFilters`](reference/functions/serializeFilters.md) | Writes filters in one of the two server grammars, `'universal'` or `'venue'`. |
| [`buildQueryParams`](reference/functions/buildQueryParams.md) | Turns an options object into the query-string map the SDK sends: every defined key is forwarded, arrays such as `sort` and `fields` are joined with `,` and dates become epoch milliseconds; an object value throws `ValidationError`. |
| [`paginatePages`](reference/functions/paginatePages.md) | Async iterator over every item of a page-numbered listing (`Page<T>` envelope). `paginate` is its deprecated 0.2 form. |
| [`paginateOffset`](reference/functions/paginateOffset.md) | Async iterator over every item of an offset listing (`OffsetPage<T>`). |
| [`collectAll`](reference/functions/collectAll.md) | Collects an async iterable into an array, with an optional `maxItems` cap. |
| [`normalizePage`](reference/functions/normalizePage.md) | Turns an array, `{ data }` or a page envelope into a `Page<T>`. `normalizeListResponse` is deprecated: it returns the flat 0.2 shape. |
| [`extractDataArray`](reference/functions/extractDataArray.md), [`isArrayResponse`](reference/functions/isArrayResponse.md) | Return the items of a response that is an array or a `{ data }` object (an empty array for anything else), and test whether a response is a bare array. |
| [`extractZonesFromGeoJSON`](reference/functions/extractZonesFromGeoJSON.md), [`extractPoisFromGeoJSON`](reference/functions/extractPoisFromGeoJSON.md), [`extractPathNodesFromGeoJSON`](reference/functions/extractPathNodesFromGeoJSON.md), [`extractPathSegmentsFromGeoJSON`](reference/functions/extractPathSegmentsFromGeoJSON.md) | Flatten a zone, POI or path FeatureCollection into `Zone[]`, `POI[]`, `PathNode[]` or `PathSegment[]`, as `zones.listAsArray()`, `venues.listPoisAsArray()`, `venues.listPathNodes()` and `venues.listPathSegments()` do. See [Venues: path graph](../guides/venues-navigation.md#6-path-graph). |
| [`resolveContext`](reference/functions/resolveContext.md), [`requireNamespace`](reference/functions/requireNamespace.md), [`requireVenueId`](reference/functions/requireVenueId.md), [`requireMapId`](reference/functions/requireMapId.md) | Merge call-time context with the defaults as the client does (an `undefined`, `null` or `''` override falls back to the default), and assert that a namespace, venue or map is set (`ContextError` otherwise). See [Getting started: default context](../guides/getting-started.md#6-default-context). |
| [`validateAlertRuleSet`](reference/functions/validateAlertRuleSet.md) | Checks an alert-rule document locally, without a request, and returns `{ valid, errors, warnings }`; [`ALERT_RULE_OPERATORS`](reference/variables/ALERT_RULE_OPERATORS.md) and [`ALERT_RULE_EVENT_TYPES`](reference/variables/ALERT_RULE_EVENT_TYPES.md) list the operators and event types of the rule editor. See [Alert rules: what stops all alerting](../guides/dashboards-alert-rules.md#what-stops-all-alerting). |
| [`classifyMessage`](reference/functions/classifyMessage.md), [`isPositionMessage`](reference/functions/isPositionMessage.md), [`isZoneEntryExitMessage`](reference/functions/isZoneEntryExitMessage.md), [`isZoneStatsMessage`](reference/functions/isZoneStatsMessage.md), [`isAlertMessage`](reference/functions/isAlertMessage.md), [`isAssetMessage`](reference/functions/isAssetMessage.md), [`isSubscriptionConfirmation`](reference/functions/isSubscriptionConfirmation.md) | Return the kind of a parsed WebSocket frame, or test it for one kind. See [WebSocket: message catalogue](../guides/websocket.md#message-catalogue). |
| [`SubscriptionType`](reference/variables/SubscriptionType.md), [`WEBSOCKET_URLS`](reference/variables/WEBSOCKET_URLS.md), [`WEBSOCKET_DEFAULTS`](reference/variables/WEBSOCKET_DEFAULTS.md), [`WS_CLOSE_CODES`](reference/variables/WS_CLOSE_CODES.md) | WebSocket constants: the subscription types, the default broker URLs, the default connection, keepalive and reconnect timings, and the close codes the broker can produce. `POSITION_ORIGIN` is deprecated (its values never matched the platform's origin codes). See [WebSocket: subscriptions](../guides/websocket.md#subscriptions). |
| [`createError`](reference/functions/createError.md) | Builds the SDK error for a status and a body, as the transport does. |

<!-- snippet: prelude=client -->
```ts
const all = await client.assets.list();
const forklifts = applyFilters(all, { filters: filters.equals('user_type', 'forklift'), sort: 'user_name:asc' });
console.log(forklifts.pagination.total, normalizeMac('02:5D:4B:00:00:01'));
console.log(serializeFilters(filters.between('battery_percent', 20, 80), 'venue'));
```

<!-- snippet: prelude=client -->
```ts
const firstTen = await collectAll(client.venues.iterate(), { maxItems: 10 });
console.log(firstTen.length);
```

See [Pagination and filtering](../guides/pagination-filtering.md) for the three listing models and the filter
operators.

## Operations the SDK does not wrap: `client.raw`

`client.raw` is the typed [openapi-fetch](https://github.com/openapi-ts/openapi-typescript/tree/main/packages/openapi-fetch)
client on the same base URL and credential as the SDK. Use it for the operations of the vendored rtls-api 3.4.0
specification that the SDK does not wrap: the rows marked `exclude` in [Endpoint coverage](endpoint-coverage.md).
Paths, parameters and bodies are typed from that specification, but a raw call has none of the SDK's behaviour: no
default context (pass the namespace in the path), no timeout, no retry and no error mapping. It answers
`{ data, error, response }` instead of throwing.

<!-- snippet: prelude=client -->
```ts
// Shown on a route the SDK wraps (client.health()); an excluded route of the specification is called the same way.
const { data, error, response } = await client.raw.GET('/health');
if (error !== undefined) console.error(response.status);
else console.log(data);
```

Only the paths of the vendored specification type-check: in TypeScript, a route the specification does not list
(for example one added to the API after this release) needs a cast on the path, or a plain `fetch` call.

Middleware added with `client.raw.use()` also runs for the scoped clients (`forNamespace`, `forVenue`, `forMap`,
`withContext`), which share the parent's connection.

## Regenerating the reference

Both files are generated and committed; regenerate them after a change to the public surface or to the operation
manifests.

| Output | Command | Check (fails when the committed file is stale) |
|---|---|---|
| `docs/api/reference/` | `npm run docs:api` (TypeDoc with `docs/api/typedoc.json`) | `npm run docs:api:check` |
| `docs/api/endpoint-coverage.md`, `docs/api/endpoint-coverage.json` | `npm run docs:coverage` (from the vendored specification and the operation manifests) | `npm run docs:coverage:check` |
