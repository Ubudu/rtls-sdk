# Pagination and filtering

RTLS listings come in three shapes. The SDK gives each a method name and a type, bounds every iteration, and
evaluates filters the same way the server does.

## 1. The three listing models

| Model | Wire | SDK type and helpers |
|---|---|---|
| Page envelope | `page` and `limit` → `{ data, pagination: { page, limit, total, totalPages, hasNext, hasPrev } }` | `Page<T>`, `listPage()`, `paginatePages()` |
| Offset | `limit` and `offset`; the total in the `X-Total-Count` header or in the body | `OffsetPage<T>`, `listPage()`, `paginateOffset()` |
| Server returns everything | the full array | `list()`, `iterate()`, and `applyFilters()` for local filtering, sorting and paging |

| Method | Model | Returns |
|---|---|---|
| `assets.list()`, `assets.iterate()` | everything (only `key`/`value` reach the server) | `Asset[]`, `AsyncGenerator<Asset>` |
| `assetDocuments.listPage(mac, { limit, offset })` | offset | `OffsetPage<AssetDocumentSummary>` |
| `assetDocuments.list(mac, { maxItems })` | offset, every page | `AssetDocumentSummary[]` |
| `positions.listCached()` | everything | `CachedAssetPosition[]` |
| `positions.listLast()` | everything (time-bounded) | `AssetPosition[]` |
| `venues.list()`, `venues.iterate()` | everything | `VenueSummary[]`, `AsyncGenerator<VenueSummary>` |
| `venues.listMaps()` | everything | `IndoorMap[]` |
| `venues.listPois()`, `venues.listPaths()` | everything (GeoJSON) | `POIFeatureCollection`, `PathFeatureCollection` |
| `venues.listPoisAsArray()`, `venues.listPathNodes()`, `venues.listPathSegments()` | everything | `POI[]`, `PathNode[]`, `PathSegment[]` |
| `venues.listMapPois()` (deprecated: sample data only, USI-P4-6) | everything | `MapPoisResponse` (`{ items, total }`) |
| `zones.list()` | everything (GeoJSON) | `ZoneFeatureCollection` |
| `zones.listAsArray()`, `zones.iterate()` | everything | `Zone[]`, `AsyncGenerator<Zone>` |
| `zones.listByMap()`, `zones.listByMapAsArray()` (deprecated: sample data only, USI-P4-6) | everything | `ZoneFeatureCollection`, `Zone[]` |
| `dashboards.list()`, `listCreated()`, `listShared()`, `listSelected()` | everything | `Dashboard[]` |
| `alerts.list({ timestampFrom, timestampTo, size })` | everything, bounded by `size` and the time range | `AlertEvent[]` |
| `notifications.list()` | offset, one page | `NotificationItem[]` |
| `notifications.listPage()` | offset | `OffsetPage<NotificationItem>` |
| `notifications.iterate()` | offset, every page | `AsyncIterableIterator<NotificationItem>` |
| `notifications.listGroups()` | grouped roll-up of the newest items | `NotificationGroup[]` |
| `notifications.rules.list()`, `connections.list()`, `savedViews.list()`, `admin.recipientMappings.list()` | everything | `NotificationRule[]`, `NotificationConnection[]`, `NotificationSavedView[]`, `NotificationRecipientMapping[]` |
| `etl.activities.listPage({ page, limit })` | page envelope | `Page<EtlActivity>` |
| `etl.activities.iterate({ pageSize })` | page envelope, every page | `AsyncIterableIterator<EtlActivity>` |
| `etl.mappingProfiles.list()`, `etl.mappingProfiles.listAll()` | everything | `EtlMappingProfile[]` |

## 2. Page envelope

`listPage()` returns one `Page<T>`; `iterate()` walks every page lazily, fetching the next page only when the
loop asks for it:

<!-- snippet: prelude=client -->
```ts
const first = await client.etl.activities.listPage({ limit: 20 });
console.log(first.data.length, first.pagination.total, first.pagination.hasNext);

for await (const activity of client.etl.activities.iterate({ pageSize: 100 })) {
  console.log(activity.action);
}
```

`paginatePages(fetchPage, { limit, startPage, maxPages })` turns any page fetcher into an async iterator; it stops
when `hasNext` is false or a page is empty:

```ts
import { paginatePages, type Page } from 'ubudu-rtls-sdk';

declare function fetchPage(page: number, limit: number): Promise<Page<{ id: string }>>;

for await (const item of paginatePages(fetchPage, { limit: 50, maxPages: 10 })) {
  console.log(item.id);
}
```

