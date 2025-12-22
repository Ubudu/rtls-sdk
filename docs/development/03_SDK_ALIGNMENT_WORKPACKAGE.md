# SDK Alignment Work Package

## Overview

This work package aligns the TypeScript SDK implementation with the actual RTLS API behavior discovered during API validation testing. The changes introduce **breaking changes** requiring a major version bump.

**Version Target**: 1.0.0 (major release)

**Prerequisites**:
- Node.js >= 18
- npm installed
- `.env` file with `APP_NAMESPACE` and `RTLS_API_KEY` for integration tests

---

## Summary of Changes

| Category | Change | Impact |
|----------|--------|--------|
| Response Formats | Handle direct arrays instead of PaginatedResponse | Breaking |
| GeoJSON Support | Zones/POIs/Paths return native GeoJSON FeatureCollection | Breaking |
| Spatial Responses | Return structured objects with metadata | Breaking |
| Dashboard Create | Fix field name `namespace` → `application_namespace` | Breaking |
| Type Definitions | Add proper GeoJSON and spatial result types | Non-breaking |
| Utility Methods | Add `listAsArray()` convenience methods | Non-breaking |

---

## Phase 1: Type Definitions

Add proper TypeScript types for GeoJSON and spatial responses.

### Task 1.1: Create GeoJSON Type Definitions

**File**: `src/types/geojson.ts` (new file)

**Implementation**:
```typescript
// GeoJSON geometry types
export interface GeoJSONPoint {
  type: 'Point';
  coordinates: [number, number]; // [lon, lat]
}

export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface GeoJSONLineString {
  type: 'LineString';
  coordinates: [number, number][];
}

export type GeoJSONGeometry = GeoJSONPoint | GeoJSONPolygon | GeoJSONLineString;

// Generic feature and collection
export interface GeoJSONFeature<G extends GeoJSONGeometry, P = Record<string, unknown>> {
  type: 'Feature';
  geometry: G;
  properties: P;
}

export interface GeoJSONFeatureCollection<F extends GeoJSONFeature<GeoJSONGeometry>> {
  type: 'FeatureCollection';
  features: F[];
  metadata?: {
    type: string;
    count: number;
    timestamp: string;
  };
}
```

**Verification**:
```bash
npm run typecheck
```

---

### Task 1.2: Create Zone Feature Types

**File**: `src/types/geojson.ts` (append)

**Implementation**:
```typescript
// Zone-specific types
export interface ZoneProperties {
  id: number;
  name: string;
  level: number;
  rgb_color: string;
  tags: string[];
  type: string;
}

export type ZoneFeature = GeoJSONFeature<GeoJSONPolygon, ZoneProperties>;

export interface ZoneFeatureCollection extends GeoJSONFeatureCollection<ZoneFeature> {
  metadata: {
    type: 'zones';
    count: number;
    timestamp: string;
  };
}
```

**Verification**:
```bash
npm run typecheck
```

---

### Task 1.3: Create POI Feature Types

**File**: `src/types/geojson.ts` (append)

**Implementation**:
```typescript
// POI-specific types
export interface POIProperties {
  id: number;
  name: string;
  description: string;
  level: number;
  color: string;
  tags: string[];
  _id: string;
  coordinates: { lat: number; lng: number };
  createdAt: string;
  updatedAt: string;
  externalId: number;
  externalVenueId: number;
  externalApplicationId: number;
  index: number;
}

export type POIFeature = GeoJSONFeature<GeoJSONPoint, POIProperties>;

export interface POIFeatureCollection extends GeoJSONFeatureCollection<POIFeature> {
  metadata: {
    type: 'pois';
    count: number;
    timestamp: string;
  };
}
```

**Verification**:
```bash
npm run typecheck
```

---

### Task 1.4: Create Path Feature Types

**File**: `src/types/geojson.ts` (append)

**Implementation**:
```typescript
// Path node types
export interface PathNodeProperties {
  id: number;
  external_id: number;
  type: 'path_node';
  node_type: 'waypoint' | 'entrance' | 'exit' | 'elevator' | 'stairs';
  name: string;
  level: number;
  is_active: boolean;
  cross_level_connections: number[];
  tags: string[];
}

export type PathNodeFeature = GeoJSONFeature<GeoJSONPoint, PathNodeProperties>;

// Path segment types
export interface PathSegmentProperties {
  id: number;
  type: 'path_segment';
  start_node_id: number;
  end_node_id: number;
  is_bidirectional: boolean;
  weight: number;
  level: number;
}

export type PathSegmentFeature = GeoJSONFeature<GeoJSONLineString, PathSegmentProperties>;

export type PathFeature = PathNodeFeature | PathSegmentFeature;

export interface PathFeatureCollection extends GeoJSONFeatureCollection<PathFeature> {
  metadata: {
    type: 'paths';
    timestamp: string;
  };
}
```

**Verification**:
```bash
npm run typecheck
```

---

### Task 1.5: Create Spatial Response Types

**File**: `src/types/spatial.ts` (new file)

