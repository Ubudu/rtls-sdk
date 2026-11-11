[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / extractPoisFromGeoJSON

# Function: extractPoisFromGeoJSON()

> **extractPoisFromGeoJSON**(`geoJson`): [`POI`](../interfaces/POI.md)[]

Extracts flat [POI](../interfaces/POI.md) objects from a POI collection (`[lon, lat]` → `lat`/`lng`; missing `tags` → `[]`).

## Parameters

### geoJson

[`POIFeatureCollection`](../interfaces/POIFeatureCollection.md)

## Returns

[`POI`](../interfaces/POI.md)[]

## Example

```typescript
import { extractPoisFromGeoJSON } from 'ubudu-rtls-sdk';

const pois = extractPoisFromGeoJSON(await client.venues.listPois());
```
