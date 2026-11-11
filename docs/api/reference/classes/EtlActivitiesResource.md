[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / EtlActivitiesResource

# Class: EtlActivitiesResource

The ETL activity log (`client.etl.activities`): one entry per profile change and per upload, typed from the
returned entries (USI-P7-10). The namespace is not used.

## Extends

- `ResourceBase`

## Methods

### listPage()

> **listPage**(`query?`, `options?`): `Promise`\<[`Page`](../interfaces/Page.md)\<[`EtlActivity`](../type-aliases/EtlActivity.md)\>\>

One page of entries (`GET /etl/activities`), normalised to `Page<EtlActivity>`. Only the query keys that are
set are sent; `search` is literal text (USI-P7-9).

#### Parameters

##### query?

[`EtlActivityQuery`](../interfaces/EtlActivityQuery.md)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`Page`](../interfaces/Page.md)\<[`EtlActivity`](../type-aliases/EtlActivity.md)\>\>

#### Throws

status 0 when `page` or `limit` is not an integer >= 1 (nothing is sent)

#### Example

```typescript
const page = await client.etl.activities.listPage({ action: 'upload', limit: 20 });
for (const entry of page.data) {
  if (entry.action === 'upload') console.log(entry.details.processingStats?.totalErrors);
}
```

***

### iterate()

> **iterate**(`query?`, `options?`): `AsyncIterableIterator`\<[`EtlActivity`](../type-aliases/EtlActivity.md)\>

Every entry, page after page (`pageSize` per request, default 100, never sent as such). Lazy: the next page is
fetched when the consumer pulls past the current one; stops when `pagination.hasNext` is false. Bound it with
`collectAll(…, { maxItems })`.

#### Parameters

##### query?

[`EtlActivityIterateQuery`](../type-aliases/EtlActivityIterateQuery.md)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`AsyncIterableIterator`\<[`EtlActivity`](../type-aliases/EtlActivity.md)\>

#### Throws

status 0, on the first `next()`, when `pageSize` is not an integer >= 1

#### Example

```typescript
import { collectAll } from 'ubudu-rtls-sdk';

const uploads = await collectAll(client.etl.activities.iterate({ action: 'upload' }), { maxItems: 50 });
```
