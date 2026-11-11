[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / filter

# Function: filter()

> **filter**(`field`, `operator`, `value`): [`FilterOptions`](../type-aliases/FilterOptions.md)

Builds one filter, keyed `'<field>:<operator>'`, keeping the typed value. A `RegExp` becomes its `source` (its flags
are dropped: the universal grammar always matches case-insensitively, the venue grammar case-sensitively).

## Parameters

### field

`string`

### operator

[`FilterOperator`](../type-aliases/FilterOperator.md)

### value

`RegExp` \| [`FilterValue`](../type-aliases/FilterValue.md)

## Returns

[`FilterOptions`](../type-aliases/FilterOptions.md)

## Example

```typescript
import { filter } from 'ubudu-rtls-sdk';

filter('battery', 'gte', 20);          // { 'battery:gte': 20 }
filter('user_name', 'regex', /^fork/); // { 'user_name:regex': '^fork' }
```
