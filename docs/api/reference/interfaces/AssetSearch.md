[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / AssetSearch

# Interface: AssetSearch

Regex search on a dot path of the cached position (`user_name`, `data.type`, `zone.name`…), case-sensitive.

## Properties

### field

> **field**: `string`

***

### pattern

> **pattern**: `string`

A JavaScript regular expression, sent unchanged.

***

### mode?

> `optional` **mode?**: `"include"` \| `"exclude"`

`include` (server default) keeps the matches, `exclude` drops them.
