[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / createRtlsClient

# Function: createRtlsClient()

> **createRtlsClient**(`options?`): [`RtlsClient`](../classes/RtlsClient.md)

Creates a new RTLS API client instance.

## Parameters

### options?

[`RtlsClientOptions`](../interfaces/RtlsClientOptions.md)

Client configuration options

## Returns

[`RtlsClient`](../classes/RtlsClient.md)

Configured RtlsClient instance

## Throws

status 0 for an invalid option (`baseUrl`, `timeoutMs`, `auth`, `retry`, …)

## Examples

```typescript
import { createRtlsClient } from 'ubudu-rtls-sdk';

const client = createRtlsClient({
  apiKey: 'your-api-key',
  namespace: 'my-namespace',
  timeoutMs: 10000,
});

const assets = await client.assets.list();
```

```javascript
const { createRtlsClient } = require('ubudu-rtls-sdk');

const client = createRtlsClient({
  apiKey: process.env.RTLS_API_KEY,
});
```
