[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / DocumentUploadJob

# Interface: DocumentUploadJob

An upload job (`GET …/documents/jobs/{jobId}`); `error` is reduced to its `message` by the SDK.

## Properties

### jobId

> **jobId**: `string`

***

### status

> **status**: [`DocumentJobStatus`](../type-aliases/DocumentJobStatus.md)

***

### progress

> **progress**: `number`

0, 10, 20, 40, 90 or 100.

***

### result?

> `optional` **result?**: [`DocumentUploadResult`](DocumentUploadResult.md) \| `null`

***

### error?

> `optional` **error?**: \{ `message`: `string`; \} \| `null`

***

### created\_at

> **created\_at**: `string`

***

### started\_at?

> `optional` **started\_at?**: `string` \| `null`

***

### completed\_at?

> `optional` **completed\_at?**: `string` \| `null`

***

### duration\_ms?

> `optional` **duration\_ms?**: `number` \| `null`
