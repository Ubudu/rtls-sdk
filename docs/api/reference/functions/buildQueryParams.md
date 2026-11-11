[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / buildQueryParams

# Function: buildQueryParams()

> **buildQueryParams**(`options?`): `Record`\<`string`, `string`\>

Query parameters as a string map: every defined key is forwarded (`key`, `value`, `level`, filter keys such as
`'name:contains'`, `page`, …), arrays such as `sort` and `fields` joined with `,`, dates as epoch milliseconds.
An object value throws `ValidationError` (status 0).

## Parameters

### options?

[`QueryOptions`](../interfaces/QueryOptions.md) & `Record`\<`string`, `unknown`\>

## Returns

`Record`\<`string`, `string`\>

## Example

```typescript
import { buildQueryParams } from 'ubudu-rtls-sdk';

buildQueryParams({ key: 'user_udid', value: 'aabbccddeeff', sort: ['name:asc', 'date:desc'] });
// { key: 'user_udid', value: 'aabbccddeeff', sort: 'name:asc,date:desc' }
```
