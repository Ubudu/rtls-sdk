# Recipe: bulk declared location

## What you build

A declared location tells the RTLS where an asset is when no tag reports it, for example a pallet scanned at a
dock door. This recipe declares one shared location for a set of assets in one call and clears it again. The
same `bulkDeclare` call takes up to 500 assets.

## Prerequisites

- A namespace with a venue, a map and zones.
- The read-only run only computes the target point and prints the plan. The write run (`--write`) creates one
  test asset, declares its location, which makes the position server publish one position for it, and removes
  everything again.

## Run it

```bash
cd examples
npm run ts -- typescript/24-bulk-declared-location.ts
npm run js -- javascript/24-bulk-declared-location.js
```

## Steps

### 1. Choose the point

The repository recipe takes its point from the shared example helpers in
[`examples/shared/discover.js`](../../examples/shared/discover.js): `discover()` collects the venue's zones and the
chosen map's features, and `safePublishPoint()` returns a grid point of the map that lies outside every zone and at
least 10 m from any zone edge. In your own code, the point is usually where the asset was scanned.

<!-- snippet: skip -->
```ts
// In examples/typescript/24-bulk-declared-location.ts (path relative to that file):
import { discover, safePublishPoint } from '../shared/discover.js';

const discovery = await discover();
const point = safePublishPoint(discovery); // { lat, lng, level } | null
```

### 2. Declare one shared location for many assets

Declared locations use `lat`/`lng` (positions use `lat`/`lon`). `map_uuid` places the location on a map, so the
position server can detect its zone. Items are addressed by `mac_address` or `external_id`.

<!-- snippet: prelude=client -->
```ts
const result = await client.declaredLocations.bulkDeclare({
  assets: [{ mac_address: '025d4b000001' }, { mac_address: '025d4b000002' }],
  shared_location: { lat: 48.8566, lng: 2.3522, level: 0, map_uuid: 'map-uuid-of-the-floor' },
  auto_create_virtual_assets: false,
});
console.log(result.success, result.failed, result.created);
for (const e of result.errors) console.log(e.identifier, e.error, e.message);
```

`success`, `failed` and `created` are counts; `errors` lists each rejected item with a `DL_0xx` code. Each asset
whose declared location changes gets one published position; declaring the location it already has publishes
nothing.

### 3. Read it back

The declared location is stored on the asset:

<!-- snippet: prelude=client -->
```ts
const asset = await client.assets.get('025d4b000001');
console.log(asset.declared_location?.lat, asset.declared_location?.lng);
```

### 4. Clear it

Clearing removes `declared_location` from the asset (the field is absent afterwards, not `null`) and publishes
nothing:

<!-- snippet: prelude=client -->
```ts
const cleared = await client.declaredLocations.bulkClear({ mac_addresses: ['025d4b000001', '025d4b000002'] });
console.log(cleared.success, cleared.failed);
```

## Example output

Illustrative, read-only run:

```text
planned declare: 1 asset (025d4b1a2b5b) on level 0, outside every zone
planned point: 48.85660, 2.35220
expected budget: positions=1
read-only pass: nothing written (start with --write to declare)
DONE 24-bulk-declared-location
```

## Pitfalls

- `assets.create(mac, …)` is an upsert keyed by MAC: creating an asset whose MAC already exists merges the body
  into it (RFC 7396), so its other fields stay. Check with `assets.get(mac)` (expect `NotFoundError`) before
  creating.
- A declared position is a real position: alert rules evaluate it like any other, including the "outside all
  zones" pseudo-zone event it produces outside every zone. A point outside every zone keeps zone rules quiet,
  not every rule.
- `auto_create_virtual_assets: true` creates permanent virtual assets for unknown identifiers; leave it `false`
  unless that is what you want.
- Deleting an asset removes the asset record only: its cached position stays until the namespace's position
  expiry, and published positions stay in the position history.
- At most 500 assets per request; split larger sets.

## With `--write`

The write section runs only when the namespace's alert rules cannot react to a declared position of a test
asset (rule preflight); otherwise it reports `SKIPPED: preflight`. It then:

1. checks that the test MAC is free (`assets.get` → `NotFoundError`; otherwise it stops without writing);
2. creates the asset `sdk-test-<runId>-dl-1` and reads it back;
3. declares the location (budget: positions 1) and checks `success 1`, `failed 0`, `created 0`, no errors;
4. reads `declared_location` back and, for up to 10 s, looks for the published position in the cache;
5. cleans up in reverse order: clears the declared location, deletes the asset, and checks that it is gone.

What stays: the one published position in the position history, the cached position of the test MAC until the
namespace's position expiry, the asset-change history entries, and the events already delivered to live
subscribers.

## Going further

- [Assets guide](../guides/assets.md): assets, declared locations, documents.
- [Positions and spatial guide](../guides/positions-spatial.md): cached positions and history.
- [All recipes](README.md)
