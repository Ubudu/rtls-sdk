# API Validation Work Package

## Overview

This work package defines a systematic approach to test every SDK endpoint against the live Ubudu RTLS API and document all discrepancies between the SDK's assumptions and actual API behavior.

**Goal**: Create a comprehensive report of API issues, response format mismatches, missing endpoints, and SDK fixes needed.

**Prerequisites**:
- `.env` file with valid `APP_NAMESPACE` and `RTLS_API_KEY`
- `npm run test:integration` configured

---

## Phase 1: Client Core Methods

Test the base client functionality.

### Task 1.1: Health Check
- **Endpoint**: `GET /health`
- **SDK Method**: `client.health()`
- **Test**: Call and verify response structure
- **Document**: Response schema, any error conditions

### Task 1.2: Get Settings
- **Endpoint**: `GET /settings/{app_namespace}`
- **SDK Method**: `client.getSettings(namespace)`
- **Test**: Call with valid namespace
- **Document**: Response schema, settings available

### Task 1.3: Elasticsearch Query
- **Endpoint**: `POST /es/query/{appNamespace}/{dataType}`
- **SDK Method**: `client.esQuery(namespace, dataType, query)`
- **Test**: Query each dataType: `alerts`, `positions`, `zone_visits`
- **Document**: Query syntax, response format, error handling

### Task 1.4: Tag Actions
- **Endpoint**: `POST /tag-actions/{appNamespace}`
- **SDK Method**: `client.sendTagActions(namespace, actions)`
- **Test**: Send test action (if safe), or document expected behavior
- **Document**: Action types, response format, error conditions

---

## Phase 2: Assets Resource

Test all asset-related operations.

### Task 2.1: List Assets
- **Endpoint**: `GET /assets/{app_namespace}`
- **SDK Method**: `client.assets.list(namespace, options?)`
- **SDK Expects**: `PaginatedResponse<T>` with `{ data, page, limit, total, totalPages, hasNext, hasPrev }`
- **Test**:
  - Call without options
  - Call with pagination: `{ page: 1, limit: 5 }`
  - Call with sorting: `{ sort: 'user_name' }`
  - Call with filtering (if supported)
- **Document**:
  - Actual response format (array vs paginated wrapper)
  - Pagination support (query params accepted?)
  - Sorting support
  - Filtering support
  - Field names in response

### Task 2.2: Get Single Asset
- **Endpoint**: `GET /assets/{app_namespace}/{mac_address}`
- **SDK Method**: `client.assets.get(namespace, macAddress)`
- **Test**:
  - Get existing asset
  - Get non-existent asset (document error format)
- **Document**: Response schema, error handling

### Task 2.3: Create Asset
- **Endpoint**: `POST /assets/{app_namespace}/{mac_address}`
- **SDK Method**: `client.assets.create(namespace, macAddress, asset)`
- **Test**:
  - Create new asset with minimal data
  - Create with full data
  - Create duplicate (document error)
- **Document**: Required fields, response format, error handling

### Task 2.4: Update Asset
- **Endpoint**: `PATCH /assets/{app_namespace}/{mac_address}`
- **SDK Method**: `client.assets.update(namespace, macAddress, updates)`
- **Test**:
  - Update existing asset
  - Update non-existent asset
- **Document**: Partial update behavior, response format

### Task 2.5: Delete Asset
- **Endpoint**: `DELETE /assets/{app_namespace}/{mac_address}`
- **SDK Method**: `client.assets.delete(namespace, macAddress)`
- **Test**:
  - Delete existing asset
  - Delete non-existent asset
- **Document**: Response (void or confirmation?), error handling

### Task 2.6: Batch Save Assets
- **Endpoint**: `POST /assets/{app_namespace}`
- **SDK Method**: `client.assets.batchSave(namespace, assets[])`
- **Test**:
  - Save multiple new assets
  - Save mix of new and existing
- **Document**: Response format (BatchSaveResult?), error handling

