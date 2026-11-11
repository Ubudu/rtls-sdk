[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / AlertMessage

# Interface: AlertMessage

M4: alert. No timestamp on the wire; `user_udid` is absent when a zone event fired the rule.

## Properties

### action

> **action**: `"notifyEvent"`

***

### event\_type

> **event\_type**: `"NOTIFICATION"`

***

### app\_namespace

> **app\_namespace**: `string`

***

### map\_uuid?

> `optional` **map\_uuid?**: `string`

***

### user\_udid?

> `optional` **user\_udid?**: `string`

***

### user\_type?

> `optional` **user\_type?**: `string`

***

### zone?

> `optional` **zone?**: [`WsPositionZone`](WsPositionZone.md) \| [`WsZoneStub`](WsZoneStub.md) \| [`WsZoneFeature`](WsZoneFeature.md) \| `null`

***

### params?

> `optional` **params?**: [`WsAlertParams`](WsAlertParams.md)
