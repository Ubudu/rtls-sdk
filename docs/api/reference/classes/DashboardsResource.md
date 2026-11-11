[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / DashboardsResource

# Class: DashboardsResource

Dashboards of the API key's user (`/dashboards`). Server rules the methods rely on: no pagination, sort or
filters on the lists; only the creator sees `shared_with` / `selected_by`; editing needs the creator or
`'edit'`; deleting, sharing and unsharing are creator-only; request bodies are limited to 100 kB
(`PayloadTooLargeError` above).

## Extends

- `ResourceBase`

## Methods

### list()

#### Call Signature

> **list**(`options?`): `Promise`\<[`Dashboard`](../interfaces/Dashboard.md)[]\>

Dashboards created by the caller or shared with the caller (`GET /dashboards`), in no particular order.
The namespace (`options.namespace`, else the client default) filters the list; with no namespace at all the
list spans every namespace the user can see.

##### Parameters

###### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`Dashboard`](../interfaces/Dashboard.md)[]\>

##### Example

```typescript
const dashboards = await client.dashboards.list();
for (const d of dashboards) console.log(d._id, d.name, d.can_edit);
```

#### Call Signature

> **list**(`options`, `requestOptions`): `Promise`\<[`Dashboard`](../interfaces/Dashboard.md)[]\>

##### Parameters

###### options

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md) \| `undefined`

###### requestOptions

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`Dashboard`](../interfaces/Dashboard.md)[]\>

##### Deprecated

0.2.0 two-object form: pass request options in `options`

#### Call Signature

> **list**(`namespace`, `requestOptions?`): `Promise`\<[`Dashboard`](../interfaces/Dashboard.md)[]\>

Legacy positional namespace.

##### Parameters

###### namespace

`string`

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`Dashboard`](../interfaces/Dashboard.md)[]\>

***

### listCreated()

#### Call Signature

> **listCreated**(`options?`): `Promise`\<[`Dashboard`](../interfaces/Dashboard.md)[]\>

Dashboards created by the caller (`GET /dashboards/created`); namespace filter as for [list](#list).

##### Parameters

###### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`Dashboard`](../interfaces/Dashboard.md)[]\>

#### Call Signature

> **listCreated**(`options`, `requestOptions`): `Promise`\<[`Dashboard`](../interfaces/Dashboard.md)[]\>

##### Parameters

###### options

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md) \| `undefined`

###### requestOptions

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`Dashboard`](../interfaces/Dashboard.md)[]\>

##### Deprecated

0.2.0 two-object form: pass request options in `options`

#### Call Signature

> **listCreated**(`namespace`, `requestOptions?`): `Promise`\<[`Dashboard`](../interfaces/Dashboard.md)[]\>

Legacy positional namespace.

##### Parameters

###### namespace

`string`

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`Dashboard`](../interfaces/Dashboard.md)[]\>

***

### listShared()

#### Call Signature

> **listShared**(`options?`): `Promise`\<[`Dashboard`](../interfaces/Dashboard.md)[]\>

Dashboards other users shared with the caller (`GET /dashboards/shared`); namespace filter as for
[list](#list). Items are the non-creator view (no `shared_with` / `selected_by`).

##### Parameters

###### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`Dashboard`](../interfaces/Dashboard.md)[]\>

#### Call Signature

> **listShared**(`options`, `requestOptions`): `Promise`\<[`Dashboard`](../interfaces/Dashboard.md)[]\>

##### Parameters

###### options

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md) \| `undefined`

###### requestOptions

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`Dashboard`](../interfaces/Dashboard.md)[]\>

##### Deprecated

0.2.0 two-object form: pass request options in `options`

#### Call Signature

> **listShared**(`namespace`, `requestOptions?`): `Promise`\<[`Dashboard`](../interfaces/Dashboard.md)[]\>

Legacy positional namespace.

##### Parameters

###### namespace

`string`

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`Dashboard`](../interfaces/Dashboard.md)[]\>

***

### listSelected()

#### Call Signature

> **listSelected**(`options?`): `Promise`\<[`Dashboard`](../interfaces/Dashboard.md)[]\>

Dashboards the caller selected (`GET /dashboards/selected`); namespace filter as for [list](#list). It may hold
several dashboards of one namespace: selecting one does not unselect the others.

##### Parameters

###### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`Dashboard`](../interfaces/Dashboard.md)[]\>

#### Call Signature

> **listSelected**(`options`, `requestOptions`): `Promise`\<[`Dashboard`](../interfaces/Dashboard.md)[]\>

##### Parameters

###### options

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md) \| `undefined`

###### requestOptions

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`Dashboard`](../interfaces/Dashboard.md)[]\>

##### Deprecated

0.2.0 two-object form: pass request options in `options`

#### Call Signature

> **listSelected**(`namespace`, `requestOptions?`): `Promise`\<[`Dashboard`](../interfaces/Dashboard.md)[]\>

Legacy positional namespace.

##### Parameters

###### namespace

`string`

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`Dashboard`](../interfaces/Dashboard.md)[]\>

***

### get()

> **get**(`id`, `options?`): `Promise`\<[`Dashboard`](../interfaces/Dashboard.md)\>

