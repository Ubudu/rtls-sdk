# Recipe: zone presence report

Report how long assets spent in each zone over the last hours: one zone presence timeline per asset, summed into
dwell time per zone and printed as CSV.

Files: [TypeScript](../../examples/typescript/22-zone-presence-report.ts),
[JavaScript](../../examples/javascript/22-zone-presence-report.js). Read-only.

## Prerequisites

- A namespace with zones and assets whose positions are recorded in the position history.
- The repository examples set up as in [examples/README.md](../../examples/README.md) (`.env` with
  `APP_NAMESPACE` and `RTLS_API_KEY`).

## Run it

```bash
npm run examples:check -- 22
# or, from examples/
npx tsx typescript/22-zone-presence-report.ts --hours 48 --interval 30m
node javascript/22-zone-presence-report.js --type forklift --out presence.csv
```

| Option | Default | Meaning |
|---|---|---|
| `--hours <n>` | 24 | window ending now, at most 168 |
| `--interval <i>` | `1h` | slot length, a fixed interval in `m`, `h` or `d` (`30m`, `1h`, `1d`) |
| `--type <user_type>` | — | only assets of this type |
| `--max-assets <n>` | 20 | number of assets, at most 20 |
| `--out <file>` | — | writes the CSV to a file instead of the console |

The CSV holds asset identifiers and names of your namespace: keep it out of version control.

## Steps

### 1. Pick the assets

The presence timeline is per asset and keyed by the asset's udid exactly as stored, so take the udids from the
position cache. Filter locally with `applyFilters`.

<!-- snippet: prelude=client -->
```ts
const cached = await client.positions.listCached();
const forklifts = applyFilters(cached, { filters: filters.equals('user_type', 'forklift') }).data;
const assets = forklifts.slice(0, 20);
```

### 2. One timeline per asset

`zones.getPresence()` returns one slot per `interval`, from the asset's first to its last position in the time
range. Send `interval` explicitly: without it the server picks one from the length of the range (`1h` for a
24-hour range; see the [default intervals](../guides/venues-navigation.md#7-zone-presence-timeline)). Space the
calls: each one is a query on the position history.

<!-- snippet: continue -->
```ts
const timestampTo = Date.now();
const timestampFrom = timestampTo - 24 * 3_600_000;
for (const p of assets) {
  const slots = await client.zones.getPresence({ value: p.user_udid, timestampFrom, timestampTo, interval: '1h' });
  console.log(p.user_udid, slots.length);
  await new Promise((resolve) => setTimeout(resolve, 200));
}
```

Without `value` the server returns the timeline of the busiest asset, not of all assets; a `key` other than the
default returns an empty list (USI-P4-18).

### 3. Read the slots

Each slot has a `timestamp` (start of the slot, epoch ms) and the zone of one position sampled in it:

| Slot | Meaning |
|---|---|
| `{ id, name, tags, color, timestamp }` | the asset was seen in this zone |
| `{ id: 0, name: 'OUTSIDE_ALL_ZONES', timestamp }` | no position was recorded in the slot (between the asset's first and last position) |
| `{ name: 'UNKNOWN_ZONE', timestamp }` | positions without zone data |

<!-- snippet: continue -->
```ts
const sample = await client.zones.getPresence({ value: assets[0]?.user_udid, interval: '1h' });
const perZone = new Map<string, number>();
for (const s of sample) perZone.set(s.name, (perZone.get(s.name) ?? 0) + 1);
for (const [zone, count] of perZone) console.log(`${zone}: ${count * 60} min`);
```

Dwell time is `slots × interval`, an approximation: a slot stands for one sampled position, not for the time
spent in the zone during the whole slot. The slots span only the asset's first to last position in the range,
and the time outside that span is not reported as `OUTSIDE_ALL_ZONES`: an asset seen for 3 hours of a 24-hour
window gives about 3 slots at `1h`. A 24-hour window at `1h` yields 25 slots (aligned to whole hours) only when
the asset reported at both ends of the window.

## Example output

Illustrative; MACs, names and zones are invented.

```text
cached positions: 200; selected assets: 20
slots for the first asset: 25
presence requests: 20
asset_udid,asset_name,zone_id,zone_name,slots,dwell_minutes
025d4b000001,Forklift 12,3,Loading bay,14,840
025d4b000001,Forklift 12,0,OUTSIDE_ALL_ZONES,11,660
025d4b000002,Pallet 381,5,Cold store,25,1500
…
DONE 22-zone-presence-report
```

## Pitfalls

- `value` must match the stored udid exactly (12 lowercase hex characters); the SDK normalises a MAC written
  with separators or capitals before sending (USI-P4-18).
- The slot's zone comes from one document of the slot, not from the majority of the slot (USI-P4-18).
- Calendar intervals (`1w`, `1M`) are rejected; use fixed units.
- Keep the number of requests small: the recipe caps it at 20 per run.

## Going further

- [Venues and navigation guide](../guides/venues-navigation.md) (zones and presence)
- [Pagination and filtering](../guides/pagination-filtering.md) (`applyFilters`)
- [All recipes](README.md)
