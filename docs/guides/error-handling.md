# Error handling

Every error the SDK throws is an `RtlsError`. Its class tells what happened, `status` is the real HTTP status (or
`0` when no response was received), and the server's own message and code are kept.

## 1. Class hierarchy

```text
RtlsError
├── ValidationError              400, 422, or an argument rejected before sending (status 0)
├── AuthenticationError          401
├── AuthorizationError           403
├── NotFoundError                404
├── ConflictError                409
├── GoneError                    410
├── PayloadTooLargeError         413
├── UnsupportedMediaTypeError    415
├── RateLimitError               429
├── ServerError                  5xx
│   └── ServiceUnavailableError  503
├── TimeoutError                 the SDK's timeout fired (status 0)
├── AbortError                   the caller's AbortSignal fired (status 0)
├── NetworkError                 no response: connection refused, DNS failure, reset (status 0)
├── ResponseParseError           a 2xx body could not be parsed as declared
├── StreamError                  a server-sent-event or WebSocket stream failed (reason: idle_timeout | network | protocol)
│   └── WebSocketError
│       ├── WebSocketConnectionError
│       ├── WebSocketAuthenticationError
│       ├── WebSocketSubscriptionError
│       └── WebSocketSendError
└── ContextError                 namespace, venue, map or level missing or invalid; nothing was sent (status 0)
```

All classes are exported from `ubudu-rtls-sdk`. `RtlsError.is(value)` also recognises an error thrown by another
copy of the SDK (for example when both the ESM and the CommonJS build are loaded), where `instanceof` fails. The
WebSocket classes are described in the [WebSocket guide](./websocket.md).

## 2. Fields

| Field | Content |
|---|---|
| `status` | real HTTP status; `0` when there was no HTTP exchange |
| `code` | SDK class code, for example `NOT_FOUND`, `VALIDATION_ERROR`, `TIMEOUT` |
| `apiCode` | the server's own code when the body carries one (for example `DL_012`, `rate_limited`) |
| `message` | the server's human message when there is one, else `HTTP <status> <status text>` |
| `details` | detail lines sent by the server (validation messages, offending fields) |
| `retryAfter` | delay requested through `Retry-After`, in **milliseconds** |
| `body` | the parsed error body, the raw text (cut to 4 000 characters), or `undefined` when empty |
| `cause` | the underlying error (standard `Error.cause`) |

Class-specific fields: `ContextError.field`, `.suggestion` and `.problem` (`'missing'` or `'invalid'`),
`TimeoutError.timeoutMs`, `StreamError.reason`, `ResponseParseError.contentType`, `WebSocketError.closeCode` and
`.closeReason`, `WebSocketSubscriptionError.subscriptionTypes`, `WebSocketSendError.payload`. On a
WebSocket error, `status` is the HTTP status of a failed handshake and 0 otherwise.

## 3. Status to class

| Status | Class | Example |
|---|---|---|
| 400, 422 | `ValidationError` | a spatial search with a negative radius → `400 {"error":"Radius must be positive"}` |
| 401 | `AuthenticationError` | a missing or rejected credential |
| 403 | `AuthorizationError` | the request is not permitted |
| 404 | `NotFoundError` | `client.dashboards.get('<unknown id>')` → `404 {"error":"Dashboard not found"}` |
| 409 | `ConflictError` | `notifications.acknowledge()` on a direct message (`apiCode` `not_actionable`); a stale ETL profile write (`stale_write`) |
| 410 | `GoneError` | the resource existed and was removed |
| 413 | `PayloadTooLargeError` | `notifications.bulk()` matching 1000 items or more (`apiCode` `too_many_matched`, nothing changed); an `assets.batchSave()` body over the server's 100 kB limit |
| 415 | `UnsupportedMediaTypeError` | an HTTP position publish whose body is sent encoded |
| 429 | `RateLimitError` | more than 60 `notifications.send` calls in 60 s |
| 5xx | `ServerError`; 503 → `ServiceUnavailableError` | `GET /health` while the database is not ready → `503 {"status":"…"}` |
| no response | `TimeoutError`, `AbortError`, `NetworkError` | `timeoutMs: 1`; an aborted signal; an unreachable host |
| — | `ContextError` | a client without namespace; navigation without a venue; an invalid `level` (`listMaps({ level: 0.5 })`) |

```ts
import { NotFoundError, RtlsError, ValidationError } from 'ubudu-rtls-sdk';

declare const call: () => Promise<unknown>;

try {
  await call();
} catch (err) {
  if (err instanceof NotFoundError) console.log('not found');
  else if (err instanceof ValidationError) console.log('invalid request:', err.message, err.details ?? []);
  else if (err instanceof RtlsError) console.log(err.status, err.code, err.message);
  else throw err;
}
```

## 4. Server error bodies

The API answers errors in several envelopes. The SDK reads them all and fills `message`, `apiCode` and `details`:

<!-- snippet: skip -->
```ts
type ServerErrorBody =
  | { error: string }                              // most routes: message = error
  | { error: string; message: string }             // notifications, declared locations: apiCode = error, message = message
  | { error: string; details: string[] | string }  // dashboards validation, some 500s: details = details
  | { success: false; error: string }              // BLE tag actions: message = error
  | { status: string }                             // health 503: message = status
  | string;                                        // text or HTML (error pages, disabled features): first line → message
```

A one-word, code-like `error` (`stale_write`, `DL_017`) is also copied to `apiCode`. An HTML body contributes
only its first message line; a `502`/`504` text body becomes `Upstream service unavailable`. An empty body gives
the message `HTTP <status> <status text>` and `body` `undefined`.

Server codes worth testing for (`err.apiCode`); each domain guide lists the codes of its own routes:

| `apiCode` | Class | Where |
|---|---|---|
| `reserved_field_namespace` | `ValidationError` (400) | asset create, update and batch save, position publishing with asset data: a reserved `data` key; `body.fields` names the fields ([assets](./assets.md)) |
| `DL_002`, `DL_010`, `DL_012`, `DL_013` | `ValidationError` (400) | declared locations: the request was refused ([assets](./assets.md)) |
| `DL_004`, `DL_017` | `ServerError` | declared locations: an unexpected failure while declaring or clearing |
| `not_actionable`, `not_a_mission` | `ConflictError` (409) | notifications: acknowledge on a direct message, `updateMission` on an item that is not a mission ([notifications](./notifications.md)) |
| `too_many_matched` | `PayloadTooLargeError` (413) | `notifications.bulk()` matching 1000 items or more |
| `stale_write` | `ConflictError` (409) | ETL mapping profile update with an outdated `updated_at`; `body.current` holds the stored profile ([ETL](./etl.md)) |

Per-item results of a bulk declaration are not errors: the call answers `200`, and each failed item carries its
`DL_0xx` code in the result.

## 5. Detecting a disabled feature

A domain that is switched off for a namespace answers `404` with a text or HTML body instead of JSON (known
server issue USI-P9-2). The SDK raises `NotFoundError`; the string body tells it apart from a missing entity:

<!-- snippet: prelude=client -->
```ts
import { NotFoundError } from 'ubudu-rtls-sdk';

async function notificationsEnabled(): Promise<boolean> {
  try {
    await client.notifications.unreadCount();
    return true;
  } catch (err) {
    if (err instanceof NotFoundError && typeof err.body === 'string') return false;
    throw err;
  }
}
console.log(await notificationsEnabled());
```

## 6. Timeouts and cancellation

- `timeoutMs` (client option, default 30 000 ms; per call in the last parameter) bounds each attempt, headers and
  body included. `0` or `Infinity` disables it. When it fires: `TimeoutError` with `timeoutMs`.
- `signal` (per call) is the caller's `AbortSignal`. When it fires: `AbortError`, with the signal's reason as
  `cause`. An already aborted signal sends nothing.

<!-- snippet: prelude=client -->
```ts
import { AbortError, TimeoutError } from 'ubudu-rtls-sdk';

const controller = new AbortController();
try {
  await client.venues.list({ signal: controller.signal, timeoutMs: 2_000 });
} catch (err) {
  if (err instanceof TimeoutError) console.log(`no answer within ${err.timeoutMs} ms`);
  else if (err instanceof AbortError) console.log('cancelled');
  else throw err;
}
```

## 7. Retries

Retries are off by default. `retry: true` turns on the default policy: `GET` requests are retried up to 2 times on
429, 502, 503 and 504, on `NetworkError` and on `TimeoutError`, with exponential backoff (300 ms base, 10 s cap);
a `Retry-After` up to 60 s is waited for, a longer one is thrown at once. A `RetryPolicy` object changes any of
these values:

| Field | Default | Meaning |
|---|---|---|
| `retries` | `2` | further attempts after the first; an integer from 0 to 10 |
| `retryOn` | `[429, 502, 503, 504]` | HTTP statuses that are retried (integers from 400 to 599) |
| `methods` | `['GET']` | methods that are retried; `PUT` and `DELETE` are opt-in, `POST` and `PATCH` are ignored |
| `baseDelayMs` | `300` | base of the exponential backoff, in ms |
| `maxDelayMs` | `10000` | upper bound of one backoff delay, in ms (not below `baseDelayMs`) |
| `maxRetryAfterMs` | `60000` | longest `Retry-After` waited for, in ms; a longer one is thrown at once |
| `retryNetworkErrors` | `true` | also retry `NetworkError` and `TimeoutError` |

```ts
import { createRtlsClient } from 'ubudu-rtls-sdk';

const client = createRtlsClient({
  apiKey: process.env.RTLS_API_KEY,
  namespace: process.env.APP_NAMESPACE,
  retry: { retries: 3, retryOn: [429, 503], methods: ['GET', 'PUT', 'DELETE'], retryNetworkErrors: false },
});
console.log(await client.health());
```

