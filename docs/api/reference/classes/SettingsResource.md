[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / SettingsResource

# Class: SettingsResource

Read access to the namespace configuration (writing it is an operator task, not wrapped by the SDK).

## Extends

- `ResourceBase`

## Methods

### get()

> **get**(`options?`): `Promise`\<[`NamespaceSettings`](../interfaces/NamespaceSettings.md)\>

The settings document of the namespace (`GET /settings/{app_namespace}`). `positionsExpirationPeriod` (default
60 s) and `accuracy` (default `{ accuracy_meter: 5, show: false }`) are always present; every other key is the
stored, free-form configuration. The document may hold namespace identifiers: do not log it.

#### Parameters

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

per-call `namespace` (else the client default) and request options

#### Returns

`Promise`\<[`NamespaceSettings`](../interfaces/NamespaceSettings.md)\>

#### Throws

when no namespace is given or set (nothing is sent)

#### Throws

401; [ServerError](ServerError.md) 500 on a store error

#### Example

```typescript
import { createRtlsClient } from 'ubudu-rtls-sdk';

const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace' });
const settings = await client.settings.get();
console.log(settings.positionsExpirationPeriod); // seconds
const other = await client.settings.get({ namespace: 'other-namespace', timeoutMs: 5000 });
```
