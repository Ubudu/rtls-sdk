[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / SseEvent

# Interface: SseEvent

One server-sent event. `data` is the raw string (multi-line data joined with `\n`); consumers parse JSON
themselves. `event` defaults to `'message'`. `id` is the last event id the stream set, when it set one.

## Properties

### event

> **event**: `string`

***

### data

> **data**: `string`

***

### id?

> `optional` **id?**: `string`
