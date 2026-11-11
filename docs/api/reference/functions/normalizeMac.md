[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / normalizeMac

# Function: normalizeMac()

> **normalizeMac**(`mac`): `string`

The stored form of a MAC address: separators `:`, `-` and `.` removed, 12 hex characters, lowercase.

## Parameters

### mac

`string`

## Returns

`string`

## Throws

status 0 when the value is not a MAC address

## Example

```typescript
import { normalizeMac } from 'ubudu-rtls-sdk';

normalizeMac('AA:BB:CC:DD:EE:FF'); // 'aabbccddeeff'
normalizeMac('aabb.ccdd.eeff');    // 'aabbccddeeff'
```
