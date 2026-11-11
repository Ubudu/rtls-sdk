[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / extractPathNodesFromGeoJSON

# Function: extractPathNodesFromGeoJSON()

> **extractPathNodesFromGeoJSON**(`geoJson`): [`PathNode`](../interfaces/PathNode.md)[]

Extracts the path nodes of a path collection (segments are ignored).

## Parameters

### geoJson

[`PathFeatureCollection`](../interfaces/PathFeatureCollection.md)

## Returns

[`PathNode`](../interfaces/PathNode.md)[]

## Example

```typescript
import { extractPathNodesFromGeoJSON } from 'ubudu-rtls-sdk';

const nodes = extractPathNodesFromGeoJSON(await client.venues.listPaths());
```
