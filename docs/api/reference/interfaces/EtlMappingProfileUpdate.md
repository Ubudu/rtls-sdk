[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / EtlMappingProfileUpdate

# Interface: EtlMappingProfileUpdate

Changes of `mappingProfiles.update()`. A full [EtlMappingProfile](EtlMappingProfile.md) value is assignable (read-modify-write);
only the assignable fields are sent, each top-level field replaces the stored one (no deep merge). Server truth;
the spec's MappingProfile schema is wrong (USI-P7-1).

## Properties

### name?

> `optional` **name?**: `string`

***

### description?

> `optional` **description?**: `string`

***

### sourceType?

> `optional` **sourceType?**: [`EtlSourceType`](../type-aliases/EtlSourceType.md)

***

### mappings?

> `optional` **mappings?**: `Record`\<`string`, `string` \| [`EtlFieldMapping`](EtlFieldMapping.md)\>

***

### keyColumns?

> `optional` **keyColumns?**: `string`[]

***

### requiredFields?

> `optional` **requiredFields?**: `string`[]

***

### defaults?

> `optional` **defaults?**: `Record`\<`string`, [`EtlFieldDefault`](EtlFieldDefault.md)\>

***

### applicationId?

> `optional` **applicationId?**: `string`

***

### modelKey?

> `optional` **modelKey?**: `string`

***

### updated\_at?

> `optional` **updated\_at?**: `string` \| `number` \| `Date`

Optimistic-lock precondition: the `updated_at` you read. Stale → 409 ConflictError. Omit to skip the check.