For list responses you fetch yourself (for example through `client.raw`), `normalizePage(response, { page, limit })`
turns an envelope, a `{ data }` object or a bare array into a `Page<T>`; an array or a `{ data }` object becomes a
single page with `hasNext` false. `extractDataArray(response)` returns the item array of any of these shapes (an
empty array for anything else):

```ts
import { extractDataArray, normalizePage } from 'ubudu-rtls-sdk';

console.log(normalizePage(['a', 'b']).pagination); // { page: 1, limit: 2, total: 2, totalPages: 1, hasNext: false, hasPrev: false }
console.log(extractDataArray<string>({ data: ['a', 'b'] })); // ['a', 'b']
```

`buildQueryParams(query)` serialises a query as the transport does: every defined key is kept, arrays (`sort`,
`fields`) are joined with `,` and dates become epoch milliseconds, for example
`buildQueryParams({ key: 'user_type', value: 'forklift', sort: ['user_name:asc'] })` gives
`{ key: 'user_type', value: 'forklift', sort: 'user_name:asc' }`.

Venue routes (venues, maps, zones, POIs, paths) have no page form. `venues.list()` returns the whole array and
`venues.iterate()` yields it; the SDK never sends `page` or `limit` there. Paging keys change the body of the venue
and map listings (USI-P4-3), the GeoJSON routes ignore paging without a filter (USI-P4-5), and any other
unrecognised query key empties the result (USI-P4-4). See the
[venues and navigation guide](./venues-navigation.md).

## 3. Offset

An `OffsetPage<T>` is `{ items, total?, limit, offset }`. `total` comes from the `X-Total-Count` header or from
the body; it may be absent (cross-origin browsers cannot read the header, known server issue USI-P1-4). Without a
total, stop on a page shorter than `limit`:

<!-- snippet: prelude=client -->
```ts
const page = await client.notifications.listPage({ limit: 50, offset: 0 });
console.log(page.items.length, page.total ?? 'unknown total');
```

`paginateOffset(fetchPage, { limit, startOffset, maxPages, stopOnShortPage })` iterates any offset fetcher:

<!-- snippet: prelude=client -->
```ts
import { paginateOffset } from 'ubudu-rtls-sdk';

const mac = '025d4b000001';
const documents = paginateOffset(
  (offset, limit) => client.assetDocuments.listPage(mac, { offset, limit }),
  { limit: 100 }
);
for await (const doc of documents) console.log(doc);
```

Notifications are listed flat: `list()`, `listPage()` and `iterate()` return individual items, newest first.
`listGroups({ group_by })` returns roll-ups (by thread, zone, asset or type) of the newest matching items.

## 4. Server returns everything

`GET /assets/{namespace}` answers with every asset of the namespace and applies only an exact `key`/`value` match.
`assets.list()` sends `key` and `value` and evaluates `filters`, `sort`, `fields`, `page` and `limit` itself:

<!-- snippet: prelude=client -->
```ts
import { filters } from 'ubudu-rtls-sdk';

const one = await client.assets.list({ key: 'user_udid', value: '025d4b000001' });
const forklifts = await client.assets.list({
  filters: filters.equals('user_type', 'forklift'),
  sort: 'user_name:asc',
  limit: 10,
});
console.log(one.length, forklifts.length);
```

`applyFilters(items, { filters, sort, page, limit, fields })` is the same evaluator, for any array you already
hold. It returns a `Page<T>`:

```ts
import { applyFilters, filters } from 'ubudu-rtls-sdk';

const rows = [
  { name: 'Forklift 1', battery: 80 },
  { name: 'Forklift 2', battery: 15 },
  { name: 'Trolley 7', battery: 55 },
];
const low = applyFilters(rows, { filters: filters.lessThan('battery', 60), sort: 'battery:asc', limit: 10 });
console.log(low.data.map((r) => r.name), low.pagination.total);
```

The full list is held in memory: for large namespaces read it once and filter locally rather than calling
`list()` in a loop.

## 5. Bounding an iteration

`collectAll(iterable, { maxItems })` gathers an async iterator into an array and stops after `maxItems`:

<!-- snippet: prelude=client -->
```ts
import { collectAll } from 'ubudu-rtls-sdk';

const latest = await collectAll(client.notifications.iterate({ state: 'unread' }), { maxItems: 200 });
console.log(latest.length);
```

## 6. Filter DSL

The `filters` builders produce `field:op` keys; `combineFilters()` merges several (a later filter on the same
`field:op` wins):

```ts
import { combineFilters, filters } from 'ubudu-rtls-sdk';

const query = combineFilters(
  filters.equals('user_type', 'forklift'),
  filters.contains('user_name', 'dock'),
  filters.between('battery_percent', 20, 80)
);
console.log(query);
```

