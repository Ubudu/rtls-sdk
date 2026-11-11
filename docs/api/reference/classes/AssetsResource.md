[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / AssetsResource

# Class: AssetsResource

Asset records of a namespace.

The 0.2.0 positional forms with an explicit namespace first (`get('ns', mac)`, `list('ns', options)`) keep working;
the per-call `{ namespace }` option is the current form.

## Extends

- `ResourceBase`

## Methods

### list()

#### Call Signature

> **list**(`options?`): `Promise`\<[`Asset`](../interfaces/Asset.md)[]\>

Lists the assets of the namespace (`GET /assets/{app_namespace}`).

The server returns the whole namespace and matches only `key`/`value` (an exact match on one field, dot paths
allowed); `page`, `limit`, `sort`, `fields` and the `"field:op"` filters are evaluated locally with the
server's universal-filter semantics (USI-P2-1), so only `key`/`value` are sent.

With `fields`, each item holds only the selected fields (a projection), while the return type stays `Asset[]`:
`user_name` and the other fields not selected are then absent at run time.

##### Parameters

###### options?

[`ListAssetsParams`](../type-aliases/ListAssetsParams.md)

`key` + `value` (server-side, both or neither), local `filters` / `"field:op"` keys (explicit
  `filters` win on the same key), `sort`, `fields`, `page` (integer >= 1), `limit` (integer 1..1000), per-call
  `namespace` and request options

##### Returns

`Promise`\<[`Asset`](../interfaces/Asset.md)[]\>

##### Throws

status 0 for `key` without `value` (or the reverse), a bad `page`/`limit`, filter,
  `sort` or `fields` (nothing is sent)

##### Throws

when no namespace is given or set

##### Example

```typescript
import { createRtlsClient } from 'ubudu-rtls-sdk';

const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace' });
const forklifts = await client.assets.list({ key: 'user_type', value: 'forklift' });
const firstTen = await client.assets.list({ 'user_name:contains': 'fork', sort: 'user_name:asc', limit: 10 });
console.log(forklifts.length, firstTen.length);
```

#### Call Signature

> **list**(`options`, `requestOptions`): `Promise`\<[`Asset`](../interfaces/Asset.md)[]\>

##### Parameters

###### options

[`ListAssetsParams`](../type-aliases/ListAssetsParams.md) \| `undefined`

###### requestOptions

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`Asset`](../interfaces/Asset.md)[]\>

##### Deprecated

since 0.3.0 — the 0.2.0 two-object form; pass `signal` / `timeoutMs` in `options`.

#### Call Signature

> **list**(`namespace`, `options?`, `requestOptions?`): `Promise`\<[`Asset`](../interfaces/Asset.md)[]\>

Legacy form with the namespace first.

##### Parameters

###### namespace

`string`

###### options?

[`ListAssetsOptions`](../type-aliases/ListAssetsOptions.md)

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`Asset`](../interfaces/Asset.md)[]\>

***

### iterate()

#### Call Signature

> **iterate**(`options?`): `AsyncGenerator`\<[`Asset`](../interfaces/Asset.md)\>

Yields the assets that [AssetsResource.list](#list) returns, in order (one request).

##### Parameters

###### options?

[`ListAssetsParams`](../type-aliases/ListAssetsParams.md)

##### Returns

`AsyncGenerator`\<[`Asset`](../interfaces/Asset.md)\>

##### Throws

as `list`

##### Throws

when no namespace is given or set

##### Example

```typescript
for await (const asset of client.assets.iterate({ key: 'user_type', value: 'forklift' })) {
  console.log(asset.user_udid, asset.user_name);
}
```

#### Call Signature

> **iterate**(`namespace`, `options?`): `AsyncGenerator`\<[`Asset`](../interfaces/Asset.md)\>

Legacy form with the namespace first.

##### Parameters

###### namespace

`string`

###### options?

[`ListAssetsOptions`](../type-aliases/ListAssetsOptions.md)

##### Returns

`AsyncGenerator`\<[`Asset`](../interfaces/Asset.md)\>

***

### ~~getAll()~~

#### Call Signature

> **getAll**(`options?`, `requestOptions?`): `Promise`\<[`Asset`](../interfaces/Asset.md)[]\>

Same as [AssetsResource.list](#list).

##### Parameters

###### options?

[`ListAssetsParams`](../type-aliases/ListAssetsParams.md)

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`Asset`](../interfaces/Asset.md)[]\>

##### Deprecated

since 0.3.0 — use `list()`.

#### Call Signature

> **getAll**(`namespace`, `options?`, `requestOptions?`): `Promise`\<[`Asset`](../interfaces/Asset.md)[]\>

##### Parameters

###### namespace

`string`

###### options?

[`ListAssetsOptions`](../type-aliases/ListAssetsOptions.md)

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`Asset`](../interfaces/Asset.md)[]\>

##### Deprecated

since 0.3.0 — use `list()`.

***

### get()

#### Call Signature

> **get**(`macAddress`, `options?`): `Promise`\<[`Asset`](../interfaces/Asset.md)\>

