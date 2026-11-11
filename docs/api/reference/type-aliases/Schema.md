[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / Schema

# Type Alias: Schema\<K\>

> **Schema**\<`K`\> = `components`\[`"schemas"`\]\[`K`\]

A named schema of the vendored spec, `components['schemas'][K]`. An unknown name is a compile error.

## Type Parameters

### K

`K` *extends* keyof `components`\[`"schemas"`\]

## Example

```typescript
import type { Schema } from 'ubudu-rtls-sdk';

type Health = Schema<'HealthStatus'>; // { status: string }
```
