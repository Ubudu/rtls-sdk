[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / WebSocketPublishPositionData

# Interface: WebSocketPublishPositionData

A position to publish over the WebSocket publisher.

## Properties

### macAddress

> **macAddress**: `string`

***

### latitude

> **latitude**: `number`

***

### longitude

> **longitude**: `number`

***

### mapUuid?

> `optional` **mapUuid?**: `string`

Overrides the configured map.

***

### appNamespace?

> `optional` **appNamespace?**: `string`

Overrides the configured namespace.

***

### timestamp?

> `optional` **timestamp?**: `string` \| `number` \| `Date`

Default now; sent as an ISO 8601 UTC string.

***

### name?

> `optional` **name?**: `string`

Sent as `user_name`.

***

### model?

> `optional` **model?**: `string`

***

### color?

> `optional` **color?**: `string`

***

### origin?

> `optional` **origin?**: `number`

***

### data?

> `optional` **data?**: `Record`\<`string`, `unknown`\>

***

### extra?

> `optional` **extra?**: `Record`\<`string`, `unknown`\>

Other wire fields (snake_case), passed through.
