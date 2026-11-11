[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / AssetDocument

# Interface: AssetDocument

The metadata of one document. Spec defect: the spec documents `virus_scan_*` fields the server does not return
(USI-P2-12).

## Extends

- [`AssetDocumentSummary`](AssetDocumentSummary.md)

## Properties

### documentId

> **documentId**: `string`

#### Inherited from

[`AssetDocumentSummary`](AssetDocumentSummary.md).[`documentId`](AssetDocumentSummary.md#documentid)

***

### docType

> **docType**: `string`

#### Inherited from

[`AssetDocumentSummary`](AssetDocumentSummary.md).[`docType`](AssetDocumentSummary.md#doctype)

***

### originalFilename

> **originalFilename**: `string`

#### Inherited from

[`AssetDocumentSummary`](AssetDocumentSummary.md).[`originalFilename`](AssetDocumentSummary.md#originalfilename)

***

### description

> **description**: `string` \| `null`

#### Inherited from

[`AssetDocumentSummary`](AssetDocumentSummary.md).[`description`](AssetDocumentSummary.md#description)

***

### tags

> **tags**: `string`[]

#### Inherited from

[`AssetDocumentSummary`](AssetDocumentSummary.md).[`tags`](AssetDocumentSummary.md#tags)

***

### contentType

> **contentType**: `string`

#### Inherited from

[`AssetDocumentSummary`](AssetDocumentSummary.md).[`contentType`](AssetDocumentSummary.md#contenttype)

***

### sizeBytes

> **sizeBytes**: `number`

#### Inherited from

[`AssetDocumentSummary`](AssetDocumentSummary.md).[`sizeBytes`](AssetDocumentSummary.md#sizebytes)

***

### availableVersions

> **availableVersions**: [`DocumentVersion`](../type-aliases/DocumentVersion.md)[]

`[]` while pending, or forever when processing failed (USI-P2-14).

#### Inherited from

[`AssetDocumentSummary`](AssetDocumentSummary.md).[`availableVersions`](AssetDocumentSummary.md#availableversions)

***

### uploadedBy

> **uploadedBy**: `object`

#### userId?

> `optional` **userId?**: `string`

#### username?

> `optional` **username?**: `string`

#### Inherited from

[`AssetDocumentSummary`](AssetDocumentSummary.md).[`uploadedBy`](AssetDocumentSummary.md#uploadedby)

***

### createdAt

> **createdAt**: `string`

#### Inherited from

[`AssetDocumentSummary`](AssetDocumentSummary.md).[`createdAt`](AssetDocumentSummary.md#createdat)

***

### namespaceId

> **namespaceId**: `string`

***

### mac\_address

> **mac\_address**: `string`

***

### updatedAt

> **updatedAt**: `string`
