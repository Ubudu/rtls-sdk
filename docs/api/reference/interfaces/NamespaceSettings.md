[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NamespaceSettings

# Interface: NamespaceSettings

The settings document of a namespace, as `GET /settings/{app_namespace}` returns it: the stored, free-form
settings plus `positionsExpirationPeriod` and `accuracy`, which the server always fills in. The spec omits the
server defaults and the `tagActions` key (USI-P5-12). The document may hold namespace identifiers
(`linkedApplications`, `assetPermissions`): do not log it.

## Indexable

> \[`key`: `string`\]: `unknown`

Stored settings are free-form.

## Properties

### accuracy

> **accuracy**: `object`

Always present; server default `{ accuracy_meter: 5, show: false }`.

#### accuracy\_meter

> **accuracy\_meter**: `number`

#### show

> **show**: `boolean`

***

### positionsExpirationPeriod

> **positionsExpirationPeriod**: `number`

Always present; seconds, server default 60.

***

### assetPermissions?

> `optional` **assetPermissions?**: `Record`\<`string`, \{ `create?`: `string`[]; `read?`: `string`[]; \}\>

***

### defaultSelectedModels?

> `optional` **defaultSelectedModels?**: `string`[]

***

### lastPositions?

> `optional` **lastPositions?**: `object`

#### defaultSearchInterval?

> `optional` **defaultSearchInterval?**: `number`

***

### linkedApplications?

> `optional` **linkedApplications?**: `string`[]

***

### map?

> `optional` **map?**: `object`

#### rotation?

> `optional` **rotation?**: `number`

#### rotationPerVenue?

> `optional` **rotationPerVenue?**: `Record`\<`string`, `number`\>

***

### tagActions?

> `optional` **tagActions?**: [`TagActionsSettings`](../type-aliases/TagActionsSettings.md)

Not in the spec (USI-P5-12).