One dashboard (`GET /dashboards/{id}`). The server answers 403 `Access denied` unless the caller is the creator
or the dashboard is shared with the caller, 400 `Invalid dashboard ID` for an id that is not an ObjectId and 404
`Dashboard not found` for an unknown id.

#### Parameters

##### id

`string`

the dashboard's `_id`

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

request options; no context field is used

#### Returns

`Promise`\<[`Dashboard`](../interfaces/Dashboard.md)\>

#### Throws

`id` is not a non-empty string (status 0, no request)

***

### create()

> **create**(`input`, `options?`): `Promise`\<[`Dashboard`](../interfaces/Dashboard.md)\>

Creates a dashboard (`POST /dashboards`, 201) owned by the API key's user. `application_namespace` is
`options.namespace`, else the deprecated `input.namespace`, else the client default. `data` defaults to `[]`
(the product UI's widget array); `{}` is rejected, because the server drops it and every later update of the
dashboard then fails (USI-P5-10). `shared_with` permissions: `'view'` is dropped (membership grants view) and
`'edit'` is sent once. The server stores `dynamicVariables` only when non-empty and keeps in `selected_by` only
the creator and users the dashboard is shared with.

#### Parameters

##### input

[`CreateDashboardInput`](../interfaces/CreateDashboardInput.md)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`Dashboard`](../interfaces/Dashboard.md)\>

#### Example

```typescript
const d = await client.dashboards.create({ name: 'Floor 1', description: 'Live view' });
console.log(d._id);
```

#### Throws

invalid input (status 0, `details` = field paths, no request)

#### Throws

no namespace in `options`, `input` or the client

***

### update()

> **update**(`id`, `input`, `options?`): `Promise`\<[`Dashboard`](../interfaces/Dashboard.md)\>

Updates a dashboard (`PUT /dashboards/{id}`): only the keys of `input` that are not `undefined` are sent, and
an absent key leaves the stored value untouched (`{}` only bumps `updated_at`). `dynamicVariables: []` clears
them; `null` is rejected because the server would clear them too. `data: {}` is rejected as for `create()`
(USI-P5-10). `application_namespace` moves the dashboard.
`shared_with` is creator-only and replaces the whole list. The server answers 403 `You do not have permission
to edit this dashboard` unless the caller is the creator or has `'edit'`.

#### Parameters

##### id

`string`

##### input

[`UpdateDashboardInput`](../interfaces/UpdateDashboardInput.md)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

request options; no context field is used

#### Returns

`Promise`\<[`Dashboard`](../interfaces/Dashboard.md)\>

#### Throws

invalid input, including `null` for any key (status 0, no request)

***

### delete()

> **delete**(`id`, `options?`): `Promise`\<`void`\>

Deletes a dashboard (`DELETE /dashboards/{id}`, 204). Creator only (403 `Only the creator can delete the
dashboard`); a hard delete, so a second call gives `NotFoundError`.

#### Parameters

##### id

`string`

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

request options; no context field is used

#### Returns

`Promise`\<`void`\>

#### Throws

`id` is not a non-empty string (status 0, no request)

***

### share()

#### Call Signature

> **share**(`id`, `users`, `options?`): `Promise`\<[`Dashboard`](../interfaces/Dashboard.md)\>

Shares a dashboard (`POST /dashboards/{id}/share`). Being in `shared_with` grants view access; `'edit'` grants
editing; `'view'` is dropped before sending. The server merges by username: an existing entry gets the new
permissions, a new one is appended. It does not check that the username exists and sends no notification.
Creator only (403 `Only the creator can share the dashboard`).

##### Parameters

###### id

`string`

###### users

[`DashboardShareInput`](../interfaces/DashboardShareInput.md) \| [`DashboardShareInput`](../interfaces/DashboardShareInput.md)[]

###### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

request options; no context field is used

##### Returns

`Promise`\<[`Dashboard`](../interfaces/Dashboard.md)\>

##### Example

```typescript
await client.dashboards.share(d._id, { username: 'colleague', permissions: ['edit'] });
```

##### Throws

empty list, blank username or unknown permission (status 0, no request)

#### Call Signature

> **share**(`id`, `username`, `permissions`, `requestOptions?`): `Promise`\<[`Dashboard`](../interfaces/Dashboard.md)\>

##### Parameters

###### id

`string`

###### username

`string`

###### permissions

[`SharePermissions`](../interfaces/SharePermissions.md)

###### requestOptions?

[`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`Dashboard`](../interfaces/Dashboard.md)\>

##### Deprecated

use `share(id, { username, permissions })`. `permissions.write === true` grants `'edit'`; `read`
and `delete` have no server meaning (0.2.0 sent the object and the server granted view only).

***

### unshare()

> **unshare**(`id`, `usernames`, `options?`): `Promise`\<[`Dashboard`](../interfaces/Dashboard.md)\>

Removes users from `shared_with` and `selected_by` (`POST /dashboards/{id}/unshare`); unknown names are a
no-op. Creator only (403 `Only the creator can unshare the dashboard`).

#### Parameters

##### id

`string`

##### usernames

`string` \| `string`[]

one username or a list

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

request options; no context field is used

#### Returns

`Promise`\<[`Dashboard`](../interfaces/Dashboard.md)\>

#### Throws

empty list or a username that is not a non-empty string (status 0, no request)
