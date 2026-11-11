# Migrating from 0.2 to 0.3

`ubudu-rtls-sdk` 0.3.0 aligns the SDK with rtls-api 3.4.0. Most changes make calls work that did not work in 0.2
(navigation, asset creation, pagination past page 1, unsubscribe); others change types to what the server really
sends. This guide lists every breaking change with the 0.2 code and its 0.3 replacement, then the deprecated
aliases, the removed APIs, the new capabilities and the behaviour fixes.

## Who is affected

- Everyone on Node 18 or on a Node 20 release before 20.3.
- Code that branches on `err.status === 422` for a bad request, on `err.code === 'RTLS_ERROR'`, or on
  `TimeoutError` after a user abort.
- Code that calls resource methods with a positional namespace (`client.assets.get(ns, mac)`): this form still
  works for the 0.2 methods, but most examples below use the default context of the client.
- Code that reads 0.2 type fields which never existed on the wire (navigation, path segments, WebSocket messages,
  dashboards).
- WebSocket handlers for zone counters, zone events, alerts and errors.

## Upgrade checklist

1. Run Node `>=20.3.0` (Node 20, 22 and 24 are tested; Bun 1.4.4 is verified as a consumer runtime).
2. Install the package under its published name: `npm install ubudu-rtls-sdk@0.3` (imports from
   `@ubudu/rtls-sdk` in the 0.2 examples never resolved; use `ubudu-rtls-sdk`).
3. Error handling: a 400 now reports `status` 400; switch on error classes or `err.status`, not on
   `err.code === 'RTLS_ERROR'`; a user abort is `AbortError`.
4. WebSocket: rename the message fields of zone counters, zone events and alerts; read `closeCode` and
   `closeReason` on WebSocket errors.
