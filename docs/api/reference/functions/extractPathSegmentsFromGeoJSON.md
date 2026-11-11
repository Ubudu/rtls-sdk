[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / extractPathSegmentsFromGeoJSON

# Function: extractPathSegmentsFromGeoJSON()

> **extractPathSegmentsFromGeoJSON**(`geoJson`): [`PathSegment`](../interfaces/PathSegment.md)[]

Extracts the path segments of a path collection (nodes are ignored), with the stored property names.

## Parameters

### geoJson

[`PathFeatureCollection`](../interfaces/PathFeatureCollection.md)

## Returns

[`PathSegment`](../interfaces/PathSegment.md)[]

## Example

```typescript
import { extractPathSegmentsFromGeoJSON } from 'ubudu-rtls-sdk';

const segments = extractPathSegmentsFromGeoJSON(await client.venues.listPaths());
```
