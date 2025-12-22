# SDK Fix Recommendations

## Overview

Based on the API validation testing, this document outlines required SDK changes to match actual API behavior.

---

## Priority 1: Critical Fixes (Breaking Functionality)

### Fix 1.1: Handle Direct Array Responses

**Affected Methods:**
- `client.assets.list()`
- `client.venues.list()`
- All `iterate()` and `getAll()` methods

**Problem:**
SDK expects `PaginatedResponse<T>` format:
```typescript
{
  data: T[],
  page: number,
  limit: number,
  total: number,
  totalPages: number,
  hasNext: boolean,
  hasPrev: boolean
}
```

API returns direct array: `T[]`

**Solution:**
Create a response normalizer that handles both formats:

```typescript
// src/utils/response.ts
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
```

**Update affected resources:**
```typescript
// src/resources/assets.ts
async list(namespace: string, options?: ListAssetsOptions): Promise<PaginatedResponse<Asset>> {
  const response = await this.client.request(...);
  return normalizeListResponse(response);
}
```

---

### Fix 1.2: Handle GeoJSON Zone Responses

**Affected Methods:**
- `client.zones.list()`
- `client.zones.listByMap()`

**Problem:**
SDK expects `PaginatedResponse<Zone>`, API returns GeoJSON:
```typescript
{
  type: "FeatureCollection",
  features: Feature[],
  metadata: { type: "zones", count: number, timestamp: string }
}
```

**Solution:**
Option A: Return GeoJSON directly (breaking change):
```typescript
export interface ZoneFeatureCollection {
  type: 'FeatureCollection';
  features: ZoneFeature[];
  metadata: {
    type: 'zones';
    count: number;
    timestamp: string;
  };
}

async list(namespace: string, venueId: string | number): Promise<ZoneFeatureCollection>
```

Option B: Transform GeoJSON to Zone array (maintain compatibility):
```typescript
// src/utils/geojson.ts
export function extractZonesFromGeoJSON(geoJson: ZoneFeatureCollection): Zone[] {
  return geoJson.features.map(feature => ({
    id: feature.properties.id,
    name: feature.properties.name,
    level: feature.properties.level,
    color: feature.properties.rgb_color,
    tags: feature.properties.tags,
    type: feature.properties.type,
    geometry: feature.geometry,
  }));
}
```

**Recommended:** Option A (return GeoJSON directly) - it's the native format and GeoJSON is widely supported.

---

### Fix 1.3: Handle Spatial Query Response Format

**Affected Methods:**
- `client.spatial.zonesContainingPoint()`
- `client.spatial.nearestZones()`
- `client.spatial.zonesWithinRadius()`
- `client.spatial.nearestPois()`
- `client.spatial.poisWithinRadius()`

**Problem:**
SDK expects arrays, API returns structured objects:
```typescript
// API returns:
{
  reference_point: { lat: number, lon: number },
  level: number | null,
  total_zones: number,
  zones: Zone[],
  hasMore: boolean
}
```

**Solution:**
Update return types to match actual API:

```typescript
// src/resources/spatial.ts
export interface SpatialZoneResult {
  reference_point: { lat: number; lon: number };
  level: number | null;
  total_zones: number;
  zones: Zone[];
  hasMore: boolean;
}

export interface SpatialPoiResult {
  reference_point: { lat: number; lon: number };
  level: number | null;
  total_pois: number;
  pois: POI[];
  hasMore: boolean;
}

async zonesContainingPoint(namespace: string, options: ZonePointQuery): Promise<SpatialZoneResult>
```

---

## Priority 2: Medium Fixes (Required for Full Functionality)

### Fix 2.1: Dashboard Create Field Names

**Problem:**
SDK uses `namespace`, API expects `application_namespace`:

```typescript
// SDK interface:
interface CreateDashboardData {
  name: string;
  namespace: string;  // ❌ Wrong
  data?: Record<string, unknown>;
}

// API expects:
{
  name: string;
  application_namespace: string;  // ✓ Correct
  data: unknown;
}
```

**Solution:**
```typescript
// src/resources/dashboards.ts
async create(data: CreateDashboardData): Promise<Dashboard> {
  const apiData = {
    name: data.name,
    application_namespace: data.namespace,  // Transform field name
    data: data.data ?? {},
  };
  return this.client.request(/* ... */);
}
```

---

### Fix 2.2: Spatial Analyze Endpoints

**Problem:**
API requires `reference_point` in request body:
```json
{
  "reference_point": { "lat": 48.88, "lon": 2.31 },
  "zones": [/* GeoJSON features */]
}
```