### Task 2.7: Batch Delete Assets
- **Endpoint**: `DELETE /assets/{app_namespace}`
- **SDK Method**: `client.assets.batchDelete(namespace, macAddresses[])`
- **Test**:
  - Delete multiple assets
  - Delete mix of existing and non-existent
- **Document**: Response format (BatchDeleteResult?), error handling

### Task 2.8: Asset History
- **Endpoint**: `GET /asset_history/{app_namespace}/{mac_address}`
- **SDK Method**: `client.assets.getHistory(namespace, macAddress, { startTime, endTime })`
- **Test**:
  - Get history for known asset
  - Various time ranges
- **Document**: Response format, time format (unix ms?), data structure

### Task 2.9: Asset Stats
- **Endpoint**: `GET /asset_stats/{app_namespace}/{start_time}/{end_time}`
- **SDK Method**: `client.assets.getStats(namespace, { startTime, endTime })`
- **Test**: Query stats for various time ranges
- **Document**: Response format, available statistics

### Task 2.10: Asset Iteration
- **SDK Method**: `client.assets.iterate(namespace, options?)`
- **Test**: Verify pagination iteration works with actual API
- **Document**: Whether API supports pagination needed for iteration

### Task 2.11: Asset GetAll
- **SDK Method**: `client.assets.getAll(namespace, options?)`
- **Test**: Collect all assets
- **Document**: Works with actual API response format?

---

## Phase 3: Positions Resource

Test all position-related operations.

### Task 3.1: List Cached Positions
- **Endpoint**: `GET /cache/{app_namespace}/positions`
- **SDK Method**: `client.positions.listCached(namespace)`
- **Test**: Get all cached positions
- **Document**: Response format (array vs paginated), position schema

### Task 3.2: Get Single Cached Position
- **Endpoint**: `GET /cache/{app_namespace}/positions/{mac_address}`
- **SDK Method**: `client.positions.getCached(namespace, macAddress)`
- **Test**:
  - Get existing position
  - Get non-existent position
- **Document**: Response schema, error handling

### Task 3.3: Get Last Position
- **Endpoint**: `GET /asset_last_position/{app_namespace}/{mac_address}`
- **SDK Method**: `client.positions.getLast(namespace, macAddress)`
- **Test**: Get last known position for asset
- **Document**: Response schema, difference from cached

### Task 3.4: List Last Positions (ES)
- **Endpoint**: `GET /es/last_positions/{appNamespace}`
- **SDK Method**: `client.positions.listLast(namespace, options?)`
- **Test**:
  - Call without options
  - With `key` and `queryString`
  - With `mapUuids`
  - With `timestampFrom` and `timestampTo`
- **Document**: Query parameter support, response format

### Task 3.5: Get Position History
- **Endpoint**: `GET /es/position_history/{appNamespace}`
- **SDK Method**: `client.positions.getHistory(namespace, { timestampFrom, timestampTo, key?, value })`
- **Test**: Query position history for known asset
- **Document**: Response format, time format, data structure

### Task 3.6: Publish Position
- **Endpoint**: `POST /publisher/{app_namespace}`
- **SDK Method**: `client.positions.publish(namespace, position, options?)`
- **Test**:
  - Publish position with lat/lon
  - Publish with map_uuid
  - Test `patchAssetData` option
- **Document**: Required fields, response (void?), error handling

---

## Phase 4: Venues Resource

Test all venue-related operations.

### Task 4.1: List Venues
- **Endpoint**: `GET /venues/{namespace}`
- **SDK Method**: `client.venues.list(namespace, options?)`
- **SDK Expects**: `PaginatedResponse<T>`
- **Test**:
  - List all venues
  - Test pagination options
- **Document**: Actual response format, venue schema

### Task 4.2: Get Single Venue
- **Endpoint**: `GET /venues/{namespace}/{venueId}`
- **SDK Method**: `client.venues.get(namespace, venueId)`
- **Test**: Get existing venue by ID
- **Document**: Response schema, nested data (statistics, coordinates)

