[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / extractZonesFromGeoJSON

# Function: extractZonesFromGeoJSON()

> **extractZonesFromGeoJSON**(`geoJson`): [`Zone`](../interfaces/Zone.md)[]

Extracts flat [Zone](../interfaces/Zone.md) objects from a zone collection (`color` from `rgb_color`, `geometry` kept).

## Parameters

### geoJson

[`ZoneFeatureCollection`](../interfaces/ZoneFeatureCollection.md)

## Returns

[`Zone`](../interfaces/Zone.md)[]

## Example

```typescript
import { extractZonesFromGeoJSON } from 'ubudu-rtls-sdk';

const zones = extractZonesFromGeoJSON(await client.zones.list());
```
