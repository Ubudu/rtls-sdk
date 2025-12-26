# API Reference

This document provides an overview of all SDK exports and their usage.

## Client

### `createRtlsClient(options?)`

Creates a new RTLS client instance.

```typescript
import { createRtlsClient } from 'ubudu-rtls-sdk';

const client = createRtlsClient({
  apiKey: 'your-api-key',
  baseUrl: 'https://rtls.ubudu.com/api', // optional
  timeoutMs: 30000, // optional
});
```

### `RtlsClient`

The main client class with all resource accessors.

**Methods:**
- `health()` - Check API health
- `getSettings(namespace)` - Get namespace settings
- `esQuery(namespace, dataType, query)` - Execute Elasticsearch query
- `sendTagActions(namespace, actions)` - Send tag LED/blink actions

**Resource Properties:**
- `client.assets` - AssetsResource
- `client.positions` - PositionsResource
- `client.venues` - VenuesResource
- `client.zones` - ZonesResource
- `client.spatial` - SpatialResource
- `client.alerts` - AlertsResource
- `client.dashboards` - DashboardsResource
- `client.navigation` - NavigationResource

## Resources

### AssetsResource

```typescript
// List assets
client.assets.list(namespace, options?)

// Get single asset
client.assets.get(namespace, macAddress)

// Create asset
client.assets.create(namespace, macAddress, data)

// Update asset
client.assets.update(namespace, macAddress, updates)

// Delete asset
client.assets.delete(namespace, macAddress)

// Batch operations
client.assets.batchSave(namespace, assets)
client.assets.batchDelete(namespace, macAddresses)

// History and stats
client.assets.getHistory(namespace, macAddress, { startTime, endTime })
client.assets.getStats(namespace, { startTime, endTime })

// Iteration
client.assets.iterate(namespace, options?)
client.assets.getAll(namespace, options?)
```

### PositionsResource

```typescript
// Cached positions
client.positions.listCached(namespace)
client.positions.getCached(namespace, macAddress)

// Last position
client.positions.getLast(namespace, macAddress)
client.positions.listLast(namespace, options?)

// History
client.positions.getHistory(namespace, { timestampFrom, timestampTo, key?, value })

// Publish
client.positions.publish(namespace, position, { patchAssetData? })
```

### VenuesResource

```typescript
// Venues
client.venues.list(namespace)
client.venues.get(namespace, venueId)
client.venues.iterate(namespace)

// Maps
client.venues.listMaps(namespace, venueId)

// POIs
client.venues.listPois(namespace, venueId)        // GeoJSON
client.venues.listPoisAsArray(namespace, venueId) // Array
client.venues.listMapPois(namespace, venueId, mapId)
client.venues.listMapPoisAsArray(namespace, venueId, mapId)

// Paths
client.venues.listPaths(namespace, venueId)        // GeoJSON
client.venues.listPathNodes(namespace, venueId)    // Array
client.venues.listPathSegments(namespace, venueId) // Array
```

### ZonesResource

```typescript
// Zones
client.zones.list(namespace, venueId)           // GeoJSON
client.zones.listAsArray(namespace, venueId)    // Array
client.zones.listByMap(namespace, venueId, mapId)
client.zones.listByMapAsArray(namespace, venueId, mapId)

// Presence
client.zones.getPresence(namespace, { timestampFrom, timestampTo, key?, value?, interval? })

// Iteration
client.zones.iterate(namespace, venueId)
client.zones.getAll(namespace, venueId)
```

### SpatialResource

```typescript
// Zone queries
client.spatial.zonesContainingPoint(namespace, { lat, lon, level? })
client.spatial.nearestZones(namespace, { lat, lon, limit?, maxDistanceMeters?, level? })
client.spatial.zonesWithinRadius(namespace, { lat, lon, radiusMeters, level? })
client.spatial.analyzeCustomZones(namespace, { reference_point, zones })

// POI queries
client.spatial.nearestPois(namespace, { lat, lon, limit?, maxDistanceMeters?, level? })
client.spatial.poisWithinRadius(namespace, { lat, lon, radiusMeters, level? })
client.spatial.analyzeCustomPois(namespace, { reference_point, pois })
```

### NavigationResource

```typescript
client.navigation.shortestPath(namespace, request)
client.navigation.accessiblePath(namespace, request)
client.navigation.multiStop(namespace, request)
```

### AlertsResource

```typescript
client.alerts.list(namespace, options?)
client.alerts.get(namespace, alertId)
client.alerts.create(namespace, alert)
client.alerts.update(namespace, alertId, updates)
client.alerts.delete(namespace, alertId)
```

### DashboardsResource

```typescript
client.dashboards.list(namespace)
client.dashboards.get(namespace, dashboardId)
client.dashboards.create(namespace, dashboard)
client.dashboards.update(namespace, dashboardId, updates)
client.dashboards.delete(namespace, dashboardId)
client.dashboards.share(namespace, dashboardId, permissions)
```

## Error Classes

```typescript
import {
  RtlsError,           // Base error class
  AuthenticationError, // 401
  AuthorizationError,  // 403
  NotFoundError,       // 404
  ValidationError,     // 400/422
  RateLimitError,      // 429
  TimeoutError,        // Request timeout
  NetworkError,        // Connection issues
  createError,         // Error factory
} from 'ubudu-rtls-sdk';
```

## Filter Utilities

```typescript
import { filters, filter, combineFilters } from 'ubudu-rtls-sdk';

// Predefined filters
filters.equals(field, value)
filters.notEquals(field, value)
filters.greaterThan(field, value)
filters.greaterThanOrEqual(field, value)
filters.lessThan(field, value)
filters.lessThanOrEqual(field, value)
filters.contains(field, value)
filters.startsWith(field, value)
filters.endsWith(field, value)
filters.matches(field, regex)
filters.in(field, values)
filters.notIn(field, values)
filters.exists(field, exists)
filters.between(field, min, max)
filters.size(field, size)
filters.all(field, values)
filters.elemMatch(field, value)

// Raw filter
filter(field, operator, value)

// Combine multiple filters
combineFilters(...filterObjects)
```

## GeoJSON Utilities

```typescript
import {
  extractZonesFromGeoJSON,
  extractPoisFromGeoJSON,
  extractPathNodesFromGeoJSON,
  extractPathSegmentsFromGeoJSON,
} from 'ubudu-rtls-sdk';
```

## Types

```typescript
import type {
  // Core types
  Asset,
  AssetPosition,
  CachedAssetPosition,
  Venue,
  Zone,
  POI,
  PathNode,
  PathSegment,
  MapData,
  Dashboard,
  AlertRule,
  NavigationResponse,
  HealthStatus,
  BatchSaveResult,
  BatchDeleteResult,

  // Pagination
  PaginatedResponse,
  QueryOptions,
  FilterOptions,
  FilterOperator,

  // GeoJSON
  GeoJSONPoint,
  GeoJSONPolygon,
  GeoJSONLineString,
  GeoJSONGeometry,
  GeoJSONFeature,
  GeoJSONFeatureCollection,
  ZoneFeature,
  ZoneFeatureCollection,
  POIFeature,
  POIFeatureCollection,
  PathFeature,
  PathFeatureCollection,

  // Spatial
  SpatialReferencePoint,
  ZonesContainingPointResult,
  NearestZonesResult,
  ZonesWithinRadiusResult,
  NearestPoisResult,
  PoisWithinRadiusResult,
  ZoneWithDistance,
  POIWithDistance,
} from 'ubudu-rtls-sdk';
```
