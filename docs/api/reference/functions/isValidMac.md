[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / isValidMac

# Function: isValidMac()

> **isValidMac**(`mac`): `boolean`

`true` when the value is a string that [normalizeMac](normalizeMac.md) accepts. Never throws.

## Parameters

### mac

`unknown`

## Returns

`boolean`

## Example

```typescript
import { isValidMac } from 'ubudu-rtls-sdk';

isValidMac('aa-bb-cc-dd-ee-ff'); // true
isValidMac('aabbccddeef');       // false (11 hex characters)
```
