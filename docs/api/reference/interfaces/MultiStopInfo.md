[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / MultiStopInfo

# Interface: MultiStopInfo

Summary of a multi-stop optimisation.

## Properties

### optimized

> **optimized**: `boolean`

***

### stopCount

> **stopCount**: `number`

***

### algorithm?

> `optional` **algorithm?**: `string` & `object` \| [`TspAlgorithm`](../type-aliases/TspAlgorithm.md)

Only when optimised.

***

### optimizationDistance?

> `optional` **optimizationDistance?**: `number`

Only when optimised.

***

### roundTripInfo?

> `optional` **roundTripInfo?**: [`RoundTripInfo`](RoundTripInfo.md)

`returnDistance` is 0 when `optimizeOrder` and `returnToStart` are combined (USI-P4-13).
