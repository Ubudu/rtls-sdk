[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / BulkDeclareResult

# Interface: BulkDeclareResult

Answer of a bulk declare (always `200`; per-item failures in `errors`).

## Properties

### success

> **success**: `number`

***

### failed

> **failed**: `number`

***

### created

> **created**: `number`

***

### errors

> **errors**: `object`[]

#### identifier

> **identifier**: `string`

#### error

> **error**: [`DeclaredLocationErrorCode`](../type-aliases/DeclaredLocationErrorCode.md)

#### message

> **message**: `string`
