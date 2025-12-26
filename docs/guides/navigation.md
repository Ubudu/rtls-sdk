# Navigation & Wayfinding Guide

This guide covers indoor navigation and wayfinding with the Ubudu RTLS SDK.

## Overview

The navigation system consists of:
- **POIs (Points of Interest)**: Named locations users can navigate to
- **Path Nodes**: Waypoints for routing
- **Path Segments**: Connections between nodes
- **Navigation API**: Route calculation

## Quick Reference

| Operation | Method | Returns |
|-----------|--------|---------|
| List POIs (GeoJSON) | `client.venues.listPois()` | `POIFeatureCollection` |
| List POIs (array) | `client.venues.listPoisAsArray()` | `POI[]` |
| List paths (GeoJSON) | `client.venues.listPaths()` | `PathFeatureCollection` |
| List path nodes | `client.venues.listPathNodes()` | `PathNode[]` |
| List path segments | `client.venues.listPathSegments()` | `PathSegment[]` |
| Nearest POIs | `client.spatial.nearestPois(opts)` | `NearestPoisResult` |
| POIs in radius | `client.spatial.poisWithinRadius(opts)` | `PoisWithinRadiusResult` |

> **Note:** All methods use the default namespace and venueId from client configuration. You can override per-call with `{ namespace: 'other', venueId: 456 }` or use explicit arguments for backward compatibility.

## Points of Interest (POIs)

### Listing POIs as GeoJSON

```typescript
import { createRtlsClient, type POIFeatureCollection } from 'ubudu-rtls-sdk';

// Configure with default namespace and venue
const client = createRtlsClient({
  apiKey: 'your-key',
  namespace: 'your-namespace',
  venueId: 123,
});

// Uses default namespace and venueId
const geoJson: POIFeatureCollection = await client.venues.listPois();

geoJson.features.forEach(feature => {
  console.log(`POI: ${feature.properties.name}`);
  console.log(`Location: ${feature.geometry.coordinates}`);
  console.log(`Level: ${feature.properties.level}`);
});
```

### Listing POIs as Array

```typescript
import { type POI } from 'ubudu-rtls-sdk';

// Uses default namespace and venueId
const pois: POI[] = await client.venues.listPoisAsArray();

pois.forEach(poi => {
  console.log(`${poi.name} at (${poi.lat}, ${poi.lng})`);
  console.log(`Tags: ${poi.tags.join(', ')}`);
});
```

### POIs for a Specific Map

```typescript
// Get POIs for a specific floor/map
// Uses default namespace and venueId, with specific mapId
const mapPois = await client.venues.listMapPoisAsArray({ mapId: 456 });
```

## Spatial POI Queries

### Find Nearest POIs

```typescript
// Uses default namespace
const result = await client.spatial.nearestPois({
  lat: 48.8566,
  lon: 2.3522,
  limit: 5,
  maxDistanceMeters: 500, // Optional
  level: 0 // Optional: filter by floor
});

console.log(`Found ${result.total_pois} POIs`);
result.pois.forEach(poi => {
  console.log(`${poi.name}: ${poi.distance_meters?.toFixed(1)}m`);
});
```

### Find POIs Within Radius

```typescript
// Uses default namespace
const result = await client.spatial.poisWithinRadius({
  lat: 48.8566,
  lon: 2.3522,
  radiusMeters: 100,
  level: 0 // Optional
});

console.log(`${result.total_pois} POIs within ${result.radius_meters}m`);
result.pois.forEach(poi => {
  console.log(`- ${poi.name}`);
});
```

## Navigation Paths

### Listing Paths as GeoJSON

The paths endpoint returns a GeoJSON FeatureCollection containing both path nodes (Points) and path segments (LineStrings):

```typescript
// Uses default namespace and venueId
const geoJson = await client.venues.listPaths();

const nodes = geoJson.features.filter(f => f.properties.type === 'path_node');
const segments = geoJson.features.filter(f => f.properties.type === 'path_segment');

console.log(`Nodes: ${nodes.length}, Segments: ${segments.length}`);
```

### Extracting Path Nodes

```typescript
import { type PathNode } from 'ubudu-rtls-sdk';

// Uses default namespace and venueId
const nodes: PathNode[] = await client.venues.listPathNodes();

nodes.forEach(node => {
  console.log(`Node ${node.id}: ${node.name}`);
  console.log(`Type: ${node.nodeType}`);
  console.log(`Location: (${node.lat}, ${node.lng})`);
  console.log(`Level: ${node.level}`);
  console.log(`Active: ${node.isActive}`);
});
```

### Extracting Path Segments

```typescript
import { type PathSegment } from 'ubudu-rtls-sdk';

// Uses default namespace and venueId
const segments: PathSegment[] = await client.venues.listPathSegments();

segments.forEach(segment => {
  console.log(`Segment ${segment.id}`);
  console.log(`From: ${segment.startNodeId} -> To: ${segment.endNodeId}`);
  console.log(`Bidirectional: ${segment.isBidirectional}`);
  console.log(`Weight: ${segment.weight}`);
  console.log(`Accessible: ${segment.isAccessible}`);
});
```

