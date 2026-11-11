# Positions and spatial analysis

This guide covers `client.positions` (live, last and historical positions, custom Elasticsearch queries,
REST publishing) and `client.spatial` (zones, POIs and assets around a point). Zone listing and zone presence
are in the [venues and navigation guide](venues-navigation.md).

Every example uses a client created with a default namespace:

```ts
import { createRtlsClient } from 'ubudu-rtls-sdk';

const client = createRtlsClient({
  apiKey: process.env.RTLS_API_KEY ?? '',
  namespace: process.env.APP_NAMESPACE ?? '',
});
```

Every method also accepts `{ namespace }` per call, plus `signal`, `timeoutMs` and `headers` in the same
options object. A missing namespace throws `ContextError` before any request.

## 1. Which source answers what

| Question | Method | Source | Notes |
|---|---|---|---|
| Where is every tag right now? | `positions.listCached()` | position cache | an entry disappears after the namespace setting `positionsExpirationPeriod` |
| Where is this tag right now? | `positions.getCached(mac)` | position cache | `NotFoundError` once the entry has expired |
| Where was this tag last seen? | `positions.getLast(mac)` | last-position store | never expires |
| Latest position per tag (or per `key`) over a period | `positions.listLast(options)` | Elasticsearch | the most expensive read of the API; last 24 h by default |
| Track of one tag | `positions.getHistory(options)` | Elasticsearch | downsampled |
| Counts, histograms, custom filters | `positions.query(dataType, dsl)` | Elasticsearch | raw search body |
| Every position as it happens | WebSocket subscriber | real-time stream | [WebSocket guide](websocket.md) |

MAC addresses are stored as 12 lowercase hex digits. A MAC in a path (`getCached`, `getLast`) is normalised by
the SDK: `02:5D:4B:00:00:01`, `02-5d-4b-00-00-01` and `025d4b000001` all reach the server as `025d4b000001`, and
an invalid one throws `ValidationError` (status 0) with nothing sent. `user_udid`/`user_uuid` of a publish body
and the `value` of `getHistory` are normalised when they are valid MACs and are otherwise sent unchanged, with no
local check. `normalizeMac`, `formatMac` and `isValidMac` are exported if you need the same rule yourself.

<!-- snippet: prelude=client -->
```ts
import { formatMac, normalizeMac } from 'ubudu-rtls-sdk';

const mac = normalizeMac('02:5D:4B:00:00:01'); // '025d4b000001'
const label = formatMac(mac, { separator: '-' }); // '02-5D-4B-00-00-01'
const position = await client.positions.getCached(label); // same request as getCached(mac)
console.log(position.user_udid === mac);
```

## 2. Live positions

`listCached()` returns every cached position of the namespace (`CachedAssetPosition[]`, an empty array when
nothing is cached). `getCached(mac)` returns one. `getLast(mac)` returns the last stored position of a tag,
which survives the cache expiry. Both single reads throw `NotFoundError` (status 404) for an unknown MAC.

<!-- snippet: prelude=client -->
```ts
import { NotFoundError } from 'ubudu-rtls-sdk';

const cached = await client.positions.listCached();
const stale = cached.filter((p) => Date.now() - Date.parse(p.timestamp) > 15 * 60_000);
console.log(`${cached.length} cached positions, ${stale.length} older than 15 min`);

try {
  const last = await client.positions.getLast('025d4b000001');
  console.log(last.lat, last.lon, last.timestamp);
} catch (err) {
  if (!(err instanceof NotFoundError)) throw err;
  console.log('this tag never reported a position');
}
```

`timestamp` of a cached position is an ISO-8601 string; `zone` is the zone the position falls in, or `null`.

## 3. Last positions

`listLast(options)` returns the newest Elasticsearch document per distinct value of `key` (default
`user.udid`, one per tag), newest first, typed `AssetPosition[]`.

| Option | Meaning |
|---|---|
| `timestampFrom`, `timestampTo` | `Date`, epoch milliseconds or a date string. Neither → the last 24 h; only `timestampFrom` → up to now; only `timestampTo` → the 24 h before it. `from > to` throws `ValidationError` before any request. |
| `key` | grouping field; `data.x` is short for `user.data.x` |
| `queryString` | Lucene query string, e.g. `user.name:forklift*` |
| `mapUuids` | only positions on these maps |
| `current` | asks for current-position semantics; the server honours it only when the platform has it enabled and ignores it otherwise |

The SDK always sends a time range. The whole history is still reachable with `timestampFrom: 0`, but it is the
slowest call of the API: give it a generous `timeoutMs`.

