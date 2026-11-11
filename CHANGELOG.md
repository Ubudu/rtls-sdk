# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-11-11

Aligned with rtls-api 3.4.0. This is a breaking release: the API changes wherever 0.2.0 did not match what the
server reads and returns, on every supported runtime (Node.js and Bun alike). The
[migration guide](docs/guides/migration-0.3.md) shows each breaking change with 0.2 and 0.3 code; known server
limitations are listed at its end.

### Breaking changes

**Runtime**

- Node.js `>=20.3.0` ([migration](docs/guides/migration-0.3.md#nodejs-2030))

**Core: errors, transport, pagination, filters and context**

- A 400 reports status 400 ([migration](docs/guides/migration-0.3.md#a-400-reports-status-400))
- The server's message and code are kept ([migration](docs/guides/migration-0.3.md#the-servers-message-and-code-are-kept))
- A user abort is `AbortError` ([migration](docs/guides/migration-0.3.md#a-user-abort-is-aborterror))
- `retryAfter` is set, in milliseconds ([migration](docs/guides/migration-0.3.md#retryafter-is-set-in-milliseconds))
- One credential per request ([migration](docs/guides/migration-0.3.md#one-credential-per-request))
- `Content-Type` only with a JSON body ([migration](docs/guides/migration-0.3.md#content-type-only-with-a-json-body))
- `buildQueryParams` forwards every defined key ([migration](docs/guides/migration-0.3.md#buildqueryparams-forwards-every-defined-key))
- Filter builders keep typed values ([migration](docs/guides/migration-0.3.md#filter-builders-keep-typed-values))
- `setContext` and `withContext` clear a key given as `undefined` ([migration](docs/guides/migration-0.3.md#setcontext-and-withcontext-clear-a-key-given-as-undefined))
- Invalid ids are rejected before any request ([migration](docs/guides/migration-0.3.md#invalid-ids-are-rejected-before-any-request))
- `ContextError` is an `RtlsError` ([migration](docs/guides/migration-0.3.md#contexterror-is-an-rtlserror))
- `health()` is typed; a 503 is `ServiceUnavailableError` ([migration](docs/guides/migration-0.3.md#health-is-typed-a-503-is-serviceunavailableerror))
- `timeoutMs: 0` and `Infinity` disable the timeout ([migration](docs/guides/migration-0.3.md#timeoutms-0-and-infinity-disable-the-timeout))
- `createWebSocket()` namespace, credential and URLs ([migration](docs/guides/migration-0.3.md#createwebsocket-namespace-credential-and-urls))
- A non-JSON 2xx body is parsed ([migration](docs/guides/migration-0.3.md#a-non-json-2xx-body-is-parsed))
- The flat `PaginatedResponse` is replaced by the `Page` envelope ([migration](docs/guides/migration-0.3.md#the-flat-paginatedresponse-is-replaced-by-the-page-envelope))
- MAC path parameters are normalised ([migration](docs/guides/migration-0.3.md#mac-path-parameters-are-normalised))
- Scoped clients share the parent's connection ([migration](docs/guides/migration-0.3.md#scoped-clients-share-the-parents-connection))
- New status classes and codes ([migration](docs/guides/migration-0.3.md#new-status-classes-and-codes))

**Assets, tag actions and related resources**

- `assets.create()` works and returns the stored asset ([migration](docs/guides/migration-0.3.md#assetscreate-works-and-returns-the-stored-asset))
- Asset MACs are normalised ([migration](docs/guides/migration-0.3.md#asset-macs-are-normalised))
- `assets.list()` filters, sorts and pages locally ([migration](docs/guides/migration-0.3.md#assetslist-filters-sorts-and-pages-locally))
- `assets.batchSave()` returns `Asset[]` and validates items ([migration](docs/guides/migration-0.3.md#assetsbatchsave-returns-asset-and-validates-items))
- Asset methods are typed ([migration](docs/guides/migration-0.3.md#asset-methods-are-typed))
- `getHistory()` is the audit trail; `getStats()` does not exist ([migration](docs/guides/migration-0.3.md#gethistory-is-the-audit-trail-getstats-does-not-exist))
- Tag actions moved to `client.tagActions.send()` ([migration](docs/guides/migration-0.3.md#tag-actions-moved-to-clienttagactionssend))
- `assets.getAll()` is a deprecated alias of `list()` ([migration](docs/guides/migration-0.3.md#assetsgetall-is-a-deprecated-alias-of-list))
- `assets.update()` checks the patch and normalises `user_udid` ([migration](docs/guides/migration-0.3.md#assetsupdate-checks-the-patch-and-normalises-user_udid))

**Positions and spatial**

- Spatial zone results are GeoJSON Features ([migration](docs/guides/migration-0.3.md#spatial-zone-results-are-geojson-features))
- `analyzeCustomZones` and `analyzeCustomPois` bodies corrected ([migration](docs/guides/migration-0.3.md#analyzecustomzones-and-analyzecustompois-bodies-corrected))
- `positions.listLast()` is bounded to the last 24 hours ([migration](docs/guides/migration-0.3.md#positionslistlast-is-bounded-to-the-last-24-hours))
- Position and spatial results are typed ([migration](docs/guides/migration-0.3.md#position-and-spatial-results-are-typed))
- Zone and POI lookups apply the client's default `level` ([migration](docs/guides/migration-0.3.md#zone-and-poi-lookups-apply-the-clients-default-level))
- `client.esQuery()` is deprecated ([migration](docs/guides/migration-0.3.md#clientesquery-is-deprecated))
- Position MACs are normalised ([migration](docs/guides/migration-0.3.md#position-macs-are-normalised))
- `positions.listCached({ namespace })` is honoured ([migration](docs/guides/migration-0.3.md#positionslistcached-namespace--is-honoured))
- Spatial methods reject out-of-range coordinates locally ([migration](docs/guides/migration-0.3.md#spatial-methods-reject-out-of-range-coordinates-locally))
- Trailing `requestOptions` on object-first forms is deprecated ([migration](docs/guides/migration-0.3.md#trailing-requestoptions-on-object-first-forms-is-deprecated))

**Venues, zones and navigation**

- Navigation calls take the route first ([migration](docs/guides/migration-0.3.md#navigation-calls-take-the-route-first))
- Navigation request types have new shapes ([migration](docs/guides/migration-0.3.md#navigation-request-types-have-new-shapes))
- Nearest POI and evacuation ([migration](docs/guides/migration-0.3.md#nearest-poi-and-evacuation))
- `NavigationResponse` is a deprecated alias of `RouteResult` ([migration](docs/guides/migration-0.3.md#navigationresponse-is-a-deprecated-alias-of-routeresult))
- `PathSegment` and `PathSegmentProperties` field names ([migration](docs/guides/migration-0.3.md#pathsegment-and-pathsegmentproperties-field-names))
- `PathNode.nodeType` values ([migration](docs/guides/migration-0.3.md#pathnode-node-types))
- `crossLevelConnections` entries may be objects ([migration](docs/guides/migration-0.3.md#crosslevelconnections-entries-may-be-objects))
- `venues.listMapPois()` returns `MapPoisResponse` ([migration](docs/guides/migration-0.3.md#venueslistmappois-returns-mappoisresponse))
- `venues.listMapPoisAsArray()` is removed ([migration](docs/guides/migration-0.3.md#venueslistmappoisasarray-is-removed))
- Collection `metadata` is optional ([migration](docs/guides/migration-0.3.md#collection-metadata-is-optional))
- `POI` and `POIProperties` field types ([migration](docs/guides/migration-0.3.md#poi-and-poiproperties-field-types))
- Client-side argument errors in venue methods ([migration](docs/guides/migration-0.3.md#client-side-argument-errors-in-venue-methods))
- `venues.list({ namespace })` is honoured ([migration](docs/guides/migration-0.3.md#venueslist-namespace--is-honoured))
- `venues.list/get/listMaps` return typed venues and maps ([migration](docs/guides/migration-0.3.md#venue-and-map-types))
- `Venue` and `MapData` are the typed shapes ([migration](docs/guides/migration-0.3.md#venue-and-mapdata-are-the-typed-shapes))
- An unexpected list body of `venues.list()` or `listMaps()` is an error ([migration](docs/guides/migration-0.3.md#an-unexpected-list-body-of-venueslist-or-listmaps-is-an-error))
- `ListVenuesOptions` ([migration](docs/guides/migration-0.3.md#listvenuesoptions))
- Per-call `level` on venue list methods ([migration](docs/guides/migration-0.3.md#per-call-level-on-venue-list-methods))
- A malformed per-call `level` is refused ([migration](docs/guides/migration-0.3.md#a-malformed-per-call-level-is-refused))
- `zones.getPresence()` ([migration](docs/guides/migration-0.3.md#zonesgetpresence))
- `zones.getAll()`, `zones.listByMap*()` and `venues.listMapPois()` are deprecated ([migration](docs/guides/migration-0.3.md#zonesgetall-zoneslistbymap-and-venueslistmappois-are-deprecated))
- Trailing `requestOptions` on venue and zone methods is deprecated ([migration](docs/guides/migration-0.3.md#trailing-requestoptions-on-venue-and-zone-methods-is-deprecated))

**Dashboards, alert rules, alerts, settings and health**

- `alerts.getRules()` returns `AlertRuleSet` ([migration](docs/guides/migration-0.3.md#alertsgetrules-returns-alertruleset))
- Dashboard types use `_id` ([migration](docs/guides/migration-0.3.md#dashboard-types-use-_id))
- `dashboards.create()` forwards every field ([migration](docs/guides/migration-0.3.md#dashboardscreate-forwards-every-field))
- `Dashboard.data` is optional; `data: {}` is refused ([migration](docs/guides/migration-0.3.md#dashboarddata-is-optional-data--is-refused))
- `dashboards.update()` and `dashboards.unshare()` ([migration](docs/guides/migration-0.3.md#dashboardsupdate-and-dashboardsunshare))
- `alerts.list()` time range, bounds and result type ([migration](docs/guides/migration-0.3.md#alertslist-time-range-bounds-and-result-type))
- `AlertRule` is the stored-rule shape ([migration](docs/guides/migration-0.3.md#alertrule-is-the-stored-rule-shape))
- `alerts.saveRules()` types ([migration](docs/guides/migration-0.3.md#alertssaverules-types))
- `GetAlertsOptions` is an alias of `ListAlertsOptions` ([migration](docs/guides/migration-0.3.md#getalertsoptions-is-an-alias-of-listalertsoptions))
- `client.getSettings()` uses the default context and is deprecated ([migration](docs/guides/migration-0.3.md#clientgetsettings-uses-the-default-context-and-is-deprecated))
- `client.health()` is typed ([migration](docs/guides/migration-0.3.md#clienthealth-is-typed))
- Client-side validation of dashboards, alert rules and alert bounds ([migration](docs/guides/migration-0.3.md#client-side-validation-of-dashboards-alert-rules-and-alert-bounds))

**WebSocket**

- `ZoneStatsMessage` field names ([migration](docs/guides/migration-0.3.md#zonestatsmessage-field-names))
- `ZoneEntryExitMessage` ([migration](docs/guides/migration-0.3.md#zoneentryexitmessage))
- `AlertMessage` ([migration](docs/guides/migration-0.3.md#alertmessage))
- `PositionMessage` ([migration](docs/guides/migration-0.3.md#positionmessage))
- `AssetMessage.data` ([migration](docs/guides/migration-0.3.md#assetmessagedata))
- `SubscriptionConfirmation` ([migration](docs/guides/migration-0.3.md#subscriptionconfirmation))
- `SubscribeMessage` ([migration](docs/guides/migration-0.3.md#subscribemessage))
- `SubscriptionResult` ([migration](docs/guides/migration-0.3.md#subscriptionresult))
- `classifyMessage()` returns `WebSocketMessageKind` ([migration](docs/guides/migration-0.3.md#classifymessage-returns-websocketmessagekind))
- The publisher adds no default fields ([migration](docs/guides/migration-0.3.md#the-publisher-adds-no-default-fields))
- Publisher input is validated before connecting ([migration](docs/guides/migration-0.3.md#publisher-input-is-validated-before-connecting))
- Publisher without `mapUuid` throws `ContextError` ([migration](docs/guides/migration-0.3.md#publisher-without-mapuuid-throws-contexterror))
- `unsubscribe(types)` and `unsubscribe()` really stop delivery ([migration](docs/guides/migration-0.3.md#unsubscribe-really-stops-delivery))
- WebSocket error fields ([migration](docs/guides/migration-0.3.md#websocket-error-fields))
- WebSocket error constructors ([migration](docs/guides/migration-0.3.md#websocket-error-constructors))
- `WebSocketAuthenticationError(message, status)` ([migration](docs/guides/migration-0.3.md#websocketauthenticationerrormessage-status))
- `ErrorEventData.error` is a `WebSocketError` ([migration](docs/guides/migration-0.3.md#erroreventdataerror-is-a-websocketerror))
- `disconnected` fires only after an open connection ([migration](docs/guides/migration-0.3.md#disconnected-fires-only-after-an-open-connection))
- Every unintended close reconnects, with jitter ([migration](docs/guides/migration-0.3.md#every-unintended-close-reconnects-with-jitter))
- Missing namespace or credential ([migration](docs/guides/migration-0.3.md#missing-namespace-or-credential))
- Subscriber `mapUuid` filters on the client ([migration](docs/guides/migration-0.3.md#subscriber-mapuuid-filters-on-the-client))
- Unified client `mapUuid` is the publisher's map only ([migration](docs/guides/migration-0.3.md#unified-client-mapuuid-is-the-publishers-map-only))
- Listener helpers take an event name, not a type argument ([migration](docs/guides/migration-0.3.md#listener-helpers-take-an-event-name-not-a-type-argument))

### Added

**Core**

- Error classes, all `instanceof RtlsError`: `ConflictError` (409), `GoneError` (410), `PayloadTooLargeError` (413),
  `UnsupportedMediaTypeError` (415), `ServerError` (5xx), `ServiceUnavailableError` (503), `AbortError`,
  `ResponseParseError`, `StreamError`; every constructor takes an optional last `init`.
- Error fields `apiCode`, `details`, `retryAfter` (milliseconds), `body` and `cause`; `RtlsError.is(value)` across
  two loaded copies of the package. Client-side argument errors are `ValidationError` with `status: 0`.
- Client options `auth: 'auto' | 'apiKey' | 'bearer'` and the opt-in `retry` policy (idempotent requests on
  429/502/503/504, network errors and timeouts; `Retry-After` honoured up to 60 s; uploads and streams never
  retried); options validated at construction.
- Client properties `assetDocuments`, `assetTree`, `dataModels`, `declaredLocations`, `tagActions`, `alertRules`,
  `settings`, `notifications`, `etl`.
- Pagination: `Page<T>`, `OffsetPage<T>`, `paginatePages`, `paginateOffset`, `normalizePage`,
  `collectAll(iterable, { maxItems })`.
- Filtering: `serializeFilters(filters, 'universal' | 'venue')`, `applyFilters(items, query)` (local evaluator with
  the server's universal semantics); types `FilterValue`, `FilterGrammar`, `LocalQuery`, `DeepPartial`.
- Utilities `normalizeMac`, `formatMac`, `isValidMac`, `toEpochMs`; types `Schema<K>`, `HealthStatus`, `paths`,
  `components` and the transport types.
- `createError(status, body, init)` takes an optional `init` (`message`, `headers`, `contentType`, `statusText`,
  `cause`) in place of the message string; the filter builders accept `Date` bounds (`greaterThan`, `lessThan`,
  `between`, …), a `RegExp` in `matches` and `filter()`, read-only arrays, and several values in `elemMatch`.
- `ubudu-rtls-sdk/package.json` is exported, so tools can read the package manifest.

**Assets**

- `client.assetDocuments`: `upload`, `getJob`, `waitForJob`, `listPage` (`OffsetPage`), `list`, `get`, `download`,
  `delete`, with local type, extension and size checks.
- `client.declaredLocations`: `bulkDeclare` and `bulkClear`, validated locally (1..500 items), typed results.
- `client.tagActions.send(actions, options?)`: the 11 actions, optional `duration`, typed `results`; never retried.
- `client.assetTree.get()` and `client.dataModels.get()` (read-only).
- `assets.getHistory(mac, { startTime, endTime })`: the audit trail of the asset record.
- Per-call `{ namespace, signal, timeoutMs }` on every asset method; typed `Asset`, `AssetInput`, `AssetPatch` and
  the document, declared-location and tag-action types.

**Positions and spatial**

- `positions.query(dataType, dsl, options?)`: typed Elasticsearch queries.
- `spatial.zoneDistances()`, `spatial.poisByTag()`, `spatial.poiStatistics()`, `spatial.nearestAssets()`,
  `spatial.nearestAssetsRealtime()`.
- `current` on `positions.listLast()`; `tags` on `spatial.nearestPois()` and `spatial.poisWithinRadius()`;
  `Date`-capable time bounds on `positions.getHistory()` and `positions.listLast()`.
- `PublishPositionData` gains `user_uuid`, `data` and extra keys; `PublishOptions`.
- `spatial.analyzeCustomPois({ customPois })` accepts GeoJSON Point Features, so the POIs of
  `venues.listPois()` can be passed as they are.
- Typed results: `CachedAssetPosition`, `AssetPosition`, `EsSearchResponse` and the spatial result types.

**Venues, zones and navigation**

- Navigation implemented: `navigation.shortestPath`, `accessiblePath`, `multiStop`, `nearestPoi`,
  `evacuationRoute`, each sending the venue id from the call or the client.
- Server-side venue `filters` on `venues.list`, `listMaps`, `listPois*`, `listPaths*` and `zones.list*`, with the
  shorthands `level`, `tag` and `nodeType`.
- Typed venues and maps (`VenueSummary`, `VenueDetails`, `IndoorMap`, `MapPoisResponse`) and the navigation
  request and result types.
- `zones.getPresence` defaults to the last 24 hours, accepts `Date`, ISO strings or epoch ms, and normalises MACs.

**Dashboards, alert rules, settings**

- `client.alertRules`: `get`, `replace`, `upsertRule`, `removeRule`, `setRuleEnabled`; `validateAlertRuleSet`,
  `ALERT_RULE_OPERATORS`, `ALERT_RULE_EVENT_TYPES`.
- `alertRules.replace(get(), { skipValidation: true })` restores verbatim only a canonical `{ name, rules }`
  document; a stored bare array is written back as `{ name, rules }` and its rules start firing.
- `client.settings.get()` with `NamespaceSettings`.
- Typed `Dashboard`, `DashboardShare`, `CreateDashboardInput`, `UpdateDashboardInput`, `AlertRule`, `AlertRuleSet`
  and the alert-event types.

**Notifications**

- `client.notifications`: inbox reads (`list`, `listPage`, `iterate`, `listGroups`, `facets`, `unreadCount`,
  `export`, `get`), triage, bulk actions with undo, sending, and a live `stream()`.
- `client.notifications.rules`, `client.notifications.connections`, `client.notifications.savedViews`,
  `client.notifications.cleanupPolicy` and `client.notifications.admin` (tenant configuration and recipient
  mappings).
- The `Notification*` types.

**ETL imports**

- `client.etl`: bulk updates of existing assets from CSV or Excel files.
- `etl.mappingProfiles.list()`, `listAll()`, `get()`, `create()`, `update()` (optimistic lock, stale write →
  `ConflictError`) and `delete()`.
- `etl.parseHeaders(file)` (preview), `etl.upload(file, mappingProfileIds, { dryRun })` (dry run or import),
  `etl.activities.listPage(query)` and `etl.activities.iterate(query)`.
- The `Etl*` types. Not wrapped: `GET /etl/check-mappings`, `PUT /etl/fix-mapping/{id}` and the legacy
  `POST /etl/mappings` routes (see the ETL guide).

**WebSocket**

- `subscriber.subscribe(request)` with an object form `{ types, uuids }`, `'ALL'`, one type or a list;
  `subscriber.setTagFilter(uuids)`; `subscriber.getSubscription()`.
- Events `reconnected`, `reconnect_failed`, `unknown`, `TAG_LOST` and the refetch hints; unified client
  `publisher:*` events.
- Config `reconnect`, `keepAliveIntervalMs`, `pongTimeoutMs`, `authTransport`, an injected `WebSocket`,
  `subscriptionTimeoutMs`; credential provider functions.
- Publish `timestamp`, `origin`, `extra`, per-call `mapUuid` and `appNamespace`.
- `ConnectionStatus.lastMessageAt` and `lastPongAt`; `WS_CLOSE_CODES`; `WebSocketMessageKind`, `WebSocketErrorInit` and the
  message types.
- The message type guards (`isPositionMessage`, …, `classifyMessage`) accept any value (`unknown`);
  `WEBSOCKET_DEFAULTS` gains `KEEPALIVE_INTERVAL_MS`, `PONG_TIMEOUT_MS` and `SUBSCRIPTION_TIMEOUT_MS`;
  `WebSocketConnectionError` takes an optional handshake `status`; `sendBatch()` accepts a read-only array.

### Changed

- Installing from git generates the types offline from the vendored specification (rtls-api 3.4.0) and fails
  loudly instead of ignoring a failure.
- `assets.list()` downloads the whole namespace (the server has no paging there) and applies filters, sort,
  `page`, `limit` and `fields` locally; `assets.create()` is an upsert; `assets.update()` sends a JSON merge patch;
  `assets.batchDelete()` sends one `DELETE` per MAC; `assets.getHistory()` returns at most the newest 1000 entries.
- `tagActions.send()` resolves a partial failure instead of throwing; `declaredLocations.bulkDeclare()` publishes
  one position per item whose location changed; `assetTree.get()` returns the stored value unchanged.
- `venues.list({ namespace })` honours the namespace; the `extract*FromGeoJSON` helpers skip features without a
  geometry; collections carry `total` and `hasMore` when a filter is sent; the legacy positional venue forms send
  the bag's `level`, `tag`, `nodeType` and `filters`; `accessiblePath` is never retried.
- `notifications.list()` always returns flat items; `rules.create()` requires `enabled`; `bulk()` refuses a filter
  that is not selective; `stream()` requires an `AbortSignal`; `send()` and `sendToSelf()` are never retried; ids
  are checked locally.
- ETL: `upload` defaults to a 600 000 ms timeout and `parseHeaders` to 120 000 ms; `upload` refuses a non-boolean
  `dryRun`; uploads are never retried; a CSV byte-order mark is stripped and the extension lower-cased; `update`
  sends `updated_at` as an ISO string; `activities` search is literal text.
- WebSocket: a `subscribe()` that times out still stores the request for the next reconnect; the stored
  subscription is replayed on every new socket (also a `connect()` after `disconnect()` or after
  `reconnect_failed`); a credential function that throws counts as one failed reconnect attempt; a refused
  handshake during a reconnect cycle ends it with `reconnect_failed`; `disconnected.willReconnect` is `false` when
  no attempt is left; zone-event `start_ts` / `exit_ts` are typed `string | number | null`.

### Deprecated

Working aliases, removed in 0.4.0 (replacements in the
[migration guide](docs/guides/migration-0.3.md#deprecated-aliases)):

- `client.getSettings`, `client.esQuery()`, `client.sendTagActions(ns, actions)`.
- `paginate`, the fetcher form of `collectAll`, `PaginatedResponse`, `normalizeListResponse`,
  `ValidationError.errors`, `NetworkError.networkCause`.
- `assets.getAll()`, `BatchSaveResult`, `TagActionsResult`.
- The trailing `requestOptions` argument of the 0.2 object forms (assets, positions, spatial, venues, zones,
  dashboards, alerts).
- `ListPositionsOptions`, `ListPositionsParams`, `SpatialQueryOptions`, `ZoneWithDistance`, `POIWithDistance`.
- `zones.getAll`, `zones.listByMap`, `zones.listByMapAsArray`, `venues.listMapPois`, `NavigationResponse`,
  `ZonePresenceOptions.key`.
- `alerts.getRules`, `alerts.saveRules`, the three-argument `dashboards.share`, `GetAlertsOptions`,
  `CreateDashboardData`, `UpdateDashboardData`, `SharePermissions`, `Settings`; the `namespace` field of the
  `dashboards.create()` input (use the `namespace` call option).
- `normalizeMacAddress`, `isValidMacAddress`, `POSITION_ORIGIN`, `reconnectInterval`, `maxReconnectAttempts`,
  `subscribe([])`.

### Removed

- `navigation.evacuation` (renamed `navigation.evacuationRoute`; the 0.2.0 stub never worked).
- `venues.listMapPoisAsArray` (threw `TypeError` on every call; use `venues.listPoisAsArray({ level })`).
- From the `src/websocket` barrel only (never exported from the package root): the inline fixtures,
  `BaseWebSocketConnection`, `BaseWebSocketEvents`, `TypedEventEmitter`, `EventHandler`, `EventMap`, `DebugLogger`,
  the old reconnect helpers and the 0.2.0 helper types.

### Fixed

- Navigation methods work; they threw since 0.1.0.
- `assets.create()` resolves with the stored asset (it threw `NetworkError` after writing); asset MACs are
  normalised.
- `alerts.saveRules` no longer disables every alert rule of the namespace (it posted a bare array);
  `dashboards.share` grants the requested permissions (it granted view only).
- `spatial.analyzeCustomZones()` and `spatial.analyzeCustomPois()` send the bodies the server reads (always 400
  before); `positions.publish()` resolves after a successful publish; `positions.listLast()` no longer scans the
  whole history by default; `positions.listCached({ namespace })` honours the namespace.
- Error messages of every server error envelope are read; a 400 keeps its status; `Retry-After` is read.
- No forced `Content-Type`; a text or empty 2xx body no longer throws; a user abort is `AbortError`; an invalid
  `timeoutMs` is a `ValidationError`.
- `buildQueryParams` keeps `key`, `value`, `level` and other plain keys.
- `paginate` and `collectAll` follow the server's `{ data, pagination }` envelope past page 1.
- `createWebSocket()` works with an access token, with `baseUrl` and with a per-call namespace.
- Exactly one credential is sent; path parameters are encoded; `setContext` / `withContext` can clear a value.
- WebSocket: `unsubscribe()` stops delivery; a reconnect keeps a subscription to every kind; overlapping
  `subscribe()` calls each settle; `disconnect()` while connecting ends the pending `connect()`; the client works
  without a global `WebSocket` and from the ESM build; the publisher no longer overwrites asset metadata; a
  refused credential is a `WebSocketAuthenticationError`; every unintended close reconnects with jitter; `once()`
  then `off()` removes the handler; `subscriptionTimeoutMs` and `retryInitialConnect` are configurable; debug
  logging never prints a credential. Not fixed: `sendBatch()` does not wait for the socket buffer.

### Documentation

- `README.md` rewritten for 0.3.0 as the npm landing page.
- `docs/guides/getting-started.md` and `docs/guides/error-handling.md` rewritten.
- `docs/guides/pagination-filtering.md` new (replaces the advanced patterns guide).
- `docs/guides/migration-0.3.md` new 0.2 → 0.3 migration guide (replaces the default-context migration guide of 0.2).
- Domain guides: assets, positions and spatial, venues and navigation, dashboards and alert rules,
  notifications, ETL imports, WebSocket.
- `docs/recipes/`: asset tracking view, geofence alert to notification, zone presence report, indoor routing,
  bulk declared location, each with a TypeScript and a JavaScript example.
- `docs/api/reference/` generated API reference and `docs/api/endpoint-coverage.md` (the 176 API operations and
  the SDK method that wraps each, or why it is excluded); `docs/api/README.md` signature lists removed.
- `examples/` renumbered, one TypeScript and one JavaScript file per example, runnable from a fresh checkout with
  the `ubudu-rtls-sdk` import (`npm run examples:all`).
- The internal specification proposals under `docs/development/` removed; `docs/guides/images/` screenshots
  redacted.
- `docs/guides/release-setup.md` rewritten against the CI files; `CHANGELOG.md`: the 0.1.0 entry dated and the
  0.1.1 entry added.

### Runtime

- `engines.node` is `>=20.3.0` (Node 18 is end-of-life); tested on Node 20, 22 and 24.
- Bun 1.4.4 is a verified consumer runtime of the published package (ESM and CommonJS imports and REST calls).
  Tests, build and tooling run on Node only.
- WebSocket on Node 20 needs the optional peer dependency `ws`; Node 22 and later and browsers have a global
  `WebSocket`.

## [0.2.0] - 2025-12-26

### Added
- **WebSocket Client** for real-time position streaming and publishing
  - `RtlsWebSocketSubscriber` - Subscribe to positions, zone events, alerts, assets
  - `RtlsWebSocketPublisher` - Publish positions from external tracking sources
  - `RtlsWebSocketClient` - Unified client with both pub/sub capabilities
  - Automatic reconnection with exponential backoff
  - Type-safe event handling with `SubscriptionType` enum
  - MAC address normalisation utilities
  - Message type guards (`isPositionMessage`, `isAlertMessage`, etc.)
- JavaScript examples for WebSocket functionality (subscriber, publisher, unified)
- WebSocket streaming guide (`docs/guides/websocket.md`)
- Default context support via `createRtlsClient()` factory
- GeoJSON type definitions for zones, POIs, and paths
- Flat type exports (`Zone`, `POI`, `PathNode`, `PathSegment`)
- Spatial response types with proper structures
- Response normaliser utilities (`normalizeListResponse`, `extractDataArray`)
- GeoJSON extraction utilities (`extractZonesFromGeoJSON`, `extractPoisFromGeoJSON`, etc.)
- Convenience methods for flat array access (`listAsArray`, `listPoisAsArray`, etc.)
- Path handling for venues (`listPaths`, `listPathNodes`, `listPathSegments`)

### Changed
- Zones now return GeoJSON FeatureCollection (API-aligned)
- POIs now return GeoJSON FeatureCollection (API-aligned)
- Paths now return GeoJSON FeatureCollection with nodes and segments
- Assets, venues, and maps now return direct arrays (API-aligned)
- Spatial endpoints now return structured results with metadata
- `analyzeCustomZones` and `analyzeCustomPois` now require `reference_point` in request body
- Dashboard `create` method now correctly maps `namespace` to `application_namespace`
- Cleaned up internal development documentation (removed work packages)

### Fixed
- Dashboard create endpoint field mapping for `application_namespace`
- Type conflicts between generated and custom zone/POI types

## [0.1.1] - 2025-12-26

Documentation-only release.

### Documentation
- Release setup guide: troubleshooting steps and protected CI/CD variables
- Removed the GitHub CI badge from the README (CI runs on GitLab)

## [0.1.0] - 2025-12-26

### Added
- Initial release
- Full TypeScript support with OpenAPI-generated types
- Asset management (CRUD, batch, history, stats)
- Position tracking (cached, historical, publishing)
- Zone management and presence tracking
- Venue, map, and POI operations
- Alert management
- Dashboard operations
- Navigation (shortest path, accessible, multi-stop, evacuation)
- Spatial analysis (proximity, containment, radius)
- Pagination helpers with async iterators
- Comprehensive error handling
- Request timeout and cancellation
- ESM and CJS builds
