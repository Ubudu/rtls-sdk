[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / TagActionsResponse

# Interface: TagActionsResponse

Answer of `POST /tag-actions/{appNamespace}`. Spec defect: the spec types `results` as an object and omits `success`
(USI-P2-8); a partial failure answers `500` with this same body, which `tagActions.send` resolves.

## Properties

### message

> **message**: `string`

***

### tagCount

> **tagCount**: `number`

***

### results

> **results**: [`TagActionResult`](TagActionResult.md)[]

***

### success

> **success**: `boolean`
