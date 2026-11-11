[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / EtlMappingProfile

# Interface: EtlMappingProfile

A mapping profile as the server stores it. Server truth; the spec's MappingProfile schema is wrong: it lists
`createdBy`, `dateCreated` and `status` (none exist), makes `applicationId` required and types mapping values as
strings (USI-P7-1).

## Properties

### \_id

> **\_id**: `string`

***

### name

> **name**: `string`

***

### description?

> `optional` **description?**: `string`

***

### sourceType

> **sourceType**: [`EtlSourceType`](../type-aliases/EtlSourceType.md)

Informational.

***

### applicationId?

> `optional` **applicationId?**: `string`

Target RTLS namespace of the profile's imports.

***

### mappings

> **mappings**: `Record`\<`string`, [`EtlFieldMapping`](EtlFieldMapping.md) \| `string`\>

Keyed by target asset path; a string value is a legacy entry, ignored by imports.

***

### keyColumns

> **keyColumns**: `string`[]

SOURCE column names that identify the asset of a row (raw, case-sensitive match, USI-P7-16).

***

### requiredFields

> **requiredFields**: `string`[]

Stored, not enforced (required-ness comes from `mappings[path].required`).

***

### defaults?

> `optional` **defaults?**: `Record`\<`string`, [`EtlFieldDefault`](EtlFieldDefault.md)\>

Absent when empty: the server drops empty objects.

***

### modelKey?

> `optional` **modelKey?**: `string`

Stored, not used.

***

### userId

> **userId**: `string`

Creator, assigned by the server.

***

### created\_at

> **created\_at**: `string`

ISO date.

***

### updated\_at

> **updated\_at**: `string`

ISO date; pass it back to `update()` for the optimistic lock.

***

### \_\_v?

> `optional` **\_\_v?**: `number`