Reads one asset (`GET /assets/{app_namespace}/{mac_address}`).

##### Parameters

###### macAddress

`string`

the asset MAC, in any of the accepted forms (`AA:BB:CC:DD:EE:FF`, `aabbccddeeff`, …)

###### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

per-call `namespace` and request options

##### Returns

`Promise`\<[`Asset`](../interfaces/Asset.md)\>

##### Throws

status 0 for an invalid MAC

##### Throws

404 when no asset has this MAC

##### Throws

when no namespace is given or set

##### Example

```typescript
const asset = await client.assets.get('AA:BB:CC:DD:EE:FF');
console.log(asset.user_name);
```

#### Call Signature

> **get**(`namespace`, `macAddress`, `requestOptions?`): `Promise`\<[`Asset`](../interfaces/Asset.md)\>

Legacy form with the namespace first.

##### Parameters

###### namespace

`string`

###### macAddress

`string`

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`Asset`](../interfaces/Asset.md)\>

***

### create()

#### Call Signature

> **create**(`macAddress`, `asset`, `options?`): `Promise`\<[`Asset`](../interfaces/Asset.md)\>

Creates the asset, or merges the fields into an existing one (upsert, `POST /assets/{app_namespace}/{mac}`,
RFC 7396), then reads it back and returns the stored asset.

The body is the input plus `user_udid` = the normalised MAC (the server does not take it from the path).
Changing `declared_location` publishes one synthetic position; every write is evaluated by the rule engine.

##### Parameters

###### macAddress

`string`

the asset MAC (normalised)

###### asset

[`AssetInput`](../interfaces/AssetInput.md)

the fields: `user_name` required; `data` an object; `user_udid`, if given, the same MAC

###### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

per-call `namespace` and request options (also used for the read-back)

##### Returns

`Promise`\<[`Asset`](../interfaces/Asset.md)\>

##### Throws

status 0 for an invalid MAC or input (nothing is sent); 400 `apiCode`
  `reserved_field_namespace` (`body.fields` names the fields)

##### Throws

413 for a body over the server's 100 kB limit

##### Throws

500 with the server's validation text

##### Throws

when no namespace is given or set

##### Example

```typescript
const asset = await client.assets.create('AA:BB:CC:DD:EE:FF', { user_name: 'Forklift 1', user_type: 'forklift' });
console.log(asset.user_udid); // 'aabbccddeeff'
```

#### Call Signature

> **create**(`namespace`, `macAddress`, `asset`, `requestOptions?`): `Promise`\<[`Asset`](../interfaces/Asset.md)\>

Legacy form with the namespace first.

##### Parameters

###### namespace

`string`

###### macAddress

`string`

###### asset

[`AssetInput`](../interfaces/AssetInput.md)

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`Asset`](../interfaces/Asset.md)\>

***

### update()

#### Call Signature

> **update**(`macAddress`, `patch`, `options?`): `Promise`\<[`Asset`](../interfaces/Asset.md)\>

Applies a JSON merge patch to an existing asset (`PATCH /assets/{app_namespace}/{mac_address}`) and returns
the merged asset. `null` deletes a key. Changing `declared_location` publishes one synthetic position.

##### Parameters

###### macAddress

`string`

the asset MAC (normalised)

###### patch

[`AssetPatch`](../type-aliases/AssetPatch.md)

the changes, sent verbatim except `user_udid`, which is sent normalised: `user_name` (if given) a
  non-empty string, `user_udid` (if given) the same MAC, `data` (if given) an object or `null`

###### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

per-call `namespace` and request options

##### Returns

`Promise`\<[`Asset`](../interfaces/Asset.md)\>

##### Throws

status 0 for an invalid MAC or patch (nothing is sent); 400 `reserved_field_namespace`

##### Throws

404 when no asset has this MAC (nothing is written)

##### Throws

413 for a body over 100 kB

##### Throws

500 with the server's validation text

##### Throws

when no namespace is given or set

##### Example

```typescript
const asset = await client.assets.update('aabbccddeeff', { color: '#ff0000', external_id: null });
console.log(asset.color);
```

#### Call Signature

> **update**(`namespace`, `macAddress`, `patch`, `requestOptions?`): `Promise`\<[`Asset`](../interfaces/Asset.md)\>

Legacy form with the namespace first.

##### Parameters

###### namespace

`string`

###### macAddress

`string`

###### patch

[`AssetPatch`](../type-aliases/AssetPatch.md)

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`Asset`](../interfaces/Asset.md)\>

***

### delete()

#### Call Signature

> **delete**(`macAddress`, `options?`): `Promise`\<`void`\>

Deletes an asset (`DELETE /assets/{app_namespace}/{mac_address}`).

##### Parameters

###### macAddress

`string`

the asset MAC (normalised)

###### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

per-call `namespace` and request options

##### Returns

`Promise`\<`void`\>

##### Throws

status 0 for an invalid MAC

##### Throws

404 when no asset has this MAC

##### Throws

when no namespace is given or set

