[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / EtlUploadActivity

# Interface: EtlUploadActivity

Activity entry of an upload (dry run or writing). Server truth; spec enums are wrong (USI-P7-10).

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

> **action**: `"upload"`

***

### resourceType

> **resourceType**: `"file"`

***

### details

> **details**: [`EtlUploadActivityDetails`](EtlUploadActivityDetails.md)
