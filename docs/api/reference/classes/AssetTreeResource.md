[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / AssetTreeResource

# Class: AssetTreeResource

Read access to the asset tree (asset `path` values such as `/Root/Lv 1/` address its nodes).

## Extends

- `ResourceBase`

## Methods

### get()

> **get**(`options?`): `Promise`\<[`AssetTree`](../type-aliases/AssetTree.md)\>

Reads the asset tree (`GET /assets_library/{app_namespace}`), returned as stored: `[]` when none is set. The
server stores any JSON, so the value is returned unchanged, without runtime checks: the result is typed
`AssetTree`, but a tree written by another client can be any JSON value (check `Array.isArray` if that matters).

#### Parameters

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

per-call `namespace` and request options

#### Returns

`Promise`\<[`AssetTree`](../type-aliases/AssetTree.md)\>

#### Throws

500 when the stored value is not valid JSON

#### Throws

when no namespace is given or set

#### Example

```typescript
import { createRtlsClient } from 'ubudu-rtls-sdk';

const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace' });
const tree = await client.assetTree.get();
for (const root of tree) console.log(root.name, root.families?.length ?? 0);
```