##### Example

```typescript
await client.assets.delete('aabbccddeeff');
```

#### Call Signature

> **delete**(`namespace`, `macAddress`, `requestOptions?`): `Promise`\<`void`\>

Legacy form with the namespace first.

##### Parameters

###### namespace

`string`

###### macAddress

`string`

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<`void`\>

***

### batchSave()

#### Call Signature

> **batchSave**(`assets`, `options?`): `Promise`\<[`Asset`](../interfaces/Asset.md)[]\>

Saves several assets in one request (`POST /assets/{app_namespace}`, upsert per item keyed by `user_udid`) and
returns the saved assets. Not chunked: a body over the server's 100 kB limit fails with
`PayloadTooLargeError`, so send large sets in slices.

##### Parameters

###### assets

[`BatchSaveItem`](../type-aliases/BatchSaveItem.md)[]

the items: each an object with a valid MAC in `user_udid` (normalised) and a non-empty
  `user_name`; `data` an object

###### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

per-call `namespace` and request options

##### Returns

`Promise`\<[`Asset`](../interfaces/Asset.md)[]\>

##### Throws

status 0 naming the index of the first invalid item (nothing is sent); 400
  `reserved_field_namespace`

##### Throws

413 for a body over 100 kB

##### Throws

500 with the server text

##### Throws

when no namespace is given or set

##### Example

```typescript
const saved = await client.assets.batchSave([
  { user_udid: 'aabbccddee01', user_name: 'Cart 1' },
  { user_udid: 'aabbccddee02', user_name: 'Cart 2' },
]);
console.log(saved.length);
```

#### Call Signature

> **batchSave**(`namespace`, `assets`, `requestOptions?`): `Promise`\<[`Asset`](../interfaces/Asset.md)[]\>

Legacy form with the namespace first.

##### Parameters

###### namespace

`string`

###### assets

[`BatchSaveItem`](../type-aliases/BatchSaveItem.md)[]

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`Asset`](../interfaces/Asset.md)[]\>

***

### batchDelete()

#### Call Signature

> **batchDelete**(`macAddresses`, `options?`): `Promise`\<[`BatchDeleteResult`](../interfaces/BatchDeleteResult.md)\>

Deletes several assets and reports which MACs were deleted and which were not found.

The SDK does not use the batch route `DELETE /assets/{app_namespace}` (USI-P2-5): it sends one
`DELETE /assets/{app_namespace}/{mac}` per MAC, in order: a 404 puts the MAC in `not_found`; any other error is
thrown and the remaining MACs are not sent. The result lists the normalised MACs.

##### Parameters

###### macAddresses

`string`[]

the MACs (each normalised)

###### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

per-call `namespace` and request options (applied to each request)

##### Returns

`Promise`\<[`BatchDeleteResult`](../interfaces/BatchDeleteResult.md)\>

##### Throws

status 0 naming the index of the first invalid MAC (nothing is sent)

##### Throws

the first error other than 404 (the MACs after it are not sent)

##### Throws

when no namespace is given or set

##### Example

```typescript
const { deleted, not_found } = await client.assets.batchDelete(['aabbccddee01', 'AA:BB:CC:DD:EE:02']);
console.log(deleted, not_found);
```

#### Call Signature

> **batchDelete**(`namespace`, `macAddresses`, `requestOptions?`): `Promise`\<[`BatchDeleteResult`](../interfaces/BatchDeleteResult.md)\>

Legacy form with the namespace first.

##### Parameters

###### namespace

`string`

###### macAddresses

`string`[]

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`BatchDeleteResult`](../interfaces/BatchDeleteResult.md)\>

***

### getHistory()

> **getHistory**(`macAddress`, `options?`): `Promise`\<[`AssetHistoryEntry`](../interfaces/AssetHistoryEntry.md)[]\>

The audit trail of an asset record (`GET /asset_history/{app_namespace}/{mac_address}`): one entry per create,
update or delete of the record, newest first. Not positions.

The server ignores the time range (USI-P2-7) and returns at most the newest 1000 entries, so older entries are
not reachable. The SDK sends the range (`start_time`/`end_time`, epoch ms) and keeps the entries whose
`timestamp` (unix seconds) lies inside it, in the server's order.

#### Parameters

##### macAddress

`string`

the asset MAC (normalised)

##### options?

[`AssetHistoryOptions`](../interfaces/AssetHistoryOptions.md) & [`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

`startTime` / `endTime` (`Date`, epoch ms or date string; default the last 24 hours), per-call
  `namespace` and request options

#### Returns

`Promise`\<[`AssetHistoryEntry`](../interfaces/AssetHistoryEntry.md)[]\>

#### Throws

status 0 for an invalid MAC, an invalid time or `startTime` after `endTime`

#### Throws

when no namespace is given or set

#### Example

```typescript
const week = await client.assets.getHistory('aabbccddeeff', { startTime: Date.now() - 7 * 86_400_000 });
for (const entry of week) console.log(entry.action, new Date(Number(entry.timestamp) * 1000));
```
