[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / Page

# Interface: Page\<T\>

The page envelope of the routes where the server pages lists (`{ data, pagination }`). Sent when the request
carries `page` and/or `limit`.

## Type Parameters

### T

`T`

## Properties

### data

> **data**: `T`[]

***

### pagination

> **pagination**: `object`

#### page

> **page**: `number`

#### limit

> **limit**: `number`

#### total

> **total**: `number`

#### totalPages

> **totalPages**: `number`

#### hasNext

> **hasNext**: `boolean`

#### hasPrev

> **hasPrev**: `boolean`