### Task 4.3: List Maps
- **Endpoint**: `GET /venues/{namespace}/{venueId}/maps`
- **SDK Method**: `client.venues.listMaps(namespace, venueId, options?)`
- **SDK Expects**: `PaginatedResponse<T>`
- **Test**: Get maps for venue
- **Document**: Response format, map schema

### Task 4.4: List POIs
- **Endpoint**: `GET /venues/{namespace}/{venueId}/pois`
- **SDK Method**: `client.venues.listPois(namespace, venueId, options?)`
- **SDK Expects**: `PaginatedResponse<T>`
- **Test**: Get POIs for venue
- **Document**: Response format, POI schema

### Task 4.5: List Map POIs
- **Endpoint**: `GET /venues/{namespace}/{venueId}/maps/{mapId}/pois`
- **SDK Method**: `client.venues.listMapPois(namespace, venueId, mapId, options?)`
- **Test**: Get POIs for specific map
- **Document**: Response format

### Task 4.6: List Paths
- **Endpoint**: `GET /venues/{namespace}/{venueId}/paths`
- **SDK Method**: `client.venues.listPaths(namespace, venueId, options?)`
- **Test**: Get navigation paths for venue
- **Document**: Response format, path data structure

### Task 4.7: Venue Iteration
- **SDK Method**: `client.venues.iterate(namespace, options?)`
- **Test**: Verify iteration works with actual API
- **Document**: Pagination support

---

## Phase 5: Zones Resource

Test all zone-related operations.

### Task 5.1: List Zones by Venue
- **Endpoint**: `GET /venues/{namespace}/{venueId}/zones`
- **SDK Method**: `client.zones.list(namespace, venueId, options?)`
- **SDK Expects**: `PaginatedResponse<T>`
- **Test**:
  - List zones for venue
  - Test pagination
- **Document**: Actual response format (GeoJSON FeatureCollection?), zone schema

### Task 5.2: List Zones by Map
- **Endpoint**: `GET /venues/{namespace}/{venueId}/maps/{mapId}/zones`
- **SDK Method**: `client.zones.listByMap(namespace, venueId, mapId, options?)`
- **Test**: Get zones for specific map/floor
- **Document**: Response format, filtering by map

### Task 5.3: Zone Presence
- **Endpoint**: `GET /es/zone_presence/{appNamespace}`
- **SDK Method**: `client.zones.getPresence(namespace, { timestampFrom, timestampTo, ... })`
- **Test**: Query zone presence data
- **Document**: Response format, interval aggregation, data structure

### Task 5.4: Zone Iteration
- **SDK Method**: `client.zones.iterate(namespace, venueId, options?)`
- **Test**: Verify iteration works
- **Document**: Pagination support

### Task 5.5: Zone GetAll
- **SDK Method**: `client.zones.getAll(namespace, venueId, options?)`
- **Test**: Collect all zones
- **Document**: Works with actual response format?

---

## Phase 6: Alerts Resource

Test all alert-related operations.

### Task 6.1: Get Alert Rules
- **Endpoint**: `GET /alert_rules/{app_namespace}`
- **SDK Method**: `client.alerts.getRules(namespace)`
- **Test**: Get all alert rules
- **Document**: Response format, rule schema

### Task 6.2: Save Alert Rules
- **Endpoint**: `POST /alert_rules/{app_namespace}`
- **SDK Method**: `client.alerts.saveRules(namespace, rules[])`
- **Test**:
  - Save new rules
  - Update existing rules
- **Document**: Rule schema, response format, validation errors

### Task 6.3: List Alerts
- **Endpoint**: `GET /es/alerts/{appNamespace}`
- **SDK Method**: `client.alerts.list(namespace, { timestampFrom, timestampTo, size? })`
- **Test**: Query historical alerts
- **Document**: Response format, alert schema, pagination via size

---

## Phase 7: Dashboards Resource

Test all dashboard operations.

### Task 7.1: List All Dashboards
- **Endpoint**: `GET /dashboards`
- **SDK Method**: `client.dashboards.list(namespace?)`
- **Test**:
  - List all dashboards
  - List with namespace filter