`POST` and `PATCH` requests are never retried, except the read-only computations the SDK marks idempotent:
`navigation.shortestPath()`, `navigation.multiStop()`, the spatial `POST` calls (`zoneDistances()`,
`analyzeCustomZones()`, `analyzeCustomPois()`) and `positions.query()`. These are retried under any enabled
policy, whatever `methods` says. Never retried, whatever the policy: `notifications.send()` and `sendToSelf()`,
position publishing, BLE tag actions, `navigation.accessiblePath()`, uploads and streams.

The policy belongs to the client, and scoped clients (`forVenue()`, `withContext()`, …) share it; there is no
per-call option. Send calls that must not be retried through a second client created without `retry`.

## 8. Rate limits

A `RateLimitError` carries `retryAfter` in milliseconds when the server sent `Retry-After` (the header is in
seconds; the SDK converts it). `notifications.send` is limited to 60 calls per 60 s for each user and namespace.

<!-- snippet: prelude=client -->
```ts
import { RateLimitError } from 'ubudu-rtls-sdk';

async function withBackoff<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if (!(err instanceof RateLimitError)) throw err;
    await new Promise((resolve) => setTimeout(resolve, err.retryAfter ?? 1_000));
    return call();
  }
}
console.log((await withBackoff(() => client.venues.list())).length);
```

Cross-origin browser code cannot read `Retry-After` (known server issue USI-P1-4): `retryAfter` is then
`undefined`.

## 9. Wire behaviour worth knowing

- An unknown asset MAC answers `404` with an **empty** body: `NotFoundError` with `message` `HTTP 404`.
- An unknown venue id answers `200` with zero statistics instead of `404` (known server issue USI-P4-2, see the
  [venues and navigation guide](./venues-navigation.md)); check the result rather than expecting an error.
- Elasticsearch-backed reads require a time range; the SDK sends the last 24 hours when you give none.

## 10. Patterns

"Get or null" for lookups that may miss:

<!-- snippet: prelude=client -->
```ts
import { NotFoundError, type Asset } from 'ubudu-rtls-sdk';

async function findAsset(mac: string): Promise<Asset | null> {
  try {
    return await client.assets.get(mac);
  } catch (err) {
    if (err instanceof NotFoundError) return null;
    throw err;
  }
}
console.log((await findAsset('025d4b000001')) === null);
```

Collecting errors over a batch instead of stopping at the first one:

<!-- snippet: prelude=client -->
```ts
import { RtlsError } from 'ubudu-rtls-sdk';

const macs = ['025d4b000001', '025d4b000002'];
const failures: { mac: string; status: number; code: string }[] = [];
for (const mac of macs) {
  try {
    await client.assets.get(mac);
  } catch (err) {
    if (!(err instanceof RtlsError)) throw err;
    failures.push({ mac, status: err.status, code: err.code });
  }
}
console.log(failures);
```

An SDK error for a [`client.raw`](../api/README.md#operations-the-sdk-does-not-wrap-clientraw) response:
`createError(status, body, init?)` picks the class from the status and reads `message`, `apiCode` and `details`
from the body as the SDK does; `init` takes `headers` (for `Retry-After`), `statusText`, `contentType`, `message`
and `cause`. The same call builds an error for a test double.

<!-- snippet: prelude=client -->
```ts
import { createError } from 'ubudu-rtls-sdk';

const { data, error, response } = await client.raw.GET('/health');
if (error !== undefined) {
  throw createError(response.status, error, { headers: response.headers, statusText: response.statusText });
}
console.log(data);
```

Logging: write `name`, `status`, `code`, `apiCode` and `message`. Do not log request headers (they carry the
credential) or the content of `body`, which may hold tenant data.

```ts
import { RtlsError } from 'ubudu-rtls-sdk';

function logError(err: unknown): void {
  if (RtlsError.is(err)) {
    console.error({ name: err.name, status: err.status, code: err.code, apiCode: err.apiCode, message: err.message });
  } else {
    console.error(err);
  }
}
logError(new Error('example'));
```

## 11. Changes since 0.2

- `status` is the real status: a 400 now reports 400 (0.2 reported 422).
- `ContextError` extends `RtlsError` and has `status` 0.
- `retryAfter` is set (in milliseconds) whenever the server sends `Retry-After`.
- `message`, `apiCode` and `details` are read from every server envelope; `cause` is the standard error cause
  (`NetworkError.networkCause` is deprecated).
- New classes: `ConflictError`, `GoneError`, `PayloadTooLargeError`, `UnsupportedMediaTypeError`,
  `ServiceUnavailableError`, `AbortError`, `ResponseParseError`, `StreamError`.

See the [migration guide](./migration-0.3.md) for the complete list.
