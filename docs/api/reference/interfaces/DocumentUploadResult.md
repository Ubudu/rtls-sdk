[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / DocumentUploadResult

# Interface: DocumentUploadResult

The document a completed upload job produced.

## Properties

### documentId

> **documentId**: `string`

***

### namespaceId

> **namespaceId**: `string`

***

### mac\_address

> **mac\_address**: `string`

***

### docType

> **docType**: `string`

***

### originalFilename

> **originalFilename**: `string`

***

### sizeBytes

> **sizeBytes**: `number`

***

### contentType

> **contentType**: `string`

***

### availableVersions

> **availableVersions**: [`DocumentVersion`](../type-aliases/DocumentVersion.md)[]

***

### createdAt

> **createdAt**: `string`

***

### virus\_scan\_status?

> `optional` **virus\_scan\_status?**: [`VirusScanStatus`](../type-aliases/VirusScanStatus.md)

***

### virus\_scan\_date?

> `optional` **virus\_scan\_date?**: `string` \| `null`

***

### virus\_scan\_engine?

> `optional` **virus\_scan\_engine?**: `string` \| `null`