<!-- snippet: prelude=client -->
```ts
const lastHour = await client.positions.listLast({
  timestampFrom: new Date(Date.now() - 60 * 60_000),
  timeoutMs: 60_000,
});
console.log(`${lastHour.length} tags reported in the last hour`);

const forklifts = await client.positions.listLast({ queryString: 'user.name:forklift*' });
const everything = await client.positions.listLast({ timestampFrom: 0, timeoutMs: 120_000 });
console.log(forklifts.length, everything.length);
```

`toEpochMs(input)` is the conversion the SDK applies to these bounds: a `Date`, epoch milliseconds, a string of
digits or a date string becomes epoch milliseconds, and anything else throws `ValidationError` (status 0). Use it
to check a bound before the call, or to compare the ISO `timestamp` of a cached position with a bound.

<!-- snippet: prelude=client -->
```ts
import { toEpochMs } from 'ubudu-rtls-sdk';

declare const fromInput: string; // a date string or epoch milliseconds typed by a user
const from = toEpochMs(fromInput);
const cached = await client.positions.listCached();
const fresh = cached.filter((p) => toEpochMs(p.timestamp) >= from);
const reported = await client.positions.listLast({ timestampFrom: from });
console.log(fresh.length, reported.length);
```

`AssetPosition.timestamp` is epoch milliseconds; the tag is under `user` (`user.udid`, `user.name`) and the
coordinates under `location` (`{ lat, lon }`).

## 4. History

`getHistory({ value, timestampFrom?, timestampTo? })` returns the track of one tag in ascending time order. The
time bounds follow the same defaults as `listLast`. `value` is the tag's MAC unless you group by another `key`;
with the default `key` it is normalised when it is a valid MAC and sent unchanged otherwise.

The server downsamples to one document per time bucket; the bucket grows with the range:

| Range up to | Bucket | Range up to | Bucket |
|---|---|---|---|
| 15 min | 500 ms | 7 d | 10 min |
| 1 h | 1 s | 14 d | 15 min |
| 3 h | 10 s | 30 d | 30 min |
| 6 h | 20 s | 90 d | 2 h |
| 1 d | 45 s | 180 d | 3 h |
| 3 d | 5 min | 365 d | 12 h |

Longer ranges use 1 d (up to two years) and then 3 d buckets.

<!-- snippet: prelude=client -->
```ts
const track = await client.positions.getHistory({
  value: '02:5D:4B:00:00:01',
  timestampFrom: new Date(Date.now() - 60 * 60_000),
});
const points = track.flatMap((p) => (p.location ? [p.location] : []));
console.log(`${points.length} points in the last hour`);
```

A missing `value` is rejected by the server with `ValidationError` (400, `value parameter is required`).

## 5. Publishing

`publish(position, options?)` sends one position through the REST publisher. It resolves `undefined` once the
server accepted it (201, empty body).

<!-- snippet: prelude=client -->
```ts
await client.positions.publish({
  user_udid: '025d4b000001',
  lat: 48.8566,
  lon: 2.3522,
  map_uuid: 'my-map-uuid',
  user_name: 'Forklift 12',
  data: { battery: 87 },
});
```

What the server does with it:

- **MAC.** `user_uuid`, when given, wins over `user_udid`. The SDK normalises both when they are valid MACs and
  sends any other value unchanged, without a local check: check them with `isValidMac` when they must be MACs.
- **Merge.** When an asset exists for the MAC, the position is merged into the stored asset before it is
  published; a missing `timestamp` is added by the server.
- **`patchAssetData: true`** (query `patch_asset_data=true`) also writes these 17 fields back to the asset:
  `battery_percent`, `color`, `data`, `dateChanged`, `dateCreated`, `declared_location`, `external_id`,
  `is_virtual`, `model`, `origin`, `path`, `tags`, `targetApplications`, `user_motion`, `user_name`, `user_type`,
  `user_udid`. A changed `declared_location` also publishes a declared position. With no asset for the MAC the
  patch is skipped and the answer is still 201.
- **Reserved keys.** `data.sensor_ils_*` keys are rejected with `patchAssetData` (400
  `reserved_field_namespace`; the offending keys are in `err.body.fields`).
- **Side effects.** A publish runs the namespace's alert rules, moves the tag on live dashboards, updates the
  cache and the last position, and is stored in Elasticsearch history. History cannot be deleted. Cache and
  Elasticsearch updates happen shortly after the 201, not synchronously.
