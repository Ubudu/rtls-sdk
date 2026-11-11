[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / DocumentUploadInput

# Interface: DocumentUploadInput

Input of `assetDocuments.upload`.

## Properties

### file

> **file**: `Blob` \| `ArrayBuffer` \| `Uint8Array`\<`ArrayBufferLike`\>

The bytes (a Node `Buffer` is a `Uint8Array`), a `Blob` or a `File`.

***

### filename?

> `optional` **filename?**: `string`

Wins over `File.name`; required unless `file` is a `File` with a name.

***

### contentType?

> `optional` **contentType?**: [`DocumentContentType`](../type-aliases/DocumentContentType.md)

Default: `Blob.type` when allowed, else derived from the extension.

***

### docType

> **docType**: `string`

`^[A-Za-z0-9_-]+$`.

***

### description?

> `optional` **description?**: `string`

***

### tags?

> `optional` **tags?**: `string`[]

Sent comma-separated, so a tag cannot contain `,`.
