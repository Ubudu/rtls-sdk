[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / EtlMappingProfilesResource

# Class: EtlMappingProfilesResource

Mapping profiles: how the columns of a file map to asset fields, and which source columns identify the asset of
a row (`client.etl.mappingProfiles`).

## Extends

- `ResourceBase`

## Methods

### list()

> **list**(`options?`): `Promise`\<[`EtlMappingProfile`](../interfaces/EtlMappingProfile.md)[]\>

The profiles whose `applicationId` is the namespace (`GET /etl/mappings?applicationId=…`). No paging: the
server returns every match.

#### Parameters

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

per-call `namespace` (else the client default) and request options

#### Returns

`Promise`\<[`EtlMappingProfile`](../interfaces/EtlMappingProfile.md)[]\>

#### Throws

when no namespace is given or set (nothing is sent)

#### Example

```typescript
const profiles = await client.etl.mappingProfiles.list();
const withoutKeys = profiles.filter((p) => p.keyColumns.length === 0);
```

***

### listAll()

> **listAll**(`options?`): `Promise`\<[`EtlMappingProfile`](../interfaces/EtlMappingProfile.md)[]\>

Every profile visible to the caller, whatever its `applicationId` (`GET /etl/mapping-profiles`). The namespace
is not used.

#### Parameters

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`EtlMappingProfile`](../interfaces/EtlMappingProfile.md)[]\>

#### Example

```typescript
const all = await client.etl.mappingProfiles.listAll();
```

***

### get()

> **get**(`id`, `options?`): `Promise`\<[`EtlMappingProfile`](../interfaces/EtlMappingProfile.md)\>

One profile by id (`GET /etl/mapping-profiles/{id}`). The namespace is not used.

#### Parameters

##### id

`string`

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`EtlMappingProfile`](../interfaces/EtlMappingProfile.md)\>

#### Throws

status 0 for an empty id (nothing is sent)

#### Throws

when the profile is absent or not visible to the caller

#### Example

```typescript
const profile = await client.etl.mappingProfiles.get('64b0c0ffee0000000000abcd');
```

***

### create()

> **create**(`input`, `options?`): `Promise`\<[`EtlMappingProfile`](../interfaces/EtlMappingProfile.md)\>

Creates a profile (`POST /etl/mapping-profiles`, 201). Only the keys of [EtlMappingProfileInput](../interfaces/EtlMappingProfileInput.md) are sent;
`applicationId` is `input.applicationId`, else the per-call namespace, else the client default. Not idempotent
(duplicate names are allowed).

#### Parameters

##### input

[`EtlMappingProfileInput`](../interfaces/EtlMappingProfileInput.md)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`EtlMappingProfile`](../interfaces/EtlMappingProfile.md)\>

#### Throws

status 0 when `name` is empty after trimming or `mappings` is not a plain object

#### Throws

when neither `input.applicationId` nor a namespace is given (nothing is sent)

#### Throws

`apiCode: 'namespace_access_denied'` when the key does not hold the namespace

#### Example

```typescript
const profile = await client.etl.mappingProfiles.create({
  name: 'Badge names',
  mappings: {
    user_udid: { sourceColumn: 'MAC', required: true },
    user_name: { sourceColumn: 'Name', transformation: 'trim' },
  },
  keyColumns: ['MAC'],
});
```

***

### update()

> **update**(`id`, `changes`, `options?`): `Promise`\<[`EtlMappingProfile`](../interfaces/EtlMappingProfile.md)\>

Updates a profile (`PUT /etl/mapping-profiles/{id}`). Each given top-level field replaces the stored one
(`mappings` wholesale, no deep merge). Pass the `updated_at` you read for the optimistic lock: a stale value
fails with 409 `ConflictError` (`apiCode: 'stale_write'`, the stored profile in `body.current`) and writes
nothing. A full profile value is accepted: only the assignable fields are sent. `applicationId` is never added
from the namespace (no silent retarget).

#### Parameters

##### id

`string`

##### changes

[`EtlMappingProfileUpdate`](../interfaces/EtlMappingProfileUpdate.md)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`EtlMappingProfile`](../interfaces/EtlMappingProfile.md)\>

#### Throws

status 0 for an empty id, an empty `name` or an unreadable `updated_at`

#### Throws

409 when `updated_at` differs from the stored value

#### Example

```typescript
import { ConflictError } from 'ubudu-rtls-sdk';

const profile = await client.etl.mappingProfiles.get('64b0c0ffee0000000000abcd');
try {
  await client.etl.mappingProfiles.update(profile._id, {
    description: 'Nightly badge import',
    updated_at: profile.updated_at,
  });
} catch (err) {
  if (err instanceof ConflictError) console.log('changed by someone else; read it again');
  else throw err;
}
```

***

### delete()

> **delete**(`id`, `options?`): `Promise`\<`void`\>

Deletes a profile (`DELETE /etl/mapping-profiles/{id}`, 204). Creator only. Rows stored by earlier writing
imports are not removed (USI-P7-15).

#### Parameters

##### id

`string`

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<`void`\>

#### Throws

status 0 for an empty id (nothing is sent)

#### Throws

403 when the caller did not create the profile

#### Example

```typescript
await client.etl.mappingProfiles.delete('64b0c0ffee0000000000abcd');
```
