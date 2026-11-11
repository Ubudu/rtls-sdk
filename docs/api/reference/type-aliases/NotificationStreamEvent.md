[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationStreamEvent

# Type Alias: NotificationStreamEvent

> **NotificationStreamEvent** = \{ `type`: `"open"`; `data`: \{ `app_namespace`: `string`; `user_id`: `string`; \}; \} \| \{ `type`: `"item"`; `data`: `Omit`\<[`NotificationItem`](../interfaces/NotificationItem.md), `"_id"`\> & `object`; \} \| \{ `type`: `"state"`; `data`: `object` & `Partial`\<`Pick`\<[`NotificationItem`](../interfaces/NotificationItem.md), `"read"` \| `"acknowledged"` \| `"archived"` \| `"pinned"` \| `"muted"` \| `"snooze_until"` \| `"mission"`\>\>; \} \| \{ `type`: `"unread_count"`; `data`: \{ `action`: [`NotificationBulkAction`](NotificationBulkAction.md); `affected`: `number`; \}; \} \| \{ `type`: `"reconnected"`; `data`: \{ `attempt`: `number`; \}; \}

One event of the live stream. `'reconnected'` is synthetic (emitted by the SDK after the `open` of a
re-connection); after it, re-fetch `unreadCount()` and the list.

## Remarks

Spec: `/stream` is typed as a `string`; the event names and data are not documented. `unread_count`
  carries `{ action, affected }`, not counts (USI-P6-3).