| Builder | Operator | Meaning |
|---|---|---|
| `filters.equals(f, v)` / `notEquals` | `eq` / `ne` | equal / not equal |
| `filters.greaterThan`, `greaterThanOrEqual`, `lessThan`, `lessThanOrEqual` | `gt`, `gte`, `lt`, `lte` | comparisons |
| `filters.contains`, `startsWith`, `endsWith` | `contains`, `starts`, `ends` | text match |
| `filters.matches(f, pattern)` | `regex` | regular expression |
| `filters.in(f, values)` / `notIn` | `in` / `nin` | one of / none of |
| `filters.exists(f, present?)` | `exists` | field present (or absent) |
| `filters.between(f, min, max)` | `between` | inclusive range |
| `filters.size(f, n)` | `size` | array length |
| `filters.all(f, values)` | `all` | array contains every value |
| `filters.elemMatch(f, v)` | `elem` | an array element matches |

`filter(field, operator, value)` is the builder every `filters.*` helper wraps; use it when the operator is held in
a variable. `filter('battery_percent', 'gte', 20)` is the same as `filters.greaterThanOrEqual('battery_percent', 20)`:

```ts
import { filter, type FilterOperator } from 'ubudu-rtls-sdk';

const operator: FilterOperator = 'gte';
console.log(filter('battery_percent', operator, 20)); // { 'battery_percent:gte': 20 }
```

Fields are dot paths (`properties.level`, `data.batch`); a field containing `:`, `[` or `]` is rejected with a
client-side `ValidationError` (status 0). `applyFilters()` reads an array element through a numeric segment
(`items.0`).

`serializeFilters(filters, grammar)` shows what is sent. Universal-filter routes take one query key per filter;
venue, zone, POI and path routes take one JSON `filters` parameter:

```ts
import { combineFilters, filters, serializeFilters } from 'ubudu-rtls-sdk';

const f = combineFilters(filters.equals('properties.level', 0), filters.contains('properties.name', 'dock'));
console.log(serializeFilters(f, 'universal')); // { 'properties.level:eq': '0', 'properties.name:contains': 'dock' }
console.log(serializeFilters(f, 'venue')); // { filters: '[{"field":"properties.level","operator":"eq","value":0},…]' }
```

Pitfalls of the server grammar:

- On universal-filter routes an unknown operator or a plain `field=value` key is **silently ignored**: the result
  is unfiltered. Use the builders, never hand-written keys.
- On venue routes the opposite happens: an unrecognised key makes the result **empty**.
- The asset list applies neither grammar on the server; the SDK evaluates the filters locally (section 4).

## 7. Sorting and field selection

`sort` takes `'field:asc'` or `'field:desc'`, several keys as an array; `fields` keeps only the listed dot paths:

```ts
import { applyFilters } from 'ubudu-rtls-sdk';

const rows = [
  { name: 'b', level: 1, meta: { owner: 'x' } },
  { name: 'a', level: 1, meta: { owner: 'y' } },
];
const sorted = applyFilters(rows, { sort: ['level:desc', 'name:asc'], fields: ['name', 'meta.owner'] });
console.log(sorted.data); // [{ name: 'a', meta: { owner: 'y' } }, { name: 'b', meta: { owner: 'x' } }]
```

## 8. Patterns

Bounded concurrency over venues, one scoped client per venue:

<!-- snippet: prelude=client -->
```ts
async function mapWithConcurrency<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const venues = await client.venues.list();
const zoneCounts = await mapWithConcurrency(venues, 3, async (venue) => {
  const zones = await client.forVenue(venue.id).zones.listAsArray();
  return { venue: venue.id, zones: zones.length };
});
console.log(zoneCounts);
```

Caching a full listing for a short time:

<!-- snippet: prelude=client -->
```ts
import type { Asset } from 'ubudu-rtls-sdk';

let cache: { at: number; assets: Asset[] } | undefined;

async function allAssets(maxAgeMs = 60_000): Promise<Asset[]> {
  if (cache && Date.now() - cache.at <= maxAgeMs) return cache.assets;
  const assets = await client.assets.list();
  cache = { at: Date.now(), assets };
  return assets;
}
console.log((await allAssets()).length);
```

Processing in batches with a bound:

<!-- snippet: prelude=client -->
```ts
import { collectAll } from 'ubudu-rtls-sdk';

const items = await collectAll(client.notifications.iterate({ state: 'unread' }), { maxItems: 500 });
for (let i = 0; i < items.length; i += 50) {
  const batch = items.slice(i, i + 50);
  console.log(`batch ${i / 50 + 1}: ${batch.length} item(s)`);
}
```
