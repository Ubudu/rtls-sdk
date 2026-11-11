[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / FilterOptions

# Type Alias: FilterOptions

> **FilterOptions** = `` { [K in `${string}:${FilterOperator}`]?: FilterValue } ``

Filters keyed `'<field>:<operator>'`, as the builders of `filters` produce them and `combineFilters` merges them.

## Example

```typescript
import type { FilterOptions } from 'ubudu-rtls-sdk';

const f: FilterOptions = { 'user_type:in': ['forklift', 'person'], 'battery:gte': 20 };
```
