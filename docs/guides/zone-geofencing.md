# Zone & Geofencing Guide

This guide covers zone management and geofencing with the Ubudu RTLS SDK.

## Overview

Zones are geographic areas within venues that can be used for geofencing, presence detection, and spatial queries. The API returns zones as GeoJSON FeatureCollections.

## Quick Reference

| Operation | Method | Returns |
|-----------|--------|---------|
| List zones (GeoJSON) | `client.zones.list(ns, venueId)` | `ZoneFeatureCollection` |
| List zones (array) | `client.zones.listAsArray(ns, venueId)` | `Zone[]` |
| Zones containing point | `client.spatial.zonesContainingPoint(ns, opts)` | `ZonesContainingPointResult` |
| Nearest zones | `client.spatial.nearestZones(ns, opts)` | `NearestZonesResult` |
| Zones within radius | `client.spatial.zonesWithinRadius(ns, opts)` | `ZonesWithinRadiusResult` |
| Zone presence | `client.zones.getPresence(ns, opts)` | `Record[]` |

## Listing Zones

### As GeoJSON FeatureCollection

```typescript
import { createRtlsClient, type ZoneFeatureCollection } from '@ubudu/rtls-sdk';

const client = createRtlsClient({ apiKey: 'your-key' });

const geoJson: ZoneFeatureCollection = await client.zones.list('namespace', venueId);

console.log(`Type: ${geoJson.type}`); // "FeatureCollection"
console.log(`Zones: ${geoJson.features.length}`);

// Access individual features
geoJson.features.forEach(feature => {
  console.log(`Zone: ${feature.properties.name}`);
  console.log(`Geometry: ${feature.geometry.type}`); // "Polygon"
});
```

### As Flat Array

```typescript
import { type Zone } from '@ubudu/rtls-sdk';

const zones: Zone[] = await client.zones.listAsArray('namespace', venueId);

zones.forEach(zone => {
  console.log(`${zone.name} (ID: ${zone.id})`);
  console.log(`Level: ${zone.level}, Color: ${zone.color}`);
});
```

### Extracting from GeoJSON

```typescript
import { extractZonesFromGeoJSON } from '@ubudu/rtls-sdk';

const geoJson = await client.zones.list('namespace', venueId);
const zones = extractZonesFromGeoJSON(geoJson);

// zones is Zone[] with flattened properties
```

## Spatial Queries

### Zones Containing a Point

Find all zones that contain a specific geographic point:

```typescript
const result = await client.spatial.zonesContainingPoint('namespace', {
  lat: 48.8566,
  lon: 2.3522,
  level: 0 // Optional: filter by floor level
});

console.log(`Reference: (${result.reference_point.lat}, ${result.reference_point.lon})`);
console.log(`Found: ${result.total} zones`);

result.containing_zones.forEach(zone => {
  console.log(`- ${zone.name} (ID: ${zone.id})`);
});
```

### Nearest Zones

Find zones closest to a point:

```typescript
const result = await client.spatial.nearestZones('namespace', {
  lat: 48.8566,
  lon: 2.3522,
  limit: 5,
  maxDistanceMeters: 1000, // Optional: maximum distance
  level: 0 // Optional: filter by floor level
});

console.log(`Total zones: ${result.total_zones}`);
console.log(`Has more: ${result.hasMore}`);

result.zones.forEach(zone => {
  console.log(`${zone.name}: ${zone.distance_meters?.toFixed(1)}m`);
});
```

### Zones Within Radius

Find all zones within a specified distance:

```typescript
const result = await client.spatial.zonesWithinRadius('namespace', {
  lat: 48.8566,
  lon: 2.3522,
  radiusMeters: 500,
  level: 0 // Optional: filter by floor level
});

console.log(`Radius: ${result.radius_meters}m`);
console.log(`Found: ${result.total_zones} zones`);

result.zones.forEach(zone => {
  console.log(`- ${zone.name}`);
});
```

## Zone Presence

Track asset presence in zones over time:

```typescript
const endTime = Date.now();
const startTime = endTime - 24 * 60 * 60 * 1000; // Last 24 hours

const presence = await client.zones.getPresence('namespace', {
  timestampFrom: startTime,
  timestampTo: endTime,
  interval: '1h', // Aggregation interval
  key: 'zone.id',
  value: '123', // Optional: filter by zone ID
});

presence.forEach(record => {
  console.log(record);
});
```

## Iterating Zones

For processing all zones:

```typescript
for await (const zone of client.zones.iterate('namespace', venueId)) {
  console.log(`Processing: ${zone.name}`);
  // Handle each zone
}
```

## Working with GeoJSON

### Zone Feature Structure

```typescript
interface ZoneFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  properties: {
    id: number;
    name: string;
    level: number;
    rgb_color: string;
    zone_type?: string;
    metadata?: Record<string, unknown>;
  };
}
```

### Converting Coordinates

```typescript
// GeoJSON uses [longitude, latitude] order
const polygon = geoJson.features[0].geometry.coordinates[0];

polygon.forEach(coord => {
  const lon = coord[0];
  const lat = coord[1];
  console.log(`Point: (${lat}, ${lon})`);
});
```

## Common Patterns

### Find Assets in a Zone

```typescript
async function getAssetsInZone(namespace: string, zoneId: number) {
  // Get all cached positions
  const positions = await client.positions.listCached(namespace);

  // Get the zone
  const zones = await client.zones.listAsArray(namespace, venueId);
  const zone = zones.find(z => z.id === zoneId);

  if (!zone) return [];

  // Filter positions that are in the zone
  // (You would need a point-in-polygon library for accurate results)
  return positions.filter(pos => {
    // Implement point-in-polygon check
    return isPointInZone(pos.lat, pos.lon, zone.geometry);
  });
}
```

### Zone Entry/Exit Detection

```typescript
// Track zone transitions using presence data
const presence = await client.zones.getPresence('namespace', {
  timestampFrom: Date.now() - 3600000,
  timestampTo: Date.now(),
  interval: '1m',
});

// Process presence changes
let previousZones = new Set<number>();
presence.forEach(record => {
  const currentZones = new Set(record.zones as number[]);

  // Detect entries
  for (const zoneId of currentZones) {
    if (!previousZones.has(zoneId)) {
      console.log(`Entry into zone ${zoneId}`);
    }
  }

  // Detect exits
  for (const zoneId of previousZones) {
    if (!currentZones.has(zoneId)) {
      console.log(`Exit from zone ${zoneId}`);
    }
  }

  previousZones = currentZones;
});
```

## Error Handling

```typescript
import { RtlsError, NotFoundError } from '@ubudu/rtls-sdk';

try {
  const result = await client.spatial.zonesContainingPoint('namespace', {
    lat: 0,
    lon: 0,
  });
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log('Venue not found');
  } else if (error instanceof RtlsError) {
    console.log(`API error: ${error.status} - ${error.message}`);
  }
}
```

## See Also

- [Getting Started](./getting-started.md)
- [Asset Tracking](./asset-tracking.md)
- [Navigation](./navigation.md)
