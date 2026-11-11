# ETL Imports Guide

`client.etl` bulk-updates **existing** assets from CSV or Excel files. A *mapping profile* says which file column
goes to which asset field and which columns identify the asset; an *upload* runs a file through one or more
profiles, either as a dry run or for real; the *activity log* records every profile change and every upload.

## 1. What an import does

- It **updates existing assets only**. A row whose key matches no asset is counted as `unassociated`; no asset is
  ever created. Create the assets first (`client.assets`), then import their data.
- Each profile's `applicationId` is the namespace the import writes into. The upload call itself carries no
  namespace.
- Imports are **synchronous**: the response arrives when the whole file is processed. There is no job id to poll.
- A changed asset is written like any other asset update (asset-change event, asset history, alert rules).
  Re-importing the same file changes nothing.

## 2. Prerequisites

The ETL calls need the `access_data_import` role; without it they throw `AuthorizationError` with
`apiCode: 'insufficient_role'`. Check the capability once at start-up:

<!-- snippet: prelude=client -->
```typescript
import { AuthorizationError } from 'ubudu-rtls-sdk';

async function canImport(): Promise<boolean> {
  try {
    await client.etl.mappingProfiles.listAll();
    return true;
  } catch (err) {
    if (err instanceof AuthorizationError && err.apiCode === 'insufficient_role') return false;
    throw err;
  }
}
```

## 3. Mapping profiles

| Field | Meaning |
|---|---|
| `name` | Required, non-empty. Duplicate names are allowed. |
| `mappings` | Required. Keyed by **target asset path** (`user_name`, `external_id`, `data.<field>`); each value is `{ sourceColumn, transformation?, required?, type?, sourceFormat? }`. |
| `keyColumns` | **Source column names** that identify the asset. Each must also be some mapping's `sourceColumn`; at least one is needed. |
| `defaults` | `{ "<targetPath>": { value, type? } }`, applied (real imports only) when the field is `undefined`, `null` or `''`. Absent from a read when empty. |
| `applicationId` | Target namespace. `create()` fills it with the client's namespace when you omit it. |
| `requiredFields`, `sourceType`, `modelKey` | Stored, informational; imports do not read them. Required-ness is `mappings[path].required`. |
| `_id`, `userId`, `created_at`, `updated_at` | Server-assigned. `updated_at` is the optimistic-lock token (§8). |

Transformations (`transformation`, default `none`):

| Value | Effect |
|---|---|
| `none`, `trim` | Value as read (string cells are always trimmed first) |
| `toString`, `toUpperCase`, `toLowerCase` | Text conversions |
| `toNumber`, `toInteger`, `toFloat`, `round` | Numbers; a blank or unparseable cell becomes **`0`** |
| `toBoolean` | `true/false/yes/no/1/0` → boolean |
| `toDate` | Date (stored as epoch milliseconds); `sourceFormat` gives the input format, e.g. `DD/MM/YYYY`; an invalid date becomes `''` |

`type` adds implicit rules: `date` and `datetime` convert Excel date serials even with `none` (`date` → 12:00 UTC,
`datetime` → server local time); `boolean` turns the same tokens into booleans and removes the field for an empty
cell.

<!-- snippet: prelude=client -->
```typescript
const profile = await client.etl.mappingProfiles.create({
  name: 'tags-from-inventory',
  mappings: {
    user_udid: { sourceColumn: 'MAC' },
    user_name: { sourceColumn: 'Name', transformation: 'trim', required: true },
    'data.department': { sourceColumn: 'Department', transformation: 'toUpperCase' },
  },
  keyColumns: ['MAC'],
});
console.log(profile._id, profile.applicationId);
```

## 4. Workflow

Preview the file, create a profile, dry-run, read the result, import, then audit:

