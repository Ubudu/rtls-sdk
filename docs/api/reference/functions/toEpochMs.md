[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / toEpochMs

# Function: toEpochMs()

> **toEpochMs**(`input`): `number`

Epoch milliseconds of a point in time: a `Date` → `getTime()`; a finite number → as it is (milliseconds); a string
of digits (optionally negative) → that number; any other string → `Date.parse` (ISO 8601 recommended).

## Parameters

### input

[`TimeInput`](../type-aliases/TimeInput.md)

## Returns

`number`

## Throws

status 0 for an invalid `Date`, a non-finite number or an unparsable string

## Example

```typescript
import { toEpochMs } from 'ubudu-rtls-sdk';

toEpochMs(new Date('2024-06-21T15:16:50Z')); // 1718983010000
toEpochMs('1718983010000');                   // 1718983010000
toEpochMs('2024-06-21T15:16:50Z');            // 1718983010000
```
