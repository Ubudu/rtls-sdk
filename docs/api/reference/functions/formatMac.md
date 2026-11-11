[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / formatMac

# Function: formatMac()

> **formatMac**(`mac`, `options?`): `string`

A MAC address for display: pairs joined by `separator` (default `':'`), uppercase unless `uppercase: false`.

## Parameters

### mac

`string`

### options?

#### separator?

`""` \| `":"` \| `"-"`

#### uppercase?

`boolean`

## Returns

`string`

## Throws

status 0 when the value is not a MAC address

## Example

```typescript
import { formatMac } from 'ubudu-rtls-sdk';

formatMac('aabbccddeeff');                       // 'AA:BB:CC:DD:EE:FF'
formatMac('aabbccddeeff', { separator: '-' });   // 'AA-BB-CC-DD-EE-FF'
formatMac('AA:BB:CC:DD:EE:FF', { separator: '', uppercase: false }); // 'aabbccddeeff'
```