<!-- snippet: prelude=client -->
```typescript
const csv = 'MAC,Name\n025d4b000001,Forklift 1\n';
const file = { data: csv, filename: 'inventory.csv' };

const preview = await client.etl.parseHeaders(file);
console.log(preview.columns, preview.sampleData);

const profile = await client.etl.mappingProfiles.create({
  name: 'inventory',
  mappings: { user_udid: { sourceColumn: 'MAC' }, user_name: { sourceColumn: 'Name' } },
  keyColumns: ['MAC'],
});

const dry = await client.etl.upload(file, profile._id, { dryRun: true });
for (const p of dry.results.processedProfiles) console.log(p.profileName, p.rowsChanged, p.errors);

const real = await client.etl.upload(file, profile._id);
console.log(real.results.processedProfiles[0]?.unassociated);

const recent = await client.etl.activities.listPage({ action: 'upload', limit: 5 });
console.log(recent.data.map((a) => a.timestamp));
```

## 5. Reading a result

The upload answers 201 with `success: true` and `status: 'completed'` **whatever happened**: neither is an outcome
signal. File-level and row-level problems appear only in `results.processedProfiles[].errors` (`rowIndex` is the
1-based data row; absent for a file-level error).

| Counter | Real import | Dry run |
|---|---|---|
| `rowsProcessed` | Data rows in the file | Same |
| `rowsChanged` | Matched assets that were updated | Every row that passed mapping and validation (no asset is read) |
| `rowsSkipped` | Rows without a key column **and** matched assets with no difference | Rows without a key column |
| `unassociated` | Rows whose key matches no asset (counted as succeeded) | Always `0` |
| `errors` | Row errors (a row with an empty required field is in no counter) and file errors | Same |

Three-line totals:

<!-- snippet: prelude=client -->
```typescript
const result = await client.etl.upload({ data: 'MAC,Name\n', filename: 'a.csv' }, 'profile-id');
const profiles = result.results.processedProfiles;
const errors = profiles.reduce((n, p) => n + p.errors.length, 0);
const unassociated = profiles.reduce((n, p) => n + p.unassociated, 0);
const changed = profiles.reduce((n, p) => n + p.rowsChanged, 0);
console.log({ errors, unassociated, changed });
```

## 6. Files

Accepted inputs (`EtlFileInput`):

- a `File` (it needs a name), e.g. from a browser file input or `new File([bytes], 'a.xlsx')`;
- `{ data, filename }` where `data` is a `Blob`, an `ArrayBuffer`, a typed array or a **string** (CSV text,
  encoded as UTF-8). A `Blob` without a name is refused locally with `ValidationError`.

| Extension | MIME type sent |
|---|---|
| `.csv` | `text/csv` |
| `.xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| `.xls` | `application/vnd.ms-excel` |

The SDK sets the MIME type from the extension (the input's own type is ignored), sends the extension in lower case
(`Report.XLSX` → `Report.xlsx`) and removes a leading UTF-8 byte-order mark from CSV files (Excel's "CSV UTF-8"
adds one). It changes nothing else in the content.

- CSV must be **UTF-8** and **comma-separated**; a semicolon export reads as a single column and every row is
  skipped. Preview first.
- **No blank lines** in a CSV: one blank line anywhere (also a doubled newline at the end) fails the whole file for
  every profile inside a 201, while the preview accepts the same file. A single trailing newline is fine.
- Excel: the first sheet is read. The preview shows formatted cell text; the import reads raw values (dates as
  Excel serial numbers, see `type: 'date'`).

## 7. Silent pitfalls

- **Exact key matching.** A row matches when the asset value at the key mapping's target path, as a string, equals
  the raw cell: no trim, no transformation, case-sensitive. MAC addresses are stored as 12 lower-case hex
  characters, so normalise the key cells when you build the file:

<!-- snippet: prelude=client -->
```typescript
import { normalizeMac } from 'ubudu-rtls-sdk';