- **Document**: Response format, dashboard schema

### Task 7.2: List Created Dashboards
- **Endpoint**: `GET /dashboards/created`
- **SDK Method**: `client.dashboards.listCreated(namespace?)`
- **Test**: Get dashboards created by current user
- **Document**: Response format

### Task 7.3: List Shared Dashboards
- **Endpoint**: `GET /dashboards/shared`
- **SDK Method**: `client.dashboards.listShared(namespace?)`
- **Test**: Get dashboards shared with current user
- **Document**: Response format

### Task 7.4: List Selected Dashboards
- **Endpoint**: `GET /dashboards/selected`
- **SDK Method**: `client.dashboards.listSelected(namespace?)`
- **Test**: Get user's selected/favorite dashboards
- **Document**: Response format

### Task 7.5: Get Single Dashboard
- **Endpoint**: `GET /dashboards/{id}`
- **SDK Method**: `client.dashboards.get(id)`
- **Test**:
  - Get existing dashboard
  - Get non-existent dashboard
- **Document**: Full dashboard schema, error handling

### Task 7.6: Create Dashboard
- **Endpoint**: `POST /dashboards`
- **SDK Method**: `client.dashboards.create({ name, namespace, data? })`
- **Test**: Create new dashboard
- **Document**: Required fields, response format, validation

### Task 7.7: Update Dashboard
- **Endpoint**: `PUT /dashboards/{id}`
- **SDK Method**: `client.dashboards.update(id, { name?, data? })`
- **Test**: Update existing dashboard
- **Document**: Response format, partial update support

### Task 7.8: Delete Dashboard
- **Endpoint**: `DELETE /dashboards/{id}`
- **SDK Method**: `client.dashboards.delete(id)`
- **Test**: Delete dashboard
- **Document**: Response (void?), error handling

### Task 7.9: Share Dashboard
- **Endpoint**: `POST /dashboards/{id}/share`
- **SDK Method**: `client.dashboards.share(id, users[])`
- **Test**: Share dashboard with users
- **Document**: User/permission schema, response format

### Task 7.10: Unshare Dashboard
- **Endpoint**: `POST /dashboards/{id}/unshare`
- **SDK Method**: `client.dashboards.unshare(id, usernames[])`
- **Test**: Remove sharing
- **Document**: Response format

---

## Phase 8: Spatial Resource

Test spatial query operations.

### Task 8.1: Zones Containing Point
- **Endpoint**: `GET /spatial/zones/{namespace}/containing-point`
- **SDK Method**: `client.spatial.zonesContainingPoint(namespace, { lat, lon, level? })`
- **Test**: Query with coordinates from known venue
- **Document**: Response format, coordinate system, level parameter

### Task 8.2: Nearest Zones
- **Endpoint**: `GET /spatial/zones/{namespace}/nearest-to-point`
- **SDK Method**: `client.spatial.nearestZones(namespace, { lat, lon, limit? })`
- **Test**: Find nearest zones to point
- **Document**: Response format, distance calculation, limit behavior

### Task 8.3: Zones Within Radius
- **Endpoint**: `GET /spatial/zones/{namespace}/within-radius`
- **SDK Method**: `client.spatial.zonesWithinRadius(namespace, { lat, lon, radiusMeters })`
- **Test**: Find zones within radius
- **Document**: Response format, radius units

### Task 8.4: Analyze Custom Zones
- **Endpoint**: `POST /spatial/zones/{namespace}/analyze-custom`
- **SDK Method**: `client.spatial.analyzeCustomZones(namespace, zones[])`
- **Test**: Analyze custom zone geometries
- **Document**: Zone input format, analysis output

### Task 8.5: Nearest POIs
- **Endpoint**: `GET /spatial/pois/{namespace}/nearest-to-point`
- **SDK Method**: `client.spatial.nearestPois(namespace, { lat, lon, limit? })`
- **Test**: Find nearest POIs to point
- **Document**: Response format