**Implementation**:
```typescript
import type { ZoneProperties, POIProperties } from './geojson';

// Base spatial query result
export interface SpatialReferencePoint {
  lat: number;
  lon: number;
}

// Zone spatial query results
export interface ZonesContainingPointResult {
  reference_point: SpatialReferencePoint;
  level: number | null;
  containing_zones: ZoneWithDistance[];
  total: number;
}

export interface NearestZonesResult {
  reference_point: SpatialReferencePoint;
  level: number | null;
  max_distance_meters: number | null;
  total_zones: number;
  zones: ZoneWithDistance[];
  hasMore: boolean;
}

export interface ZonesWithinRadiusResult {
  reference_point: SpatialReferencePoint;
  radius_meters: number;
  level: number | null;
  total_zones: number;
  zones: ZoneWithDistance[];
}

// POI spatial query results
export interface NearestPoisResult {
  reference_point: SpatialReferencePoint;
  level: number | null;
  max_distance_meters: number | null;
  total_pois: number;
  pois: POIWithDistance[];
  hasMore: boolean;
}

export interface PoisWithinRadiusResult {
  reference_point: SpatialReferencePoint;
  radius_meters: number;
  level: number | null;
  total_pois: number;
  pois: POIWithDistance[];
}

// Zone/POI with distance field
export interface ZoneWithDistance extends ZoneProperties {
  distance_meters?: number;
  geometry?: {
    type: 'Polygon';
    coordinates: number[][][];
  };
}

export interface POIWithDistance extends POIProperties {
  distance_meters?: number;
  geometry?: {
    type: 'Point';
    coordinates: [number, number];
  };
}

// Analyze custom request types
export interface AnalyzeCustomZonesRequest {
  reference_point: SpatialReferencePoint;
  zones: Array<{
    type: 'Feature';
    geometry: { type: 'Polygon'; coordinates: number[][][] };
    properties?: Record<string, unknown>;
  }>;
}

export interface AnalyzeCustomPoisRequest {
  reference_point: SpatialReferencePoint;
  pois: Array<{
    type: 'Feature';
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties?: Record<string, unknown>;
  }>;
}
```

**Verification**:
```bash
npm run typecheck
```

---

### Task 1.6: Update Main Types Export

**File**: `src/types.ts`

**Changes**:
1. Add exports for new type modules
2. Add `Zone`, `POI`, `Path` flat types for convenience methods

**Implementation** (add to end of file):
```typescript
// GeoJSON types
export * from './types/geojson';

// Spatial response types
export * from './types/spatial';

// Flat zone type (extracted from GeoJSON feature)
export interface Zone {
  id: number;
  name: string;
  level: number;
  color: string; // Mapped from rgb_color
  tags: string[];
  type: string;
  geometry?: {
    type: 'Polygon';
    coordinates: number[][][];
  };
}

// Flat POI type (extracted from GeoJSON feature)
export interface POI {
  id: number;
  name: string;
  description: string;
  level: number;
  color: string;
  tags: string[];
  lat: number;
  lng: number;
}

// Flat path node type
export interface PathNode {
  id: number;
  externalId: number;
  nodeType: 'waypoint' | 'entrance' | 'exit' | 'elevator' | 'stairs';
  name: string;
  level: number;
  isActive: boolean;
  crossLevelConnections: number[];
  tags: string[];
  lat: number;
  lng: number;
}

// Flat path segment type
export interface PathSegment {
  id: number;
  startNodeId: number;
  endNodeId: number;
  isBidirectional: boolean;
  weight: number;
  level: number;
  coordinates: [number, number][];
}
```

**Verification**:
```bash
npm run typecheck
```

---

### Task 1.7: Create Types Directory Index

**File**: `src/types/index.ts` (new file)

**Implementation**:
```typescript
export * from './geojson';
export * from './spatial';
```

**Verification**:
```bash
npm run typecheck
```

---

## Phase 2: Response Utilities

Create utilities for handling different response formats.

### Task 2.1: Create Response Normalizer

**File**: `src/utils/response.ts` (new file)

**Implementation**:
```typescript
import type { PaginatedResponse } from '../types';

/**
 * Normalizes API responses that may be arrays or paginated objects.
 * Converts direct arrays to PaginatedResponse format for consistency.
 */
export function normalizeListResponse<T>(
  response: T[] | PaginatedResponse<T>
): PaginatedResponse<T> {
  if (Array.isArray(response)) {
    return {
      data: response,
      page: 1,
      limit: response.length,
      total: response.length,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    };
  }
  return response;
}

/**
 * Checks if response is a direct array (not paginated).
 */
export function isArrayResponse<T>(
  response: T[] | PaginatedResponse<T>
): response is T[] {
  return Array.isArray(response);
}

/**
 * Extracts data array from either format.
 */
export function extractDataArray<T>(
  response: T[] | PaginatedResponse<T>
): T[] {
  return Array.isArray(response) ? response : response.data;
}
```

**Verification**:
```bash
npm run typecheck
```

---

### Task 2.2: Create GeoJSON Extractor Utilities

**File**: `src/utils/geojson.ts` (new file)

