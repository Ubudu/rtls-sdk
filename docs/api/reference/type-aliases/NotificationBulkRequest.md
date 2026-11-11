[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationBulkRequest

# Type Alias: NotificationBulkRequest

> **NotificationBulkRequest** = (\{ `ids`: `string`[]; `thread_key?`: `never`; `filter?`: `never`; \} \| \{ `thread_key`: `string`; `ids?`: `never`; `filter?`: `never`; \} \| \{ `filter`: [`NotificationFilter`](../interfaces/NotificationFilter.md); `ids?`: `never`; `thread_key?`: `never`; \}) & (\{ `action`: `"snooze"`; `snooze_until`: `Date` \| `number` \| `string`; \} \| \{ `action`: `Exclude`\<[`NotificationBulkAction`](NotificationBulkAction.md), `"snooze"`\>; `snooze_until?`: `never`; \})

A `bulk()` request: exactly one selector (`ids`, `thread_key` or a selective `filter`) and an action;
`'snooze'` needs `snooze_until`.

## Remarks

Spec: `POST /bulk` declares no request body.
