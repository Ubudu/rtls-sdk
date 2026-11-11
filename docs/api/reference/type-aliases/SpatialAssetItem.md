[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / SpatialAssetItem

# Type Alias: SpatialAssetItem

> **SpatialAssetItem** = `Omit`\<[`Schema`](Schema.md)\<`"SpatialAssetItem"`\>, `"zone"`\> & `object`

One asset of [SpatialAssetsResponse](SpatialAssetsResponse.md), ascending `distance_meters` (generated schema, `zone.tags` added).

## Type Declaration

### zone?

> `optional` **zone?**: `NonNullable`\<[`Schema`](Schema.md)\<`"SpatialAssetItem"`\>\[`"zone"`\]\> & `object`

The zone the asset is in, when known.

#### Type Declaration

##### tags?

> `optional` **tags?**: `string`[]
