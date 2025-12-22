# API Schema Report

## Overview

This document details the actual API response schemas observed during integration testing, compared with SDK type definitions.

---

## Asset Schema

### Observed API Response
```typescript
interface Asset {
  user_udid: string;           // MAC address identifier
  user_name: string;           // Display name
  user_type: string;           // e.g., "ptl_ubudu"
  user_motion: string;         // e.g., "default"
  color: string;               // Hex color code
  model: string;               // e.g., "default"
  path: string;                // Category path
  tags: string[];              // Tag identifiers
  data: Record<string, unknown>; // Custom data
  createdBy: string;           // Creator namespace
  dateCreated: number;         // Unix timestamp (ms)
  targetApplications: string[]; // Target app namespaces
}
```

### SDK Type Status: **MATCH** ✓

---

## Position Schema

### Cached Position
```typescript
interface CachedPosition {
  user_udid: string;
  lat: number;
  lon: number;
  timestamp: number;
  level?: number;
  map_uuid?: string;
  accuracy?: number;
}
```

### Last Position (ES)
```typescript
interface LastPosition {
  user: {
    udid: string;
    name: string;
    type: string;
  };
  position: {
    lat: number;
    lon: number;
    level: number;
    accuracy: number;
  };
  map: {
    uuid: string;
    name: string;
  };
  zone?: {
    id: number;
    name: string;
  };
  timestamp: number;
}
```

### SDK Type Status: **PARTIAL MATCH** - ES positions have nested structure

---

## Venue Schema

### List Response (Array)
```typescript
interface VenueListItem {
  id: number;
  name: string;
  address: string;
  coordinates: {
    lat: number;
    lng: number;  // Note: 'lng' not 'lon'
  };
  hasMetadata: boolean;
  lastUpdated: string;  // ISO date
  statistics: {
    zones: number;
    pois: number;
    pathNodes: number;
    pathSegments: number;
    floors: number[];
  };
}
```

### Single Venue Response
```typescript
interface VenueDetail extends VenueListItem {
  metadata: {
    externalVenueId: number;
    applicationNamespace: string;
    createdAt: string;
    updatedAt: string;
    isActive: boolean;
    timezone: string;
    openingHours: {
      week: Record<string, string>;
      specificDays: Record<string, string>;
    };
    context: {
      description: string;
      venueType: string;
      primaryActivities: string;
    };
    statistics: {
      totalZones: number;
      totalPOIs: number;
      totalPathNodes: number;
      totalPathSegments: number;
      floors: number[];
      lastDataSync: string;
    };
  };
}
```

### SDK Type Status: **PARTIAL MATCH** - Detailed metadata structure not typed

---

## Zone Schema

### API Response: GeoJSON FeatureCollection
```typescript
interface ZoneFeatureCollection {
  type: 'FeatureCollection';
  features: ZoneFeature[];
  metadata: {
    type: 'zones';
    count: number;
    timestamp: string;  // ISO date
  };
}

interface ZoneFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];  // GeoJSON coordinates
  };
  properties: {
    id: number;
    name: string;
    level: number;
    rgb_color: string;  // Note: 'rgb_color' not 'color'
    tags: string[];
    type: 'map_zone' | string;
  };
}
```

### SDK Type Status: **MISMATCH** ❌
- SDK expects `PaginatedResponse<Zone>`
- API returns GeoJSON FeatureCollection

---

## POI Schema

### API Response: GeoJSON FeatureCollection
```typescript
interface POIFeatureCollection {
  type: 'FeatureCollection';
  features: POIFeature[];
  metadata: {
    type: 'pois';
    count: number;
    timestamp: string;
  };
}

interface POIFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];  // [lon, lat]
  };
  properties: {
    id: number;
    name: string;
    description: string;
    level: number;
    color: string;
    tags: string[];
    _id: string;  // MongoDB ObjectId
    coordinates: {
      lat: number;
      lng: number;
    };
    createdAt: string;
    externalApplicationId: number;
    externalId: number;
    externalVenueId: number;
    index: number;
    updatedAt: string;
  };
}
```

### SDK Type Status: **MISMATCH** ❌
- SDK expects `PaginatedResponse<POI>`
- API returns GeoJSON FeatureCollection

---

## Path Schema

### API Response: GeoJSON FeatureCollection
```typescript
interface PathFeatureCollection {
  type: 'FeatureCollection';
  features: (PathNodeFeature | PathSegmentFeature)[];
  metadata: {
    type: 'paths';
    timestamp: string;
  };
}

interface PathNodeFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    id: number;
    external_id: number;
    type: 'path_node';
    node_type: 'waypoint' | 'entrance' | 'exit' | 'elevator' | 'stairs';
    name: string;
    level: number;
    is_active: boolean;
    cross_level_connections: number[];
    tags: string[];
  };
}

interface PathSegmentFeature {
  type: 'Feature';
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  properties: {
    id: number;
    type: 'path_segment';
    start_node_id: number;
    end_node_id: number;
    is_bidirectional: boolean;
    weight: number;
    level: number;
  };
}
```

### SDK Type Status: **MISMATCH** ❌
- SDK expects `PaginatedResponse`
- API returns GeoJSON FeatureCollection

---

## Map Schema

