[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / AssetDocumentsResource

# Class: AssetDocumentsResource

Upload, list, download and delete the documents attached to assets.

## Extends

- `ResourceBase`

## Methods

### upload()

> **upload**(`macAddress`, `input`, `options?`): `Promise`\<[`DocumentUploadJobCreated`](../interfaces/DocumentUploadJobCreated.md)\>

Uploads a document (`POST /assets/{namespace}/{mac_address}/documents`, multipart) and returns the processing
job. The server checks the file asynchronously (virus scan, renditions): follow it with [waitForJob](#waitforjob).

Local checks, in this order: `docType` matches `^[A-Za-z0-9_-]+$`; a filename (`filename`, else `File.name`)
ending in `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp` or `.pdf`; the content type (`contentType`, else the Blob's
type when allowed, else from the extension) is an image type for an image extension and `application/pdf` for
`.pdf`; at most 10 485 760 bytes for an image and 15 728 640 bytes for a PDF (the server cannot process larger
files although it documents 50 MB, USI-P2-13); tags are non-empty strings without `,`.

The asset does not need to exist. The default `timeoutMs` is 120 000.

#### Parameters

##### macAddress

`string`

the asset's MAC address (normalised)

##### input

[`DocumentUploadInput`](../interfaces/DocumentUploadInput.md)

the file (`Blob`, `File`, `ArrayBuffer` or `Uint8Array`), its `filename`, `docType`, optional
  `contentType`, `description` and `tags`

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

per-call `namespace` (else the client default) and request options

#### Returns

`Promise`\<[`DocumentUploadJobCreated`](../interfaces/DocumentUploadJobCreated.md)\>

the job (`status: 'pending'`) and the future `documentId`

#### Throws

status 0 for a local check (nothing is sent); status 400 for a server check
  (`File is required`, `MIME type not allowed: …`, content that does not match the type)

#### Throws

413 when the server's size limit fires

#### Throws

415

#### Throws

when no namespace is given or set (nothing is sent)

#### Example

```typescript
import { readFile } from 'node:fs/promises';

const job = await client.assetDocuments.upload('aabbccddeeff', {
  file: await readFile('manual.pdf'),
  filename: 'manual.pdf',
  docType: 'manual',
  tags: ['maintenance'],
});
const done = await client.assetDocuments.waitForJob(job.jobId);
console.log(done.status, done.result?.availableVersions);
```

***

### getJob()

> **getJob**(`jobId`, `options?`): `Promise`\<[`DocumentUploadJob`](../interfaces/DocumentUploadJob.md)\>

Reads an upload job (`GET /assets/{namespace}/documents/jobs/{jobId}`). `error` is reduced to `{ message }`.
Finished jobs are deleted 24 h after their creation.

#### Parameters

##### jobId

`string`

the `jobId` returned by [upload](#upload)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

per-call `namespace` (else the client default) and request options

#### Returns

`Promise`\<[`DocumentUploadJob`](../interfaces/DocumentUploadJob.md)\>

#### Throws

`Job not found` (unknown or expired job)

#### Throws

`Failed to get job status`

#### Throws

status 0 when `jobId` is empty (nothing is sent)

#### Example

```typescript
const job = await client.assetDocuments.getJob(jobId);
console.log(job.status, job.progress);
```

***

### waitForJob()

> **waitForJob**(`jobId`, `options?`): `Promise`\<[`DocumentUploadJob`](../interfaces/DocumentUploadJob.md)\>

Polls [getJob](#getjob) every `intervalMs` (default 1 000, at least 250) until the job is `completed` or `failed`,
for at most `maxWaitMs` (default 120 000). A `failed` job is returned, not thrown: read `error.message`.
`timeoutMs` applies to each poll and `signal` to the whole wait.

#### Parameters

##### jobId

`string`

the `jobId` returned by [upload](#upload)

##### options?

[`WaitForJobOptions`](../interfaces/WaitForJobOptions.md) & [`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

`intervalMs`, `maxWaitMs`, per-call `namespace` and request options

#### Returns

`Promise`\<[`DocumentUploadJob`](../interfaces/DocumentUploadJob.md)\>

the job in its final state

#### Throws

when the job is still running after `maxWaitMs`

#### Throws

when `signal` aborts

#### Throws

when the job disappears (unknown or expired)

#### Throws

status 0 for `intervalMs` below 250 or `maxWaitMs` not above 0 (nothing is sent)

#### Example

```typescript
const job = await client.assetDocuments.waitForJob(created.jobId, { maxWaitMs: 60_000 });
if (job.status === 'failed') console.log(job.error?.message);
```

***

### listPage()

> **listPage**(`macAddress`, `options?`): `Promise`\<[`OffsetPage`](../interfaces/OffsetPage.md)\<[`AssetDocumentSummary`](../interfaces/AssetDocumentSummary.md)\>\>

One page of an asset's documents (`GET /assets/{namespace}/{mac_address}/documents`), newest first, pending
uploads included. Only the options that are set are sent.

#### Parameters

##### macAddress

`string`

the asset's MAC address (normalised)

##### options?

[`ListDocumentsPageOptions`](../interfaces/ListDocumentsPageOptions.md) & [`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

`docType`, `limit` (1..500, server default 50), `offset` (default 0), per-call `namespace` and
  request options

#### Returns

`Promise`\<[`OffsetPage`](../interfaces/OffsetPage.md)\<[`AssetDocumentSummary`](../interfaces/AssetDocumentSummary.md)\>\>

`{ items, total, limit, offset }`

#### Throws

status 0 for an invalid `limit` or `offset` (nothing is sent)

#### Throws

`Failed to list documents`

#### Example

```typescript
const page = await client.assetDocuments.listPage('aabbccddeeff', { docType: 'manual', limit: 20 });
console.log(`${page.items.length} of ${page.total}`);
```

***

### list()

> **list**(`macAddress`, `options?`): `Promise`\<[`AssetDocumentSummary`](../interfaces/AssetDocumentSummary.md)[]\>

Every document of an asset, newest first, read in pages of 100 through [listPage](#listpage).

#### Parameters

##### macAddress

`string`

the asset's MAC address (normalised)

##### options?

[`ListDocumentsOptions`](../interfaces/ListDocumentsOptions.md) & [`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

`docType`, `maxItems` (stop after that many), per-call `namespace` and request options

#### Returns

`Promise`\<[`AssetDocumentSummary`](../interfaces/AssetDocumentSummary.md)[]\>

#### Throws

status 0 for a `maxItems` that is not a positive integer (nothing is sent)

#### Throws

`Failed to list documents`

#### Example

```typescript
const docs = await client.assetDocuments.list('aabbccddeeff', { docType: 'photo' });
```

***

### get()

> **get**(`macAddress`, `documentId`, `options?`): `Promise`\<[`AssetDocument`](../interfaces/AssetDocument.md)\>

The metadata of one document (`GET /assets/{namespace}/{mac_address}/documents/{documentId}`).

#### Parameters

##### macAddress

`string`

the asset's MAC address (normalised)

##### documentId

`string`

the document id (`doc-…`)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

per-call `namespace` (else the client default) and request options

#### Returns

`Promise`\<[`AssetDocument`](../interfaces/AssetDocument.md)\>

#### Throws

`Document not found`

#### Throws

`Failed to get document`

#### Example

```typescript
const doc = await client.assetDocuments.get('aabbccddeeff', documentId);
console.log(doc.originalFilename, doc.availableVersions);
```

***

### download()

> **download**(`macAddress`, `documentId`, `options?`): `Promise`\<[`DownloadResult`](../interfaces/DownloadResult.md)\>

Downloads a document (`GET …/documents/{documentId}/download`): the bytes as a `Blob`, the filename from
`Content-Disposition` and the content type. `version` is `original` (default, not sent), `medium` (800 px WebP,
images only) or `thumbnail` (200 px WebP for an image; for a PDF its first page as a one-page PDF, USI-P2-15).
`filename` keeps the original name and extension even for a WebP rendition. Pass a larger `timeoutMs` for
large files.

#### Parameters

##### macAddress

`string`

the asset's MAC address (normalised)

##### documentId

`string`

the document id (`doc-…`)

##### options?

`object` & [`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

`version`, per-call `namespace` and request options

#### Returns

`Promise`\<[`DownloadResult`](../interfaces/DownloadResult.md)\>

#### Throws

`Document not found`, or `Version 'x' not available for this document`

#### Throws

status 0 for an unknown `version` (nothing is sent); status 400 from the server

#### Throws

`Failed to download document`

#### Example

```typescript
const file = await client.assetDocuments.download('aabbccddeeff', documentId, { version: 'thumbnail' });
console.log(file.filename, file.contentType, file.data.size);
```

***

### delete()

> **delete**(`macAddress`, `documentId`, `options?`): `Promise`\<[`DocumentDeleteResult`](../interfaces/DocumentDeleteResult.md)\>

Deletes a document (`DELETE …/documents/{documentId}`). The server keeps the files for 30 days but the
document is no longer listed or readable.

#### Parameters

##### macAddress

`string`

the asset's MAC address (normalised)

##### documentId

`string`

the document id (`doc-…`)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

per-call `namespace` (else the client default) and request options

#### Returns

`Promise`\<[`DocumentDeleteResult`](../interfaces/DocumentDeleteResult.md)\>

`{ message, documentId }`

#### Throws

`Document not found` (also on a second delete)

#### Throws

`Failed to delete document`

#### Example

```typescript
await client.assetDocuments.delete('aabbccddeeff', documentId);
```
