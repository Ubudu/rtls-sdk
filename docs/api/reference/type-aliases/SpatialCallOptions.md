[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / SpatialCallOptions

# Type Alias: SpatialCallOptions

> **SpatialCallOptions** = `Omit`\<[`CallContext`](CallContext.md), `"level"`\> & [`RequestOptions`](../interfaces/RequestOptions.md)

Per-call context and request options of every spatial method. `level` is not part of it: only the zone and POI
lookups take it, as their own option ([SpatialLevelOption](../interfaces/SpatialLevelOption.md)).
