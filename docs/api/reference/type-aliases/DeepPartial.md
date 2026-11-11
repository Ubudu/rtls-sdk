[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / DeepPartial

# Type Alias: DeepPartial\<T\>

> **DeepPartial**\<`T`\> = `T` *extends* readonly `unknown`[] ? `T` : `T` *extends* `object` ? `{ [K in keyof T]?: DeepPartial<T[K]> }` : `T`

`T` with every property optional, recursively (arrays are kept as they are): the item type after a projection.

## Type Parameters

### T

`T`
