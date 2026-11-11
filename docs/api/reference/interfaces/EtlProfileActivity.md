[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / EtlProfileActivity

# Interface: EtlProfileActivity

Activity entry of a profile change. Server truth; the spec's resource types `asset`/`location` never occur
(USI-P7-10).

## Extends

- `EtlActivityBase`

## Properties

### \_id

> **\_id**: `string`

#### Inherited from

`EtlActivityBase._id`

***

### userId

> **userId**: `string`

#### Inherited from

`EtlActivityBase.userId`

***

### resourceId

> **resourceId**: `string`

Upload id or profile id.

#### Inherited from

`EtlActivityBase.resourceId`

***

### timestamp

> **timestamp**: `string`

ISO date.

#### Inherited from

`EtlActivityBase.timestamp`

***

### \_\_v?

> `optional` **\_\_v?**: `number`

#### Inherited from

`EtlActivityBase.__v`

***

### action

> **action**: `"create"` \| `"update"` \| `"delete"`

***

### resourceType

> **resourceType**: `"mapping"`

***

### details

> **details**: `object`

`applicationId` is absent on entries older than rtls-api 2.26.0.

#### name

> **name**: `string`

#### applicationId?

> `optional` **applicationId?**: `string`
