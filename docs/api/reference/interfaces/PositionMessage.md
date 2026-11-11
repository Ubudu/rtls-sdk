[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / PositionMessage

# Interface: PositionMessage

M1: a processed position, the source frame merged over the stored asset.

## Extends

- [`WsAssetFields`](WsAssetFields.md)

## Indexable

> \[`key`: `string`\]: `unknown`

Any other field the source published.

## Properties

### user\_name?

> `optional` **user\_name?**: `string`

#### Inherited from

[`WsAssetFields`](WsAssetFields.md).[`user_name`](WsAssetFields.md#user_name)

***

### user\_type?

> `optional` **user\_type?**: `string`

#### Inherited from

[`WsAssetFields`](WsAssetFields.md).[`user_type`](WsAssetFields.md#user_type)

***

### user\_motion?

> `optional` **user\_motion?**: `string`

#### Inherited from

[`WsAssetFields`](WsAssetFields.md).[`user_motion`](WsAssetFields.md#user_motion)

***

### model?

> `optional` **model?**: `string`

#### Inherited from

[`WsAssetFields`](WsAssetFields.md).[`model`](WsAssetFields.md#model)

***

### color?

> `optional` **color?**: `string`

#### Inherited from

[`WsAssetFields`](WsAssetFields.md).[`color`](WsAssetFields.md#color)

***

### path?

> `optional` **path?**: `string`

#### Inherited from

[`WsAssetFields`](WsAssetFields.md).[`path`](WsAssetFields.md#path)

***

### tags?

> `optional` **tags?**: `string`[]

#### Inherited from

[`WsAssetFields`](WsAssetFields.md).[`tags`](WsAssetFields.md#tags)

***

### external\_id?

> `optional` **external\_id?**: `string` \| `null`

#### Inherited from

[`WsAssetFields`](WsAssetFields.md).[`external_id`](WsAssetFields.md#external_id)

***

### data?

> `optional` **data?**: `Record`\<`string`, `unknown`\>

#### Inherited from

[`WsAssetFields`](WsAssetFields.md).[`data`](WsAssetFields.md#data)

***

### targetApplications?

> `optional` **targetApplications?**: `unknown`

#### Inherited from

[`WsAssetFields`](WsAssetFields.md).[`targetApplications`](WsAssetFields.md#targetapplications)

***

### battery\_percent?

> `optional` **battery\_percent?**: `number`

#### Inherited from

[`WsAssetFields`](WsAssetFields.md).[`battery_percent`](WsAssetFields.md#battery_percent)

***

### declared\_location?

> `optional` **declared\_location?**: `Record`\<`string`, `unknown`\> \| `null`

#### Inherited from

[`WsAssetFields`](WsAssetFields.md).[`declared_location`](WsAssetFields.md#declared_location)

***

### is\_virtual?

> `optional` **is\_virtual?**: `boolean`

#### Inherited from

[`WsAssetFields`](WsAssetFields.md).[`is_virtual`](WsAssetFields.md#is_virtual)

***

### createdBy?

> `optional` **createdBy?**: `string`

#### Inherited from

[`WsAssetFields`](WsAssetFields.md).[`createdBy`](WsAssetFields.md#createdby)

***

### dateCreated?

> `optional` **dateCreated?**: `number`

#### Inherited from

[`WsAssetFields`](WsAssetFields.md).[`dateCreated`](WsAssetFields.md#datecreated)

***

### dateChanged?

> `optional` **dateChanged?**: `number`

#### Inherited from

[`WsAssetFields`](WsAssetFields.md).[`dateChanged`](WsAssetFields.md#datechanged)

***

### app\_namespace

> **app\_namespace**: `string`

***

### user\_uuid

> **user\_uuid**: `string`

Always present on delivered positions.

***

### user\_udid

> **user\_udid**: `string`

Defaulted to `user_uuid` by the broker.

***

### lat

> **lat**: `number`

***

### lon

> **lon**: `number`

***

### map\_uuid

> **map\_uuid**: `string`

***

### timestamp

> **timestamp**: `string` \| `number`

As sent; an ISO string is added when the source sent none.

***

### zone

> **zone**: [`WsPositionZone`](WsPositionZone.md)

***

### origin?

> `optional` **origin?**: `number`

The platform sets 0 when the source sent none.

***

### origin\_detail?

> `optional` **origin\_detail?**: `string`

***

### level?

> `optional` **level?**: `number`

***

### speed?

> `optional` **speed?**: `number` \| `null`

m/s; null when the time delta is ≤ 0.

***

### prev\_pos\_distance?

> `optional` **prev\_pos\_distance?**: `number`

Metres.

***

### prev\_pos\_time\_diff\_seconds?

> `optional` **prev\_pos\_time\_diff\_seconds?**: `number`

***

### device\_info?

> `optional` **device\_info?**: [`WsDeviceInfo`](WsDeviceInfo.md)

***

### il\_sdk\_ver?

> `optional` **il\_sdk\_ver?**: `string`
