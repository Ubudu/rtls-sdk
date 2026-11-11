[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / EtlRowError

# Interface: EtlRowError

One error of a profile's import; profile-level errors have no `rowIndex`.

## Properties

### rowIndex?

> `optional` **rowIndex?**: `number`

1-based data row (the header row excluded); absent for profile-level errors.

***

### message

> **message**: `string`
