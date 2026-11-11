[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationSavedViewsResource

# Class: NotificationSavedViewsResource

Per-user saved inbox views: list, get, create, delete (the server has no update route).

## Extends

- `ResourceBase`

## Methods

### list()

> **list**(`options?`): `Promise`\<[`NotificationSavedView`](../interfaces/NotificationSavedView.md)[]\>

The caller's saved views.

#### Parameters

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationSavedView`](../interfaces/NotificationSavedView.md)[]\>

#### Throws

no namespace (per call or client default); nothing is sent

***

### get()

> **get**(`id`, `options?`): `Promise`\<[`NotificationSavedView`](../interfaces/NotificationSavedView.md)\>

One saved view by id.

#### Parameters

##### id

`string`

the view's `_id` (24-hex ObjectId)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationSavedView`](../interfaces/NotificationSavedView.md)\>

#### Throws

status 0 when `id` is not an ObjectId; nothing is sent

#### Throws

unknown id

***

### create()

> **create**(`input`, `options?`): `Promise`\<[`NotificationSavedView`](../interfaces/NotificationSavedView.md)\>

Saves a named view. `query` takes the list filters and defaults to `{}`; its `from` / `to` are sent as epoch ms
and every other key as given (USI-P6-11).

#### Parameters

##### input

[`NotificationSavedViewInput`](../interfaces/NotificationSavedViewInput.md)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationSavedView`](../interfaces/NotificationSavedView.md)\>

#### Throws

status 0 when `name` is not a string with a non-blank value, or for an invalid
  `from` / `to` (nothing is sent)

#### Example

```typescript
const view = await client.notifications.savedViews.create({
  name: 'Unread critical',
  query: { state: 'unread', severity: 'critical' },
});
```

***

### delete()

> **delete**(`id`, `options?`): `Promise`\<`void`\>

Deletes a saved view (204).

#### Parameters

##### id

`string`

the view's `_id` (24-hex ObjectId)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<`void`\>

#### Throws

status 0 when `id` is not an ObjectId; nothing is sent

#### Throws

unknown id