**Implementation**:
```typescript
import type {
  ZoneFeatureCollection,
  ZoneFeature,
  POIFeatureCollection,
  POIFeature,
  PathFeatureCollection,
  PathNodeFeature,
  PathSegmentFeature,
} from '../types/geojson';
import type { Zone, POI, PathNode, PathSegment } from '../types';

/**
 * Extracts flat Zone objects from GeoJSON FeatureCollection.
 */
export function extractZonesFromGeoJSON(geoJson: ZoneFeatureCollection): Zone[] {
  return geoJson.features.map((feature: ZoneFeature) => ({
    id: feature.properties.id,
    name: feature.properties.name,
    level: feature.properties.level,
    color: feature.properties.rgb_color,
    tags: feature.properties.tags,
    type: feature.properties.type,
    geometry: feature.geometry,
  }));
}

/**
 * Extracts flat POI objects from GeoJSON FeatureCollection.
 */
export function extractPoisFromGeoJSON(geoJson: POIFeatureCollection): POI[] {
  return geoJson.features.map((feature: POIFeature) => ({
    id: feature.properties.id,
    name: feature.properties.name,
    description: feature.properties.description,
    level: feature.properties.level,
    color: feature.properties.color,
    tags: feature.properties.tags,
    lat: feature.geometry.coordinates[1],
    lng: feature.geometry.coordinates[0],
  }));
}

/**
 * Extracts path nodes from GeoJSON FeatureCollection.
 */
export function extractPathNodesFromGeoJSON(geoJson: PathFeatureCollection): PathNode[] {
  return geoJson.features
    .filter((f): f is PathNodeFeature => f.properties.type === 'path_node')
    .map((feature) => ({
      id: feature.properties.id,
      externalId: feature.properties.external_id,
      nodeType: feature.properties.node_type,
      name: feature.properties.name,
      level: feature.properties.level,
      isActive: feature.properties.is_active,
      crossLevelConnections: feature.properties.cross_level_connections,
      tags: feature.properties.tags,
      lat: feature.geometry.coordinates[1],
      lng: feature.geometry.coordinates[0],
    }));
}

/**
 * Extracts path segments from GeoJSON FeatureCollection.
 */
export function extractPathSegmentsFromGeoJSON(geoJson: PathFeatureCollection): PathSegment[] {
  return geoJson.features
    .filter((f): f is PathSegmentFeature => f.properties.type === 'path_segment')
    .map((feature) => ({
      id: feature.properties.id,
      startNodeId: feature.properties.start_node_id,
      endNodeId: feature.properties.end_node_id,
      isBidirectional: feature.properties.is_bidirectional,
      weight: feature.properties.weight,
      level: feature.properties.level,
      coordinates: feature.geometry.coordinates,
    }));
}
```

**Verification**:
```bash
npm run typecheck
```

---

### Task 2.3: Update Utils Index

**File**: `src/utils/index.ts`

**Changes**: Add exports for new utilities

**Implementation** (append to file):
```typescript
export * from './response';
export * from './geojson';
```

**Verification**:
```bash
npm run typecheck
```

---

## Phase 3: Update Zones Resource

Update the zones resource to return GeoJSON natively with array convenience method.

### Task 3.1: Update Zones List Method

**File**: `src/resources/zones.ts`

**Changes**:
1. Change `list()` return type to `ZoneFeatureCollection`
2. Add `listAsArray()` convenience method
3. Remove broken `iterate()` and `getAll()` methods (will add back with proper implementation)

**Implementation**:
```typescript
import { BaseClient, type RequestOptions } from '../client/base';
import type { ZoneFeatureCollection, Zone } from '../types';
import { extractZonesFromGeoJSON } from '../utils/geojson';

export interface ZonePresenceOptions {
  timestampFrom: number;
  timestampTo: number;
  key?: string;
  value?: string;
  interval?: string;
}

export class ZonesResource {
  constructor(private client: BaseClient) {}

  /**
   * List zones for a venue as GeoJSON FeatureCollection.
   * @returns GeoJSON FeatureCollection with zone polygons
   */
  async list(
    namespace: string,
    venueId: string | number,
    requestOptions?: RequestOptions
  ): Promise<ZoneFeatureCollection> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}/{venueId}/zones', {
          params: {
            path: { namespace, venueId: String(venueId) },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<ZoneFeatureCollection>;
  }

  /**
   * List zones for a venue as flat array.
   * Convenience method that extracts properties from GeoJSON features.
   * @returns Array of Zone objects
   */
  async listAsArray(
    namespace: string,
    venueId: string | number,
    requestOptions?: RequestOptions
  ): Promise<Zone[]> {
    const geoJson = await this.list(namespace, venueId, requestOptions);
    return extractZonesFromGeoJSON(geoJson);
  }

  /**
   * List zones for a specific map as GeoJSON FeatureCollection.
   */
  async listByMap(
    namespace: string,
    venueId: string | number,
    mapId: string | number,
    requestOptions?: RequestOptions
  ): Promise<ZoneFeatureCollection> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}/{venueId}/maps/{mapId}/zones', {
          params: {
            path: { namespace, venueId: Number(venueId), mapId: Number(mapId) },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<ZoneFeatureCollection>;
  }

  /**
   * List zones for a specific map as flat array.
   */
  async listByMapAsArray(
    namespace: string,
    venueId: string | number,
    mapId: string | number,
    requestOptions?: RequestOptions
  ): Promise<Zone[]> {
    const geoJson = await this.listByMap(namespace, venueId, mapId, requestOptions);
    return extractZonesFromGeoJSON(geoJson);
  }

  /**
   * Get zone presence data from Elasticsearch.
   */
  async getPresence(
    namespace: string,
    options: ZonePresenceOptions,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/es/zone_presence/{appNamespace}', {
          params: {
            path: { appNamespace: namespace },
            query: {
              timestampFrom: String(options.timestampFrom),
              timestampTo: String(options.timestampTo),
              key: options.key,
              value: options.value,
              interval: options.interval,
            },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>[]>;
  }

  /**
   * Get all zones as async generator.
   * Since API returns all zones at once (no pagination), yields all in one batch.
   */
  async *iterate(
    namespace: string,
    venueId: string | number,
    requestOptions?: RequestOptions
  ): AsyncGenerator<Zone, void, unknown> {
    const zones = await this.listAsArray(namespace, venueId, requestOptions);
    for (const zone of zones) {
      yield zone;
    }
  }

  /**
   * Get all zones as array.
   * Convenience method equivalent to listAsArray.
   */
  async getAll(
    namespace: string,
    venueId: string | number,
    requestOptions?: RequestOptions
  ): Promise<Zone[]> {
    return this.listAsArray(namespace, venueId, requestOptions);
  }
}
```