const rows = [{ mac: '02:5D:4B:00:00:01', name: 'Forklift 1' }];
const data = 'MAC,Name\n' + rows.map((r) => `${normalizeMac(r.mac)},${r.name}`).join('\n') + '\n';
await client.etl.parseHeaders({ data, filename: 'inventory.csv' });
```

- Every key column must also be some mapping's `sourceColumn`, otherwise it matches nothing; a profile without
  key columns matches nothing. Client-side check:

<!-- snippet: prelude=client -->
```typescript
const profiles = await client.etl.mappingProfiles.list();
const withoutKey = profiles.filter((p) => p.keyColumns.length === 0);
console.log(withoutKey.map((p) => p.name));
```

- A blank cell under a numeric transformation writes `0` over the stored value.
- Dates are stored as epoch milliseconds (`date` at 12:00 UTC, `datetime` in server time).
- An empty cell of a `type: 'boolean'` mapping removes the field.
- Profiles created by older tools may hold string-valued mappings (`"Col": "path"`); imports ignore them. The read
  type allows them (`EtlFieldMapping | string`).

## 8. Editing safely

`update()` replaces top-level fields: sending `mappings` replaces the whole object (no deep merge). Pass the
`updated_at` you read as a precondition; a stale value is refused with `ConflictError` (409) and nothing is
written. The error body carries the stored profile:

<!-- snippet: prelude=client -->
```typescript
import { ConflictError, type EtlStaleWriteBody } from 'ubudu-rtls-sdk';

const current = await client.etl.mappingProfiles.get('profile-id');
try {
  await client.etl.mappingProfiles.update(current._id, {
    description: 'nightly inventory import',
    updated_at: current.updated_at,
  });
} catch (err) {
  if (!(err instanceof ConflictError)) throw err;
  const stored = (err.body as EtlStaleWriteBody).current;
  console.log('changed meanwhile at', stored.updated_at);
}
```

`updated_at` accepts an ISO string, a `Date` or epoch milliseconds and is always sent as an ISO string. Without
`updated_at` the update is unconditional. `update()` never changes `applicationId` unless you pass it.

## 9. Large files

`upload()` waits up to **600 s** and `parseHeaders()` up to **120 s** by default; pass `timeoutMs` to change it
(`0` disables the timeout). Uploads are never retried. A client timeout does **not** stop the server, which keeps
processing: check the activity log before you send the file again.

<!-- snippet: prelude=client -->
```typescript
const big = new File(['MAC,Name\n'], 'big.csv');
const preview = await client.etl.parseHeaders(big, { timeoutMs: 30_000 });
const dry = await client.etl.upload(big, ['profile-a', 'profile-b'], { dryRun: true, timeoutMs: 0 });
console.log(preview.columns, dry.results.totalRows);
```

## 10. Namespaces and ids

- `mappingProfiles.list()` returns the profiles whose `applicationId` is the client's namespace (or the per-call
  `{ namespace }`); it throws `ContextError` without one.
- `mappingProfiles.listAll()` is not filtered by namespace: it returns profiles whatever their `applicationId`.
- `get`, `update`, `delete` address a profile by id and use no namespace; an unknown id is `NotFoundError` (404).
- `create()` sends `applicationId` = `input.applicationId`, else the per-call namespace, else the client's.
- A refused delete throws `AuthorizationError`. Deleting a profile does not undo its imports.

## 11. Activities

The activity calls use no namespace. The activity log has no delete operation.

- Filters: `action` (`create`, `update`, `delete`, `upload`), `resourceType` (`mapping`, `file`), `sortField`,
  `sortOrder` (`asc` / `desc`), `page`, `limit`.
- `search` is literal text. It matches profile names, the action and the resource type, **not** upload filenames.
- Upload entries carry `details.processingStats`; narrow on `action`:

<!-- snippet: prelude=client -->
```typescript
import { collectAll } from 'ubudu-rtls-sdk';

