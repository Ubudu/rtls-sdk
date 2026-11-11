[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / EtlResource

# Class: EtlResource

Bulk updates of **existing** assets from CSV or Excel files (`client.etl`): mapping profiles, a file's header
preview, dry-run and writing imports, and the activity log. Assets are never created by an import.

## Extends

- `ResourceBase`

## Properties

### mappingProfiles

> `readonly` **mappingProfiles**: [`EtlMappingProfilesResource`](EtlMappingProfilesResource.md)

Mapping profiles (`client.etl.mappingProfiles`).

***

### activities

> `readonly` **activities**: [`EtlActivitiesResource`](EtlActivitiesResource.md)

The activity log (`client.etl.activities`).

## Methods

### parseHeaders()

> **parseHeaders**(`file`, `options?`): `Promise`\<[`EtlSheetPreview`](../interfaces/EtlSheetPreview.md)\>

The columns and up to 5 sample rows of a file (`POST /etl/parse-excel-headers`). Read-only: nothing is stored.
Default `timeoutMs` 120 000 (`0` disables it). Excel cells come back formatted, while the import reads raw
values (USI-P7-18). The namespace is not used.

#### Parameters

##### file

[`EtlFileInput`](../type-aliases/EtlFileInput.md)

a `File` or `{ data, filename }`; the extension (`.csv`, `.xlsx`, `.xls`) sets the MIME type

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`EtlSheetPreview`](../interfaces/EtlSheetPreview.md)\>

#### Throws

status 0 for a Blob without a name or an unsupported extension (nothing is sent)

#### Example

```typescript
const preview = await client.etl.parseHeaders({ data: 'MAC,Name\n025d4b000001,Forklift 1\n', filename: 'badges.csv' });
console.log(preview.columns); // ['MAC', 'Name']
```

***

### upload()

> **upload**(`file`, `mappingProfileIds`, `options?`): `Promise`\<[`EtlUploadResult`](../interfaces/EtlUploadResult.md)\>

Imports a file through one or more mapping profiles (`POST /etl/upload`, 201). Updates existing assets only;
each profile's `applicationId` is the target namespace (the per-call namespace is not used). Default
`timeoutMs` 600 000 (`0` disables it); never retried. A client timeout does not stop the server (USI-P7-19).

A 201 is not success: `success` is always `true`; check `results.processedProfiles[].errors` and
`.unassociated` (USI-P7-2). With `dryRun: true` nothing is written and the counters mean "rows that passed
validation" (USI-P7-11).

#### Parameters

##### file

[`EtlFileInput`](../type-aliases/EtlFileInput.md)

a `File` or `{ data, filename }`; the extension (`.csv`, `.xlsx`, `.xls`) sets the MIME type and a
  leading UTF-8 BOM is dropped from CSV

##### mappingProfileIds

`string` \| readonly `string`[]

one id or a non-empty array of ids

##### options?

[`EtlUploadOptions`](../interfaces/EtlUploadOptions.md) & [`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`EtlUploadResult`](../interfaces/EtlUploadResult.md)\>

#### Throws

status 0 for an invalid file, empty ids or a `dryRun` that is not a boolean
  (nothing is sent)

#### Throws

when one profile is absent or not visible (nothing is imported)

#### Example

```typescript
const result = await client.etl.upload(
  { data: 'MAC,Name\n025d4b000001,Forklift 1\n', filename: 'badges.csv' },
  '64b0c0ffee0000000000abcd',
  { dryRun: true }
);
const failed = result.results.processedProfiles.filter((p) => p.errors.length > 0);
```