- **Never retried.** Each call is a new position, so the SDK never retries a publish, whatever the client's
  retry policy says.

| Answer | SDK error |
|---|---|
| 400 `Invalid position data`, `JSON error: …`, `Missing MAC address (user_uuid or user_udid)` | `ValidationError`, message = the server text |
| 400 `reserved_field_namespace` | `ValidationError` with `apiCode 'reserved_field_namespace'` |
| 413 body too large | `PayloadTooLargeError` |
| 415 encoded body | `UnsupportedMediaTypeError` |
| 503 `Service temporarily unavailable - Redis error` (position not published) | `ServiceUnavailableError` |

For a continuous stream of positions, use the WebSocket publisher (one connection, batches, no HTTP overhead):
see the [WebSocket guide](websocket.md).

## 6. Custom Elasticsearch queries

`query<TSource, TAggs>(dataType, dsl)` posts an Elasticsearch search body to
`/es/query/{namespace}/{dataType}` and returns the raw search response (`took`, `timed_out`,
`terminated_early?`, `_shards`, `hits`, `aggregations?`). `dataType` is `'positions'`, `'alerts'` or
`'zone_visits'`. The DSL is sent unchanged.

Server limits:

| Rule | Effect |
|---|---|
| `runtime_mappings`, `script_fields`, any `script`, `script_score` or `scripted_metric` key | 400; `err.details` lists the rejected paths |
| `size: -1` | 400 |
| aggregations nested deeper than 3 levels | 400 |
| `size` absent or above 10000 | set to 10000 |
| `terms` / `significant_terms` / `multi_terms` `size` above 1000 | set to 1000 |
| `terminate_after` absent | 100000 documents per shard: long ranges can be partial (`terminated_early: true`) |
| `timeout` absent | 30 s: a slow search can come back with `timed_out: true` |
| `track_total_hits` absent | `false`: `hits.total` is absent unless you set `track_total_hits: true` |

Always send a time range and an explicit `size` (`0` when you only need aggregations). A rejected query throws
`ValidationError` whose `details` holds the server's list of violations.

<!-- snippet: prelude=client -->
```ts
import type { AssetPosition } from 'ubudu-rtls-sdk';

const now = Date.now();
const latest = await client.positions.query<AssetPosition>('positions', {
  size: 1,
  query: { range: { timestamp: { gte: now - 3_600_000, lte: now, format: 'epoch_millis' } } },
  sort: [{ timestamp: 'desc' }],
});
console.log(latest.hits.hits[0]?._source.user.udid);
```

Recipe: positions per hour over the last 24 h.

<!-- snippet: prelude=client -->
```ts
interface PerHour {
  per_hour: { buckets: Array<{ key: number; doc_count: number }> };
}

const now = Date.now();
const res = await client.positions.query<Record<string, unknown>, PerHour>('positions', {
  size: 0,
  query: { range: { timestamp: { gte: now - 86_400_000, lte: now, format: 'epoch_millis' } } },
  aggs: { per_hour: { date_histogram: { field: 'timestamp', fixed_interval: '1h' } } },
});
for (const b of res.aggregations?.per_hour.buckets ?? []) {
  console.log(new Date(b.key).toISOString(), b.doc_count);
}
```

Recipe: an hour-of-day profile. Scripts and runtime fields are rejected, so fold the hourly buckets on the
client.

<!-- snippet: prelude=client -->
```ts
interface PerHour {
  per_hour: { buckets: Array<{ key: number; doc_count: number }> };
}

const now = Date.now();
const res = await client.positions.query<Record<string, unknown>, PerHour>('positions', {
  size: 0,
  query: { range: { timestamp: { gte: now - 7 * 86_400_000, lte: now, format: 'epoch_millis' } } },
  aggs: { per_hour: { date_histogram: { field: 'timestamp', fixed_interval: '1h' } } },
});
const byHourOfDay = new Array<number>(24).fill(0);
for (const b of res.aggregations?.per_hour.buckets ?? []) {
  const hour = new Date(b.key).getHours();
  byHourOfDay[hour] = (byHourOfDay[hour] ?? 0) + b.doc_count;
}
console.log(byHourOfDay);
```

Migration: `client.esQuery(namespace, dataType, dsl)` is deprecated; use
`client.positions.query(dataType, dsl, { namespace })`.

## 7. Zones

The zone methods work on the zones of the namespace's **first venue** (there is no venue parameter), on
`Polygon` zones only, and ignore holes. Results are GeoJSON Features: the name is `zone.properties.name`, and
each item also carries a top-level `level`.

