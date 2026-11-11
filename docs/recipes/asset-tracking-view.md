# Recipe: asset tracking view

Build the table behind a "where is everything" screen: every tracked asset with its name, type, zone, the age of
its last position and its coordinates, newest first, plus the number of assets per zone, kept up to date for a
few seconds from the live position stream.

Files: [TypeScript](../../examples/typescript/20-asset-tracking-view.ts),
[JavaScript](../../examples/javascript/20-asset-tracking-view.js). Read-only.

## Prerequisites

- A namespace with a venue, a map, zones and assets that report positions.
- The repository examples set up as in [examples/README.md](../../examples/README.md) (`.env` with
  `APP_NAMESPACE` and `RTLS_API_KEY`).
- On Node 20 the WebSocket step needs the `ws` package (the examples package installs it).

## Run it

```bash
npm run examples:check -- 20
# or, from examples/
npx tsx typescript/20-asset-tracking-view.ts --seconds 10
node javascript/20-asset-tracking-view.js --out assets.geojson
```

| Option | Default | Meaning |
|---|---|---|
| `--seconds <n>` | 5 | length of the live subscription, at most 30 |
| `--out <file>` | — | writes a GeoJSON FeatureCollection of the asset points |

The `--out` file holds the names and positions of your assets: keep it out of version control.

## Steps

### 1. Venue, map and zones

The first venue becomes the client's default venue; zones are read once to name the zone of each position.

<!-- snippet: prelude=client -->
```ts
const [venue] = await client.venues.list();
if (!venue) throw new Error('no venue');
client.setVenue(venue.id);
const maps = await client.venues.listMaps();
const zones = await client.zones.listAsArray();
const zoneName = new Map(zones.map((z) => [z.id, z.name]));
console.log(`${maps.length} map(s), ${zones.length} zone(s)`);
```

### 2. Assets and cached positions, joined by udid

`assets.list()` returns every asset of the namespace in one array: only `key`/`value` are sent, and `sort`,
`fields`, `page`, `limit` and filters are applied locally by the SDK. `positions.listCached()` returns the last
known position of every tracked asset; `user_udid` is the key both share, so the join happens in your code.

<!-- snippet: continue -->
```ts
const assets = await client.assets.list();
const assetOf = new Map(assets.map((a) => [a.user_udid, a]));
const positions = await client.positions.listCached();
const rows = positions
  .map((p) => ({
    name: assetOf.get(p.user_udid)?.user_name ?? p.user_name ?? '(unnamed)',
    zone: p.zone && p.zone.id !== 0 ? (zoneName.get(p.zone.id) ?? p.zone.name) : 'outside all zones',
    timestamp: p.timestamp,
    lat: p.lat,
    lon: p.lon,
  }))
  .sort((x, y) => Date.parse(y.timestamp) - Date.parse(x.timestamp));
console.log(rows.slice(0, 20));
```

A position outside every zone carries the zone-0 pseudo-zone `{ id: 0, name: 'OUTSIDE_ALL_ZONES' }`; test the id,
not the name, and stay null-safe (`zone` is typed optional). `timestamp` is an ISO-8601 string.

### 3. Live positions

`client.createWebSocket()` derives the WebSocket URL and credentials from the client. Subscribe to `POSITIONS`,
update the zone of each asset as messages arrive, and always disconnect, with a deadline, when you are done.

<!-- snippet: continue -->
```ts
const zoneOf = new Map(rows.map((r) => [r.name, r.zone]));
const ws = client.createWebSocket();
try {
  await ws.connect({ subscriberOnly: true });
  ws.on('POSITIONS', (m) => {
    zoneOf.set(m.user_name ?? m.user_udid, m.zone && m.zone.id !== 0 ? m.zone.name : 'outside all zones');
  });
  await ws.subscribe([SubscriptionType.POSITIONS]);
  await new Promise((resolve) => setTimeout(resolve, 5_000));
} finally {
  await ws.disconnect();
}
```

### 4. GeoJSON output

GeoJSON coordinates are `[lon, lat]`, the reverse of the `lat`/`lon` fields.

<!-- snippet: continue -->
```ts
const collection = {
  type: 'FeatureCollection',
  features: rows.map((r) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
    properties: { name: r.name, zone: r.zone, timestamp: r.timestamp },
  })),
};
console.log(JSON.stringify(collection).length);
```

## Example output

Illustrative; names, zones and coordinates are invented.

```text
venue 7: 1 map(s), first map level 0
zones: 10
assets: 200
cached positions: 200
newest 20 positions:
  name | type | zone | age | lat, lon
  Forklift 12 | vehicle | Loading bay | 4s | 48.85000, 2.35000
  Pallet 381 | pallet | outside all zones | 2m 10s | 48.85010, 2.35020
  …
assets per zone (cache):
  Loading bay: 41
  outside all zones: 3
  …
listening to POSITIONS for 5 s
live positions received: 96
assets per zone (cache + live):
  Loading bay: 42
  …
DONE 20-asset-tracking-view
```

## Pitfalls

- `assets.list()` sends only `key`/`value` to the server and applies `sort`, `fields`, `page`, `limit` and
  filters locally, with the server's semantics; there is no need for a second `applyFilters` pass on its result.
  Use `applyFilters` (see [pagination and filtering](../guides/pagination-filtering.md)) on lists that take no
  such options, such as `positions.listCached()`.
- Spatial zone queries can report zones in `total_zones` but return an empty `zones` array (USI-P3-1), so the
  recipe takes zone names from the venue's zones, not from spatial queries.
- A busy namespace sends many position messages per second: keep handlers short and the subscription bounded.

## Going further

- [Positions and spatial queries guide](../guides/positions-spatial.md)
- [WebSocket streaming guide](../guides/websocket.md)
- [All recipes](README.md)
