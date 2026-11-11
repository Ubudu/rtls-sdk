[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / serializeFilters

# Function: serializeFilters()

> **serializeFilters**(`filters`, `grammar`): `Record`\<`string`, `string`\>

The wire form of `filters` for one grammar. Both grammars share the guards: the field must be a non-empty
dot path without `:`, `[` or `]`; list values must not contain `,`; `between` takes exactly two finite numbers or
Dates; a list operator takes an array (or one value); `exists` takes a boolean; numbers must be finite; a `Date`
becomes epoch milliseconds.

- `'universal'` → one query key per filter, `{ 'field:op': '<string>' }` (lists joined with `,`).
- `'venue'` → `{ filters: '<JSON array of { field, operator, value }>' }`, or `{}` when there is no filter; values
  keep their type, `exists: false` becomes `not_exists`, `nin` becomes `not_in`; `size`, `all` and `elem` have no
  venue counterpart and throw.

## Parameters

### filters

[`FilterOptions`](../type-aliases/FilterOptions.md) \| `undefined`

### grammar

[`FilterGrammar`](../type-aliases/FilterGrammar.md)

## Returns

`Record`\<`string`, `string`\>

## Throws

status 0 for any rejected filter (nothing is sent)

## Example

```typescript
import { filters, serializeFilters } from 'ubudu-rtls-sdk';

serializeFilters(filters.in('user_type', ['forklift', 'person']), 'universal');
// { 'user_type:in': 'forklift,person' }
serializeFilters(filters.equals('name', 'Hall A'), 'venue');
// { filters: '[{"field":"name","operator":"eq","value":"Hall A"}]' }
```
