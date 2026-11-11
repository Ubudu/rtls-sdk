[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / EtlMappingProfileInput

# Interface: EtlMappingProfileInput

Body of `mappingProfiles.create()`. Server truth; the spec's MappingProfile schema is wrong (USI-P7-1). Only these
keys are sent; `applicationId` defaults to the resolved namespace.

## Properties

### name

> **name**: `string`

***

### mappings

> **mappings**: `Record`\<`string`, [`EtlFieldMapping`](EtlFieldMapping.md)\>

***

### keyColumns?

> `optional` **keyColumns?**: `string`[]

***

### applicationId?

> `optional` **applicationId?**: `string`

Default: the per-call namespace, else the client's default namespace.

***

### description?

> `optional` **description?**: `string`

***

### sourceType?

> `optional` **sourceType?**: [`EtlSourceType`](../type-aliases/EtlSourceType.md)

***

### requiredFields?

> `optional` **requiredFields?**: `string`[]

***

### defaults?

> `optional` **defaults?**: `Record`\<`string`, [`EtlFieldDefault`](EtlFieldDefault.md)\>

***

### modelKey?

> `optional` **modelKey?**: `string`
