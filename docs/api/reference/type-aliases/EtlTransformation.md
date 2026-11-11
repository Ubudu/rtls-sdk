[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / EtlTransformation

# Type Alias: EtlTransformation

> **EtlTransformation** = `"none"` \| `"trim"` \| `"toNumber"` \| `"toString"` \| `"toBoolean"` \| `"toDate"` \| `"toUpperCase"` \| `"toLowerCase"` \| `"toInteger"` \| `"toFloat"` \| `"round"`

Transformation applied to a cell before it is written. Server truth; the spec does not describe it (USI-P7-1).
Numeric transforms write `0` for blank or unparseable cells and `toDate` stores epoch-ms numbers (USI-P7-12).
