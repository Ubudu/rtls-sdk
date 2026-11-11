[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / RtlsClient

# Class: RtlsClient

The main RTLS API client providing access to all resources.

## Example

```typescript
import { RtlsClient } from 'ubudu-rtls-sdk';

const client = new RtlsClient({ apiKey: 'your-api-key', namespace: 'my-namespace' });
const assets = await client.assets.list();
```

## Extends

- `BaseClient`

## Constructors

### Constructor

> **new RtlsClient**(`options?`): `RtlsClient`

#### Parameters

##### options?

[`RtlsClientOptions`](../interfaces/RtlsClientOptions.md)

client options (see [RtlsClientOptions](../interfaces/RtlsClientOptions.md))

#### Returns

`RtlsClient`

#### Throws

status 0 for an invalid option

#### Throws

problem `'invalid'` for an invalid default context id

#### Overrides

`BaseClient.constructor`

## Properties

### assets

> `readonly` **assets**: [`AssetsResource`](AssetsResource.md)

Asset records: list, get, create, update, delete, batch writes, history.

***

### assetDocuments

> `readonly` **assetDocuments**: [`AssetDocumentsResource`](AssetDocumentsResource.md)

Documents attached to assets.

***

### assetTree

> `readonly` **assetTree**: [`AssetTreeResource`](AssetTreeResource.md)

The namespace's asset tree (read only).

***

### dataModels

> `readonly` **dataModels**: [`DataModelsResource`](DataModelsResource.md)

The namespace's asset data model (read only).

***

### declaredLocations

> `readonly` **declaredLocations**: [`DeclaredLocationsResource`](DeclaredLocationsResource.md)

Declared asset locations.

***

### tagActions

> `readonly` **tagActions**: [`TagActionsResource`](TagActionsResource.md)

BLE and ESL tag actions.

***

### positions

> `readonly` **positions**: [`PositionsResource`](PositionsResource.md)

Cached and historical positions.

***

### spatial

> `readonly` **spatial**: [`SpatialResource`](SpatialResource.md)

Spatial queries on zones, POIs and assets.

***

### venues

> `readonly` **venues**: [`VenuesResource`](VenuesResource.md)

Venues, maps, POIs and paths.

***

### zones

> `readonly` **zones**: [`ZonesResource`](ZonesResource.md)

Venue zones and zone presence.

***

### navigation

> `readonly` **navigation**: [`NavigationResource`](NavigationResource.md)

Indoor routing.

***

### dashboards

> `readonly` **dashboards**: [`DashboardsResource`](DashboardsResource.md)

Dashboards.

***

### alerts

> `readonly` **alerts**: [`AlertsResource`](AlertsResource.md)

Alert events.

***

### alertRules

> `readonly` **alertRules**: [`AlertRulesResource`](AlertRulesResource.md)

The namespace's alert rules.

***

### settings

> `readonly` **settings**: [`SettingsResource`](SettingsResource.md)

Namespace settings (read only).

***

### notifications

> `readonly` **notifications**: [`NotificationsResource`](NotificationsResource.md)

The notification center.

***

### etl

> `readonly` **etl**: [`EtlResource`](EtlResource.md)

ETL imports.

## Accessors

### raw

#### Get Signature

> **get** **raw**(): `Client`\<`paths`\>

##### Returns

`Client`\<`paths`\>

#### Inherited from

`BaseClient.raw`

***

### context

#### Get Signature

> **get** **context**(): `Readonly`\<[`RtlsContext`](../interfaces/RtlsContext.md)\>

Get current default context (read-only copy)

##### Returns

`Readonly`\<[`RtlsContext`](../interfaces/RtlsContext.md)\>

#### Inherited from

`BaseClient.context`

***

### namespace

#### Get Signature

> **get** **namespace**(): `string` \| `undefined`

Get current default namespace

##### Returns

`string` \| `undefined`

#### Inherited from

`BaseClient.namespace`

***

### venueId

#### Get Signature

> **get** **venueId**(): `number` \| `undefined`

Get current default venue ID

##### Returns

`number` \| `undefined`

#### Inherited from

`BaseClient.venueId`

***

### mapId

#### Get Signature

> **get** **mapId**(): `number` \| `undefined`

Get current default map ID

##### Returns

`number` \| `undefined`

#### Inherited from

`BaseClient.mapId`

***

### level

#### Get Signature

> **get** **level**(): `number` \| `undefined`

Get current default level

##### Returns

`number` \| `undefined`

#### Inherited from

`BaseClient.level`

## Methods

### setNamespace()

> **setNamespace**(`namespace`): `this`

Set default namespace. Chainable.

#### Parameters

##### namespace

`string`

#### Returns

`this`

#### Throws

problem `'invalid'` for a non-string

#### Inherited from

`BaseClient.setNamespace`

***

### setVenue()

> **setVenue**(`venueId`): `this`

Set default venue ID. Chainable.

#### Parameters

##### venueId

`number`

#### Returns

`this`

#### Throws

problem `'invalid'` unless an integer `>= 0`

#### Inherited from

`BaseClient.setVenue`

***

### setMap()

> **setMap**(`mapId`): `this`

Set default map ID. Chainable.

#### Parameters

##### mapId

`number`

#### Returns

`this`

#### Throws

problem `'invalid'` unless an integer `>= 0`

#### Inherited from

`BaseClient.setMap`

***

### setLevel()

> **setLevel**(`level`): `this`

Set default level. Chainable.

#### Parameters

##### level

`number`

#### Returns

`this`

#### Throws

problem `'invalid'` unless an integer (negative levels are allowed)

#### Inherited from

`BaseClient.setLevel`

***

### setContext()

> **setContext**(`context`): `this`

Set multiple context values at once. Chainable. A key present with `undefined` or `null` clears that value; an
absent key keeps it; other values are validated.

#### Parameters

##### context

`Partial`\<[`RtlsContext`](../interfaces/RtlsContext.md)\>

#### Returns

`this`

#### Throws

problem `'invalid'` for an invalid value (nothing is changed then)

#### Inherited from

`BaseClient.setContext`

***

### clearContext()

> **clearContext**(): `this`

Clear all default context values. Chainable.

#### Returns

`this`

#### Inherited from

`BaseClient.clearContext`

***

### health()

> **health**(`options?`): `Promise`\<\{ `status`: `string`; \}\>

The API health (`GET /health`; public, no credential needed).

#### Parameters

##### options?

[`RequestOptions`](../interfaces/RequestOptions.md)

request options (`signal`, `timeoutMs`, `headers`)

#### Returns

`Promise`\<\{ `status`: `string`; \}\>

`{ status: 'OK' }`

#### Throws

503 when the API is not ready; `message` is the server's `status` text

#### Example

```typescript
import { createRtlsClient } from 'ubudu-rtls-sdk';

const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY });
const health = await client.health();
console.log('API status:', health.status); // 'OK'
```

***

### ~~getSettings()~~

> **getSettings**(`namespaceOrOptions?`, `options?`): `Promise`\<[`NamespaceSettings`](../interfaces/NamespaceSettings.md)\>

The settings document of a namespace.

#### Parameters

##### namespaceOrOptions?

`string` \| [`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

a namespace (the 0.2.0 form), or a `CallContext & RequestOptions` bag; without a
  namespace the client's default namespace applies

##### options?

[`RequestOptions`](../interfaces/RequestOptions.md)

request options; they win over the request options of the bag

#### Returns

`Promise`\<[`NamespaceSettings`](../interfaces/NamespaceSettings.md)\>

#### Deprecated

since 0.3.0 — use `client.settings.get()`.

#### Throws

when no namespace is given or set (nothing is sent)

#### Example

```typescript
const settings = await client.settings.get({ namespace: 'my-namespace' });
```

***

### ~~esQuery()~~

> **esQuery**(`namespace`, `dataType`, `query`, `options?`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Runs an Elasticsearch query (`POST /es/query/{appNamespace}/{dataType}`). The query should carry a time `range`
and a `size` (the server rejects unbounded queries). Read-only, so it is retried under the client's retry policy.

#### Parameters

##### namespace

`string`

the namespace (`''` = the client default)

##### dataType

`"alerts"` \| `"positions"` \| `"zone_visits"`

`'alerts'`, `'positions'` or `'zone_visits'`

##### query

`Record`\<`string`, `unknown`\>

the Elasticsearch query body

##### options?

[`RequestOptions`](../interfaces/RequestOptions.md)

request options

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

the search response as the server returns it (`hits`, …)

#### Deprecated

since 0.3.0 — use `client.positions.query()`.

#### Throws

when no namespace is given or set (nothing is sent)

#### Example

```typescript
const result = await client.esQuery('my-namespace', 'alerts', {
  size: 10,
  query: { range: { timestamp: { gte: Date.now() - 3_600_000 } } },
});
```

***

### ~~sendTagActions()~~

> **sendTagActions**(`namespace`, `actions`, `options?`): `Promise`\<[`TagActionsResponse`](../interfaces/TagActionsResponse.md)\>

Sends actions to tags (LED colours, UWB blink).

#### Parameters

##### namespace

`string`

the namespace (`''` = the client default)

##### actions

[`TagAction`](../interfaces/TagAction.md)[]

the actions to send

##### options?

[`RequestOptions`](../interfaces/RequestOptions.md)

request options

#### Returns

`Promise`\<[`TagActionsResponse`](../interfaces/TagActionsResponse.md)\>

the message and the number of tags reached

#### Deprecated

since 0.3.0 — use `client.tagActions.send()`.

#### Throws

status 500 when part of the actions failed, also when the server's answer says
  `success: false` (the 0.2.0 failure behaviour)

#### Example

```typescript
const result = await client.tagActions.send(
  [{ macAddress: 'aabbccddeeff', action: 'ptlGreen' }],
  { namespace: 'my-namespace' }
);
```

***

### forNamespace()

> **forNamespace**(`namespace`): `RtlsClient`

Create a new client instance scoped to a specific namespace.
The new client inherits all other settings from the parent and shares its transport and `raw` client (middleware
added with `raw.use()` applies to both); only the context differs.

#### Parameters

##### namespace

`string`

The namespace to scope to

#### Returns

`RtlsClient`

New RtlsClient instance (original unchanged)

***

### forVenue()

> **forVenue**(`venueId`, `options?`): `RtlsClient`

Create a new client instance scoped to a specific venue.
The new client inherits namespace and other settings from the parent and shares its transport and `raw` client.

#### Parameters

##### venueId

`number`

The venue ID to scope to

##### options?

Optional map ID and level overrides

###### mapId?

`number`

###### level?

`number`

#### Returns

`RtlsClient`

New RtlsClient instance (original unchanged)

#### Throws

problem `'invalid'` unless `venueId` (and `mapId`, `level`) are valid

***

### forMap()

> **forMap**(`mapId`, `options?`): `RtlsClient`

Create a new client instance scoped to a specific map.
The new client inherits namespace, venue, and other settings from the parent and shares its transport and `raw`
client.

#### Parameters

##### mapId

`number`

The map ID to scope to

##### options?

Optional level override

###### level?

`number`

#### Returns

`RtlsClient`

New RtlsClient instance (original unchanged)

#### Throws

problem `'invalid'` unless `mapId` (and `level`) are valid

***

### withContext()

> **withContext**(`context`): `RtlsClient`

Create a new client instance with merged context.
Values in the provided context override the parent's values; a key present with `undefined` or `null` clears
that value in the new client (0.2.0 kept the parent's value). The new client shares the parent's transport and
`raw` client.

#### Parameters

##### context

`Partial`\<[`RtlsContext`](../interfaces/RtlsContext.md)\>

Context values to set, override or clear

#### Returns

`RtlsClient`

New RtlsClient instance (original unchanged)

#### Throws

problem `'invalid'` for an invalid value

***

### createWebSocket()

> **createWebSocket**(`options?`): [`RtlsWebSocketClient`](RtlsWebSocketClient.md)

Creates a WebSocket client with this client's namespace, credential and base URL. Nothing is connected until
`connect()` is called.

- Namespace: `options.namespace`, else the client's default namespace.
- Credential: the access token as `token` (unless `auth: 'apiKey'`), else the API key as `apiKey`.
- URLs from `baseUrl`: `https:` → `wss:`, `http:` → `ws:`, the path is kept, then `/ws/subscriber` and
  `/ws/publisher` (with the default `baseUrl`, the production broker URLs). A root-relative `baseUrl` is
  resolved against the page (`location`); outside a browser pass `subscriberUrl` and `publisherUrl`.

Options passed here win over the derived values (`token`, `apiKey`, `subscriberUrl`, `publisherUrl`, …).

#### Parameters

##### options?

`Partial`\<[`WebSocketClientConfig`](../interfaces/WebSocketClientConfig.md)\>

WebSocket options

#### Returns

[`RtlsWebSocketClient`](RtlsWebSocketClient.md)

#### Throws

when no namespace is given or set

#### Throws

status 0 when neither the client nor `options` carry an API key or token, or when a
  root-relative `baseUrl` cannot be resolved (no `location`) and `options` do not give both URLs

#### Example

```typescript
import { createRtlsClient, SubscriptionType } from 'ubudu-rtls-sdk';

const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace' });
const ws = client.createWebSocket();
ws.on('POSITIONS', (position) => console.log(position));
await ws.connect();
await ws.subscribe([SubscriptionType.POSITIONS]);
```