const uploads = await collectAll(
  client.etl.activities.iterate({ action: 'upload', sortOrder: 'desc', pageSize: 50 }),
  { maxItems: 20 }
);
for (const a of uploads) {
  if (a.action === 'upload') console.log(a.timestamp, a.details.processingStats?.totalChanged);
}
```

`iterate()` walks the pages lazily (default page size 100) and stops at the last page.

## 12. Errors

| Error | When |
|---|---|
| `ValidationError` (status 0) | Refused locally, nothing sent: empty id, empty `name`, `mappings` not an object, unparsable `updated_at`, file without name or with an extension other than `.csv`/`.xlsx`/`.xls`, empty `mappingProfileIds`, `dryRun` not a boolean, `page`/`limit`/`pageSize` not an integer ≥ 1 |
| `ContextError` | `list()` / `create()` without any namespace |
| `AuthenticationError` (401) | Missing or invalid credentials |
| `AuthorizationError` (403) | `apiCode: 'insufficient_role'` (role missing, §2) or `'namespace_access_denied'` (a refused `create()` for the target namespace, or a refused `delete()`) |
| `NotFoundError` (404) | Unknown profile id; an upload naming one such profile fails as a whole before any work |
| `ConflictError` (409) | Stale `updated_at` (`apiCode: 'stale_write'`, `body.current`) |
| `ValidationError` (400) | Server-side: update validation, `No file uploaded`, unreadable preview file (`CSV file contains no data`, `Failed to parse …`) |
| `PayloadTooLargeError` (413) | Profile JSON body over 100 kB |
| `ServerError` (500) | Create validation failures, an id that is not a 24-hex ObjectId (get/delete), list or activity query failures |

Known server issues (ids of the SDK's upstream report):

| Id | Behaviour |
|---|---|
| USI-P7-1 | The API specification's ETL schemas do not match the server; the SDK types follow the server |
| USI-P7-2 | Upload 201 is always `success: true` / `completed`; read `processedProfiles` |
| USI-P7-3 | Upper-case extensions are refused by the server (the SDK lower-cases them) |
| USI-P7-4 | A CSV byte-order mark corrupts the first column (the SDK strips it) |
| USI-P7-5 | The preview detects CSV by MIME type only (the SDK sets it) |
| USI-P7-6 | `check-mappings` hints ignore current mappings (not wrapped) |
| USI-P7-7 | Create validation errors answer 500 and leave an activity entry (the SDK validates locally) |
| USI-P7-8 | A malformed id answers 500 instead of 404 |
| USI-P7-9 | Activities query parameters (the SDK validates `page`/`limit` and sends `search` as literal text) |
| USI-P7-10 | The specification's activity enums do not match the returned entries (the SDK types follow the server) |
| USI-P7-11 | Dry-run counters count valid rows, not matched assets |
| USI-P7-12 | Numeric blanks become `0`; dates are epoch milliseconds; invalid dates become `''` |
| USI-P7-13 | `rowsSkipped` mixes invalid and unchanged rows |
| USI-P7-14 | Legacy `/etl/mappings` write aliases answer different status codes (not wrapped) |
| USI-P7-15 | Activity entries and stored import rows cannot be removed |
| USI-P7-16 | Key matching is raw (use `normalizeMac()`) |
| USI-P7-17 | CSV delimiter is always a comma |
| USI-P7-18 | The preview shows formatted Excel values; the import reads raw values |
| USI-P7-19 | Imports are synchronous; a client timeout does not stop the server |
| USI-P7-20 | A blank line fails a whole CSV import |

## 13. Not wrapped

- `GET /etl/check-mappings` — use the client-side key-column check of §7.
- `PUT /etl/fix-mapping/{id}` — use `mappingProfiles.update(id, { keyColumns })`, which also takes the lock.
- `POST /etl/mappings`, `PUT /etl/mappings/{id}`, `DELETE /etl/mappings/{id}` — legacy aliases; use
  `mappingProfiles.create`, `update` and `delete`.
