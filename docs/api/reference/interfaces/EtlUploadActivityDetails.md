[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / EtlUploadActivityDetails

# Interface: EtlUploadActivityDetails

`details` of an upload activity entry. The spec does not describe it (USI-P7-1).

## Properties

### filename

> **filename**: `string`

***

### status

> **status**: `"processing"` \| `"completed"` \| `"failed"`

***

### debugMode

> **debugMode**: `boolean`

***

### uploadId

> **uploadId**: `string`

***

### applicationId?

> `optional` **applicationId?**: `string` \| `null`

***

### applicationIds?

> `optional` **applicationIds?**: `string`[]

***

### mappingProfiles?

> `optional` **mappingProfiles?**: `string`

Comma-separated profile names.

***

### mappingProfileIds?

> `optional` **mappingProfileIds?**: `string`[]

***

### filesize?

> `optional` **filesize?**: `number`

***

### processingStats?

> `optional` **processingStats?**: [`EtlProcessingStats`](EtlProcessingStats.md)

***

### error?

> `optional` **error?**: `string`

Set when `status` is `'failed'`.

***

### uploadResults?

> `optional` **uploadResults?**: `unknown`

Stored raw copy of the upload result (uses `processingErrors`); intentionally untyped, read the upload response instead.
