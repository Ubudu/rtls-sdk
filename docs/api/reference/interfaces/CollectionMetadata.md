[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / CollectionMetadata

# Interface: CollectionMetadata\<K\>

The `metadata` key of a venue collection. Hand-written: the spec does not describe it; the server fills it from
the unfiltered collection (`count` ignores a filter), and leaves it out on its upstream failure path.

## Type Parameters

### K

`K` *extends* `string`

## Properties

### type

> **type**: `K`

***

### count

> **count**: `number`

Number of features of the unfiltered collection.

***

### timestamp

> **timestamp**: `string`

ISO time the server built the collection.

***

### error?

> `optional` **error?**: `string`

Set on the server's fallback path only.
