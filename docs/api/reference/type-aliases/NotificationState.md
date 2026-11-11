[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationState

# Type Alias: NotificationState

> **NotificationState** = `"unread"` \| `"read"` \| `"needs_action"` \| `"archived"` \| `"muted"` \| `"snoozed"` \| `"pinned"` \| `"all"`

The `state` list filter. Absent = the active inbox (not archived); `'needs_action'` overrides `kind`.

## Remarks

Spec: the `state` values `muted`, `snoozed`, `pinned` and `all` are not documented.