**Verification**:
```bash
npm run typecheck
npm run test
```

---

## Phase 4: Update Venues Resource

Update venues resource for POIs and Paths to return GeoJSON.

### Task 4.1: Update Venues List POIs Method

**File**: `src/resources/venues.ts`

**Changes**:
1. Change `listPois()` to return `POIFeatureCollection`
2. Add `listPoisAsArray()` method
3. Update `listMapPois()` similarly

**Full Implementation** (replace entire file):
```typescript
import { BaseClient, type RequestOptions } from '../client/base';
import type {
  POIFeatureCollection,
  PathFeatureCollection,
  POI,
  PathNode,
  PathSegment,
} from '../types';
import {
  extractPoisFromGeoJSON,
  extractPathNodesFromGeoJSON,
  extractPathSegmentsFromGeoJSON,
  extractDataArray,
} from '../utils';

export class VenuesResource {
  constructor(private client: BaseClient) {}

  /**
   * List all venues for a namespace.
   * API returns direct array, not paginated.
   */
  async list(
    namespace: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    const response = await this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}', {
          params: { path: { namespace } },
          ...fetchOpts,
        }),
      requestOptions
    );
    return extractDataArray(response as Record<string, unknown>[] | { data: Record<string, unknown>[] });
  }

  /**
   * Get a single venue by ID.
   */
  async get(
    namespace: string,
    venueId: string | number,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}/{venueId}', {
          params: { path: { namespace, venueId: Number(venueId) } },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>>;
  }

  /**
   * List maps for a venue.
   * API returns direct array.
   */
  async listMaps(
    namespace: string,
    venueId: string | number,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    const response = await this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}/{venueId}/maps', {
          params: {
            path: { namespace, venueId: Number(venueId) },
          },
          ...fetchOpts,
        }),
      requestOptions
    );
    return extractDataArray(response as Record<string, unknown>[] | { data: Record<string, unknown>[] });
  }

  /**
   * List POIs for a venue as GeoJSON FeatureCollection.
   */
  async listPois(
    namespace: string,
    venueId: string | number,
    requestOptions?: RequestOptions
  ): Promise<POIFeatureCollection> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}/{venueId}/pois', {
          params: {
            path: { namespace, venueId: String(venueId) },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<POIFeatureCollection>;
  }

  /**
   * List POIs for a venue as flat array.
   */
  async listPoisAsArray(
    namespace: string,
    venueId: string | number,
    requestOptions?: RequestOptions
  ): Promise<POI[]> {
    const geoJson = await this.listPois(namespace, venueId, requestOptions);
    return extractPoisFromGeoJSON(geoJson);
  }

  /**
   * List POIs for a specific map as GeoJSON FeatureCollection.
   */
  async listMapPois(
    namespace: string,
    venueId: string | number,
    mapId: string | number,
    requestOptions?: RequestOptions
  ): Promise<POIFeatureCollection> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}/{venueId}/maps/{mapId}/pois', {
          params: {
            path: { namespace, venueId: Number(venueId), mapId: Number(mapId) },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<POIFeatureCollection>;
  }

  /**
   * List POIs for a specific map as flat array.
   */
  async listMapPoisAsArray(
    namespace: string,
    venueId: string | number,
    mapId: string | number,
    requestOptions?: RequestOptions
  ): Promise<POI[]> {
    const geoJson = await this.listMapPois(namespace, venueId, mapId, requestOptions);
    return extractPoisFromGeoJSON(geoJson);
  }

  /**
   * List navigation paths for a venue as GeoJSON FeatureCollection.
   * Contains both path nodes (Points) and path segments (LineStrings).
   */
  async listPaths(
    namespace: string,
    venueId: string | number,
    requestOptions?: RequestOptions
  ): Promise<PathFeatureCollection> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}/{venueId}/paths', {
          params: {
            path: { namespace, venueId: String(venueId) },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<PathFeatureCollection>;
  }

  /**
   * List path nodes for a venue as flat array.
   */
  async listPathNodes(
    namespace: string,
    venueId: string | number,
    requestOptions?: RequestOptions
  ): Promise<PathNode[]> {
    const geoJson = await this.listPaths(namespace, venueId, requestOptions);
    return extractPathNodesFromGeoJSON(geoJson);
  }

  /**
   * List path segments for a venue as flat array.
   */
  async listPathSegments(
    namespace: string,
    venueId: string | number,
    requestOptions?: RequestOptions
  ): Promise<PathSegment[]> {
    const geoJson = await this.listPaths(namespace, venueId, requestOptions);
    return extractPathSegmentsFromGeoJSON(geoJson);
  }

  /**
   * Iterate over all venues.
   * Since API returns all venues at once, yields each venue.
   */
  async *iterate(
    namespace: string,
    requestOptions?: RequestOptions
  ): AsyncGenerator<Record<string, unknown>, void, unknown> {
    const venues = await this.list(namespace, requestOptions);
    for (const venue of venues) {
      yield venue;
    }
  }
}
```

