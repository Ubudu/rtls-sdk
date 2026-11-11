[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / EtlUploadResult

# Interface: EtlUploadResult

201 body of `upload()`. Server truth; the spec's UploadResult shape does not exist (USI-P7-1). A 201 is not
success: file and row failures appear only in `results.processedProfiles[].errors` (USI-P7-2).

## Properties

### \_id

> **\_id**: `string`

Upload id, the `resourceId` of the activity entry.

***

### filename

> **filename**: `string`

***

### status

> **status**: `"completed"` \| `string` & `object`

Always 'completed' in a 201 (USI-P7-2).

***

### userId

> **userId**: `string`

***

### success

> **success**: `boolean`

Always true in a 201. NOT an outcome signal: inspect results.processedProfiles[].errors / unassociated.

***

### debugMode

> **debugMode**: `boolean`

***

### results

> **results**: `object`

#### totalRows

> **totalRows**: `number`

#### debugMode

> **debugMode**: `boolean`

#### processedProfiles

> **processedProfiles**: [`EtlProfileResult`](EtlProfileResult.md)[]

***

### created\_at

> **created\_at**: `string`
