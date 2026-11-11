[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / PositionsResource

# Class: PositionsResource

Position reads, Elasticsearch queries and the REST publish of a namespace.

Every method takes the namespace from its options bag (`{ namespace }`), else from the client's default context;
without either it throws `ContextError` before any request. A MAC in a path is normalised to 12 lower-case hex
characters (`'AA:BB:CC:DD:EE:FF'` → `aabbccddeeff`); an invalid one throws `ValidationError` (status 0) and
nothing is sent.

## Extends

- `ResourceBase`

## Methods

### listCached()

#### Call Signature

> **listCached**(`options?`): `Promise`\<[`CachedAssetPosition`](../interfaces/CachedAssetPosition.md)[]\>

Lists the cached position of every asset of the namespace (`GET /cache/{app_namespace}/positions`), `[]` when
none. A cache entry disappears after the namespace setting `positionsExpirationPeriod`.

##### Parameters

###### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

per-call context (`namespace`) and request options (`signal`, `timeoutMs`, `headers`)

##### Returns

`Promise`\<[`CachedAssetPosition`](../interfaces/CachedAssetPosition.md)[]\>

##### Throws

no namespace in the options or the client context

##### Throws

status 500 when a stored entry is malformed

##### Example

```typescript
const positions = await client.positions.listCached();
for (const p of positions) console.log(p.user_udid, p.lat, p.lon, p.timestamp);
```

#### Call Signature

> **listCached**(`namespace`, `requestOptions?`): `Promise`\<[`CachedAssetPosition`](../interfaces/CachedAssetPosition.md)[]\>

Legacy positional form.

##### Parameters

###### namespace

`string`

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`CachedAssetPosition`](../interfaces/CachedAssetPosition.md)[]\>

***

### getCached()

#### Call Signature

> **getCached**(`macAddress`, `options?`): `Promise`\<[`CachedAssetPosition`](../interfaces/CachedAssetPosition.md)\>

Gets the cached position of one asset (`GET /cache/{app_namespace}/positions/{mac_address}`).

##### Parameters

###### macAddress

`string`

the asset MAC, any common notation (normalised to 12 lower-case hex)

###### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

per-call context (`namespace`) and request options

##### Returns

`Promise`\<[`CachedAssetPosition`](../interfaces/CachedAssetPosition.md)\>

##### Throws

status 0 for an invalid MAC (nothing is sent)

##### Throws

status 404 when the asset has no cache entry (expired, or never seen)

##### Example

```typescript
const position = await client.positions.getCached('AA:BB:CC:DD:EE:FF');
console.log(position.lat, position.lon, position.zone?.name);
```

#### Call Signature

> **getCached**(`namespace`, `macAddress`, `requestOptions?`): `Promise`\<[`CachedAssetPosition`](../interfaces/CachedAssetPosition.md)\>

Legacy positional form.

##### Parameters

###### namespace

`string`

###### macAddress

`string`

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`CachedAssetPosition`](../interfaces/CachedAssetPosition.md)\>

***

### getLast()

#### Call Signature

> **getLast**(`macAddress`, `options?`): `Promise`\<[`CachedAssetPosition`](../interfaces/CachedAssetPosition.md)\>

Gets the last known position of one asset (`GET /asset_last_position/{app_namespace}/{mac_address}`). Unlike
the cache entry, it does not expire.

##### Parameters

###### macAddress

`string`

the asset MAC, any common notation (normalised to 12 lower-case hex)

###### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

per-call context (`namespace`) and request options

##### Returns

`Promise`\<[`CachedAssetPosition`](../interfaces/CachedAssetPosition.md)\>

##### Throws

status 0 for an invalid MAC (nothing is sent)

##### Throws

status 404 when the asset never had a position

##### Example

```typescript
const last = await client.positions.getLast('aabbccddeeff');
console.log(new Date(last.timestamp).toISOString());
```

#### Call Signature

> **getLast**(`namespace`, `macAddress`, `requestOptions?`): `Promise`\<[`CachedAssetPosition`](../interfaces/CachedAssetPosition.md)\>

Legacy positional form.

##### Parameters

###### namespace

`string`

###### macAddress

`string`

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`CachedAssetPosition`](../interfaces/CachedAssetPosition.md)\>

***

### listLast()

#### Call Signature

> **listLast**(`options?`, `requestOptions?`): `Promise`\<[`AssetPosition`](../interfaces/AssetPosition.md)[]\>

Lists the latest position document of each asset from Elasticsearch (`GET /es/last_positions/{appNamespace}`),
latest first.