**Verification**:
```bash
npm run typecheck
npm run test
```

---

## Phase 5: Update Assets Resource

Update assets resource to handle direct array responses.

### Task 5.1: Update Assets List Method

**File**: `src/resources/assets.ts`

**Changes**:
1. Change `list()` to return `Asset[]` directly (not paginated)
2. Update `iterate()` and `getAll()` to work with arrays

**Full Implementation** (replace entire file):
```typescript
import { BaseClient, type RequestOptions } from '../client/base';
import type { QueryOptions, FilterOptions } from '../types';
import { buildQueryParams, extractDataArray } from '../utils';

export type ListAssetsOptions = QueryOptions & FilterOptions & Record<string, unknown>;

export class AssetsResource {
  constructor(private client: BaseClient) {}

  /**
   * List all assets for a namespace.
   * API returns direct array, not paginated.
   */
  async list(
    namespace: string,
    options?: ListAssetsOptions,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    const params = buildQueryParams(options);
    const response = await this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/assets/{app_namespace}', {
          params: { path: { app_namespace: namespace }, query: params as Record<string, unknown> },
          ...fetchOpts,
        }),
      requestOptions
    );
    return extractDataArray(response as Record<string, unknown>[] | { data: Record<string, unknown>[] });
  }

  /**
   * Get a single asset by MAC address.
   */
  async get(
    namespace: string,
    macAddress: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/assets/{app_namespace}/{mac_address}', {
          params: { path: { app_namespace: namespace, mac_address: macAddress } },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  /**
   * Create a new asset.
   */
  async create(
    namespace: string,
    macAddress: string,
    asset: Record<string, unknown>,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.POST('/assets/{app_namespace}/{mac_address}', {
          params: { path: { app_namespace: namespace, mac_address: macAddress } },
          body: asset as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  /**
   * Update an existing asset.
   */
  async update(
    namespace: string,
    macAddress: string,
    updates: Record<string, unknown>,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.PATCH('/assets/{app_namespace}/{mac_address}', {
          params: { path: { app_namespace: namespace, mac_address: macAddress } },
          body: updates as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  /**
   * Delete an asset.
   */
  async delete(
    namespace: string,
    macAddress: string,
    requestOptions?: RequestOptions
  ): Promise<void> {
    await this.client['request'](
      (fetchOpts) =>
        this.client.raw.DELETE('/assets/{app_namespace}/{mac_address}', {
          params: { path: { app_namespace: namespace, mac_address: macAddress } },
          ...fetchOpts,
        }),
      requestOptions
    );
  }

  /**
   * Batch save multiple assets.
   */
  async batchSave(
    namespace: string,
    assets: Record<string, unknown>[],
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.POST('/assets/{app_namespace}', {
          params: { path: { app_namespace: namespace } },
          body: assets as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  /**
   * Batch delete multiple assets.
   */
  async batchDelete(
    namespace: string,
    macAddresses: string[],
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.DELETE('/assets/{app_namespace}', {
          params: { path: { app_namespace: namespace } },
          body: macAddresses as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  /**
   * Get asset history.
   */
  async getHistory(
    namespace: string,
    macAddress: string,
    options: { startTime: number; endTime: number },
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/asset_history/{app_namespace}/{mac_address}', {
          params: {
            path: { app_namespace: namespace, mac_address: macAddress },
            query: { start_time: options.startTime, end_time: options.endTime },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>[]>;
  }

  /**
   * Get asset statistics.
   */
  async getStats(
    namespace: string,
    options: { startTime: number; endTime: number },
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/asset_stats/{app_namespace}/{start_time}/{end_time}', {
          params: {
            path: {
              app_namespace: namespace,
              start_time: options.startTime,
              end_time: options.endTime,
            },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  /**
   * Iterate over all assets.
   * Since API returns all assets at once, yields each asset.
   */
  async *iterate(
    namespace: string,
    options?: Omit<ListAssetsOptions, 'page' | 'limit'>,
    requestOptions?: RequestOptions
  ): AsyncGenerator<Record<string, unknown>, void, unknown> {
    const assets = await this.list(namespace, options, requestOptions);
    for (const asset of assets) {
      yield asset;
    }
  }

  /**
   * Get all assets as array.
   */
  async getAll(
    namespace: string,
    options?: Omit<ListAssetsOptions, 'page' | 'limit'>,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    return this.list(namespace, options, requestOptions);
  }
}
```

**Verification**:
```bash
npm run typecheck
npm run test
```

---

## Phase 6: Update Spatial Resource

Update spatial resource to return structured response objects.

### Task 6.1: Update Spatial Resource

**File**: `src/resources/spatial.ts`

