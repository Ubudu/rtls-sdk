[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationStreamEnd

# Type Alias: NotificationStreamEnd

> **NotificationStreamEnd** = \{ `reason`: `"aborted"`; \} \| \{ `reason`: `"ended"`; \} \| \{ `reason`: `"error"`; `error`: [`RtlsError`](../classes/RtlsError.md); \}

How a stream ended (`stream.done` always resolves, never rejects).

## Remarks

Spec: the stream's lifecycle is not documented.
