[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / DataModelsResource

# Class: DataModelsResource

Read access to the asset data model definitions.

## Extends

- `ResourceBase`

## Methods

### get()

> **get**(`options?`): `Promise`\<[`DataModelField`](../interfaces/DataModelField.md)[]\>

Reads the data model taxonomy (`GET /data_filters_taxonomy/{app_namespace}`): one entry per asset field, plus
the entry whose `key` is `'data_models'`, which carries the model definitions in `data`. Returned as stored
(`[]` when none is set, USI-P2-9), without runtime checks.

#### Parameters

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

per-call `namespace` and request options

#### Returns

`Promise`\<[`DataModelField`](../interfaces/DataModelField.md)[]\>

#### Throws

500 when the stored value is not valid JSON

#### Throws

when no namespace is given or set

#### Example

```typescript
import { createRtlsClient } from 'ubudu-rtls-sdk';

const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace' });
const fields = await client.dataModels.get();
const models = fields.find((field) => field.key === 'data_models')?.data ?? [];
console.log(fields.length, models.map((model) => model.key));
```