Bounded by default: the request always carries both `timestampFrom` and `timestampTo`. Neither given → the
last 24 h; only `timestampFrom` → up to now; only `timestampTo` → the 24 h before it. An unbounded search is the
slowest route of the API (seconds, up to ~20 s): for the whole history pass `timestampFrom: 0` together with a
generous `timeoutMs`. Only `key`, `queryString`, `mapUuids` (CSV), the two bounds and `current=true` are sent.

`current: true` asks for current-position semantics; the server honours it only when the platform switch is on
and otherwise ignores it. The server reports which source answered in the `X-Last-Positions-Source` response
header (`latest` or `aggregation`); 0.3.0 does not expose it.

##### Parameters

###### options?

[`ListLastPositionsOptions`](../interfaces/ListLastPositionsOptions.md) & [`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

filters and bounds (`TimeInput`: `Date`, epoch ms or date string), per-call context and request
  options

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

deprecated, pass `signal` / `timeoutMs` / `headers` in `options`; wins over them

##### Returns

`Promise`\<[`AssetPosition`](../interfaces/AssetPosition.md)[]\>

##### Throws

status 0 for an invalid time input or `timestampFrom` after `timestampTo` (nothing
  is sent)

##### Example

```typescript
const lastHour = await client.positions.listLast({ timestampFrom: Date.now() - 3_600_000 });
const fullHistory = await client.positions.listLast({ timestampFrom: 0, timeoutMs: 60_000 });
console.log(lastHour.length, fullHistory[0]?.user.udid);
```

#### Call Signature

> **listLast**(`namespace`, `options?`, `requestOptions?`): `Promise`\<[`AssetPosition`](../interfaces/AssetPosition.md)[]\>

Legacy positional form.

##### Parameters

###### namespace

`string`

###### options?

[`ListLastPositionsOptions`](../interfaces/ListLastPositionsOptions.md)

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`AssetPosition`](../interfaces/AssetPosition.md)[]\>

***

### getHistory()

#### Call Signature

> **getHistory**(`options`, `requestOptions?`): `Promise`\<[`AssetPosition`](../interfaces/AssetPosition.md)[]\>

Gets the position history of one asset (`GET /es/position_history/{appNamespace}`), ascending.

The history is **downsampled**: one document per time bucket, the bucket growing with the range (≤ 15 min:
500 ms · ≤ 1 h: 1 s · ≤ 3 h: 10 s · ≤ 6 h: 20 s · ≤ 1 d: 45 s · ≤ 3 d: 5 min · ≤ 7 d: 10 min · ≤ 30 d: 15–30 min
· longer ranges: hours to days). Both bounds are always sent: neither given → the last 24 h; only
`timestampFrom` → up to now; only `timestampTo` → the 24 h before it.

With the default `key` (`user.udid`) a valid MAC `value` is normalised to 12 lower-case hex; any other value,
and the value of any other key, is sent verbatim.

##### Parameters

###### options

[`PositionHistoryOptions`](../interfaces/PositionHistoryOptions.md) & [`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

`value` (required), `key`, bounds, per-call context and request options

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

deprecated, pass `signal` / `timeoutMs` / `headers` in `options`; wins over them

##### Returns

`Promise`\<[`AssetPosition`](../interfaces/AssetPosition.md)[]\>

##### Throws

status 0 for an invalid time input or `timestampFrom` after `timestampTo` (nothing
  is sent); status 400 when `value` is empty

##### Example

```typescript
const history = await client.positions.getHistory({
  value: 'AA:BB:CC:DD:EE:FF',
  timestampFrom: new Date(Date.now() - 3_600_000),
});
for (const p of history) console.log(p.timestamp, p.location?.lat, p.location?.lon);
```

#### Call Signature

> **getHistory**(`namespace`, `options`, `requestOptions?`): `Promise`\<[`AssetPosition`](../interfaces/AssetPosition.md)[]\>

Legacy positional form.

##### Parameters

###### namespace

`string`

###### options

[`PositionHistoryOptions`](../interfaces/PositionHistoryOptions.md)

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`AssetPosition`](../interfaces/AssetPosition.md)[]\>

***

### query()

> **query**\<`TSource`, `TAggs`\>(`dataType`, `dsl`, `options?`): `Promise`\<[`EsSearchResponse`](../interfaces/EsSearchResponse.md)\<`TSource`, `TAggs`\>\>

Runs an Elasticsearch search over the namespace's `alerts`, `positions` or `zone_visits` data
(`POST /es/query/{appNamespace}/{dataType}`) and returns the raw search response. The DSL is sent verbatim.

