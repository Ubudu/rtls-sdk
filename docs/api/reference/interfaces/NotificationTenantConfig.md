[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationTenantConfig

# Interface: NotificationTenantConfig

The namespace's notification configuration (role-gated: `manage_api_keys`). `{ app_namespace }` alone when no
document is stored.

## Remarks

Spec: both `GET` and `PUT /tenant-config` responses are untyped; the index signatures keep the channel
  settings the server stores as given.

## Properties

### app\_namespace

> **app\_namespace**: `string`

***

### email?

> `optional` **email?**: `object`

#### Index Signature

\[`key`: `string`\]: `unknown`

#### smtp\_host?

> `optional` **smtp\_host?**: `string`

#### smtp\_port?

> `optional` **smtp\_port?**: `number`

#### from?

> `optional` **from?**: `string`

#### auth?

> `optional` **auth?**: `object`

##### auth.user?

> `optional` **user?**: `string`

##### auth.pass?

> `optional` **pass?**: [`NotificationSecret`](../type-aliases/NotificationSecret.md)

***

### slack?

> `optional` **slack?**: `object`

#### Index Signature

\[`key`: `string`\]: `unknown`

#### bot\_token?

> `optional` **bot\_token?**: [`NotificationSecret`](../type-aliases/NotificationSecret.md)

***

### telegram?

> `optional` **telegram?**: `object`

#### Index Signature

\[`key`: `string`\]: `unknown`

#### bot\_token?

> `optional` **bot\_token?**: [`NotificationSecret`](../type-aliases/NotificationSecret.md)

***

### teams?

> `optional` **teams?**: `object`

#### Index Signature

\[`key`: `string`\]: `unknown`

#### azure\_app?

> `optional` **azure\_app?**: `object`

##### Index Signature

\[`key`: `string`\]: `unknown`

##### azure\_app.client\_secret?

> `optional` **client\_secret?**: [`NotificationSecret`](../type-aliases/NotificationSecret.md)

***

### whatsapp?

> `optional` **whatsapp?**: `object`

#### Index Signature

\[`key`: `string`\]: `unknown`

#### cloud\_api?

> `optional` **cloud\_api?**: `object`

##### Index Signature

\[`key`: `string`\]: `unknown`

##### cloud\_api.access\_token?

> `optional` **access\_token?**: [`NotificationSecret`](../type-aliases/NotificationSecret.md)

#### templates?

> `optional` **templates?**: `Record`\<`string`, \{ `name`: `string`; `lang?`: `string`; `params?`: `string`[]; \}\>

***

### rate\_limits?

> `optional` **rate\_limits?**: `Partial`\<`Record`\<[`NotificationChannel`](../type-aliases/NotificationChannel.md), `Record`\<`string`, `unknown`\>\>\>

***

### cleanup\_cap?

> `optional` **cleanup\_cap?**: `object`

#### max\_archive\_days?

> `optional` **max\_archive\_days?**: `number`

#### max\_purge\_days?

> `optional` **max\_purge\_days?**: `number`

***

### updated\_at?

> `optional` **updated\_at?**: `number`

***

### \_id?

> `optional` **\_id?**: `string`

***

### \_\_v?

> `optional` **\_\_v?**: `number`
