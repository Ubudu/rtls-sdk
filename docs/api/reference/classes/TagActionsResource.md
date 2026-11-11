[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / TagActionsResource

# Class: TagActionsResource

Sends actions to physical tags.

## Extends

- `ResourceBase`

## Methods

### send()

> **send**(`actions`, `options?`): `Promise`\<[`TagActionsResponse`](../interfaces/TagActionsResponse.md)\>

Sends the actions in one request (`POST /tag-actions/{appNamespace}`, the array as JSON body, each MAC
normalised to 12 lowercase hex as the product UI sends it). It drives hardware, so it is never retried,
whatever the client's retry policy.

Safety: BLE actions (`ptlRed`, `ptlGreen`, `uwbBlink` and the two combinations) to a MAC that is not an ESL
asset are sent through every BLE gateway of the namespace. The ESL-only colours (`ptlBlue`, `ptlYellow`,
`ptlWhite`, `ptlCyan`, `ptlMagenta`, `ptlAquamarine`) sent to a non-ESL tag are rejected per item
(`statusCode: 400`) without contacting hardware.

When some actions fail the server answers `500` with the full result body: this method resolves it as is
(`success: false`), so inspect `results` (USI-P2-8).

#### Parameters

##### actions

[`TagAction`](../interfaces/TagAction.md)[]

the actions to send; `[]` is allowed and reaches no tag

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

per-call `namespace` (else the client default) and request options

#### Returns

`Promise`\<[`TagActionsResponse`](../interfaces/TagActionsResponse.md)\>

the answer; `success` is `false` when at least one action failed

#### Throws

status 0 when `actions` is not an array, an item is not an object, a `macAddress`
  is not a MAC address, an `action` is unknown or a `duration` is not an integer 1..3600 (nothing is sent);
  status 400 when the server rejects the body

#### Throws

a 5xx without per-action results, for example `No BLE comms configuration for
  namespace: …`

#### Throws

when no namespace is given or set (nothing is sent)

#### Example

```typescript
import { createRtlsClient } from 'ubudu-rtls-sdk';

const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace' });
const result = await client.tagActions.send([{ macAddress: 'AA:BB:CC:DD:EE:FF', action: 'ptlGreen' }]);
if (!result.success) console.log(result.results.filter((r) => !r.success));
```
