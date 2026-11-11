[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / PathNodeType

# Type Alias: PathNodeType

> **PathNodeType** = `"waypoint"` \| `"entrance"` \| `"elevator"` \| `"staircase"` \| `"restroom"` \| `"escalator"` \| `"emergency_exit"` \| `string` & `object`

`node_type` of a path node. Hand-written: the spec's enum (`exit`, `stairs`) is not what the map editor stores
(`entrance` is seen live); other values are kept as strings.