**Full Implementation** (replace entire file):
```typescript
import { BaseClient, type RequestOptions } from '../client/base';
import type {
  ZonesContainingPointResult,
  NearestZonesResult,
  ZonesWithinRadiusResult,
  NearestPoisResult,
  PoisWithinRadiusResult,
  AnalyzeCustomZonesRequest,
  AnalyzeCustomPoisRequest,
} from '../types';

export interface PointQueryOptions {
  lat: number;
  lon: number;
  level?: number;
}

export interface NearestQueryOptions extends PointQueryOptions {
  limit?: number;
  maxDistanceMeters?: number;
}

export interface RadiusQueryOptions extends PointQueryOptions {
  radiusMeters: number;
}

export class SpatialResource {
  constructor(private client: BaseClient) {}

  /**
   * Find zones containing a geographic point.
   * @returns Structured result with reference point, level, and matching zones
   */
  async zonesContainingPoint(
    namespace: string,
    options: PointQueryOptions,
    requestOptions?: RequestOptions
  ): Promise<ZonesContainingPointResult> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/spatial/zones/{namespace}/containing-point', {
          params: {
            path: { namespace },
            query: {
              lat: options.lat,
              lon: options.lon,
              level: options.level
            },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<ZonesContainingPointResult>;
  }

  /**
   * Find nearest zones to a geographic point.
   * @returns Structured result with zones sorted by distance
   */
  async nearestZones(
    namespace: string,
    options: NearestQueryOptions,
    requestOptions?: RequestOptions
  ): Promise<NearestZonesResult> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/spatial/zones/{namespace}/nearest-to-point', {
          params: {
            path: { namespace },
            query: {
              lat: options.lat,
              lon: options.lon,
              limit: options.limit,
              level: options.level,
              max_distance_meters: options.maxDistanceMeters,
            },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<NearestZonesResult>;
  }

  /**
   * Find zones within a radius of a geographic point.
   * @returns Structured result with zones within the specified radius
   */
  async zonesWithinRadius(
    namespace: string,
    options: RadiusQueryOptions,
    requestOptions?: RequestOptions
  ): Promise<ZonesWithinRadiusResult> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/spatial/zones/{namespace}/within-radius', {
          params: {
            path: { namespace },
            query: {
              lat: options.lat,
              lon: options.lon,
              radius_meters: options.radiusMeters,
              level: options.level,
            },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<ZonesWithinRadiusResult>;
  }

  /**
   * Analyze custom zone geometries against a reference point.
   * Requires reference_point in the request body.
   */
  async analyzeCustomZones(
    namespace: string,
    request: AnalyzeCustomZonesRequest,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.POST('/spatial/zones/{namespace}/analyze-custom', {
          params: { path: { namespace } },
          body: {
            reference_point: request.reference_point,
            zones: request.zones,
          } as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>>;
  }

  /**
   * Find nearest POIs to a geographic point.
   * @returns Structured result with POIs sorted by distance
   */
  async nearestPois(
    namespace: string,
    options: NearestQueryOptions,
    requestOptions?: RequestOptions
  ): Promise<NearestPoisResult> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/spatial/pois/{namespace}/nearest-to-point', {
          params: {
            path: { namespace },
            query: {
              lat: options.lat,
              lon: options.lon,
              limit: options.limit,
              level: options.level,
              max_distance_meters: options.maxDistanceMeters,
            },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<NearestPoisResult>;
  }

  /**
   * Find POIs within a radius of a geographic point.
   * @returns Structured result with POIs within the specified radius
   */
  async poisWithinRadius(
    namespace: string,
    options: RadiusQueryOptions,
    requestOptions?: RequestOptions
  ): Promise<PoisWithinRadiusResult> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/spatial/pois/{namespace}/within-radius', {
          params: {
            path: { namespace },
            query: {
              lat: options.lat,
              lon: options.lon,
              radius_meters: options.radiusMeters,
              level: options.level,
            },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<PoisWithinRadiusResult>;
  }

  /**
   * Analyze custom POI geometries against a reference point.
   * Requires reference_point in the request body.
   */
  async analyzeCustomPois(
    namespace: string,
    request: AnalyzeCustomPoisRequest,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.POST('/spatial/pois/{namespace}/analyze-custom', {
          params: { path: { namespace } },
          body: {
            reference_point: request.reference_point,
            pois: request.pois,
          } as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>>;
  }
}
```

**Verification**:
```bash
npm run typecheck
npm run test
```

---

## Phase 7: Update Dashboards Resource

Fix dashboard field name mismatch.

### Task 7.1: Fix Dashboard Create Method

**File**: `src/resources/dashboards.ts`

**Changes**:
1. Update `CreateDashboardData` interface
2. Transform `namespace` to `application_namespace` in `create()` method

**Implementation** (update the interface and create method):

```typescript
// Update interface
export interface CreateDashboardData {
  name: string;
  namespace: string;  // SDK uses friendly name
  data?: Record<string, unknown>;
}

// Update create method to transform field name
async create(
  data: CreateDashboardData,
  requestOptions?: RequestOptions
): Promise<Record<string, unknown>> {
  // Transform SDK field names to API field names
  const apiData = {
    name: data.name,
    application_namespace: data.namespace,  // API expects application_namespace
    data: data.data ?? {},
  };

  return this.client['request'](
    (fetchOpts) =>
      this.client.raw.POST('/dashboards', {
        body: apiData as never,
        ...fetchOpts,
      }),
    requestOptions
  ) as unknown as Promise<Record<string, unknown>>;
}
```

**Verification**:
```bash
npm run typecheck
npm run test
```

---

## Phase 8: Update Unit Tests

Update MSW mock handlers and unit tests to match actual API behavior.

### Task 8.1: Update Zone Mock Handlers

