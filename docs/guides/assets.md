# Assets guide

Assets, their documents, declared locations, tag actions, the asset tree and the data models with the Ubudu RTLS
SDK. Every call takes an optional last `options` argument with `namespace` (overrides the client default),
`signal` and `timeoutMs`.

| Task | Method |
|---|---|
| Read assets | `client.assets.list()`, `get()`, `iterate()` |
| Write assets | `client.assets.create()`, `update()`, `delete()`, `batchSave()`, `batchDelete()` |
| Audit trail of an asset record | `client.assets.getHistory()` |
| Asset tree, data models (read-only) | `client.assetTree.get()`, `client.dataModels.get()` |
| Files attached to an asset | `client.assetDocuments.*` |
| Check-ins (RFID, QR, WMS) | `client.declaredLocations.bulkDeclare()`, `bulkClear()` |
| Light or blink a tag | `client.tagActions.send()` |

## 1. Concepts

An asset is one JSON record per tag, keyed by its MAC address (`user_udid`) and named by `user_name`. Besides the
documented fields (`user_type`, `model`, `color`, `path`, `tags`, `external_id`, `declared_location`, `data`, …)
it can hold any custom key; the SDK types it as `Asset` with an index signature.

**MAC format.** The SDK normalises every MAC it sends, in paths and bodies, to 12 lowercase hex digits:
`'02:5D:4B:00:00:01'`, `'02-5d-4b-00-00-01'` and `'025d4b000001'` address the same asset. A value that is not
12 hex digits throws `ValidationError` before any request. `normalizeMac` and `formatMac` are exported for your
own use.

```ts
import { formatMac, normalizeMac } from 'ubudu-rtls-sdk';

normalizeMac('02:5D:4B:00:00:01'); // '025d4b000001'
formatMac('025d4b000001'); // '02:5D:4B:00:00:01'
```

**Server-owned fields.** `createdBy`, `dateCreated`, `dateChanged` and `battery_percent` are set by the server;
`AssetInput` does not accept them. A stored `maintenance` value is dropped by every write.

**Side effects.** Every asset write (create, update, delete, batch, declare, clear) writes an audit entry and is
evaluated by the namespace's alert rules. Changing `declared_location` also publishes one position.

## 2. Reading

`list()` downloads the whole namespace: the server has no paging on this route. Filters (`"field:op"` keys or
`filters`), `sort`, `page`, `limit` and `fields` are applied locally by the SDK. `key` and `value` are the only
server-side filter: an exact match on one field (a dot path such as `data.zone` works).

<!-- snippet: prelude=client -->
```ts
const all = await client.assets.list();
const forklifts = await client.assets.list({
  'user_name:contains': 'forklift',
  sort: 'user_name:asc',
  page: 1,
  limit: 20,
});
const byExternalId = await client.assets.list({ key: 'external_id', value: 'pallet-42' });
const one = await client.assets.get('02:5D:4B:00:00:01');
for await (const asset of client.assets.iterate({ 'tags:contains': 'forklift' })) {
  console.log(asset.user_udid, asset.user_name);
}
console.log(all.length, forklifts.length, byExternalId.length, one.user_name);
```

`get()` throws `NotFoundError` for an unknown MAC. `getAll()` is a deprecated alias of `list()`.

## 3. Writing

`create()` is an **upsert**: a new MAC creates the asset, an existing one is merged with the body (RFC 7396). It
returns the stored asset. `user_name` is required; `user_udid` is set from the MAC.

`update()` sends a JSON merge patch: keys you send replace the stored ones, `null` deletes a key, nested objects
are merged. It throws `NotFoundError` when the asset does not exist (nothing is written).

<!-- snippet: prelude=client -->
```ts
const mac = '025d4b000001';
await client.assets.create(mac, { user_name: 'Forklift 7', model: 'forklift', tags: ['fleet'] });
const updated = await client.assets.update(mac, { color: '#00ff00', data: { zone: null } });
console.log(updated.color);
await client.assets.delete(mac);
```

`batchSave()` saves many assets in one request and returns them; each item needs `user_udid` and `user_name`
(checked before sending). The request body is limited to 100 kB, so chunk large lists:

