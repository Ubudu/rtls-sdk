[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / AssetDocumentSummary

# Interface: AssetDocumentSummary

One entry of a document list.

## Extended by

- [`AssetDocument`](AssetDocument.md)

## Properties

### documentId

> **documentId**: `string`

***

### docType

> **docType**: `string`

***

### originalFilename

> **originalFilename**: `string`

***

### description

> **description**: `string` \| `null`

***

### tags

> **tags**: `string`[]

***

### contentType

> **contentType**: `string`

***

### sizeBytes

> **sizeBytes**: `number`

***

### availableVersions

> **availableVersions**: [`DocumentVersion`](../type-aliases/DocumentVersion.md)[]

`[]` while pending, or forever when processing failed (USI-P2-14).

***

### uploadedBy

> **uploadedBy**: `object`

#### userId?

> `optional` **userId?**: `string`

#### username?

> `optional` **username?**: `string`

***

### createdAt

> **createdAt**: `string`
