[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / DeclaredLocationsResource

# Class: DeclaredLocationsResource

Declare and clear asset locations in bulk.

## Extends

- `ResourceBase`

## Methods

### bulkDeclare()

> **bulkDeclare**(`request`, `options?`): `Promise`\<[`BulkDeclareResult`](../interfaces/BulkDeclareResult.md)\>

Declares the location of up to 500 assets (`POST /assets/{namespace}/bulk-declare`). Each item names its asset
by `mac_address` (normalised) or `external_id`, and uses its own `declared_location` or the request's
`shared_location`. The body is sent as given, with wire names.

Side effects: each item whose location changes publishes one position (origin `declared`), and alert rules may
fire; re-declaring the stored location publishes nothing. With `auto_create_virtual_assets: true`, an unknown
`external_id` creates a permanent virtual asset (a `0200…` MAC, model `default_asset_model`); find it with
`assets.list({ key: 'external_id', value })`.

The answer is `200` even when items fail: read `failed` and `errors` (each with a `DL_0xx` code).

#### Parameters

##### request

[`BulkDeclareRequest`](../interfaces/BulkDeclareRequest.md)

the items, an optional `shared_location`, `auto_create_virtual_assets`, `default_asset_model`

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

per-call `namespace` (else the client default) and request options

#### Returns

`Promise`\<[`BulkDeclareResult`](../interfaces/BulkDeclareResult.md)\>

the counts and the per-item errors

#### Throws

status 0 for a local check (1..500 items, an identifier per item, valid MACs and
  external ids, unique identifiers, a location per item, coordinate ranges); status 400 with `apiCode`
  `DL_002`/`DL_010`/`DL_012`/`DL_013` and the server message

#### Throws

`apiCode` `DL_004` on an unexpected server failure

#### Throws

when no namespace is given or set (nothing is sent)

#### Example

```typescript
const result = await client.declaredLocations.bulkDeclare({
  assets: [{ mac_address: 'AA:BB:CC:DD:EE:FF' }, { external_id: 'PALLET-42' }],
  shared_location: { lat: 48.8566, lng: 2.3522, level: 0, source: 'api' },
});
console.log(`${result.success} declared, ${result.failed} failed`, result.errors);
```

***

### bulkClear()

> **bulkClear**(`request`, `options?`): `Promise`\<[`BulkClearResult`](../interfaces/BulkClearResult.md)\>

Clears the declared location of up to 500 assets (`POST /assets/{namespace}/bulk-clear-declared`), named by
`mac_addresses` (normalised) and/or `external_ids`. A list left out is not sent. Clearing publishes no
position; afterwards `declared_location` is absent from the asset.

Invalid MACs and unknown external ids are skipped by the server without a result row (USI-P2-11); a MAC that
matches no asset gets a `DL_017` error row.

#### Parameters

##### request

[`BulkClearRequest`](../interfaces/BulkClearRequest.md)

`mac_addresses` and/or `external_ids` (at least one non-empty, at most 500 in total)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

per-call `namespace` (else the client default) and request options

#### Returns

`Promise`\<[`BulkClearResult`](../interfaces/BulkClearResult.md)\>

the counts and one row per resolved MAC

#### Throws

status 0 for a local check; status 400 with `apiCode` `DL_012`/`DL_010`

#### Throws

`apiCode` `DL_017` on an unexpected server failure

#### Throws

when no namespace is given or set (nothing is sent)

#### Example

```typescript
const result = await client.declaredLocations.bulkClear({ mac_addresses: ['aabbccddeeff'] });
console.log(result.results.map((r) => `${r.mac_address}: ${r.status}`));
```