Always bound the search: a `range` on `timestamp` and an explicit `size` (`size: 0` when only the aggregations
are needed). The server enforces limits and rewrites the body before searching:
- rejected with 400 (`ValidationError`, `err.details` = the server's `violations`): `runtime_mappings`,
  `script_fields`, any `script` / `script_score` / `scripted_metric` key, `size: -1`, aggregations nested
  deeper than 3;
- `size` defaults to and is clamped at 10 000, `terms` aggregation sizes at 1 000;
- `terminate_after: 100000` and `timeout: '30s'` are injected, so a long-range search can be partial
  (`terminated_early: true`, `timed_out: true`);
- `track_total_hits: false` is injected: `hits.total` is absent unless the body sets `track_total_hits: true`.

The body limit is 100 kB (413 → `PayloadTooLargeError`). An unknown `dataType` answers 500 (USI-P3-9). The
call is read-only, so the client's retry policy may retry it.

#### Type Parameters

##### TSource

`TSource` = `Record`\<`string`, `unknown`\>

the `_source` type of the hits (e.g. `AssetPosition` for `positions`)

##### TAggs

`TAggs` = `Record`\<`string`, `unknown`\>

the `aggregations` type

#### Parameters

##### dataType

[`EsDataType`](../type-aliases/EsDataType.md)

`'alerts'`, `'positions'` or `'zone_visits'`

##### dsl

[`EsQueryBody`](../type-aliases/EsQueryBody.md)

the Elasticsearch query DSL, sent unchanged

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

per-call context (`namespace`) and request options

#### Returns

`Promise`\<[`EsSearchResponse`](../interfaces/EsSearchResponse.md)\<`TSource`, `TAggs`\>\>

#### Throws

status 400 for a guard rejection (`details` = violations)

#### Throws

status 500 for an invalid `dataType` or an Elasticsearch failure

#### Example

```typescript
const now = Date.now();
const res = await client.positions.query<AssetPosition>('positions', {
  size: 10,
  query: { range: { timestamp: { gte: now - 3_600_000, lte: now, format: 'epoch_millis' } } },
  sort: [{ timestamp: 'desc' }],
});
for (const hit of res.hits.hits) console.log(hit._source.user.udid, hit._source.timestamp);
```

***

### publish()

#### Call Signature

> **publish**(`position`, `options?`, `requestOptions?`): `Promise`\<`void`\>

Publishes one position (`POST /publisher/{app_namespace}`); resolves `undefined` on success (201, empty body).

Side effects: the position enters the real-time pipeline (rule engine, alerts, live dashboards), then the cache,
the last position and the Elasticsearch history, which has no delete API. The cache and Elasticsearch are
written downstream, a moment after the call resolves. Not idempotent: each call is a new position, so it is
never retried.

`user_udid` and, when present, `user_uuid` are normalised to 12 lower-case hex when they are valid MACs and
sent verbatim otherwise; the server prefers `user_uuid` when it is present. The URL namespace wins over any
`app_namespace` in the body.

`patchAssetData: true` (`patch_asset_data=true`) also writes these fields of the position to the existing asset
(and to the same asset in every linked application): `battery_percent`, `color`, `data`, `dateChanged`,
`dateCreated`, `declared_location`, `external_id`, `is_virtual`, `model`, `origin`, `path`, `tags`,
`targetApplications`, `user_motion`, `user_name`, `user_type`, `user_udid`. Without an existing asset the patch
is skipped silently. `data.sensor_ils_*` keys are reserved with the patch: 400 `ValidationError` with
`apiCode: 'reserved_field_namespace'` and the fields in `err.body.fields`.

##### Parameters

###### position

[`PublishPositionData`](../interfaces/PublishPositionData.md)

the position; extra keys are sent as given

###### options?

[`PublishOptions`](../interfaces/PublishOptions.md) & [`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

`patchAssetData`, per-call context (`namespace`) and request options

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

deprecated, pass `signal` / `timeoutMs` / `headers` in `options`; wins over them

##### Returns

`Promise`\<`void`\>

##### Throws

status 400 with the server's text (`Missing MAC address (user_uuid or user_udid)`,
  `Invalid position data`, `JSON error: …`)

##### Throws

status 503: the position was not published

##### Example

```typescript
await client.positions.publish({
  user_udid: 'AA:BB:CC:DD:EE:FF',
  lat: 48.8566,
  lon: 2.3522,
  data: { source: 'gateway-7' },
});
```

#### Call Signature

> **publish**(`namespace`, `position`, `options?`, `requestOptions?`): `Promise`\<`void`\>

Legacy positional form.

##### Parameters

###### namespace

`string`

###### position

[`PublishPositionData`](../interfaces/PublishPositionData.md)

###### options?

[`PublishOptions`](../interfaces/PublishOptions.md)

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<`void`\>