The zone GETs (`zonesContainingPoint`, `nearestZones`, `zonesWithinRadius`) send the client's default `level`
when one is set; pass `level: null` to search every level.

> **Known issue (USI-P3-1).** The three zone GETs currently return no zones: `containing_zones` and `zones` are
> always empty. Until the server is fixed, compute with `analyzeCustomZones` over the features of
> `zones.list()`, and use `zoneDistances` for distances. Both are unaffected.

<!-- snippet: prelude=client -->
```ts
const venueId = 1;
const fc = await client.zones.list({ venueId });
const here = { lat: 48.8566, lon: 2.3522 };

const analysis = await client.spatial.analyzeCustomZones({ ...here, customZones: fc.features });
const inside = analysis.containing_zones.map((z) => z.properties.name);
console.log(`inside: ${inside.join(', ') || 'no zone'}`);

const distances = await client.spatial.zoneDistances({
  ...here,
  zoneIds: fc.features.map((f) => f.properties.id),
});
for (const z of distances.zones.slice(0, 3)) {
  console.log(z.zone_name, z.boundary_distance_meters, z.is_inside);
}
```

- `analyzeCustomZones({ lat, lon, customZones })` accepts an array of Polygon Features or a FeatureCollection
  and returns `containing_zones` and `nearby_zones` (every polygon, nearest first), each with your feature's
  `index` and `properties`. The request body is limited to 100 kB.
- `zoneDistances({ lat, lon, zoneIds })` matches ids strictly: pass `properties.id` exactly as `zones.list()`
  returns it.
- A reference point with `lat` or `lon` exactly `0` is rejected by these POST routes (USI-P3-6).
- Out-of-range coordinates throw `ValidationError` locally (the server would answer 500).

<!-- snippet: prelude=client -->
```ts
const nearest = await client.spatial.nearestZones({ lat: 48.8566, lon: 2.3522, limit: 5, level: null });
console.log(nearest.total_zones, nearest.zones.map((z) => z.properties.name));
```

## 8. POIs

`nearestPois`, `poisWithinRadius`, `poisByTag` and `poiStatistics` read the POIs of the namespace's first venue.
`nearestPois` and `poisWithinRadius` take `tags` (any of them matches); the zone `level` rules apply.

> **Known issues (USI-P3-2, USI-P3-3).** The POI GETs currently return no POIs, and `poiStatistics()` leaves
> `tags` and `venues` empty (`total_pois` and `levels` are correct). Working alternatives: `venues.listPois({ tag })`
> for a tag search, and `analyzeCustomPois` over the features of `venues.listPois()` for distance searches.

<!-- snippet: prelude=client -->
```ts
const stats = await client.spatial.poiStatistics();
console.log(stats.total_pois, stats.levels);

const venuePois = await client.venues.listPois({ venueId: 1 });
const near = await client.spatial.analyzeCustomPois({
  lat: 48.8566,
  lon: 2.3522,
  customPois: venuePois.features, // Point Features are flattened to { ...properties, lat, lon }
  operation: 'nearest',
  limit: 3,
});
console.log(near.matching_pois, near.pois.map((p) => `${p.name}: ${p.distance_meters} m`));
```

`analyzeCustomPois({ lat, lon, customPois, operation?, … })`:

- `customPois` holds flat points (`{ lat, lon, name?, … }`) or GeoJSON Point Features; a Feature is flattened to
  its `properties` plus `lat`/`lon`. The keys `location`, `position`, `coordinates`, `latitude` and `longitude` are
  removed, because the server would read them first.
- `operation` is `'nearest'` (default; `limit`, `maxDistanceMeters`) or `'within-radius'` (`radiusMeters`,
  required: the SDK throws `ValidationError` without it).
- Each result item is your input plus `index`, `lat`, `lon` and `distance_meters`, nearest first.
- A point with a coordinate of exactly `0` is dropped by the server (USI-P3-6).

<!-- snippet: prelude=client -->
```ts
const res = await client.spatial.analyzeCustomPois({
  lat: 48.8566,
  lon: 2.3522,
  customPois: [
    { name: 'gate', lat: 48.8567, lon: 2.3522 },
    { name: 'dock', lat: 48.8576, lon: 2.3522 },
  ],
  operation: 'within-radius',
  radiusMeters: 50,
});
console.log(res.pois.map((p) => p.name));
```

## 9. Nearest assets