## Navigation API

The navigation API provides route calculation between points.

### Shortest Path

```typescript
// Uses default namespace
const route = await client.navigation.shortestPath({
  from: { lat: 48.8566, lon: 2.3522 },
  to: { lat: 48.8584, lon: 2.2945 },
  level: 0 // Optional: starting level
});

console.log(`Distance: ${route.total_distance_meters}m`);
console.log(`Duration: ${route.estimated_duration_seconds}s`);

route.path.forEach((node, i) => {
  console.log(`Step ${i + 1}: (${node.lat}, ${node.lon})`);
});
```

### Accessible Path

For wheelchair-accessible routing that avoids stairs:

```typescript
// Uses default namespace
const route = await client.navigation.accessiblePath({
  from: { lat: 48.8566, lon: 2.3522 },
  to: { lat: 48.8584, lon: 2.2945 }
});

// Route uses elevators and ramps instead of stairs
```

### Multi-Stop Route

Plan a route visiting multiple waypoints:

```typescript
// Uses default namespace
const route = await client.navigation.multiStop({
  origin: { lat: 48.8566, lon: 2.3522 },
  destinations: [
    { lat: 48.8570, lon: 2.3530 },
    { lat: 48.8575, lon: 2.3540 },
    { lat: 48.8580, lon: 2.3550 }
  ],
  optimize: true // Optimize visit order
});
```

## GeoJSON Extraction Utilities

The SDK provides helper functions to extract data from GeoJSON:

```typescript
import {
  extractPoisFromGeoJSON,
  extractPathNodesFromGeoJSON,
  extractPathSegmentsFromGeoJSON
} from 'ubudu-rtls-sdk';

// Fetch GeoJSON (uses default namespace and venueId)
const poisGeoJson = await client.venues.listPois();
const pathsGeoJson = await client.venues.listPaths();

// Extract as arrays
const pois = extractPoisFromGeoJSON(poisGeoJson);
const pathNodes = extractPathNodesFromGeoJSON(pathsGeoJson);
const pathSegments = extractPathSegmentsFromGeoJSON(pathsGeoJson);
```

## Common Patterns

### Find Nearest POI to an Asset

```typescript
// Uses default namespace from client
async function findNearestPoi(macAddress: string) {
  // Get asset's current position
  const position = await client.positions.getCached(macAddress);

  // Find nearest POI
  const result = await client.spatial.nearestPois({
    lat: position.lat,
    lon: position.lon,
    limit: 1
  });

  return result.pois[0] ?? null;
}
```

### Navigate to POI

```typescript
// Uses default namespace and venueId from client
async function navigateToPoi(fromLat: number, fromLon: number, poiId: number) {
  // Get POI details
  const pois = await client.venues.listPoisAsArray();
  const poi = pois.find(p => p.id === poiId);

  if (!poi) throw new Error('POI not found');

  // Calculate route
  const route = await client.navigation.shortestPath({
    from: { lat: fromLat, lon: fromLon },
    to: { lat: poi.lat, lon: poi.lng }
  });

  return route;
}
```

### Build Navigation Graph

```typescript
// Uses default namespace and venueId from client
async function buildNavigationGraph() {
  const nodes = await client.venues.listPathNodes();
  const segments = await client.venues.listPathSegments();

  // Create adjacency list
  const graph = new Map<number, { nodeId: number; weight: number }[]>();

  nodes.forEach(node => {
    graph.set(node.id, []);
  });

  segments.forEach(segment => {
    const edges = graph.get(segment.startNodeId) ?? [];
    edges.push({ nodeId: segment.endNodeId, weight: segment.weight });
    graph.set(segment.startNodeId, edges);

    // Add reverse edge if bidirectional
    if (segment.isBidirectional) {
      const reverseEdges = graph.get(segment.endNodeId) ?? [];
      reverseEdges.push({ nodeId: segment.startNodeId, weight: segment.weight });
      graph.set(segment.endNodeId, reverseEdges);
    }
  });

  return { nodes, graph };
}
```

### Multi-venue Navigation

```typescript
// Create venue-scoped clients
const venue1Client = client.forVenue(123);
const venue2Client = client.forVenue(456);

// Get POIs from different venues
const venue1Pois = await venue1Client.venues.listPoisAsArray();
const venue2Pois = await venue2Client.venues.listPoisAsArray();
```

## Error Handling

```typescript
import { RtlsError, NotFoundError, ContextError } from 'ubudu-rtls-sdk';

try {
  // Uses default namespace
  const route = await client.navigation.shortestPath({
    from: { lat: 0, lon: 0 },
    to: { lat: 1, lon: 1 }
  });
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log('No route found between points');
  } else if (error instanceof ContextError) {
    console.log(`Missing context: ${error.field}`);
  } else if (error instanceof RtlsError) {
    console.log(`Navigation error: ${error.message}`);
  }
}
```

## See Also

- [Getting Started](./getting-started.md)
- [Zone & Geofencing](./zone-geofencing.md)
- [Asset Tracking](./asset-tracking.md)
- [Migration Guide](./migration-v2.md)