**Solution:**
```typescript
// src/resources/spatial.ts
export interface AnalyzeCustomZonesRequest {
  referencePoint: { lat: number; lon: number };
  zones: GeoJSONFeature[];
}

async analyzeCustomZones(
  namespace: string,
  request: AnalyzeCustomZonesRequest
): Promise<AnalyzeResult> {
  const body = {
    reference_point: request.referencePoint,
    zones: request.zones,
  };
  // ...
}
```

---

### Fix 2.3: POI and Path Response Format

**Problem:**
`venues.listPois()` and `venues.listPaths()` return GeoJSON FeatureCollection, not PaginatedResponse.

**Solution:**
Same as Fix 1.2 - update return types to GeoJSON format:

```typescript
export interface POIFeatureCollection {
  type: 'FeatureCollection';
  features: POIFeature[];
  metadata: {
    type: 'pois';
    count: number;
    timestamp: string;
  };
}

async listPois(namespace: string, venueId: string | number): Promise<POIFeatureCollection>
```

---

## Priority 3: Minor Improvements

### Fix 3.1: Improve Error Detection

**Issue:** Health endpoint returns 200 with invalid API key.

**Solution:**
Add validation helper:
```typescript
async validateCredentials(): Promise<boolean> {
  try {
    await this.assets.list(namespace);
    return true;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return false;
    }
    throw error;
  }
}
```

---

### Fix 3.2: Consistent Error Types

**Issue:** Some endpoints return 422 instead of 404.

**Solution:**
Update `createError` to handle 422 as potential NotFoundError:
```typescript
// src/errors.ts
export function createError(status: number, message: string, response?: unknown): RtlsError {
  if (status === 404 || (status === 422 && message.includes('Invalid'))) {
    return new NotFoundError(message, response);
  }
  // ...
}
```

---

## Implementation Order

1. **Week 1: Priority 1 Fixes**
   - Fix 1.1: Response normalizer for arrays
   - Fix 1.2: GeoJSON zone handling
   - Fix 1.3: Spatial response types

2. **Week 2: Priority 2 Fixes**
   - Fix 2.1: Dashboard field names
   - Fix 2.2: Spatial analyze endpoints
   - Fix 2.3: POI/Path response types

3. **Week 3: Priority 3 + Testing**
   - Fix 3.1-3.2: Error handling improvements
   - Update all unit tests
   - Update integration tests

---

## Code Examples

### Example: Updated Assets Resource

```typescript
// src/resources/assets.ts
import { normalizeListResponse } from '../utils/response';

export class AssetsResource {
  async list(
    namespace: string,
    options?: ListAssetsOptions
  ): Promise<PaginatedResponse<Asset>> {
    const response = await this.client.request(/* ... */);

    // Handle both array and paginated responses
    return normalizeListResponse<Asset>(response);
  }

  async *iterate(
    namespace: string,
    options?: IterateOptions
  ): AsyncGenerator<Asset> {
    const response = await this.list(namespace, options);

    // Now works with normalized response
    for (const item of response.data) {
      yield item;
    }

    // Handle pagination if present
    if (response.hasNext) {
      // ... fetch next page
    }
  }
}
```

### Example: Updated Zones Resource

```typescript
// src/resources/zones.ts
export interface ZoneFeatureCollection {
  type: 'FeatureCollection';
  features: ZoneFeature[];
  metadata: ZoneMetadata;
}

export class ZonesResource {
  /**
   * List zones for a venue.
   * @returns GeoJSON FeatureCollection containing zone features
   */
  async list(
    namespace: string,
    venueId: string | number
  ): Promise<ZoneFeatureCollection> {
    return this.client.request(/* ... */);
  }

  /**
   * Extract zones as flat array from GeoJSON response.
   */
  async listAsArray(
    namespace: string,
    venueId: string | number
  ): Promise<Zone[]> {
    const geoJson = await this.list(namespace, venueId);
    return extractZonesFromGeoJSON(geoJson);
  }
}
```

---

## Testing Updates Required

1. Update mock handlers to return actual API formats
2. Add tests for response normalization
3. Add tests for GeoJSON handling
4. Update type assertions in existing tests

---

## Breaking Changes Summary

If implementing recommended fixes, these are breaking changes:

| Change | Migration |
|--------|-----------|
| `zones.list()` returns GeoJSON | Use `.features` array |
| `venues.listPois()` returns GeoJSON | Use `.features` array |
| `venues.listPaths()` returns GeoJSON | Use `.features` array |
| Spatial methods return objects | Access `.zones` or `.pois` array |
| `CreateDashboardData.namespace` | Rename to use internal transform |

**Recommended versioning:** Major version bump (e.g., 0.x.x → 1.0.0)