`nearestAssetsRealtime({ lat, lon, … })` searches the position cache; `nearestAssets({ lat, lon, maxAge, … })`
searches the cache first and falls back to Elasticsearch when nothing is left. Both return
`{ reference_point, total_assets, assets }`, nearest first.

| Option | Meaning |
|---|---|
| `limit` | 1–100 (default 10); outside → `ValidationError` 400 |
| `maxDistanceMeters` | only assets within this distance |
| `search: { field, pattern, mode? }` | `field` is a dot path into the cached position (`user_udid`, `user_name`, `data.type`, `zone.name`); `pattern` is a case-sensitive regular expression; `mode` `'include'` (default) keeps matches, `'exclude'` drops them |
| `maxAge` (`nearestAssets` only) | a duration string (`'30s'`, `'15m'`, `'2h'`, `'1d'`, `'1w'`) or a number of milliseconds |

Always pass `maxAge` to `nearestAssets`: it keeps the server's fallback search time-bounded. `maxAge` is applied
after `limit`, so fewer than `limit` fresh assets can come back while more exist (USI-P3-8); ask for a larger
`limit` when you need a full page.

<!-- snippet: prelude=client -->
```ts
const around = await client.spatial.nearestAssetsRealtime({ lat: 48.8566, lon: 2.3522, limit: 5 });
console.log(around.assets.map((a) => [a.user_udid, Math.round(a.distance_meters)]));

const forklifts = await client.spatial.nearestAssets({
  lat: 48.8566,
  lon: 2.3522,
  limit: 20,
  maxAge: '15m',
  search: { field: 'user_name', pattern: '^Forklift' },
});
console.log(forklifts.total_assets);
```

## 10. Known server issues

| Id | Issue | SDK behaviour |
|---|---|---|
| USI-P3-1 | Zone GETs return no zones | documented; use `analyzeCustomZones` / `zoneDistances` |
| USI-P3-2 | POI GETs return no POIs | documented; use `venues.listPois({ tag })` / `analyzeCustomPois` |
| USI-P3-3 | POI statistics leave `tags` and `venues` empty | documented |
| USI-P3-6 | POST spatial routes reject a 0 coordinate; custom POIs with a 0 coordinate are dropped | documented |
| USI-P3-7 | Out-of-range coordinates and a missing custom-POI radius answer 500 | coordinates validated locally in every form; the radius in the object form (`radiusMeters`); the legacy wire form is sent verbatim (`ValidationError`, status 0, for what is validated) |
| USI-P3-8 | Nearest assets: `maxAge` applied after `limit`; the fallback search finds nothing | documented; pass `maxAge` |
| USI-P3-9 | An invalid `dataType` answers 500 | `EsDataType` limits the values |
| USI-P3-10 | Missing response schemas and query limits in the API specification | hand-written types; limits above |
| USI-P3-12 | Spatial zone and POI queries use only the first venue | documented |
| USI-P3-13 | `hasMore` on nearest zones is not meaningful | `hasMore` optional |

## 11. Upgrading from 0.2

- Zone results are GeoJSON Features: `res.zones[0].properties.name` instead of `res.zones[0].name`; `hasMore` is
  optional.
- `analyzeCustomZones` and `analyzeCustomPois` send the body the server reads (they always failed with 400
  before); prefer the object forms `{ lat, lon, customZones }` / `{ lat, lon, customPois, operation }`.
- `listLast()` reads the last 24 h by default and no longer sends `page`, `limit`, `sort`, `fields` or filters
  (the server ignored them); use `timestampFrom: 0` for the whole history.
- Results are typed (`CachedAssetPosition`, `AssetPosition`, `EsSearchResponse`, spatial result types) instead of
  `Record<string, unknown>`.
- Zone and POI GETs apply the client's default `level`; `level: null` opts out.
- `client.esQuery()` is deprecated in favour of `client.positions.query()`.
- MACs in paths are normalised, and an invalid one throws `ValidationError` before any request. `user_udid` /
  `user_uuid` of a publish and the `value` of `getHistory` are normalised when they are valid MACs and sent
  unchanged otherwise.
- `listCached({ namespace })` honours the namespace.
- Spatial methods reject out-of-range coordinates locally.
- The trailing `requestOptions` argument of object-form calls is deprecated: put `signal` / `timeoutMs` in the
  options object.

New: `positions.query`, `spatial.zoneDistances`, `spatial.poisByTag`, `spatial.poiStatistics`,
`spatial.nearestAssets`, `spatial.nearestAssetsRealtime`, `current` on `listLast`, `tags` on POI GETs. The full
list with before/after code is in the [migration guide](migration-0.3.md).
