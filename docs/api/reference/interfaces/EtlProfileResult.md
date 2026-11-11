[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / EtlProfileResult

# Interface: EtlProfileResult

Outcome of one profile in an upload. On a dry run every valid row counts in `rowsChanged` and `unassociated` is
always 0 (USI-P7-11); `rowsSkipped` mixes "no change" with "missing key column" (USI-P7-13).

## Properties

### profileId

> **profileId**: `string`

***

### profileName

> **profileName**: `string`

***

### rowsProcessed

> **rowsProcessed**: `number`

Number of data rows in the file.

***

### rowsChanged

> **rowsChanged**: `number`

***

### rowsSkipped

> **rowsSkipped**: `number`

***

### unassociated

> **unassociated**: `number`

Rows that matched no asset (assets are never created).

***

### errors

> **errors**: [`EtlRowError`](EtlRowError.md)[]