### Observed (Empty Response)
```typescript
interface MapData {
  id: number;
  name: string;
  level: number;
  image_url?: string;
  bounds?: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  width?: number;
  height?: number;
}
```

### SDK Type Status: **UNVERIFIED** - No maps in test data

---

## Dashboard Schema

### API Response
```typescript
interface Dashboard {
  _id: string;  // MongoDB ObjectId
  name: string;
  description: string;
  application_namespace: string;  // Not 'namespace'
  data: DashboardWidget[];
  created_at: string;  // ISO date
  created_by: string;  // Username
  shared_with: SharedUser[];
  selected_by: string[];  // Usernames
  updated_at: string;
  __v: number;  // MongoDB version key
  selected: boolean;  // For current user
  can_edit: boolean;  // Permission flag
}

interface DashboardWidget {
  category: string;
  is: string;  // Component name
  name: string;
  title: string;
  w: number;  // Width in grid units
  h: number;  // Height in grid units
  filters: DashboardFilter[];
  metrics: {
    aggregation: string;
    field: string;
    model: string | null;
  };
  buckets: {
    aggregation: string | null;
    field: string | null;
    model: string | null;
    interval: string | null;
  };
}
```

### SDK Type Status: **PARTIAL MATCH**
- Field name mismatch: `namespace` vs `application_namespace`
- Widget structure not fully typed

---

## Alert Rule Schema

### Observed
```typescript
interface AlertRule {
  id: string;
  name: string;
  type: 'zone_enter' | 'zone_exit' | 'battery_low' | string;
  enabled: boolean;
  zone_id?: number;
  threshold?: number;
  actions: AlertAction[];
  created_at: string;
  updated_at: string;
}

interface AlertAction {
  type: 'webhook' | 'email' | 'sms' | string;
  url?: string;
  recipients?: string[];
  template?: string;
}
```

### SDK Type Status: **UNVERIFIED** - No rules in test data

---

## Spatial Response Schemas

### Zones Containing Point
```typescript
interface ZonesContainingPointResponse {
  reference_point: {
    lat: number;
    lon: number;
  };
  level: number | null;
  containing_zones: Zone[];  // Empty in test
  total: number;
}
```

### Nearest Zones
```typescript
interface NearestZonesResponse {
  reference_point: {
    lat: number;
    lon: number;
  };
  level: number | null;
  max_distance_meters: number | null;
  total_zones: number;
  zones: Zone[];  // With distance property
  hasMore: boolean;
}
```

### Zones Within Radius
```typescript
interface ZonesWithinRadiusResponse {
  reference_point: {
    lat: number;
    lon: number;
  };
  radius_meters: number;
  level: number | null;
  total_zones: number;
  zones: Zone[];
}
```

### SDK Type Status: **MISMATCH** ❌
- SDK expects arrays
- API returns structured objects

---

## Error Response Schemas

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Invalid API key"
}
```

### 404 Not Found
```json
{
  "error": "Not Found",
  "message": "Resource not found"
}
```

### 422 Validation Error
```json
{
  "error": "Validation Error",
  "message": "Invalid dashboard ID"
}
```

### 500 Server Error
```json
{
  "error": "Internal Server Error",
  "message": "An unexpected error occurred"
}
```

---

## Type Definition Recommendations

### New Types Needed

```typescript
// GeoJSON support
export interface GeoJSONFeatureCollection<P = Record<string, unknown>> {
  type: 'FeatureCollection';
  features: GeoJSONFeature<P>[];
  metadata?: Record<string, unknown>;
}

export interface GeoJSONFeature<P = Record<string, unknown>> {
  type: 'Feature';
  geometry: GeoJSONGeometry;
  properties: P;
}

export type GeoJSONGeometry =
  | { type: 'Point'; coordinates: [number, number] }
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'LineString'; coordinates: [number, number][] };

// Zone feature properties
export interface ZoneProperties {
  id: number;
  name: string;
  level: number;
  rgb_color: string;
  tags: string[];
  type: string;
}

// POI feature properties
export interface POIProperties {
  id: number;
  name: string;
  description: string;
  level: number;
  color: string;
  tags: string[];
  coordinates: { lat: number; lng: number };
}

// Spatial response types
export interface SpatialQueryResult<T> {
  reference_point: { lat: number; lon: number };
  level: number | null;
  hasMore?: boolean;
}

export interface ZoneSpatialResult extends SpatialQueryResult<Zone> {
  total_zones: number;
  zones: Zone[];
}

export interface POISpatialResult extends SpatialQueryResult<POI> {
  total_pois: number;
  pois: POI[];
}
```

---

## Summary

| Resource | List Response | SDK Match |
|----------|---------------|-----------|
| Assets | Array | ❌ Expects Paginated |
| Positions (Cached) | Array | ✓ |
| Positions (ES) | Array | ✓ |
| Venues | Array or Paginated | ⚠️ Inconsistent |
| Zones | GeoJSON | ❌ Expects Paginated |
| POIs | GeoJSON | ❌ Expects Paginated |
| Paths | GeoJSON | ❌ Expects Paginated |
| Maps | Array | ✓ |
| Dashboards | Array | ✓ |
| Alert Rules | Array | ✓ |
| Spatial Zones | Object | ❌ Expects Array |
| Spatial POIs | Object | ❌ Expects Array |
