[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationBulkResult

# Interface: NotificationBulkResult

The result of `bulk()`. `affected` = documents whose stored fields changed (deleted documents for `'delete'`);
`'read'`, `'archive'` and `'acknowledge'` re-stamp a timestamp, so items already in that state are counted again;
`'pin'` and `'mute'` do not count items already pinned or muted. No `undo_token` when `affected` is 0 or the
server has no undo store; the token is single-use and valid for 300 s.

## Remarks

Spec: only `affected` is declared; `undo_token` is missing.

## Properties

### affected

> **affected**: `number`

***

### undo\_token?

> `optional` **undo\_token?**: `string`
