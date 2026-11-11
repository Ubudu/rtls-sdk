[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / PublishPositionData

# Interface: PublishPositionData

A position published with `positions.publish()`; extra keys are sent as given.

## Indexable

> \[`extra`: `string`\]: `unknown`

## Properties

### user\_udid

> **user\_udid**: `string`

The asset MAC (a valid MAC is normalised to 12 lower-case hex; anything else is sent verbatim).

***

### user\_uuid?

> `optional` **user\_uuid?**: `string`

The server prefers it over `user_udid` when present.

***

### lat?

> `optional` **lat?**: `number`

***

### lon?

> `optional` **lon?**: `number`

***

### map\_uuid?

> `optional` **map\_uuid?**: `string`

***

### user\_name?

> `optional` **user\_name?**: `string`

***

### data?

> `optional` **data?**: `Record`\<`string`, `unknown`\>

Free-form asset data.