5. Navigation: pass the route as the first argument and the namespace in the options.
6. Replace each deprecated alias of the table [below](#deprecated-aliases) before 0.4.0.
7. If 0.2 `alerts.saveRules()` ever ran on a namespace, read
   [Restoring alert rules written by 0.2](#restoring-alert-rules-written-by-02).

## Breaking changes

Each entry names who is affected, shows the 0.2 code ("Before", not compiled) and the 0.3 code ("After", compiled
against the 0.3.0 package), and says why it changed.

### Runtime

#### Node.js `>=20.3.0`

Affects consumers on Node 18 (end-of-life) and on Node 20 releases before 20.3.

Before:

```json
{ "engines": { "node": ">=18" } }
```

After:

```json
{ "engines": { "node": ">=20.3.0" } }
```

Why: Node 18 is end-of-life; the SDK is tested on Node 20, 22 and 24. No code change is needed on a supported
Node version.

### Core: errors, transport, pagination, filters and context

#### A 400 reports status 400

Affects code that tested `err.status === 422` for a bad request.

Before:

<!-- snippet: skip -->
```ts
createError(400, body).status; // 422
```

After:

```ts
const err = createError(400, { error: 'bad_request', message: 'invalid kind' });
console.log(err.status, err instanceof ValidationError); // 400 true (a 422 stays 422)
```

Why: the status is the server's; both 400 and 422 are `ValidationError`.

#### The server's message and code are kept

Affects code that parsed `err.message` to find the server's error code.

Before:

<!-- snippet: skip -->
```ts
createError(400, { error: 'bad_request', message: 'invalid kind' }).message; // 'bad_request'
createError(404, { error: { code: 'X' } }).message; // '[object Object]'
```

After:

```ts
const e = createError(400, { error: 'bad_request', message: 'invalid kind' });
console.log(e.message, e.apiCode); // 'invalid kind' 'bad_request'
console.log(createError(404, { error: { code: 'X' } }).message); // 'X'
console.log(createError(409, { error: 'stale_write' }).apiCode); // 'stale_write'
```

Why: every server error envelope is read; `apiCode` holds the server's code and `message` its text.

#### A user abort is `AbortError`

Affects code that treated `TimeoutError` or `NetworkError` as "the user cancelled".

Before:

<!-- snippet: skip -->
```ts
controller.abort(); // → TimeoutError
controller.abort(new Error()); // → NetworkError
```

After:

<!-- snippet: prelude=client -->
```ts
const controller = new AbortController();
const pending = client.venues.list({ signal: controller.signal });
controller.abort(new Error('user left the page'));
try {
  await pending;
} catch (err) {
  if (err instanceof AbortError) console.log(err.code, err.cause); // 'ABORTED', the abort reason
  else if (err instanceof TimeoutError) console.log(err.timeoutMs); // only the SDK timer (timeoutMs)
}
```

Why: a cancellation is not a failure of the server or of the network.

#### `retryAfter` is set, in milliseconds

Affects code that read `retryAfter` (never set in 0.2) or assumed seconds.

Before:

<!-- snippet: skip -->
```ts
err.retryAfter; // never set
```

After:

<!-- snippet: prelude=client -->
```ts
try {
  await client.venues.list();
} catch (err) {
  if (err instanceof RateLimitError && err.retryAfter !== undefined) {
    const waitMs = err.retryAfter; // Retry-After: 17 → 17000; an HTTP date → ms until then
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}
```

Why: `Retry-After` is read on every status; milliseconds match `setTimeout` and `timeoutMs`. Code that constructs
the error passes milliseconds too: the third argument of `new RateLimitError(message, body, retryAfterMs)`.

#### One credential per request

Affects clients created with both `apiKey` and `accessToken`.

Before:

<!-- snippet: skip -->
```ts
createRtlsClient({ apiKey, accessToken }); // X-API-Key and Authorization: Bearer
```

After:

```ts
declare const apiKey: string;
declare const accessToken: string;
createRtlsClient({ apiKey, accessToken }); // Authorization: Bearer <accessToken> only
createRtlsClient({ apiKey, accessToken, auth: 'apiKey' }); // X-API-Key only
```

Why: the SDK sends exactly one credential header.

#### `Content-Type` only with a JSON body

Affects code that set `Content-Type` in the client `headers` option or relied on it being sent with GET
requests and uploads.

Before:

<!-- snippet: skip -->
```ts
createRtlsClient({ apiKey, headers: { 'Content-Type': 'application/json' } }); // sent on every request
```

After:

```ts
declare const apiKey: string;
// Content-Type is sent only with a JSON body; a Content-Type key in `headers` is ignored,
// and multipart uploads let fetch set the boundary.
createRtlsClient({ apiKey, headers: { 'X-Correlation-Id': 'checkout-42' } });
```

Why: a forced `Content-Type` broke multipart uploads.

#### `buildQueryParams` forwards every defined key

Affects code that relied on `key`, `value`, `level` and other plain keys being dropped.

Before:

<!-- snippet: skip -->
```ts
buildQueryParams({ key: 'k', value: 'v', level: 1, 'a:eq': 1, page: 1 }); // { page: '1', 'a:eq': '1' }
```

After:

```ts
buildQueryParams({ key: 'k', value: 'v', level: 1, 'a:eq': 1, page: 1 });
// { key: 'k', value: 'v', level: '1', 'a:eq': '1', page: '1' }
// buildQueryParams({ x: {} }) throws ValidationError (status 0)
```

Why: the dropped keys are server filters; an object value used to be sent as `[object Object]`.

#### Filter builders keep typed values

Affects code that read the values of a filter object as strings.

Before:

<!-- snippet: skip -->
```ts
filters.between('x', 1, 2); // { 'x:between': '1,2' }
filters.equals('n', 5); // { 'n:eq': '5' }
```

After:

```ts
console.log(filters.between('x', 1, 2)); // { 'x:between': [1, 2] }
console.log(filters.equals('n', 5)); // { 'n:eq': 5 }
console.log(serializeFilters(filters.between('x', 1, 2), 'universal')); // { 'x:between': '1,2' }
```

Why: the two server grammars serialise values differently; the wire form of the universal grammar is unchanged.

#### `setContext` and `withContext` clear a key given as `undefined`

Affects code that passed `undefined` and expected the previous value to stay.

Before:

<!-- snippet: skip -->
```ts
client.setContext({ venueId: undefined }); // ignored
```

After:

<!-- snippet: prelude=client -->
```ts
client.setContext({ venueId: undefined }); // venueId cleared
console.log(client.withContext({ venueId: undefined }).venueId); // undefined
```

Why: there was no way to clear a value.

#### Invalid ids are rejected before any request

Affects code that passed `NaN` or malformed ids (for example `Number(input)`).

Before:

<!-- snippet: skip -->
```ts
client.zones.list({ venueId: NaN }); // GET …/NaN/zones
client.setVenue(NaN); // accepted
```

After:

<!-- snippet: prelude=client -->
```ts
try {
  await client.zones.list({ venueId: Number('x') });
} catch (err) {
  if (err instanceof ContextError) console.log(err.message); // nothing was sent
}
```

Why: a `NaN` path segment reached the wrong route.

#### `ContextError` is an `RtlsError`

Affects code that tested `instanceof RtlsError` and handled context errors separately.

Before:

<!-- snippet: skip -->
```ts
err instanceof RtlsError; // false for ContextError
```

After:

```ts
declare const apiKey: string;
try {
  await createRtlsClient({ apiKey }).assets.list(); // no namespace anywhere
} catch (err) {
  if (err instanceof RtlsError) console.log(err.status, err.code); // 0 'CONTEXT_ERROR'
}
```

Why: one error hierarchy for the SDK.

#### `health()` is typed; a 503 is `ServiceUnavailableError`

Affects code that cast the health result or caught `RtlsError('HTTP 503 error')`.

Before:

<!-- snippet: skip -->
```ts
const h: Record<string, unknown> = await client.health(); // 503 → RtlsError('HTTP 503 error')
```

After:

<!-- snippet: prelude=client -->
```ts
try {
  const h: HealthStatus = await client.health();
  console.log(h.status); // 'OK'
} catch (err) {
  if (err instanceof ServiceUnavailableError) console.log(err.message); // the server's status text
}
```

Why: the health route answers a typed body; 503 is its "not ready" signal.

#### `timeoutMs: 0` and `Infinity` disable the timeout

Affects code that passed 0 (every request timed out) or `Infinity` (a `RangeError`).

Before:

<!-- snippet: skip -->
```ts
createRtlsClient({ timeoutMs: 0 }); // every request timed out
```

After:

```ts
declare const apiKey: string;
createRtlsClient({ apiKey, timeoutMs: 0 }); // no timeout (also Infinity); a negative value is a ValidationError
```

Why: 0 is the common "no timeout" convention.

#### `createWebSocket()` namespace, credential and URLs

Affects code that worked around `createWebSocket()` failing without a default namespace or with an access token.

Before:

<!-- snippet: skip -->
```ts
createRtlsClient({ apiKey }).createWebSocket({ namespace: 'x' }); // Error without a default namespace
createRtlsClient({ accessToken }).createWebSocket(); // Error
```

After:

```ts
declare const apiKey: string;
declare const accessToken: string;
createRtlsClient({ apiKey }).createWebSocket({ namespace: 'my-namespace' });
createRtlsClient({ accessToken, namespace: 'my-namespace' }).createWebSocket(); // passes the token
// no namespace anywhere → ContextError; URLs derive from baseUrl (https → wss, path kept)
```

Why: the WebSocket client follows the REST client's context and credential.

#### A non-JSON 2xx body is parsed

Affects code that caught `NetworkError` after a write that succeeded.

Before:

<!-- snippet: skip -->
```ts
await client.assets.create(ns, mac, data); // NetworkError('Unknown error occurred'), written anyway
```

After:

<!-- snippet: prelude=client -->
```ts
const asset = await client.assets.create('025d4b000001', { user_name: 'Forklift 1' });
console.log(asset.user_udid); // a text body is returned as text, an empty body as undefined
```

Why: several write routes answer `Created` as plain text or an empty body; malformed JSON is now
`ResponseParseError`.

#### The flat `PaginatedResponse` is replaced by the `Page` envelope

Affects code that read the flat 0.2 page fields or used `paginate()`.

Before:

<!-- snippet: skip -->
```ts
type PaginatedResponse<T> = { data: T[]; page; limit; total; totalPages; hasNext; hasPrev };
paginate(fetcher); // stopped after page 1 on the server's envelope
```

After:

```ts
declare function fetchPage(page: number, limit: number): Promise<Page<EtlActivity>>;
const first = await fetchPage(1, 50);
console.log(first.pagination.total, first.pagination.hasNext);
for await (const activity of paginatePages(fetchPage, { limit: 50, maxPages: 3 })) console.log(activity._id);
```

Why: the server's envelope is `{ data, pagination }`; `paginate()` (deprecated) accepts both shapes.

#### MAC path parameters are normalised

Affects code that addressed records by a MAC with separators or upper case.

Before:

<!-- snippet: skip -->
```ts
await client.assets.get(ns, '02:5D:4B:00:00:01'); // sent as given
```

After:

<!-- snippet: prelude=client -->
```ts
await client.assets.get('02:5D:4B:00:00:01'); // sent as 025d4b000001
console.log(normalizeMac('02:5D:4B:00:00:01')); // '025d4b000001'; an invalid MAC is a ValidationError
```

Why: the server stores 12 lowercase hex characters.

#### Scoped clients share the parent's connection

Affects code that registered `raw` middleware and expected scoped clients to skip it.

Before:

<!-- snippet: skip -->
```ts
client.raw.use(mw);
client.forVenue(1).raw.GET('/health'); // mw did not run
```

After:

<!-- snippet: prelude=client -->
```ts
client.raw.use({
  onRequest({ request }) {
    console.log(request.method, new URL(request.url).pathname);
    return request;
  },
});
await client.forVenue(1).raw.GET('/health'); // the middleware runs
```

Why: `forNamespace`, `forVenue`, `forMap` and `withContext` share the transport and `raw`.

#### New status classes and codes

Affects code that compared `err.code === 'RTLS_ERROR'` for 409, 410, 413, 415 and 5xx.

Before:

<!-- snippet: skip -->
```ts
createError(409, body).code; // 'RTLS_ERROR'
```

After:

```ts
const err = createError(409, { error: 'stale_write' });
if (err instanceof ConflictError) console.log(err.code); // 'CONFLICT'
// 410 GoneError, 413 PayloadTooLargeError, 415 UnsupportedMediaTypeError,
// 5xx ServerError, 503 ServiceUnavailableError
```

Why: switch on the class or on `err.status`.

### Assets, tag actions and related resources

#### `assets.create()` works and returns the stored asset

Affects every caller of `assets.create()`: 0.2 threw `NetworkError` after the write, and a new MAC failed with
500.

Before:

<!-- snippet: skip -->
```ts
await client.assets.create(ns, '025d4b000001', { user_name: 'Forklift 1' }); // threw, written anyway
```

After:

<!-- snippet: prelude=client -->
```ts
const asset = await client.assets.create('025d4b000001', { user_name: 'Forklift 1' });
console.log(asset.user_udid); // '025d4b000001'
```

Why: `user_udid` is now sent and the stored asset is read back. `create()` is an upsert: an existing asset is
merged.

#### Asset MACs are normalised

Affects code that stored or looked up assets under MACs with separators or upper case.

Before:

<!-- snippet: skip -->
```ts
await client.assets.get(ns, '02:5D:4B:00:00:01'); // the key "02:5D:4B:00:00:01" verbatim
```

After:

<!-- snippet: prelude=client -->
```ts
await client.assets.get('02:5D:4B:00:00:01'); // addresses "025d4b000001"; 'zz' throws ValidationError
```

Why: one asset, one key. An asset stored under a non-normalised key by another client is not reachable through
the SDK (USI-P2-10).

#### `assets.list()` filters, sorts and pages locally

Affects code that passed `limit`, `page`, `sort`, `fields` or `field:op` keys: the server ignored them and 0.2
returned the whole namespace.

Before:

<!-- snippet: skip -->
```ts
await client.assets.list(ns, { 'user_name:contains': 'fork', limit: 10 }); // every asset
```

After:

<!-- snippet: prelude=client -->
```ts
const some = await client.assets.list({ filters: filters.contains('user_name', 'fork'), limit: 10 });
const one = await client.assets.list({ key: 'external_id', value: 'pallet-42' }); // server-side exact match
console.log(some.length, one.length);
```

Why: the call returns what it asks for. Option keys outside the documented options no longer type-check.
`list()`, `iterate()` and `getAll()` also check their options before any request and throw `ValidationError`
(status 0) for `key` without `value` (or the reverse), an empty `key`, a `value` that is not a string, number or
boolean, a `page` below 1, a `limit` outside 1..1000, and an invalid filter operator, `sort` or `fields`
(0.2 sent them and received the whole namespace).

#### `assets.batchSave()` returns `Asset[]` and validates items

Affects code that keyed items by `mac_address` (skipped silently by the server) or used `BatchSaveResult`.

Before:

<!-- snippet: skip -->
```ts
await client.assets.batchSave(ns, [{ mac_address: '025d4b000001', user_name: 'A' }]);
```

After:

<!-- snippet: prelude=client -->
```ts
const saved: Asset[] = await client.assets.batchSave([{ user_udid: '025d4b000001', user_name: 'A' }]);
console.log(saved.length);
```

Why: each item needs `user_udid` and `user_name`, checked before sending.

#### Asset methods are typed

Affects code that cast `Record<string, unknown>` results.

Before:

<!-- snippet: skip -->
```ts
const a = await client.assets.get(ns, mac); // Record<string, unknown>
```

After:

<!-- snippet: prelude=client -->
```ts
const b: Asset = await client.assets.get('025d4b000001');
console.log(b.user_name.toUpperCase());
```

Why: `Asset`, `Asset[]`, `BatchDeleteResult` and `AssetHistoryEntry[]` describe the wire. `Asset.path` and
`Asset.user_motion` are optional (an asset may have neither), so code that read them as `string` checks them first.

#### `getHistory()` is the audit trail; `getStats()` does not exist

Affects code written from the 0.2 guide, reference or example 02: no released version contained these methods.

Before:

<!-- snippet: skip -->
```ts
await client.assets.getHistory(ns, mac, { startTime, endTime }); // absent at run time
await client.assets.getStats(ns, { startTime, endTime });
```

After:

<!-- snippet: prelude=client -->
```ts
const entries = await client.assets.getHistory('025d4b000001', { startTime: Date.now() - 7 * 86_400_000 });
console.log(entries.map((e) => e.action)); // record changes, newest first; positions: client.positions
```

Why: the server's asset history is the audit trail of the record, not positions.

#### Tag actions moved to `client.tagActions.send()`

Affects callers of `client.sendTagActions()` (now a deprecated delegate).

Before:

<!-- snippet: skip -->
```ts
await client.sendTagActions(ns, [{ macAddress: mac, action: 'ptlRed' }]);
```

After:

<!-- snippet: prelude=client -->
```ts
const r = await client.tagActions.send([{ macAddress: '025d4b000001', action: 'ptlRed', duration: 5 }]);
if (!r.success) console.log(r.results.filter((x) => !x.success));
```

Why: 11 typed actions, an optional `duration` and per-item results; a partial failure resolves instead of
throwing. The deprecated `client.sendTagActions()` runs the same local checks: a list that is not an array, a
`macAddress` that is not a MAC, an unknown `action` or a `duration` outside 1..3600 throws `ValidationError`
before any request (0.2 sent it as is).

#### `assets.getAll()` is a deprecated alias of `list()`

Affects callers of `getAll()`.

Before:

<!-- snippet: skip -->
```ts
await client.assets.getAll(ns);
```

After:

<!-- snippet: prelude=client -->
```ts
const assets = await client.assets.list();
console.log(assets.length);
```

Why: one name per operation.

#### `assets.update()` checks the patch and normalises `user_udid`

Affects code that sent `null` or empty names, or a `user_udid` that differs from the asset's MAC.

Before:

<!-- snippet: skip -->
```ts
await client.assets.update(ns, mac, { user_name: null }); // sent; the server answered 500
```

After:

<!-- snippet: prelude=client -->
```ts
await client.assets.update('025d4b000001', { user_name: 'Forklift 2' });
await client.assets.update('025d4b000001', { user_udid: '02:5D:4B:00:00:01' }); // sends "025d4b000001"
```

Why: a patch that is not an object, a `null` or empty `user_name`, a `user_udid` that is `null` or another MAC,
or a `data` that is neither an object nor `null` throws `ValidationError` (status 0) before any request; the
`AssetPatch` type refuses `null` names and the server-owned fields. A normalised `user_udid` keeps the key form
that `list()` returns.

### Positions and spatial

#### Spatial zone results are GeoJSON Features

Affects code that read `res.zones[0].name`; POI items are typed per route and `hasMore` is optional.

Before:

<!-- snippet: skip -->
```ts
const res = await client.spatial.nearestZones({ lat: 48.8, lon: 2.3 });
console.log(res.zones[0].name);
```

After:

<!-- snippet: prelude=client -->
```ts
const res = await client.spatial.nearestZones({ lat: 48.8, lon: 2.3 });
console.log(res.zones[0]?.properties.name);
```

Why: the 0.2 type never matched the wire.

#### `analyzeCustomZones` and `analyzeCustomPois` bodies corrected

Affects every caller: the 0.2 bodies always answered 400, so there is no alias.

Before:

<!-- snippet: skip -->
```ts
await client.spatial.analyzeCustomPois('ns', { reference_point: { lat, lon }, pois: [feature] });
```

After:

<!-- snippet: prelude=client -->
```ts
const pois = await client.venues.listPois();
const result = await client.spatial.analyzeCustomPois({
  lat: 48.8,
  lon: 2.3,
  customPois: pois.features,
  operation: 'nearest',
});
console.log(result);
```

Why: the server reads `custom_zones` (a FeatureCollection) and `custom_pois` with an `operation`.

#### `positions.listLast()` is bounded to the last 24 hours

Affects code that expected the whole history, or passed `page`, `limit`, `sort`, `fields` or filter keys (the
server ignored them; they are no longer sent).

Before:

<!-- snippet: skip -->
```ts
const all = await client.positions.listLast(); // scanned the whole history
```

After:

<!-- snippet: prelude=client -->
```ts
const lastDay = await client.positions.listLast(); // last 24 h
const all = await client.positions.listLast({ timestampFrom: 0, timeoutMs: 60_000 });
const cutoff = Date.now() - 3_600_000;
const dayBeforeCutoff = await client.positions.listLast({ timestampTo: cutoff }); // the 24 h before cutoff
const beforeCutoff = await client.positions.listLast({ timestampFrom: 0, timestampTo: cutoff, timeoutMs: 60_000 });
console.log(lastDay.length, all.length, dayBeforeCutoff.length, beforeCutoff.length);
```

Why: an unbounded scan is slow and heavy on the server. With only `timestampTo`, 0.2 had no lower bound; the
lower bound is now the 24 hours before it. The deprecated `ListPositionsOptions` and `ListPositionsParams`
aliases changed shape with it (no paging, sort, field or filter keys), so code that types `{ page, limit }` with
them no longer compiles.

#### Position and spatial results are typed

Affects code that cast `Record<string, unknown>`; compile-time only.

Before:

<!-- snippet: skip -->
```ts
const cached = (await client.positions.listCached(ns)) as Record<string, unknown>[];
```

After:

<!-- snippet: prelude=client -->
```ts
const cached: CachedAssetPosition[] = await client.positions.listCached();
console.log(cached[0]?.user_udid);
```

Why: `CachedAssetPosition`, `AssetPosition`, `EsSearchResponse` and the spatial result types describe the wire.
The `zone` of both position types is `PositionZone | null` (`null` outside every zone), and its `tags` and `color`
may be `null`: test `zone != null` rather than `zone !== undefined`.

#### Zone and POI lookups apply the client's default `level`

Affects clients with a default `level` that expected lookups across every floor.

Before:

<!-- snippet: skip -->
```ts
await floor2.spatial.zonesContainingPoint({ lat, lon }); // the default level was ignored
```

After:

<!-- snippet: prelude=client -->
```ts
const floor2 = client.withContext({ level: 2 });
await floor2.spatial.zonesContainingPoint({ lat: 48.8, lon: 2.3 }); // level=2
await floor2.spatial.zonesContainingPoint({ lat: 48.8, lon: 2.3, level: null }); // every level
```

Why: the default context applies to every call that takes a level.

#### `client.esQuery()` is deprecated

Affects callers of `esQuery()` (a working alias).

Before:

<!-- snippet: skip -->
```ts
await client.esQuery('ns', 'positions', dsl);
```

After:

<!-- snippet: prelude=client -->
```ts
const res = await client.positions.query('positions', { size: 1, query: { match_all: {} } });
console.log(res.hits.hits.length);
```

Why: the query belongs to the positions resource and is typed there; `esQuery()` delegates to it and keeps its
0.2 return type `Record<string, unknown>`.

#### Position MACs are normalised

Affects code that worked around `NotFoundError` for MACs with separators.

Before:

<!-- snippet: skip -->
```ts
await client.positions.getCached(ns, '02:5D:4B:00:00:01'); // NotFoundError
```

After:

<!-- snippet: prelude=client -->
```ts
await client.positions.getCached('02:5D:4B:00:00:01'); // sent as 025d4b000001
```

Why: path MACs, MAC-shaped `user_udid` / `user_uuid` of `publish()` and the history `value` are normalised; an
invalid MAC throws `ValidationError` (status 0) and sends nothing.

#### `positions.listCached({ namespace })` is honoured

Affects code that passed a namespace and silently got the client default.

Before:

<!-- snippet: skip -->
```ts
await client.positions.listCached({ namespace: 'other-namespace' }); // the client default was used
```

After:

<!-- snippet: prelude=client -->
```ts
await client.positions.listCached({ namespace: 'other-namespace' }); // queries 'other-namespace'
```

Why: bug fix.

#### Spatial methods reject out-of-range coordinates locally

Affects code that relied on the server's 500 for invalid coordinates.

Before:

<!-- snippet: skip -->
```ts
await client.spatial.nearestZones({ lat: 91, lon: 0 }); // server 500
```

After:

<!-- snippet: prelude=client -->
```ts
try {
  await client.spatial.nearestZones({ lat: 91, lon: 0 });
} catch (err) {
  if (err instanceof ValidationError) console.log(err.status); // 0, nothing sent
}
```

Why: invalid input fails fast and clearly.

#### Trailing `requestOptions` on object-first forms is deprecated

Affects calls that pass request options as a second object (still accepted; the trailing value wins).

Before:

<!-- snippet: skip -->
```ts
await client.spatial.nearestZones({ lat, lon }, { timeoutMs: 5_000 });
```

After:

<!-- snippet: prelude=client -->
```ts
await client.spatial.nearestZones({ lat: 48.8, lon: 2.3, timeoutMs: 5_000 });
```

Why: one options object per call.

### Venues, zones and navigation

#### Navigation calls take the route first

Affects every navigation caller (the 0.2 methods threw).

Before:

<!-- snippet: skip -->
```ts
await client.navigation.shortestPath('ns', { startNodeId: 'a', endNodeId: 'b', options: {} }); // threw
```

After:

<!-- snippet: prelude=client -->
```ts
await client.navigation.shortestPath({ start: 'a', end: 'b' }, { namespace: 'my-namespace', venueId: 7 });
```

Why: the namespace and venue are context; the request is the route itself.

#### Navigation request types have new shapes

Affects code that built `ShortestPathRequest`, `AccessiblePathRequest` or `MultiStopRequest` objects.

Before:

<!-- snippet: skip -->
```ts
const a: ShortestPathRequest = { startNodeId: 'a', endNodeId: 'b', options: {} };
const c: MultiStopRequest = { nodeIds: ['a', 'b', 'c'], algorithm: 'optimal' };
```

After:

```ts
const a: ShortestPathRequest = { start: 'a', end: { lat: 48.1, lon: 2.3, level: 0 }, walkingSpeed: 1.2 };
const b: AccessiblePathRequest = { start: 'a', end: 'b', returnToStart: true };
const c: MultiStopRequest = { start: 'a', stops: ['b', 'c'], algorithm: 'twoOpt', optimizeOrder: true };
console.log(a, b, c);
```

Why: the types follow what the server reads; an endpoint is a node id or a point. `startNodeId` / `endNodeId`
become `start` / `end`, `nodeIds` becomes `start` plus `stops`, and `options.returnToStart` moves to the top level.
`options.avoidStairs`, `options.avoidElevators`, `accessibility` and `preferElevator` are gone without replacement:
the server ignores them (USI-P4-9). `MultiStopRequest.algorithm` takes `'twoOpt'`, `'nearestNeighbor'` or
`'simulatedAnnealing'` instead of `'nearest'` or `'optimal'`.

#### Nearest POI and evacuation

Affects callers of `nearestPoi` and `evacuation` (both threw in 0.2; `evacuation` is renamed).

Before:

<!-- snippet: skip -->
```ts
await client.navigation.nearestPoi('ns', 'n1');
await client.navigation.evacuation('ns', 'n1');
```

After:

<!-- snippet: prelude=client -->
```ts
await client.navigation.nearestPoi('n1', { poiType: 'all' });
await client.navigation.evacuationRoute('n1');
```

Why: the methods are real calls; the new name says what is returned.

#### `NavigationResponse` is a deprecated alias of `RouteResult`

Affects code typed with the stale generated `NavigationResponse`.

Before:

<!-- snippet: skip -->
```ts
const r: NavigationResponse = generatedShape;
```

After:

<!-- snippet: prelude=client -->
```ts
const r: RouteResult = await client.navigation.shortestPath({ start: 'a', end: 'b' });
console.log(r.path.length);
```

Why: `RouteResult` is the shape the route returns.

#### `PathSegment` and `PathSegmentProperties` field names

Affects code that read segment fields; the 0.2 names were always `undefined`.

Before:

<!-- snippet: skip -->
```ts
segment.startNodeId; segment.endNodeId; segment.isBidirectional; segment.weight;
feature.properties.start_node_id; feature.properties.end_node_id;
```

After:

```ts
declare const segment: PathSegment;
declare const feature: PathSegmentFeature;
console.log(segment.sourceNodeId, segment.targetNodeId, segment.bidirectional, segment.distance);
console.log(feature.properties.source_node_id, feature.properties.target_node_id, feature.properties.bidirectional);
```

Why: the names follow the wire.

#### `PathNode` node types

Affects code that switched on `'exit'` or `'stairs'`.

Before:

<!-- snippet: skip -->
```ts
type NodeType = 'waypoint' | 'entrance' | 'exit' | 'elevator' | 'stairs';
```

After:

```ts
const kinds: PathNodeType[] = ['waypoint', 'entrance', 'elevator', 'staircase', 'restroom', 'escalator', 'emergency_exit'];
console.log(kinds);
```

Why: these are the node types the server stores; other strings are accepted too.

#### `crossLevelConnections` entries may be objects

Affects code that treated every connection as a number.

Before:

<!-- snippet: skip -->
```ts
const ids: number[] = node.crossLevelConnections;
```

After:

```ts
declare const node: PathNode;
const ids = node.crossLevelConnections.map((c) => (typeof c === 'number' ? c : c.target_node_id));
console.log(ids);
```

Why: the server stores either form.

#### `venues.listMapPois()` returns `MapPoisResponse`

Affects callers of `listMapPois()` (now deprecated): the wire was never GeoJSON.

Before:

<!-- snippet: skip -->
```ts
const fc: POIFeatureCollection = await client.venues.listMapPois();
```

After:

<!-- snippet: prelude=client -->
```ts
const { items, total }: MapPoisResponse = await client.venues.listMapPois(); // deprecated
console.log(items.length, total);
```

Why: the type follows the wire; prefer `venues.listPois({ level })`.

#### `venues.listMapPoisAsArray()` is removed

Affects nobody in practice: it threw `TypeError` on every call in 0.2.

Before:

<!-- snippet: skip -->
```ts
await client.venues.listMapPoisAsArray(); // threw TypeError
```

After:

<!-- snippet: prelude=client -->
```ts
await client.venues.listPoisAsArray({ level: 1 });
```

Why: the map-level routes serve a bundled sample dataset.

#### Collection `metadata` is optional

Affects code that read `metadata.count` without a check.

Before:

<!-- snippet: skip -->
```ts
const count = (await client.zones.list()).metadata.count;
```

After:

<!-- snippet: prelude=client -->
```ts
const col = await client.zones.list({ level: 0 });
console.log(col.metadata?.count, col.total); // total is set when a filter was sent
```

Why: the server omits `metadata` on some collections.

#### `POI` and `POIProperties` field types

Affects code that assumed a numeric `id` or a present `description`.

Before:

<!-- snippet: skip -->
```ts
const id: number = poi.id;
const text: string = poi.description;
```

After:

```ts
declare const poi: POI;
const id: number | string = poi.id;
const text = poi.description ?? '';
console.log(id, text);
```

Why: the server stores both id forms and an optional description. `POI.color` is optional too, and so is every
`POIProperties` field except `id`, `name` and `level`: `color`, `tags`, `_id`, `coordinates`, `createdAt`,
`updatedAt`, `externalId`, `externalVenueId`, `externalApplicationId` and `index`.

#### Client-side argument errors in venue methods

Affects code that sent malformed venue or map ids.

Before:

<!-- snippet: skip -->
```ts
await client.zones.list({ venueId: Number('x') }); // sent GET /venues/ns/NaN/zones
```

After:

<!-- snippet: prelude=client -->
```ts
try {
  await client.zones.list({ venueId: Number('x') });
} catch (err) {
  if (err instanceof ContextError) console.log(err.message); // no request
}
```

Why: a malformed id reached the wrong route.

#### `venues.list({ namespace })` is honoured

Affects code that passed a namespace and got the client default.

Before:

<!-- snippet: skip -->
```ts
await client.venues.list({ namespace: 'other' }); // queried the default namespace
```

After:

<!-- snippet: prelude=client -->
```ts
await client.venues.list({ namespace: 'other-namespace' }); // queries 'other-namespace'
```

Why: bug fix.

#### Venue and map types

Affects code that cast `Record<string, unknown>[]` results.

Before:

<!-- snippet: skip -->
```ts
const venues: Record<string, unknown>[] = await client.venues.list();
```

After:

<!-- snippet: prelude=client -->
```ts
const venues: VenueSummary[] = await client.venues.list();
const venue: VenueDetails = await client.venues.get({ venueId: venues[0].id });
const maps: IndoorMap[] = await client.venues.listMaps({ venueId: venue.id });
console.log(maps.length);
```

Why: typed venues and maps (lat-first `map_bounds`, tile template, opening hours). `venues.iterate()` yields
`VenueSummary` items as well.

#### `Venue` and `MapData` are the typed shapes

Affects code that used index access or arbitrary keys on these aliases (they were `Record<string, unknown>`).

Before:

<!-- snippet: skip -->
```ts
const venue: Venue = await client.venues.get();
venue['anything'];
```

After:

<!-- snippet: prelude=client -->
```ts
const venue: Venue = await client.venues.get(); // Venue = VenueDetails; MapData = IndoorMap
console.log(venue.name);
```

Why: the specification has no such schema; the aliases now name the typed shapes.

#### An unexpected list body of `venues.list()` or `listMaps()` is an error

Affects code that relied on an empty array for a body that was neither an array nor `{ data: [...] }`.

Before:

<!-- snippet: skip -->
```ts
await client.venues.list(); // [] for such a body
```

After:

<!-- snippet: prelude=client -->
```ts
try {
  await client.venues.list();
} catch (err) {
  if (err instanceof ResponseParseError) console.log(err.message); // the body was not a list
}
```

Why: a silent `[]` hid a server or proxy error.

#### `ListVenuesOptions`

Affects code that typed options with arbitrary keys.

Before:

<!-- snippet: skip -->
```ts
const o: ListVenuesOptions = { namespace: 'ns', anything: 1 };
```

After:

```ts
const o: ListVenuesOptions = { namespace: 'my-namespace', filters: filters.equals('name', 'Hall A'), timeoutMs: 5_000 };
console.log(o);
```

Why: the options are the ones the call reads.

#### Per-call `level` on venue list methods

Affects code that passed `level` and expected every floor (the option was ignored).

Before:

<!-- snippet: skip -->
```ts
await client.zones.list({ level: 1 }); // ignored: every zone
```

After:

<!-- snippet: prelude=client -->
```ts
await client.zones.list({ level: 1 }); // zones of floor 1 only (the client default level is not applied)
```

Why: the option now reaches the server as a filter.

#### A malformed per-call `level` is refused

Affects code that passed a non-integer level (it was ignored).

Before:

<!-- snippet: skip -->
```ts
await client.venues.listMaps({ level: 0.5 }); // level ignored: every map
```

After:

<!-- snippet: prelude=client -->
```ts
try {
  await client.venues.listMaps({ level: 0.5 });
} catch (err) {
  if (err instanceof ContextError) console.log(err.message); // no request
}
```

Why: the level is now a server filter; an invalid one fails locally.

#### `zones.getPresence()`

Affects code that passed both bounds and the key and cast the result.

Before:

<!-- snippet: skip -->
```ts
const slots: Record<string, unknown>[] = await client.zones.getPresence({ timestampFrom: a, timestampTo: b, key: 'user.udid', value: mac });
```

After:

<!-- snippet: prelude=client -->
```ts
const slots: ZonePresenceSlot[] = await client.zones.getPresence({ value: '02:5D:4B:00:00:01' }); // last 24 h
console.log(slots.length);
```

Why: bounds default to the last 24 hours, the MAC is normalised and the slots are typed.

#### `zones.getAll()`, `zones.listByMap*()` and `venues.listMapPois()` are deprecated

Affects callers of these methods (still working).

Before:

<!-- snippet: skip -->
```ts
await client.zones.getAll();
await client.zones.listByMap({ mapId: 3 });
```

After:

<!-- snippet: prelude=client -->
```ts
await client.zones.listAsArray();
await client.zones.list({ level: 0 });
```

Why: the map-level routes serve a bundled sample dataset; the floor is a `level` filter.

#### Trailing `requestOptions` on venue and zone methods is deprecated

Affects calls that pass request options as a second object (still accepted; the trailing keys win).

Before:

<!-- snippet: skip -->
```ts
await client.zones.list({ venueId: 7 }, { timeoutMs: 5_000 });
```

After:

<!-- snippet: prelude=client -->
```ts
await client.zones.list({ venueId: 7, timeoutMs: 5_000 });
```

Why: one options object per call.

### Dashboards, alert rules, alerts, settings and health

#### `alerts.getRules()` returns `AlertRuleSet`

Affects code that cast the result to an array (the runtime value was an object). Deprecated: use
`client.alertRules.get()`.

Before:

<!-- snippet: skip -->
```ts
const rules = (await client.alerts.getRules()) as Record<string, unknown>[]; // runtime: { name, rules }
await client.alerts.getRules({ namespace: 'other' }); // ignored the option
```

After:

<!-- snippet: prelude=client -->
```ts
const { name, rules } = await client.alertRules.get();
console.log(name, rules.length);
await client.alerts.getRules({ namespace: 'other-namespace' }); // targets 'other-namespace'
```

Why: the type follows the stored document; the namespace option is honoured.

#### Dashboard types use `_id`

Affects code that read `d.id` (always `undefined`).

Before:

<!-- snippet: skip -->
```ts
const d = await client.dashboards.get(id); // Record<string, unknown>
console.log(d.id); // undefined
```

After:

<!-- snippet: prelude=client -->
```ts
const [first] = await client.dashboards.list();
const d: Dashboard = await client.dashboards.get(first._id);
console.log(d._id, d.can_edit, d.shared_with?.length);
```

Why: the hand-written `Dashboard` type follows the wire.

#### `dashboards.create()` forwards every field

Affects code that relied on `description` or `dynamicVariables` being dropped, on `data` defaulting to `{}`, or
on a plain `Error` without a namespace.

Before:

<!-- snippet: skip -->
```ts
await client.dashboards.create({ name: 'n', namespace: 'ns' }); // description, dynamicVariables… dropped
```

After:

<!-- snippet: prelude=client -->
```ts
await client.dashboards.create(
  { name: 'n', description: 'd', dynamicVariables: [{ id: 'v', name: 'var' }] },
  { namespace: 'my-namespace' }
);
```

Why: every field reaches the server; `data` defaults to `[]`; a missing namespace is a `ContextError`.

#### `Dashboard.data` is optional; `data: {}` is refused

Affects code that created dashboards with `data: {}` (the 0.2 default) or read `data` without a check.

Before:

<!-- snippet: skip -->
```ts
await client.dashboards.create({ name: 'n', data: {} }); // stored without data; later updates fail
```

After:

<!-- snippet: prelude=client -->
```ts
const created = await client.dashboards.create({ name: 'n' }); // data [] (or a non-empty object)
const widgets = (await client.dashboards.get(created._id)).data ?? [];
console.log(widgets);
```

Why: the server drops an empty object, and every later update of that dashboard fails (USI-P5-10);
`create()` and `update()` reject `data: {}` with `ValidationError` (details `['data']`), nothing sent.

#### `dashboards.update()` and `dashboards.unshare()`

Affects code that passed partial 0.2 shapes.

Before:

<!-- snippet: skip -->
```ts
await client.dashboards.update(id, { name: 'n', data: {} });
await client.dashboards.unshare(id, ['u']);
```

After:

<!-- snippet: prelude=client -->
```ts
declare const id: string;
await client.dashboards.update(id, { description: 'd', dynamicVariables: [] });
await client.dashboards.unshare(id, 'colleague'); // or an array of user names
```

Why: `update` takes the full `UpdateDashboardInput` (`null` `dynamicVariables` is rejected locally).

#### `alerts.list()` time range, bounds and result type

Affects code that always passed both bounds and cast the result.

Before:

<!-- snippet: skip -->
```ts
const alerts = (await client.alerts.list({ timestampFrom: from, timestampTo: to })) as unknown[];
```

After:

<!-- snippet: prelude=client -->
```ts
const alerts: AlertEvent[] = await client.alerts.list({ timestampFrom: new Date(Date.now() - 86_400_000), size: 100 });
console.log(alerts.length);
```

Why: the range defaults to the last 24 hours, bounds accept `Date | number | string`, and `size` is validated
(integer 1…10 000).

#### `AlertRule` is the stored-rule shape

Affects code that built rules with the generated shape `{ id, name, type, enabled }`, which the server never
stored (USI-P5-1).

Before:

<!-- snippet: skip -->
```ts
const rule: AlertRule = { id: 'r1', name: 'Zone entry', type: 'zone_entry', enabled: true };
```

After:

```ts
const rule: AlertRule = {
  id: 'r1',
  conditions: { all: [{ fact: 'zone_name', operator: 'equal', value: 'Dock' }] },
  event: {
    type: 'message',
    params: { title: 'Dock', text: 'Entered the dock', style: 'info', duration: 5, coalescence: 60, coalescence_group: 'dock' },
  },
};
console.log(rule.id);
```

Why: `conditions` and `event` are required, `disabled` and `priority` optional, extra keys allowed.

#### `alerts.saveRules()` types

Affects callers that passed `Record<string, unknown>[]` or read a result (deprecated method).

Before:

<!-- snippet: skip -->
```ts
const saved: Record<string, unknown>[] = await client.alerts.saveRules(rules as Record<string, unknown>[]);
```

After:

<!-- snippet: prelude=client -->
```ts
declare const rules: AlertRule[];
await client.alerts.saveRules(rules); // void; prefer client.alertRules.replace(set)
```

Why: the parameter is `AlertRule[] | AlertRuleSet` and the method resolves `void`.

#### `GetAlertsOptions` is an alias of `ListAlertsOptions`

Affects code that read the bounds as numbers (they were required numbers; now optional `Date | number | string`).

Before:

<!-- snippet: skip -->
```ts
const span = (o: GetAlertsOptions): number => o.timestampTo - o.timestampFrom;
```

After:

```ts
const o: ListAlertsOptions = { timestampFrom: Date.now() - 3_600_000 }; // ends now
console.log(o);
```

Why: both bounds are optional (deprecated alias).

#### `client.getSettings()` uses the default context and is deprecated

Affects callers of `getSettings(ns)`.

Before:

<!-- snippet: skip -->
```ts
const settings = await client.getSettings('ns');
```

After:

<!-- snippet: prelude=client -->
```ts
const settings: NamespaceSettings = await client.settings.get(); // or { namespace }
console.log(Object.keys(settings).length);
```

Why: settings are a resource like the others.

#### `client.health()` is typed

Affects code that cast the health result or caught `RtlsError('HTTP 503 error')`. Same change as the core entry
above, listed again in this section.

Before:

<!-- snippet: skip -->
```ts
const health = (await client.health()) as Record<string, unknown>;
```

After:

<!-- snippet: prelude=client -->
```ts
try {
  const { status } = await client.health();
  console.log(status);
} catch (err) {
  if (err instanceof ServiceUnavailableError) console.log(err.message); // the server's status text
}
```

Why: typed `HealthStatus`; 503 is a typed error.

#### Client-side validation of dashboards, alert rules and alert bounds

Affects code that relied on the server to reject empty ids or invalid input.

Before:

<!-- snippet: skip -->
```ts
await client.dashboards.get(''); // requested GET /dashboards/ (the list route)
```

After:

<!-- snippet: prelude=client -->
```ts
try {
  await client.dashboards.get('');
} catch (err) {
  if (err instanceof ValidationError) console.log(err.status, err.details); // 0 ['id'], nothing sent
}
```

Why: an empty id reached a different route.

### Notifications

No breaking change: `client.notifications` is new in 0.3.0.

### ETL imports

No breaking change: `client.etl` is new in 0.3.0.

### WebSocket

#### `ZoneStatsMessage` field names

Affects every zone-counter handler: the 0.2 names never appeared on the wire.

Before:

<!-- snippet: skip -->
```ts
subscriber.on('ZONE_STATS_EVENTS', (stats) => console.log(stats.zone_id, stats.total_count, stats.tag_count));
```

After:

<!-- snippet: prelude=subscriber -->
```ts
subscriber.on('ZONE_STATS_EVENTS', (stats) => {
  console.log(stats.zone.properties.id, stats.total, stats.total_tags, stats.avg_time);
});
```

Why: the fields follow the wire (`total`, `total_tags`, `total_mobiles`, `avg_time`, `avg_time_tags`,
`avg_time_mobiles`, `zone`, optional `map_uuid` and `is_synthetic_exit`). The 0.2 `type` field is gone too.

#### `ZoneEntryExitMessage`

Affects zone-event handlers: the tag is `user_udid`; `zone` is a Feature, an id stub or `null` (outside all
zones); `event_type` is `'ENTER_ZONE' | 'EXIT_ZONE'`.

Before:

<!-- snippet: skip -->
```ts
subscriber.on('ZONES_ENTRIES_EVENTS', (e) => console.log(e.user_uuid, e.event_type));
```

After:

<!-- snippet: prelude=subscriber -->
```ts
subscriber.on('ZONES_ENTRIES_EVENTS', (e) =>
  console.log(e.user_udid, e.event_type, e.zone === null ? 0 : e.zone.properties.id)
);
```

Why: the six 0.2 event types never occurred. New optional fields: `visit_id`, `start_ts`, `exit_ts`, `path`,
`model`, `color`, `data`, `external_id`, `tags`, `user_name`. The 0.2 fields `user_uuid`, `user_type` and `type` are
gone: a zone event carries none of them.

#### `AlertMessage`

Affects alert handlers: `user_udid` (not `user_uuid`) is optional, `params` is optional, and there is no
`timestamp`, `type` or `alert_type`.

Before:

<!-- snippet: skip -->
```ts
subscriber.on('ALERTS', (a) => console.log(a.user_uuid, a.params.text, a.timestamp));
```

After:

<!-- snippet: prelude=subscriber -->
```ts
subscriber.on('ALERTS', (a) => console.log(a.user_udid ?? 'zone-triggered', a.params?.text));
```

Why: an alert carries the tag only when a position triggered the rule; the platform adds no timestamp.

#### `PositionMessage`

Affects code that read the fictional `type` field.

Before:

<!-- snippet: skip -->
```ts
subscriber.on('POSITIONS', (p) => { if (p.type === 'POSITIONS') console.log(p.lat, p.lon); });
```

After:

<!-- snippet: prelude=subscriber -->
```ts
subscriber.on('POSITIONS', (p) => console.log(p.user_uuid, p.lat, p.lon, p.zone.id));
```

Why: `user_uuid`, `user_udid`, `map_uuid`, `timestamp` and `zone` are always present; other published fields are
admitted by an index signature.

#### `AssetMessage.data`

Affects asset handlers that read `data.user_uuid`.

Before:

<!-- snippet: skip -->
```ts
subscriber.on('ASSETS', (m) => console.log(m.data?.user_uuid)); // typed string
```

After:

<!-- snippet: prelude=subscriber -->
```ts
subscriber.on('ASSETS', (m) => console.log(m.mac_address, m.data?.user_udid, m.data?.external_id ?? 'none'));
```

Why: `data` is the stored asset record (`WsAssetData`), which has no `user_uuid` (any such key is typed `unknown`
through the index signature); `external_id` may be `null`.

#### `SubscriptionConfirmation`

Affects code that read `type` or `types` from the confirmation.

Before:

<!-- snippet: skip -->
```ts
subscriber.on('message', (m) => { if (isSubscriptionConfirmation(m)) console.log(m.types); });
```

After:

<!-- snippet: prelude=subscriber -->
```ts
subscriber.on('message', (m) => {
  if (isSubscriptionConfirmation(m)) console.log(m.app_namespace);
});
```

Why: the broker's reply is `{ action: 'subscribeEvent', app_namespace }`; `subscribe()` resolves with what was
requested.

#### `SubscribeMessage`

Affects code that built subscribe frames with `map_uuid`.

Before:

<!-- snippet: skip -->
```ts
const frame: SubscribeMessage = { type: 'SUBSCRIBE', app_namespace: 'ns', map_uuid: 'm' };
```

After:

```ts
const frame: SubscribeMessage = { type: 'SUBSCRIBE', app_namespace: 'my-namespace', uuids: ['025d4b000001'] };
console.log(frame);
```

Why: the broker never reads `map_uuid`; `uuids` is the tag filter.

#### `SubscriptionResult`

Affects code that read `types` from the result (it was always `'ALL'`).

Before:

<!-- snippet: skip -->
```ts
const { types } = await subscriber.subscribe([SubscriptionType.POSITIONS]); // 'ALL'
```

After:

<!-- snippet: prelude=subscriber -->
```ts
const { types, uuids } = await subscriber.subscribe([SubscriptionType.POSITIONS]); // ['POSITIONS'], null
console.log(types, uuids);
```

Why: the result echoes the request.

#### `classifyMessage()` returns `WebSocketMessageKind`

Affects code that switched on `'SUBSCRIPTION_CONFIRMATION'` or treated `CLEAR_ALERT` as an alert.

Before:

<!-- snippet: skip -->
```ts
if (classifyMessage(msg) === 'SUBSCRIPTION_CONFIRMATION') console.log('ready');
```

After:

<!-- snippet: prelude=subscriber -->
```ts
subscriber.on('message', (msg) => {
  if (classifyMessage(msg) === 'CONFIRMATION') console.log('ready');
});
```

Why: 13 kinds from the wire discriminators only; `event_type: 'CLEAR_ALERT'` is `UNKNOWN`.

#### The publisher adds no default fields

Affects callers that relied on `model: 'GenericTag'`, `color: '#0088FF'`, `user_name: <MAC>`, `device_info`,
`origin: 4` or `data: {}` being added.

Before:

<!-- snippet: skip -->
```ts
await publisher.sendPosition({ macAddress: '02:5D:4B:00:00:01', latitude: 48.85, longitude: 2.35 });
```

After:

<!-- snippet: prelude=publisher -->
```ts
await publisher.sendPosition({
  macAddress: '02:5D:4B:00:00:01',
  latitude: 48.85,
  longitude: 2.35,
  name: '02:5D:4B:00:00:01',
  model: 'GenericTag',
  color: '#0088FF',
});
```

Why: the defaults overwrote the real asset metadata for every consumer; delivered positions now show the
platform's `origin`.

#### Publisher input is validated before connecting

Affects code that expected a socket to open for an invalid position or for `sendBatch([])`.

Before:

<!-- snippet: skip -->
```ts
const r = await publisher.sendPosition({ macAddress: 'zz', latitude: 0, longitude: 0 }); // connected first
```

After:

<!-- snippet: prelude=publisher -->
```ts
const r = await publisher.sendPosition({ macAddress: 'zz', latitude: 0, longitude: 0 });
if (!r.success) console.error(r.error); // 'Invalid MAC …', no socket opened
```

Why: latitude, longitude, map and `extra` keys are checked first; results keep their shape.

#### Publisher without `mapUuid` throws `ContextError`

Affects code that caught a plain `Error`.

Before:

<!-- snippet: skip -->
```ts
new RtlsWebSocketPublisher({ namespace: 'ns', apiKey: 'k', mapUuid: '' }); // Error
```

After:

```ts
try {
  new RtlsWebSocketPublisher({ namespace: 'my-namespace', apiKey: 'k', mapUuid: '' });
} catch (err) {
  if (err instanceof ContextError) console.error(err.message);
}
```

Why: aligned with the SDK's context errors.

#### `unsubscribe()` really stops delivery

Affects code that called `unsubscribe([...])` and kept filtering on the client.

Before:

<!-- snippet: skip -->
```ts
await subscriber.unsubscribe([SubscriptionType.POSITIONS]); // positions kept arriving
```

After:

<!-- snippet: prelude=subscriber -->
```ts
await subscriber.unsubscribe(SubscriptionType.POSITIONS); // stops positions
await subscriber.unsubscribe(); // stops everything; the socket stays open
```

Why: the SDK sends `UNSUBSCRIBE`, then `SUBSCRIBE` with the remaining types.

#### WebSocket error fields

Affects code that read the close code from `code` or the close reason from `reason`.

Before:

<!-- snippet: skip -->
```ts
subscriber.on('error', ({ error }) => console.log(error.code, error.reason)); // 1006, 'abnormal'
```

After:

<!-- snippet: prelude=subscriber -->
```ts
subscriber.on('error', ({ error }) => {
  console.log(error.closeCode, error.closeReason, error.code, error.reason, error.status);
});
```

Why: every WebSocket error extends `StreamError` (an `RtlsError`); `code` is the SDK class code and `reason` the
stream reason (`'network' | 'protocol' | 'idle_timeout'`).

#### WebSocket error constructors

Affects code that constructs WebSocket errors (for example in tests or mocks) or reads `cause` and
`subscriptionTypes` with their 0.2 types.

Before:

<!-- snippet: skip -->
```ts
const err = new WebSocketError('closed', 1006, 'abnormal');
const failed: SubscriptionType[] | undefined = subscriptionError.subscriptionTypes;
```

After:

```ts
const err = new WebSocketError('closed', { closeCode: 1006, closeReason: 'abnormal' });
const lost = new WebSocketConnectionError('lost', new Error('socket hang up'));
const refused = new WebSocketSubscriptionError('refused', 'ALL');
console.log(err.closeCode, lost.cause, refused.subscriptionTypes); // 1006, the Error, 'ALL'
```

Why: the close code and reason moved out of `code` and `reason` (see above), so the base constructor takes an
`init` object (`closeCode`, `closeReason`, `reason`, `status`, `cause`, `code`). `WebSocketConnectionError.cause` is
`unknown` (it was `Error | undefined`), and `WebSocketSubscriptionError.subscriptionTypes` is `'ALL'` when the
failed request covered every type.

#### `WebSocketAuthenticationError(message, status)`

Affects code that constructed the error with a close code.

Before:

<!-- snippet: skip -->
```ts
const err = new WebSocketAuthenticationError('denied', 4001);
```

After:

```ts
const err = new WebSocketAuthenticationError('denied', 401);
console.log(err.status); // 401
```

Why: the second argument is the HTTP status of a refused handshake.

#### `ErrorEventData.error` is a `WebSocketError`

Affects handlers typed with `Error`.

Before:

<!-- snippet: skip -->
```ts
subscriber.on('error', ({ error }: { error: Error }) => console.error(error.message));
```

After:

<!-- snippet: prelude=subscriber -->
```ts
subscriber.on('error', ({ error }) => console.error(error.code, error.message));
```

Why: every emitted error is a WebSocket error.

#### `disconnected` fires only after an open connection

Affects code that counted failed attempts with `disconnected`.

Before:

<!-- snippet: skip -->
```ts
subscriber.on('disconnected', ({ code }) => console.log('lost', code));
```

After:

<!-- snippet: prelude=subscriber -->
```ts
subscriber.on('disconnected', ({ code, willReconnect }) => console.log('lost', code, willReconnect));
subscriber.on('reconnect_failed', ({ attempts }) => console.log('gave up after', attempts));
```

Why: a failed attempt is not a disconnection.

#### Every unintended close reconnects, with jitter

Affects code that relied on close code 1000 not reconnecting, or used the flat reconnect options (deprecated).

Before:

<!-- snippet: skip -->
```ts
new RtlsWebSocketSubscriber({ namespace: 'ns', apiKey: 'k', reconnectInterval: 5000, maxReconnectAttempts: 10 });
```

After:

```ts
const s = new RtlsWebSocketSubscriber({
  namespace: 'my-namespace',
  apiKey: 'k',
  reconnect: { initialDelayMs: 5000, maxAttempts: 10, jitter: 'full' },
});
console.log(s.isConnected());
```

Why: any close that `disconnect()` did not start is unintended; the old keys still work.

#### Missing namespace or credential

Affects code that caught a plain `Error` from the subscriber constructor.

Before:

<!-- snippet: skip -->
```ts
new RtlsWebSocketSubscriber({ namespace: '', apiKey: 'k' }); // Error
```

After:

```ts
try {
  new RtlsWebSocketSubscriber({ namespace: '', apiKey: 'k' });
} catch (err) {
  if (err instanceof ContextError || err instanceof WebSocketAuthenticationError) console.error(err.message);
}
```

Why: `ContextError` for the namespace, `WebSocketAuthenticationError` (status 0) for the credential.

#### Subscriber `mapUuid` filters on the client

Affects code that expected the server to filter by map.

Before:

<!-- snippet: skip -->
```ts
new RtlsWebSocketSubscriber({ namespace: 'ns', apiKey: 'k', mapUuid: 'm' }); // sent, ignored by the server
```

After:

```ts
const s = new RtlsWebSocketSubscriber({ namespace: 'my-namespace', apiKey: 'k', mapUuid: 'm' });
s.on('POSITIONS', (p) => console.log(p.map_uuid)); // only 'm'
```

Why: the broker never read it (USI-P8-2).

#### Unified client `mapUuid` is the publisher's map only

Affects code that relied on the unified client's `mapUuid` filtering the subscriber.

Before:

<!-- snippet: skip -->
```ts
new RtlsWebSocketClient({ namespace: 'ns', apiKey: 'k', mapUuid: 'm' }); // subscriber filtered by 'm' too
```

After:

```ts
const c = new RtlsWebSocketClient({ namespace: 'my-namespace', apiKey: 'k', mapUuid: 'm' });
console.log(c.getSubscriber()); // receives every map
```

Why: `mapUuid` names the publisher's map.

#### Listener helpers take an event name, not a type argument

Affects code that called `removeAllListeners`, `listenerCount` or `hasListeners` of the subscriber or the
publisher with an explicit type argument.

Before:

<!-- snippet: skip -->
```ts
subscriber.listenerCount<'POSITIONS'>('POSITIONS');
```

After:

<!-- snippet: prelude=subscriber -->
```ts
console.log(subscriber.listenerCount('POSITIONS'), subscriber.hasListeners('ALERTS'));
subscriber.removeAllListeners('POSITIONS');
```

Why: the three helpers are no longer generic; a call without a type argument compiles as before.

## Deprecated aliases

Each alias works in 0.3.x and is removed in 0.4.0.

| Deprecated | Replacement | Removed in |
|---|---|---|
| `client.getSettings(ns?, options?)` | `client.settings.get({ namespace })` | 0.4.0 |
| `client.esQuery(ns, dataType, query, options?)` | `client.positions.query(dataType, query, { namespace })` | 0.4.0 |
| `client.sendTagActions(ns, actions, options?)` | `client.tagActions.send(actions, { namespace })` | 0.4.0 |
| `paginate(fetcher)`, `collectAll(fetcher)` | `paginatePages(fetchPage)`, `collectAll(iterable)` | 0.4.0 |
| `PaginatedResponse<T>` (flat) | `Page<T>` | 0.4.0 |
| `normalizeListResponse` | `normalizePage` | 0.4.0 |
| `ValidationError.errors` | `details` | 0.4.0 |
| `NetworkError.networkCause` | `cause` | 0.4.0 |
| `assets.getAll()` | `assets.list()` | 0.4.0 |
| `BatchSaveResult` | `Asset[]` (the result of `batchSave()`) | 0.4.0 |
| `TagActionsResult` | `TagActionsResponse` | 0.4.0 |
| Trailing `requestOptions` of `assets.list(options, requestOptions)` and `assets.getAll()` | `signal` / `timeoutMs` in the options object | 0.4.0 |
| Trailing `requestOptions` of the object-first position and spatial methods | `signal` / `timeoutMs` / `headers` in the options object | 0.4.0 |
| `ListPositionsOptions`, `ListPositionsParams` | `ListLastPositionsOptions` (`& CallContext`) | 0.4.0 |
| `SpatialQueryOptions`, `ZoneWithDistance`, `POIWithDistance` | `NearestQueryOptions`, `SpatialZoneMatch`, `SpatialPoiMatch` | 0.4.0 |
| `zones.getAll()` | `zones.listAsArray()` | 0.4.0 |
| `zones.listByMap()`, `zones.listByMapAsArray()` | `zones.list({ level })`, `zones.listAsArray({ level })` | 0.4.0 |
| `venues.listMapPois()` | `venues.listPois({ level })` | 0.4.0 |
| `NavigationResponse` | `RouteResult` | 0.4.0 |
| `ZonePresenceOptions.key` | the default key (`user.udid`), the only one that returns data | 0.4.0 |
| Trailing `requestOptions` of the 0.2 two-object venue and zone forms | request options in the first object | 0.4.0 |
| `alerts.getRules()`, `alerts.saveRules()` | `client.alertRules.get()`, `replace()`, `upsertRule()` | 0.4.0 |
| `dashboards.share(id, username, permissions)` | `dashboards.share(id, { username, permissions })` | 0.4.0 |
| Trailing `requestOptions` of `dashboards.list*()` and `alerts.list()` | request options in the options object | 0.4.0 |
| `GetAlertsOptions`, `CreateDashboardData`, `UpdateDashboardData`, `Settings` | `ListAlertsOptions`, `CreateDashboardInput`, `UpdateDashboardInput`, `NamespaceSettings` | 0.4.0 |
| `SharePermissions` | `DashboardShareInput` permissions | 0.4.0 |
| `namespace` in the `dashboards.create()` input (`CreateDashboardData.namespace`) | `{ namespace }` in the call options, or the client default | 0.4.0 |
| `normalizeMacAddress`, `isValidMacAddress` | `normalizeMac`, `isValidMac` | 0.4.0 |
| `POSITION_ORIGIN` | none (the values never matched the platform's origin codes) | 0.4.0 |
| `reconnectInterval`, `maxReconnectAttempts` | `reconnect.initialDelayMs`, `reconnect.maxAttempts` | 0.4.0 |
| `subscribe([])` | `subscribe('ALL')` | 0.4.0 |

## Removed without alias

These never worked, so no alias is kept:

- `navigation.evacuation()`: renamed `navigation.evacuationRoute()` (the 0.2 stub threw).
- `venues.listMapPoisAsArray()`: threw `TypeError`; use `venues.listPoisAsArray({ level })`.
- `assets.getStats()`: documented in 0.2, never in a released build.
- The 0.2 request bodies of `spatial.analyzeCustomZones()` and `spatial.analyzeCustomPois()` (always 400).
- From the `src/websocket` barrel only (never exported from the package root): the inline fixtures,
  `BaseWebSocketConnection`, `BaseWebSocketEvents`, `TypedEventEmitter`, `EventHandler`, `EventMap`, `DebugLogger`,
  the old reconnect helpers and the 0.2 helper types (`ZoneEventType`, `AlertStyle`, `AssetAction`, …).

## New capabilities

- Errors: `ConflictError`, `GoneError`, `PayloadTooLargeError`, `UnsupportedMediaTypeError`, `ServerError`,
  `ServiceUnavailableError`, `AbortError`, `ResponseParseError`, `StreamError`; `apiCode`, `details`, `retryAfter`,
  `body`, `cause`, `RtlsError.is()`; opt-in `retry` policy and `auth` mode. See
  [Error handling](./error-handling.md).
- Pagination and filters: `Page<T>`, `OffsetPage<T>`, `paginatePages`, `paginateOffset`, `normalizePage`,
  `collectAll(iterable, { maxItems })`, `serializeFilters`, `applyFilters`. See
  [Pagination and filtering](./pagination-filtering.md).
- Assets: `client.assetDocuments`, `client.declaredLocations`, `client.tagActions`, `client.assetTree`,
  `client.dataModels`, `assets.getHistory()` (audit trail). See [Assets](./assets.md).
- Positions and spatial: `positions.query()`, `listLast({ current })`, `spatial.zoneDistances()`, `poisByTag()`,
  `poiStatistics()`, `nearestAssets()`, `nearestAssetsRealtime()`. See
  [Positions and spatial analysis](./positions-spatial.md).
- Venues and navigation: working navigation (`shortestPath`, `accessiblePath`, `multiStop`, `nearestPoi`,
  `evacuationRoute`), server-side venue `filters` with `level`, `tag` and `nodeType` shorthands, typed venues and
  maps. See [Venues, maps, zones and navigation](./venues-navigation.md).
- Dashboards and alert rules: `client.alertRules` (`get`, `replace`, `upsertRule`, `removeRule`, `setRuleEnabled`),
  `validateAlertRuleSet`, `client.settings.get()`. See
  [Dashboards, alert rules, alerts, settings and health](./dashboards-alert-rules.md).
- Notifications: `client.notifications` (inbox, triage, bulk and undo, sending, live stream, rules, connections,
  saved views, retention, administration). See [Notifications](./notifications.md).
- ETL imports: `client.etl` (mapping profiles, header preview, dry-run and real uploads, activities). See
  [ETL imports](./etl.md).
- WebSocket: subscription object form with a tag filter, `setTagFilter()`, `getSubscription()`, reconnect
  events, refetch hints, `TAG_LOST`, configurable reconnect, keep-alive and confirmation timeout, injected
  `WebSocket` implementation. See [WebSocket streaming](./websocket.md).
- Runtimes: Bun 1.4.4 verified as a consumer runtime (ESM and CommonJS); `ubudu-rtls-sdk/package.json` exported.
  See [Getting started](./getting-started.md).

## Behaviour fixes you may have relied on

- `paginate()` and `collectAll()` stopped after page 1 on the server's `{ data, pagination }` envelope; they now
  follow every page.
- A 400 was reported as 422; it now reports 400.
- A successful write answered with a text or empty body threw `NetworkError`; it now resolves.
- Both credentials were sent when `apiKey` and `accessToken` were set; one is sent now.
- `buildQueryParams` dropped `key`, `value`, `level` and other plain keys; they are sent now.
- `assets.list()` options other than `key`/`value` were sent and ignored; they are applied locally now, so the
  result can be smaller than before.
- `positions.listLast()` scanned the whole history; it now reads the last 24 hours unless a bound is given.
- `positions.publish()` threw `NetworkError` after a successful publish; it resolves `undefined`.
- `venues.list({ namespace })`, `positions.listCached({ namespace })` and `alerts.getRules({ namespace })`
  ignored the namespace; they honour it.
- `zones.list({ level })` ignored the level; it filters by floor.
- WebSocket `unsubscribe()` kept delivering; it stops now. A reconnect after any unintended close (also 1000)
  happens with jitter.
- The WebSocket publisher overwrote asset metadata with its defaults; it sends only what you pass.
- `dashboards.share(id, username, { write: true })` granted view only; the deprecated form now sends `['edit']`:

  <!-- snippet: prelude=client -->
  ```ts
  declare const id: string;
  await client.dashboards.share(id, { username: 'colleague', permissions: ['edit'] });
  ```

- `alerts.saveRules()` posted a bare array, which switched off every alert rule of the namespace. It now writes
  `{ name, rules }` after validation and resolves `void`; prefer the read-modify-write helpers:

  <!-- snippet: prelude=client -->
  ```ts
  declare const rule: AlertRule;
  await client.alertRules.upsertRule(rule); // changes one rule, keeps the others
  ```

### Restoring alert rules written by 0.2

A namespace whose rules were saved by 0.2 `saveRules()` stores a bare array, and no rule has fired since.
`alertRules.get()` shows those rules as `{ name: '', rules }`. Review them (they start firing again once
restored), fix every validation error, then write the set back. The read-modify-write helpers refuse to touch
such a document.

<!-- snippet: prelude=client -->
```ts
const set = await client.alertRules.get();
console.log(validateAlertRuleSet(set).errors); // fix every error first
await client.alertRules.replace(set);
```

## Known server limitations

These are server behaviours of rtls-api 3.4.0 that the SDK documents or works around; the domain guides describe
each one.

- Specification: no operation has an `operationId` (USI-P0-1); 78 of 176 operations declare no success schema, so
  the SDK hand-writes those types (USI-P0-2).
- Cross-origin browser code cannot read `X-Total-Count`, `Retry-After` or `Content-Disposition` (USI-P1-4).
- Assets: the asset list has no server paging (USI-P2-1); `assets.batchDelete()` does not use the batch delete
  route and sends one `DELETE` per MAC (USI-P2-5); a stored `maintenance` field is dropped on every write
  (USI-P2-6).
- Spatial: zone and POI GET lookups return no items today (USI-P3-1, USI-P3-2); the POST spatial routes reject
  `lat` or `lon` exactly 0 (USI-P3-6); `POST /es/query` answers 500 for an invalid `dataType` (USI-P3-9).
- Venues: the map-level zone and POI routes serve a bundled sample dataset; the SDK deprecates them.
- Notifications: see USI-P6-1 to USI-P6-14 in the [notifications guide](./notifications.md#11-known-server-limitations).
- ETL: a 201 is not an outcome signal, key matching is exact, CSV is comma-only (USI-P7-1 to USI-P7-21; see the
  [ETL guide](./etl.md#7-silent-pitfalls)).
- WebSocket: a second SUBSCRIBE keeps the first type filter (USI-P8-1); `map_uuid` in SUBSCRIBE is ignored
  (USI-P8-2); no acknowledgement or error frame (USI-P8-6); alerts raised from zone events carry no tag id
  (USI-P8-11).
- A domain switched off on the server answers `404` with a non-JSON body (USI-P9-2); the SDK raises
  `NotFoundError`.