<!-- snippet: prelude=client -->
```ts
import type { Asset, BatchSaveItem } from 'ubudu-rtls-sdk';

async function saveAll(items: BatchSaveItem[], chunkSize = 200): Promise<Asset[]> {
  const saved: Asset[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    saved.push(...(await client.assets.batchSave(items.slice(i, i + chunkSize))));
  }
  return saved;
}
console.log((await saveAll([{ user_udid: '025d4b000001', user_name: 'A' }])).length);
```

`batchDelete()` returns `{ deleted, not_found }` in input order. It sends one delete per MAC (the SDK does not use
the server's batch delete route); the first error other than "not found" is thrown and the remaining MACs are not
sent.

<!-- snippet: prelude=client -->
```ts
const { deleted, not_found } = await client.assets.batchDelete(['025d4b000001', '025d4b000002']);
console.log(deleted, not_found);
```

## 4. Audit history

`getHistory(mac, { startTime, endTime })` returns the audit trail of the asset **record** (who created, changed or
deleted it), newest first. It is not position history: positions are in `client.positions`.

- Default window: the last 24 hours; `startTime`/`endTime` accept a `Date`, epoch milliseconds or an ISO string.
- Each entry: `id`, `action` (`'create' | 'update' | 'delete'`), `timestamp` (unix **seconds** as a string),
  `data` (the record as written; absent on delete entries), optional `user` and `app_namespace`.
- The server returns at most the newest 1000 entries of the asset and ignores the range; the SDK filters them by
  the window. Older entries of a busy asset cannot be reached.

<!-- snippet: prelude=client -->
```ts
const week = await client.assets.getHistory('025d4b000001', {
  startTime: Date.now() - 7 * 86_400_000,
});
for (const e of week) console.log(new Date(Number(e.timestamp) * 1000).toISOString(), e.action);
```

## 5. Asset tree and data models

Both are read-only in the SDK; they are edited in the product UI.

- `assetTree.get()` returns the namespace's tree of families (`{ name, color?, families? }[]`, `[]` when none). An
  asset's `path` (for example `/Root/Lv 1/`) addresses a node of that tree.
- `dataModels.get()` returns the field taxonomy (`key`, `type`, `label`, `showInFilters`, …). The entry whose `key`
  is `'data_models'` carries the model definitions in `data`.

<!-- snippet: prelude=client -->
```ts
const tree = await client.assetTree.get();
const fields = await client.dataModels.get();
const models = fields.find((f) => f.key === 'data_models')?.data ?? [];
console.log(tree.length, fields.filter((f) => f.showInFilters).length, models.length);
```

## 6. Documents

Images and PDFs attached to an asset. An upload answers a job at once; processing (virus scan, renditions) is
asynchronous, so wait for the job before downloading.

- Allowed types: `.jpg`/`.jpeg`, `.png`, `.gif`, `.webp` (images) and `.pdf`. The content type is `contentType`, else
  the `Blob`/`File` type when allowed, else the extension's type; it must match the file's real format.
- Size: at most 10 MiB for an image and 15 MiB for a PDF. The server documents 50 MB for PDFs but fails above about
  16 MiB, so the SDK stops at 15 MiB before sending.
- Renditions: `original` always; images also get `medium` (800 px wide) and `thumbnail` (200 px), both WebP; a PDF's
  `thumbnail` is its first page as a one-page PDF, and there is no `medium`.
- The job's `result.virus_scan_status` is `clean` or `unscanned` on success; an infected file fails the job and the
  document is hidden. Jobs are deleted 24 h after creation (`getJob` then throws `NotFoundError`).
- `delete()` is a soft delete. `list()`/`listPage()` return active documents, newest first.
- Use ASCII file names: the download's `filename` is the original name, also for WebP renditions.

<!-- snippet: prelude=client -->
```ts
import { readFile } from 'node:fs/promises';

const mac = '025d4b000001';
const job = await client.assetDocuments.upload(mac, {
  file: await readFile('./delivery-note.pdf'), // a Node Buffer is a Uint8Array
  filename: 'delivery-note.pdf',
  docType: 'delivery_note',
  tags: ['inbound'],
});
const done = await client.assetDocuments.waitForJob(job.jobId, { maxWaitMs: 120_000 });
if (done.status === 'completed') {
  const { data, contentType } = await client.assetDocuments.download(mac, job.documentId, {
    version: 'thumbnail',
  });
  console.log(contentType, data.size);
}
const docs = await client.assetDocuments.list(mac, { docType: 'delivery_note' });
console.log(docs.map((d) => d.originalFilename));
```

In a browser, pass the `File` of an `<input type="file">`; its name and type are used:

<!-- snippet: prelude=client -->
```ts
declare const input: { files: ArrayLike<File> | null };

const file = input.files?.[0];
if (file !== undefined) {
  const job = await client.assetDocuments.upload('025d4b000001', { file, docType: 'photo' });
  console.log(job.jobId);
}
```

`get(mac, documentId)` returns the metadata of one document (`originalFilename`, `contentType`, `sizeBytes`,
`availableVersions`, …; the virus-scan status is only in the job's `result`). Check `availableVersions` before
asking `download()` for a rendition: it is `[]` while the document is pending, and stays `[]` when processing
failed. `list()` reads every page; `listPage(mac, { docType, limit, offset })` returns one `OffsetPage` (`items`,
`total`, `limit`, `offset`; `limit` 1–500).

<!-- snippet: prelude=client -->
```ts
const mac = '025d4b000001';
const [latest] = await client.assetDocuments.list(mac, { maxItems: 1 });
if (latest !== undefined) {
  const doc = await client.assetDocuments.get(mac, latest.documentId);
  const version = doc.availableVersions.includes('medium') ? 'medium' : 'original';
  console.log(doc.originalFilename, version);
}
```

## 7. Declared locations

A declared location says where an asset was checked in (an RFID gate, a QR scan, a WMS move) without a tag
position. `bulkDeclare()` sets it for up to 500 assets, identified by `mac_address` or by `external_id`;
`shared_location` applies to every item that has no `declared_location` of its own.

- Each item whose location **changed** publishes one position (origin `declared`) that the alert rules evaluate;
  re-declaring the stored location publishes nothing.
- With `auto_create_virtual_assets: true`, an unknown `external_id` creates a **permanent** virtual asset (MAC
  starting `0200`, `is_virtual: true`, model `default_asset_model`). Find it with
  `assets.list({ key: 'external_id', value })`.
- `bulkClear()` removes the declared location (by `mac_addresses` and/or `external_ids`) and publishes nothing.
  Unknown external ids are skipped without a result row.
- Limits: 500 items per request and a 100 kB body.

<!-- snippet: prelude=client -->
```ts
const gate = { lat: 48.8566, lng: 2.3522, level: 0, source: 'rfid', declared_via: 'rtls-api' } as const;
const result = await client.declaredLocations.bulkDeclare({
  assets: [{ external_id: 'pallet-42' }, { mac_address: '02:5D:4B:00:00:01' }],
  shared_location: gate,
});
for (const e of result.errors) console.log(e.identifier, e.error, e.message);
const cleared = await client.declaredLocations.bulkClear({ external_ids: ['pallet-42'] });
console.log(result.success, cleared.results);
```

| Code | Meaning |
|---|---|
| `DL_002` | no location: neither the item nor `shared_location` has one (or `shared_location` is invalid) |
| `DL_004` | asset not found; as a `500`, an unexpected server error of the declare |
| `DL_005` | invalid MAC address |
| `DL_007` | `lat`, `lng` or `level` out of range |
| `DL_010` | `assets` missing, empty or more than 500 items (clear: more than 500 identifiers) |
| `DL_011` | `external_id` matches no asset and auto-create is off |
| `DL_012` | an item without `mac_address` or `external_id` (clear: no identifier at all) |
| `DL_013` | duplicate identifier in the request |
| `DL_014` | invalid `external_id` (`^[a-zA-Z0-9._-]+$`, at most 128 characters) |
| `DL_016` | the virtual asset could not be created |
| `DL_017` | clearing this asset failed (for example an unknown MAC); as a `500`, an unexpected server error of the clear |

**Local checks.** The SDK checks the request before sending it. These cases throw `ValidationError` with
`status: 0`, no `apiCode` and `details` naming the field (for example `['assets[1].mac_address']`), and nothing is
sent:

- `assets` empty or longer than 500 items; for `bulkClear`, no identifier at all or more than 500 in total;
- an item with neither `mac_address` nor `external_id`;
- a duplicate identifier (MACs compared after normalisation, external ids ignoring case);
- an item without `declared_location` when the request has no `shared_location`, or an invalid `shared_location`;
- an invalid MAC; an item identified by an `external_id` that does not match `^[a-zA-Z0-9._-]+$` or is longer
  than 128 characters; an empty string in the `external_ids` of `bulkClear`;
- `lat` outside −90..90, `lng` outside −180..180, or `level` not an integer from −10 to 200.

These are the local counterparts of `DL_002`, `DL_005`, `DL_007`, `DL_010`, `DL_012`, `DL_013` and `DL_014`, so
a test such as `err.apiCode === 'DL_013'` does not match them. A `DL_0xx` code appears only when the server
refuses a request that passed the local checks: request-level codes reject the whole request with a
`ValidationError` (status 400) whose `apiCode` is the code; per-item codes are in `errors` (declare) or `results`
(clear).

## 8. Tag actions

`tagActions.send(actions)` lights or blinks tags. `duration` is in seconds (1–3600).

| Target | Actions |
|---|---|
| BLE tags (sent through the BLE gateways) | `ptlRed`, `ptlGreen`, `uwbBlink`, `ptlRedUwbBlink`, `ptlGreenUwbBlink` |
| ESL labels (assets whose `user_type` is an ESL type), 8 colours | `ptlRed`, `ptlGreen`, `ptlBlue`, `ptlYellow`, `ptlWhite`, `ptlCyan`, `ptlMagenta`, `ptlAquamarine` |

The six colours other than red and green are ESL-only: sent to a tag that is not an ESL asset, they fail per item
(`statusCode: 400`) without reaching any device.

A partial failure is a **result**, not an exception: the call resolves with `success: false` and one entry per
action in `results` (`statusCode`, `error`). Calls are never retried, because a retried action could reach the
hardware twice. A BLE action to a MAC that is not an ESL asset is broadcast through every BLE gateway of the
namespace.

<!-- snippet: prelude=client -->
```ts
const r = await client.tagActions.send([
  { macAddress: '02:5D:4B:00:00:01', action: 'ptlGreen', duration: 5 },
]);
if (!r.success) {
  for (const x of r.results.filter((y) => !y.success)) console.log(x.action, x.statusCode, x.error);
}
```

`client.sendTagActions(namespace, actions)` is deprecated; it throws `ServerError` when `success` is false.

## 9. Errors in this domain

| Error | When |
|---|---|
| `ValidationError` (`status: 0`, no `apiCode`) | a local check failed before any request: MAC, `user_name`, list options, batch items, upload type or size, declared-location items (count, identifiers, duplicates, locations, coordinates), tag actions |
| `ValidationError` with `apiCode` | the server refused the request: `reserved_field_namespace` (a `data.sensor_ils_*` key; `body.fields` lists them), or a request-level `DL_0xx` code of a declare or clear that passed the local checks |
| `NotFoundError` | unknown asset (`get`, `update`, `delete`), document, job or rendition |
| `PayloadTooLargeError` | a JSON body over 100 kB, or an upload over the server's limit |
| `ServerError` | server failures; `apiCode` `DL_004` / `DL_017` for an unexpected declare / clear error; an asset save the server refuses (`Error: user_name is required…`) |

<!-- snippet: prelude=client -->
```ts
import { NotFoundError, ValidationError } from 'ubudu-rtls-sdk';

try {
  await client.assets.update('025d4b000001', { data: { sensor_ils_temp: 1 } });
} catch (err) {
  if (err instanceof ValidationError && err.apiCode === 'reserved_field_namespace') console.log(err.details);
  else if (err instanceof NotFoundError) console.log('no such asset');
  else throw err;
}
```

## 10. From 0.2.0

`create()` now works and returns the stored asset, MACs are normalised, `list()` filters locally, `batchSave()`
returns `Asset[]`, `getHistory()` is the audit trail, and tag actions moved to `client.tagActions.send()`. The
[migration guide](./migration-0.3.md) lists every change with before/after code.