**File**: `test/mocks/handlers.ts` or equivalent

**Changes**: Update zone endpoint handlers to return GeoJSON

**Implementation Pattern**:
```typescript
// Zone list should return GeoJSON FeatureCollection
http.get('*/venues/:namespace/:venueId/zones', () => {
  return HttpResponse.json({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[[2.31, 48.88], [2.32, 48.88], [2.32, 48.89], [2.31, 48.89], [2.31, 48.88]]],
        },
        properties: {
          id: 1,
          name: 'Test Zone',
          level: 0,
          rgb_color: '#FF0000',
          tags: ['test'],
          type: 'map_zone',
        },
      },
    ],
    metadata: {
      type: 'zones',
      count: 1,
      timestamp: new Date().toISOString(),
    },
  });
}),
```

**Verification**:
```bash
npm run test
```

---

### Task 8.2: Update Asset Mock Handlers

**File**: `test/mocks/handlers.ts`

**Changes**: Update asset list to return direct array

**Implementation Pattern**:
```typescript
// Asset list should return direct array
http.get('*/assets/:namespace', () => {
  return HttpResponse.json([
    {
      user_udid: 'aa:bb:cc:dd:ee:ff',
      user_name: 'Test Asset',
      user_type: 'default',
      user_motion: 'default',
      color: '#FF0000',
      model: 'default',
      path: '/test/',
      tags: [],
      data: {},
      createdBy: 'test',
      dateCreated: Date.now(),
      targetApplications: [],
    },
  ]);
}),
```

**Verification**:
```bash
npm run test
```

---

### Task 8.3: Update Spatial Mock Handlers

**File**: `test/mocks/handlers.ts`

**Changes**: Update spatial endpoints to return structured objects

**Implementation Pattern**:
```typescript
// Spatial zones containing point
http.get('*/spatial/zones/:namespace/containing-point', ({ request }) => {
  const url = new URL(request.url);
  const lat = parseFloat(url.searchParams.get('lat') || '0');
  const lon = parseFloat(url.searchParams.get('lon') || '0');

  return HttpResponse.json({
    reference_point: { lat, lon },
    level: null,
    containing_zones: [],
    total: 0,
  });
}),

// Nearest zones
http.get('*/spatial/zones/:namespace/nearest-to-point', ({ request }) => {
  const url = new URL(request.url);
  const lat = parseFloat(url.searchParams.get('lat') || '0');
  const lon = parseFloat(url.searchParams.get('lon') || '0');

  return HttpResponse.json({
    reference_point: { lat, lon },
    level: null,
    max_distance_meters: null,
    total_zones: 0,
    zones: [],
    hasMore: false,
  });
}),
```

**Verification**:
```bash
npm run test
```

---

### Task 8.4: Update POI/Path Mock Handlers

**File**: `test/mocks/handlers.ts`

**Changes**: Update POI and path endpoints to return GeoJSON

**Implementation Pattern**:
```typescript
// POI list should return GeoJSON FeatureCollection
http.get('*/venues/:namespace/:venueId/pois', () => {
  return HttpResponse.json({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [2.31, 48.88],
        },
        properties: {
          id: 1,
          name: 'Test POI',
          description: 'A test POI',
          level: 0,
          color: '#00FF00',
          tags: ['test'],
          _id: 'abc123',
          coordinates: { lat: 48.88, lng: 2.31 },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          externalId: 1,
          externalVenueId: 1,
          externalApplicationId: 1,
          index: 0,
        },
      },
    ],
    metadata: {
      type: 'pois',
      count: 1,
      timestamp: new Date().toISOString(),
    },
  });
}),

// Paths should return GeoJSON FeatureCollection with nodes and segments
http.get('*/venues/:namespace/:venueId/paths', () => {
  return HttpResponse.json({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [2.31, 48.88] },
        properties: {
          id: 1,
          external_id: 1,
          type: 'path_node',
          node_type: 'waypoint',
          name: 'Node 1',
          level: 0,
          is_active: true,
          cross_level_connections: [],
          tags: [],
        },
      },
    ],
    metadata: {
      type: 'paths',
      timestamp: new Date().toISOString(),
    },
  });
}),
```

**Verification**:
```bash
npm run test
```

---

### Task 8.5: Update Resource Unit Tests

**File**: `test/resources/*.test.ts`

**Changes**: Update test assertions for new return types

**Implementation Pattern**:
```typescript
describe('ZonesResource', () => {
  it('should return GeoJSON FeatureCollection from list()', async () => {
    const result = await client.zones.list(namespace, venueId);

    expect(result.type).toBe('FeatureCollection');
    expect(Array.isArray(result.features)).toBe(true);
    expect(result.metadata).toBeDefined();
    expect(result.metadata.type).toBe('zones');
  });

  it('should return Zone array from listAsArray()', async () => {
    const result = await client.zones.listAsArray(namespace, venueId);

    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('color'); // Mapped from rgb_color
    }
  });
});

describe('SpatialResource', () => {
  it('should return structured result from zonesContainingPoint()', async () => {
    const result = await client.spatial.zonesContainingPoint(namespace, {
      lat: 48.88,
      lon: 2.31,
    });

    expect(result.reference_point).toEqual({ lat: 48.88, lon: 2.31 });
    expect(result).toHaveProperty('containing_zones');
    expect(result).toHaveProperty('total');
  });
});
```

