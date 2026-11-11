[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / RtlsClientOptions

# Interface: RtlsClientOptions

## Properties

### baseUrl?

> `optional` **baseUrl?**: `string`

API base URL, `http:` or `https:`, or a root-relative path such as `/rtls-api` (a same-origin proxy in a browser,
resolved by `fetch` against the page); default `https://rtls.ubudu.com/api`; trailing `/` stripped.

***

### apiKey?

> `optional` **apiKey?**: `string`

API key, sent as `X-API-Key` (unless `accessToken` wins, see `auth`).

***

### accessToken?

> `optional` **accessToken?**: `string`

Bearer token, sent as `Authorization: Bearer <token>` (wins over `apiKey` unless `auth` says otherwise).

***

### auth?

> `optional` **auth?**: [`AuthMode`](../type-aliases/AuthMode.md)

Credential selection when both `apiKey` and `accessToken` are set; default `'auto'` (Bearer wins).

***

### timeoutMs?

> `optional` **timeoutMs?**: `number`

Per-attempt timeout in ms (headers and body); default 30 000; `0` or `Infinity` disables it.

***

### retry?

> `optional` **retry?**: `boolean` \| [`RetryPolicy`](RetryPolicy.md)

Retry of idempotent requests; default `false`. `true` applies the [RetryPolicy](RetryPolicy.md) defaults: GET only,
2 retries on 429/502/503/504, network errors and timeouts, `Retry-After` honoured up to 60 s. Uploads, streams
and non-idempotent writes are never retried: the SDK opts those calls out itself (there is no per-call option).

***

### fetch?

> `optional` **fetch?**: \{(`input`, `init?`): `Promise`\<`Response`\>; (`input`, `init?`): `Promise`\<`Response`\>; \}

`fetch` implementation. Default: the global `fetch`, looked up on every call (so a `fetch` patched after the client
was created, for example by a test harness, applies).

#### Call Signature

> (`input`, `init?`): `Promise`\<`Response`\>

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Window/fetch)

##### Parameters

###### input

`URL` \| `RequestInfo`

###### init?

`RequestInit`

##### Returns

`Promise`\<`Response`\>

#### Call Signature

> (`input`, `init?`): `Promise`\<`Response`\>

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Window/fetch)

##### Parameters

###### input

`string` \| `URL` \| `Request`

###### init?

`RequestInit`

##### Returns

`Promise`\<`Response`\>

***

### headers?

> `optional` **headers?**: `Record`\<`string`, `string`\>

Headers sent on every request; a `Content-Type` here is ignored (it is set only with a JSON body).

***

### namespace?

> `optional` **namespace?**: `string`

Default namespace for all API calls

***

### venueId?

> `optional` **venueId?**: `number`

Default venue ID for venue-scoped API calls

***

### mapId?

> `optional` **mapId?**: `number`

Default map ID for map-scoped API calls

***

### level?

> `optional` **level?**: `number`

Default floor level for spatial queries