### Task 8.6: POIs Within Radius
- **Endpoint**: `GET /spatial/pois/{namespace}/within-radius`
- **SDK Method**: `client.spatial.poisWithinRadius(namespace, { lat, lon, radiusMeters })`
- **Test**: Find POIs within radius
- **Document**: Response format

### Task 8.7: Analyze Custom POIs
- **Endpoint**: `POST /spatial/pois/{namespace}/analyze-custom`
- **SDK Method**: `client.spatial.analyzeCustomPois(namespace, pois[])`
- **Test**: Analyze custom POI data
- **Document**: POI input format, analysis output

---

## Phase 9: Navigation Resource

Test navigation operations (expected to fail - placeholder API).

### Task 9.1: Shortest Path
- **SDK Method**: `client.navigation.shortestPath(namespace, request)`
- **Test**: Verify throws "Navigation API not yet available"
- **Document**: Endpoint status, expected future API

### Task 9.2: Accessible Path
- **SDK Method**: `client.navigation.accessiblePath(namespace, request)`
- **Test**: Verify throws
- **Document**: Planned accessibility features

### Task 9.3: Multi-Stop Path
- **SDK Method**: `client.navigation.multiStop(namespace, request)`
- **Test**: Verify throws
- **Document**: Planned multi-stop routing

### Task 9.4: Nearest POI Navigation
- **SDK Method**: `client.navigation.nearestPoi(namespace, startNodeId)`
- **Test**: Verify throws
- **Document**: Planned POI navigation

### Task 9.5: Evacuation Route
- **SDK Method**: `client.navigation.evacuation(namespace, startNodeId)`
- **Test**: Verify throws
- **Document**: Planned evacuation features

---

## Phase 10: Error Handling Validation

Test error responses across all endpoints.

### Task 10.1: Authentication Errors
- **Test**: Call with invalid API key
- **Document**: Error response format, HTTP status, error message

### Task 10.2: Authorization Errors
- **Test**: Access resources without permission
- **Document**: 403 response format

### Task 10.3: Not Found Errors
- **Test**: Request non-existent resources
- **Document**: 404 response format

### Task 10.4: Validation Errors
- **Test**: Send invalid data (malformed requests)
- **Document**: 400 response format, validation messages

### Task 10.5: Rate Limiting
- **Test**: Rapid requests to trigger rate limiting (if applicable)
- **Document**: 429 response format, rate limit headers

### Task 10.6: Server Errors
- **Document**: 500 error format (observed during testing)

---

## Phase 11: Documentation & Reporting

### Task 11.1: Create API Response Schema Report
- Document actual response schemas for each endpoint
- Compare with SDK type definitions
- List all mismatches

### Task 11.2: Create SDK Fix Recommendations
- List required SDK changes
- Prioritize by impact
- Provide code examples for fixes

### Task 11.3: Create Missing Endpoint Report
- Endpoints in Swagger but not in SDK
- Endpoints in SDK but not in API
- Deprecated endpoints

### Task 11.4: Update Integration Tests
- Fix tests to work with actual API responses
- Add comprehensive coverage for all endpoints

---

## Test Execution Template

For each task, use this template in the integration test:

```typescript
describe('Resource.method', () => {
  it('should document actual API behavior', async () => {
    try {
      const result = await client.resource.method(params);

      // Log actual response for documentation
      console.log('=== API Response ===');
      console.log('Type:', typeof result);
      console.log('Is Array:', Array.isArray(result));
      console.log('Keys:', result ? Object.keys(result) : 'null');
      console.log('Sample:', JSON.stringify(result, null, 2).slice(0, 1000));

      // Document findings
      // - Response format: [array | object | paginated]
      // - Schema: [list actual fields]
      // - SDK Match: [yes | no - describe mismatch]

    } catch (error) {
      console.log('=== Error Response ===');
      console.log('Error Type:', error.constructor.name);
      console.log('Message:', error.message);
      console.log('Status:', error.status);

      // Document error handling
    }
  });
});
```