**Verification**:
```bash
npm run test
```

---

## Phase 9: Update Integration Tests

Update integration tests to work with new response formats.

### Task 9.1: Update Zone Integration Tests

**File**: `test/integration/zones.test.ts`

**Changes**: Update assertions for GeoJSON responses

**Verification**:
```bash
npm run test:integration
```

---

### Task 9.2: Update Venue Integration Tests

**File**: `test/integration/venues.test.ts`

**Changes**: Update assertions for POI/Path GeoJSON responses

**Verification**:
```bash
npm run test:integration
```

---

### Task 9.3: Update Spatial Integration Tests

**File**: `test/integration/spatial.test.ts`

**Changes**: Update assertions for structured response objects

**Verification**:
```bash
npm run test:integration
```

---

### Task 9.4: Update Asset Integration Tests

**File**: `test/integration/assets.test.ts`

**Changes**: Update assertions for direct array responses

**Verification**:
```bash
npm run test:integration
```

---

## Phase 10: Update Exports and Documentation

### Task 10.1: Update Main Index Exports

**File**: `src/index.ts`

**Changes**: Export new types and utilities

**Verification**:
```bash
npm run typecheck
npm run build
```

---

### Task 10.2: Update CHANGELOG

**File**: `CHANGELOG.md`

**Content**:
```markdown
# Changelog

## [1.0.0] - YYYY-MM-DD

### Breaking Changes

- **Zones**: `zones.list()` now returns `ZoneFeatureCollection` (GeoJSON) instead of `PaginatedResponse<Zone>`
- **POIs**: `venues.listPois()` now returns `POIFeatureCollection` (GeoJSON) instead of `PaginatedResponse<POI>`
- **Paths**: `venues.listPaths()` now returns `PathFeatureCollection` (GeoJSON) instead of `PaginatedResponse<Path>`
- **Assets**: `assets.list()` now returns `Asset[]` directly instead of `PaginatedResponse<Asset>`
- **Venues**: `venues.list()` now returns `Venue[]` directly instead of `PaginatedResponse<Venue>`
- **Spatial**: All spatial methods now return structured objects with metadata instead of arrays

### Added

- `zones.listAsArray()` - Get zones as flat array
- `zones.listByMapAsArray()` - Get zones by map as flat array
- `venues.listPoisAsArray()` - Get POIs as flat array
- `venues.listMapPoisAsArray()` - Get map POIs as flat array
- `venues.listPathNodes()` - Get path nodes as flat array
- `venues.listPathSegments()` - Get path segments as flat array
- GeoJSON type definitions (`ZoneFeatureCollection`, `POIFeatureCollection`, `PathFeatureCollection`)
- Spatial result types (`ZonesContainingPointResult`, `NearestZonesResult`, etc.)
- Utility functions for GeoJSON extraction (`extractZonesFromGeoJSON`, etc.)

### Fixed

- Dashboard create now correctly sends `application_namespace` field
- Spatial analyze methods now include required `reference_point` in request body
- Response handling for endpoints returning direct arrays
```

**Verification**:
```bash
npm run build
```

---

## Phase 11: Final Verification

### Task 11.1: Run Full Test Suite

```bash
npm run typecheck
npm run lint
npm run test
npm run test:integration
npm run build
```

### Task 11.2: Verify Package Exports

```bash
# Test that package can be imported
node -e "const sdk = require('./dist/index.cjs'); console.log(Object.keys(sdk));"
```

---

## Execution Checklist

- [ ] Phase 1: Type Definitions (7 tasks)
- [ ] Phase 2: Response Utilities (3 tasks)
- [ ] Phase 3: Update Zones Resource (1 task)
- [ ] Phase 4: Update Venues Resource (1 task)
- [ ] Phase 5: Update Assets Resource (1 task)
- [ ] Phase 6: Update Spatial Resource (1 task)
- [ ] Phase 7: Update Dashboards Resource (1 task)
- [ ] Phase 8: Update Unit Tests (5 tasks)
- [ ] Phase 9: Update Integration Tests (4 tasks)
- [ ] Phase 10: Update Exports and Documentation (2 tasks)
- [ ] Phase 11: Final Verification (2 tasks)

**Total Tasks**: 28

---

## AI Implementation Notes

### Autonomous Execution Guidelines

1. **Execute phases sequentially** - Each phase depends on previous phases
2. **Run verification after each task** - Catch issues early
3. **Keep existing tests passing** - Don't break working functionality
4. **Use TypeScript strict mode** - Catch type errors at compile time

### Key Implementation Details

1. **Type Safety**: All new types should be properly exported and importable
2. **Response Handling**: Use `extractDataArray()` utility for endpoints that may return arrays or objects
3. **GeoJSON Extraction**: Use provided utility functions, don't duplicate logic
4. **Backward Compatibility**: While breaking, provide `listAsArray()` alternatives for common use cases

### Test Strategy

1. Update MSW mock handlers FIRST before updating tests
2. Run unit tests after each resource update
3. Integration tests require live API - run after all code changes
4. Use `--updateSnapshot` if snapshot tests need updating

### Common Pitfalls

1. **Don't cast to `never`** - Use proper type assertions
2. **Don't modify generated schema** - `src/generated/schema.ts` is auto-generated
3. **Handle empty responses** - Some endpoints return empty arrays/collections
4. **Check for undefined** - API may return null for optional fields
