[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / filters

# Variable: filters

> `const` **filters**: `object`

The filter builders (names kept from 0.2.0). Each returns `FilterOptions` with the typed value;
combine them with `combineFilters` or object spread.

## Type Declaration

### equals

> **equals**: (`field`, `value`) => [`FilterOptions`](../type-aliases/FilterOptions.md)

Universal: JavaScript `==` against the text (`5` equals `'5'`); a boolean field matches `'true'`/`'false'`.

#### Parameters

##### field

`string`

##### value

`string` \| `number` \| `boolean`

#### Returns

[`FilterOptions`](../type-aliases/FilterOptions.md)

### notEquals

> **notEquals**: (`field`, `value`) => [`FilterOptions`](../type-aliases/FilterOptions.md)

The negation of `equals`; missing and `null` fields match.

#### Parameters

##### field

`string`

##### value

`string` \| `number` \| `boolean`

#### Returns

[`FilterOptions`](../type-aliases/FilterOptions.md)

### greaterThan

> **greaterThan**: (`field`, `value`) => [`FilterOptions`](../type-aliases/FilterOptions.md)

#### Parameters

##### field

`string`

##### value

`number` \| `Date`

#### Returns

[`FilterOptions`](../type-aliases/FilterOptions.md)

### greaterThanOrEqual

> **greaterThanOrEqual**: (`field`, `value`) => [`FilterOptions`](../type-aliases/FilterOptions.md)

#### Parameters

##### field

`string`

##### value

`number` \| `Date`

#### Returns

[`FilterOptions`](../type-aliases/FilterOptions.md)

### lessThan

> **lessThan**: (`field`, `value`) => [`FilterOptions`](../type-aliases/FilterOptions.md)

#### Parameters

##### field

`string`

##### value

`number` \| `Date`

#### Returns

[`FilterOptions`](../type-aliases/FilterOptions.md)

### lessThanOrEqual

> **lessThanOrEqual**: (`field`, `value`) => [`FilterOptions`](../type-aliases/FilterOptions.md)

#### Parameters

##### field

`string`

##### value

`number` \| `Date`

#### Returns

[`FilterOptions`](../type-aliases/FilterOptions.md)

### contains

> **contains**: (`field`, `value`) => [`FilterOptions`](../type-aliases/FilterOptions.md)

Universal: case-insensitive; `0`, `false` and `''` never match. Venue: case-sensitive.

#### Parameters

##### field

`string`

##### value

`string`

#### Returns

[`FilterOptions`](../type-aliases/FilterOptions.md)

### startsWith

> **startsWith**: (`field`, `value`) => [`FilterOptions`](../type-aliases/FilterOptions.md)

#### Parameters

##### field

`string`

##### value

`string`

#### Returns

[`FilterOptions`](../type-aliases/FilterOptions.md)

### endsWith

> **endsWith**: (`field`, `value`) => [`FilterOptions`](../type-aliases/FilterOptions.md)

#### Parameters

##### field

`string`

##### value

`string`

#### Returns

[`FilterOptions`](../type-aliases/FilterOptions.md)

### matches

> **matches**: (`field`, `pattern`) => [`FilterOptions`](../type-aliases/FilterOptions.md)

A regular expression; flags are dropped: case-insensitive on universal routes and in `applyFilters`,
case-sensitive on venue routes. An invalid pattern never matches.

#### Parameters

##### field

`string`

##### pattern

`string` \| `RegExp`

#### Returns

[`FilterOptions`](../type-aliases/FilterOptions.md)

### in

> **in**: (`field`, `values`) => [`FilterOptions`](../type-aliases/FilterOptions.md)

The field's text is one of the values (elements must not contain `,`).

#### Parameters

##### field

`string`

##### values

readonly (`string` \| `number`)[]

#### Returns

[`FilterOptions`](../type-aliases/FilterOptions.md)

### notIn

> **notIn**: (`field`, `values`) => [`FilterOptions`](../type-aliases/FilterOptions.md)

#### Parameters

##### field

`string`

##### values

readonly (`string` \| `number`)[]

#### Returns

[`FilterOptions`](../type-aliases/FilterOptions.md)

### exists

> **exists**: (`field`, `exists`) => [`FilterOptions`](../type-aliases/FilterOptions.md)

`true`: the field is present (`null` counts as present); `false`: it is missing.

#### Parameters

##### field

`string`

##### exists?

`boolean` = `true`

#### Returns

[`FilterOptions`](../type-aliases/FilterOptions.md)

### between

> **between**: (`field`, `min`, `max`) => [`FilterOptions`](../type-aliases/FilterOptions.md)

Inclusive; a `Date` bound becomes epoch milliseconds.

#### Parameters

##### field

`string`

##### min

`number` \| `Date`

##### max

`number` \| `Date`

#### Returns

[`FilterOptions`](../type-aliases/FilterOptions.md)

### size

> **size**: (`field`, `size`) => [`FilterOptions`](../type-aliases/FilterOptions.md)

Array or string length (universal grammar only).

#### Parameters

##### field

`string`

##### size

`number`

#### Returns

[`FilterOptions`](../type-aliases/FilterOptions.md)

### all

> **all**: (`field`, `values`) => [`FilterOptions`](../type-aliases/FilterOptions.md)

The array field includes every value (universal grammar only).

#### Parameters

##### field

`string`

##### values

readonly `string`[]

#### Returns

[`FilterOptions`](../type-aliases/FilterOptions.md)

### elemMatch

> **elemMatch**: (`field`, `values`) => [`FilterOptions`](../type-aliases/FilterOptions.md)

"Any of": the array field includes at least one value (not Mongo `$elemMatch`; universal grammar only).

#### Parameters

##### field

`string`

##### values

`string` \| readonly `string`[]

#### Returns

[`FilterOptions`](../type-aliases/FilterOptions.md)

## Example

```typescript
import { applyFilters, combineFilters, filters } from 'ubudu-rtls-sdk';

const forklifts = combineFilters(
  filters.equals('user_type', 'forklift'),
  filters.between('battery', 20, 80)
);
const page = applyFilters(assets, { filters: forklifts, sort: 'user_name:asc', page: 1, limit: 20 });
```