---

## Known Issues (Pre-Discovered)

### Issue #1: Pagination Response Mismatch
- **Affected**: `assets.list`, `venues.list`, `zones.list`, `venues.listMaps`, `venues.listPois`, `venues.listPaths`
- **SDK Expects**: `{ data: T[], page, limit, total, totalPages, hasNext, hasPrev }`
- **API Returns**: Direct array `T[]`
- **Impact**: `iterate()` and `getAll()` methods broken
- **Fix Required**: Update SDK to handle direct arrays, remove pagination wrapper assumption

### Issue #2: Zones GeoJSON Format
- **Affected**: `zones.list`
- **SDK Expects**: `PaginatedResponse<Zone>`
- **API Returns**: `{ type: 'FeatureCollection', features: [...], metadata: {...} }`
- **Impact**: Type mismatch, pagination broken
- **Fix Required**: Update zones resource to expect GeoJSON

### Issue #3: Positions listHistory Missing
- **Affected**: Integration test referenced non-existent method
- **SDK Method**: `client.positions.listHistory` does not exist
- **Actual SDK**: `client.positions.getHistory` exists
- **Impact**: Test error
- **Fix Required**: Update test to use correct method name

---

## Execution Checklist

- [x] Phase 1: Client Core (4 tasks) ✓
- [x] Phase 2: Assets Resource (11 tasks) ✓
- [x] Phase 3: Positions Resource (6 tasks) ✓
- [x] Phase 4: Venues Resource (7 tasks) ✓
- [x] Phase 5: Zones Resource (5 tasks) ✓
- [x] Phase 6: Alerts Resource (3 tasks) ✓
- [x] Phase 7: Dashboards Resource (10 tasks) ✓
- [x] Phase 8: Spatial Resource (7 tasks) ✓
- [x] Phase 9: Navigation Resource (5 tasks) ✓
- [x] Phase 10: Error Handling (6 tasks) ✓
- [x] Phase 11: Documentation (4 tasks) ✓

**Total Tasks**: 68 ✓ **ALL COMPLETED**

**Execution Date**: December 21, 2025

---

## Output Artifacts

After execution, produce:

1. **`API_VALIDATION_RESULTS.md`** - Test results for each endpoint ✓
2. **`API_SCHEMA_REPORT.md`** - Actual vs expected schemas ✓
3. **`SDK_FIX_RECOMMENDATIONS.md`** - Required SDK changes ✓
4. **Updated integration tests** - Working tests for all endpoints ✓

---

## Implementation Results Summary

### Test Execution
- **Total Integration Tests**: 89
- **Tests Passed**: 89 (100%)
- **Test Files**: 10

### Key Findings

#### Critical Issues Discovered
1. **Pagination Response Mismatch** - API returns direct arrays, SDK expects paginated response
2. **GeoJSON Response Format** - Zones, POIs, Paths return GeoJSON FeatureCollection
3. **Spatial Response Format** - Spatial queries return structured objects, not arrays

#### Integration Test Files Created/Updated
- `test/integration/client.test.ts` - Phase 1 tests
- `test/integration/assets.test.ts` - Phase 2 tests
- `test/integration/positions.test.ts` - Phase 3 tests
- `test/integration/venues.test.ts` - Phase 4 tests
- `test/integration/zones.test.ts` - Phase 5 tests
- `test/integration/alerts.test.ts` - Phase 6 tests (new)
- `test/integration/dashboards.test.ts` - Phase 7 tests (new)
- `test/integration/spatial.test.ts` - Phase 8 tests (new)
- `test/integration/navigation.test.ts` - Phase 9 tests (new)
- `test/integration/errors.test.ts` - Phase 10 tests (new)

### Documentation Produced
- `docs/development/API_VALIDATION_RESULTS.md` - Detailed test results
- `docs/development/API_SCHEMA_REPORT.md` - Schema comparison
- `docs/development/SDK_FIX_RECOMMENDATIONS.md` - Fix recommendations
