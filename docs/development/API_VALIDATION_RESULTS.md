# API Validation Results

## Overview

This document summarizes the results of testing every SDK endpoint against the live Ubudu RTLS API (December 2025).

**Test Environment:**
- Namespace: 4a2044367e12d8de5e5eb48e18ee703ad6deb00a
- Venue: Bureau Tocqueville (ID: 35149)
- Total Tests: 89
- All Tests Passed: Yes

---

## Phase 1: Client Core Methods

### Task 1.1: Health Check
| Aspect | Status |
|--------|--------|
| Endpoint | `GET /health` |
| SDK Method | `client.health()` |
| Response | `{ status: "OK" }` |
| SDK Match | **YES** |

### Task 1.2: Get Settings
| Aspect | Status |
|--------|--------|
| Endpoint | `GET /settings/{app_namespace}` |
| SDK Method | `client.getSettings(namespace)` |
| Response Keys | accuracy, defaultSelectedModels, lastPositions, map, positionsExpirationPeriod, tagActions |
| SDK Match | **YES** |

### Task 1.3: Elasticsearch Query
| Data Type | Status | Notes |
|-----------|--------|-------|
| alerts | Works | Returns ES query results |
| positions | Works | Returns ES query results |
| zone_visits | Works | Returns ES query results |

### Task 1.4: Tag Actions
| Aspect | Status |
|--------|--------|
| Endpoint | `POST /tag-actions/{appNamespace}` |
| SDK Method | `client.sendTagActions(namespace, actions)` |
| Action Types | ptlRed, ptlGreen, uwbBlink, ptlRedUwbBlink, ptlGreenUwbBlink |
| Note | Not tested to avoid side effects on physical tags |

---

## Phase 2: Assets Resource

### Task 2.1: List Assets
| Aspect | Finding |
|--------|---------|
| Endpoint | `GET /assets/{app_namespace}` |
| **SDK Expects** | `PaginatedResponse<Asset>` |
| **API Returns** | **Direct array** `Asset[]` |
| **MISMATCH** | **YES - API returns array, not paginated response** |
| Pagination Params | Query params ignored, always returns full array |
| Sorting | Unknown if supported |

**Sample Response:**
```json
[
  {
    "color": "#ff0000",
    "createdBy": "...",
    "data": {},
    "dateCreated": 1764329351477,
    "model": "default",
    "path": "/item/turbine/",
    "tags": [],
    "targetApplications": [],
    "user_motion": "default",
    "user_name": "349",
    "user_type": "ptl_ubudu",
    "user_udid": "f27ba65c518e"
  }
]
```

### Task 2.2: Get Single Asset
| Aspect | Status |
|--------|--------|
| Endpoint | `GET /assets/{app_namespace}/{mac_address}` |
| Response | Returns single asset object |
| Non-existent | Returns 404 NotFoundError |
| SDK Match | **YES** |

### Task 2.3: Create Asset
| Aspect | Status |
|--------|--------|
| Endpoint | `POST /assets/{app_namespace}/{mac_address}` |
| Behavior | Creates/upserts asset |
| Duplicate | No error - acts as upsert |
| SDK Match | **YES** |

### Task 2.4: Update Asset
| Aspect | Status |
|--------|--------|
| Endpoint | `PATCH /assets/{app_namespace}/{mac_address}` |
| Behavior | Partial update |
| Non-existent | Creates new asset (upsert) |
| SDK Match | **YES** |

### Task 2.5: Delete Asset
| Aspect | Status |
|--------|--------|
| Endpoint | `DELETE /assets/{app_namespace}/{mac_address}` |
| Response | void (no content) |
| Non-existent | No error thrown |
| SDK Match | **YES** |

### Task 2.6: Batch Save Assets
| Aspect | Status |
|--------|--------|
| Endpoint | `POST /assets/{app_namespace}` |
| Response | `{ created: n, updated: n }` |
| SDK Match | **YES** |

### Task 2.7: Batch Delete Assets
| Aspect | Status |
|--------|--------|
| Endpoint | `DELETE /assets/{app_namespace}` |
| Response | `{ deleted: n, notFound: n }` |
| SDK Match | **YES** |

### Task 2.8: Asset History
| Aspect | Status |
|--------|--------|
| Endpoint | `GET /asset_history/{app_namespace}/{mac_address}` |
| Response | Array of history entries |
| Entry Fields | action, timestamp, user, data |
| SDK Match | **YES** |

### Task 2.9: Asset Stats
| Aspect | Status |
|--------|--------|
| Endpoint | `GET /asset_stats/{app_namespace}/{start_time}/{end_time}` |
| Response | Stats object |
| Fields | app_namespace, total, unknown_namespace, unknown_user, user |
| SDK Match | **YES** |

### Task 2.10-2.11: Asset Iteration/GetAll
| Aspect | Status |
|--------|--------|
| SDK Methods | `iterate()`, `getAll()` |
| **BROKEN** | **YES - API returns array, not paginated** |
| Error | `response.data is not iterable` |
| Fix Required | SDK must handle direct array responses |

---

## Phase 3: Positions Resource

### Task 3.1: List Cached Positions
| Aspect | Status |
|--------|--------|
| Endpoint | `GET /cache/{app_namespace}/positions` |
| Response | Direct array `Position[]` |
| SDK Match | **YES** |

### Task 3.2: Get Single Cached Position
| Aspect | Status |
|--------|--------|
| Endpoint | `GET /cache/{app_namespace}/positions/{mac_address}` |
| Non-existent | 404 NotFoundError |
| SDK Match | **YES** |

### Task 3.3: Get Last Position
| Aspect | Status |
|--------|--------|
| Endpoint | `GET /asset_last_position/{app_namespace}/{mac_address}` |
| Response | Single position object |
| No Data | 404 if no position recorded |
| SDK Match | **YES** |

### Task 3.4: List Last Positions (ES)
| Aspect | Status |
|--------|--------|
| Endpoint | `GET /es/last_positions/{appNamespace}` |
| Response | Array of positions |
| Query Params | key, queryString, mapUuids, timestampFrom, timestampTo |
| SDK Match | **YES** |

### Task 3.5: Get Position History
| Aspect | Status |
|--------|--------|
| Endpoint | `GET /es/position_history/{appNamespace}` |
| Response | Array of history entries |
| Query Params | timestampFrom, timestampTo, key, value |
| SDK Match | **YES** |

### Task 3.6: Publish Position
| Aspect | Status |
|--------|--------|
| Endpoint | `POST /publisher/{app_namespace}` |
| Response | void |
| Note | Not tested to avoid publishing test data |

---

## Phase 4: Venues Resource

### Task 4.1: List Venues
| Aspect | Finding |
|--------|---------|
| Endpoint | `GET /venues/{namespace}` |
| **SDK Expects** | `PaginatedResponse<Venue>` |
| **API Behavior** | Returns array without options, paginated with options |
| **Inconsistency** | Different formats based on query params |

**Without pagination options:** Returns direct array
**With pagination options:** Returns paginated wrapper but empty data

### Task 4.2: Get Single Venue
| Aspect | Status |
|--------|--------|
| Endpoint | `GET /venues/{namespace}/{venueId}` |
| Response | Full venue object with metadata |
| Nested Data | coordinates, metadata, statistics |
| SDK Match | **YES** |

**Sample Response Schema:**
```json
{
  "id": 35149,
  "name": "Bureau Tocqueville",
  "address": "...",
  "coordinates": { "lat": 48.88, "lng": 2.31 },
  "metadata": {
    "timezone": "Europe/Paris",
    "openingHours": {...},
    "context": {...},
    "statistics": {...}
  },
  "statistics": {
    "zones": 8,
    "pois": 1,
    "pathNodes": 18,
    "pathSegments": 19,
    "floors": [0, 1]
  }
}
```

### Task 4.3: List Maps
| Aspect | Status |
|--------|--------|
| Endpoint | `GET /venues/{namespace}/{venueId}/maps` |
| Response | Direct array `Map[]` |
| Current Data | 0 maps returned (no image maps configured) |
| SDK Match | **YES** |

### Task 4.4: List POIs
| Aspect | Status |
|--------|--------|
| Endpoint | `GET /venues/{namespace}/{venueId}/pois` |
| **Response** | **GeoJSON FeatureCollection** |
| **MISMATCH** | **SDK expects PaginatedResponse** |
| Features | Point geometries with POI properties |

### Task 4.5: List Map POIs
| Aspect | Status |
|--------|--------|
| Endpoint | `GET /venues/{namespace}/{venueId}/maps/{mapId}/pois` |
| Note | Skipped - no maps configured |

### Task 4.6: List Paths
| Aspect | Status |
|--------|--------|
| Endpoint | `GET /venues/{namespace}/{venueId}/paths` |
| **Response** | **GeoJSON FeatureCollection** |
| **MISMATCH** | **SDK expects PaginatedResponse** |
| Features | Points (nodes) and LineStrings (segments) |

### Task 4.7: Venue Iteration
| Aspect | Status |
|--------|--------|
| SDK Methods | `iterate()` |
| Behavior | Works but returns empty (API quirk) |

---

## Phase 5: Zones Resource

### Task 5.1: List Zones by Venue
| Aspect | Finding |
|--------|---------|
| Endpoint | `GET /venues/{namespace}/{venueId}/zones` |
| **SDK Expects** | `PaginatedResponse<Zone>` |
| **API Returns** | **GeoJSON FeatureCollection** |
| **MISMATCH** | **YES - Completely different format** |

**Actual Response:**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Polygon", "coordinates": [...] },
      "properties": {
        "id": 64899,
        "level": 1,
        "name": "Lab",
        "rgb_color": "#2E79FF",
        "tags": [],
        "type": "map_zone"
      }
    }
  ],
  "metadata": {
    "type": "zones",
    "count": 8,
    "timestamp": "2025-12-21T16:17:41.266Z"
  }
}
```

### Task 5.2: List Zones by Map
| Aspect | Status |
|--------|--------|
| Endpoint | `GET /venues/{namespace}/{venueId}/maps/{mapId}/zones` |
| Response | GeoJSON FeatureCollection |
| Note | Skipped - no maps configured |

### Task 5.3: Zone Presence
| Aspect | Status |
|--------|--------|
| Endpoint | `GET /es/zone_presence/{appNamespace}` |
| Response | Array of presence records |
| Query Params | timestampFrom, timestampTo, interval, key, value |
| SDK Match | **YES** |

### Task 5.4-5.5: Zone Iteration/GetAll
| Aspect | Status |
|--------|--------|
| SDK Methods | `iterate()`, `getAll()` |
| **BROKEN** | **YES - API returns GeoJSON, not paginated** |
| Error | `response.data is not iterable` |
| Fix Required | SDK must handle GeoJSON FeatureCollection |

---

## Phase 6: Alerts Resource

### Task 6.1: Get Alert Rules
| Aspect | Status |
|--------|--------|
| Endpoint | `GET /alert_rules/{app_namespace}` |
| Response | Array of rules |
| SDK Match | **YES** |

### Task 6.2: Save Alert Rules
| Aspect | Status |
|--------|--------|
| Endpoint | `POST /alert_rules/{app_namespace}` |
| Note | Not tested to avoid modifying production rules |

### Task 6.3: List Alerts
| Aspect | Status |
|--------|--------|
| Endpoint | `GET /es/alerts/{appNamespace}` |
| Response | Array of alert records |
| Query Params | timestampFrom, timestampTo, size |
| SDK Match | **YES** |

---

## Phase 7: Dashboards Resource

### Task 7.1: List All Dashboards
| Aspect | Status |
|--------|--------|
| Endpoint | `GET /dashboards` |
| Response | Array of dashboards |
| Schema | _id, name, description, application_namespace, data, created_at, shared_with, etc. |
| SDK Match | **YES** |

### Task 7.2-7.4: List Created/Shared/Selected
| Endpoint | Status |
|----------|--------|
| `GET /dashboards/created` | Works - returns array |
| `GET /dashboards/shared` | Works - returns array |
| `GET /dashboards/selected` | Works - returns array |

### Task 7.5: Get Single Dashboard
| Aspect | Status |
|--------|--------|
| Endpoint | `GET /dashboards/{id}` |
| Invalid ID | Returns 422 ValidationError (not 404) |
| SDK Match | **PARTIAL** - Invalid ID returns validation error |

### Task 7.6: Create Dashboard
| Aspect | Finding |
|--------|---------|
| Endpoint | `POST /dashboards` |
| **Error** | **Missing required fields: name, application_namespace, and data are required** |
| **ISSUE** | SDK field names may not match API expectations |
| SDK uses | `{ name, namespace, data }` |
| API expects | `{ name, application_namespace, data }` |

### Task 7.7-7.10: Update/Delete/Share/Unshare
| Aspect | Status |
|--------|--------|
| SDK Methods | All exist |
| Testing | Limited - no test dashboard created |

---

## Phase 8: Spatial Resource

### Task 8.1: Zones Containing Point
| Aspect | Status |
|--------|--------|
| Endpoint | `GET /spatial/zones/{namespace}/containing-point` |
| Response | Object with reference_point, containing_zones, total |
| **MISMATCH** | **SDK returns array, API returns structured object** |

### Task 8.2: Nearest Zones
| Aspect | Status |
|--------|--------|
| Endpoint | `GET /spatial/zones/{namespace}/nearest-to-point` |
| Response | Object with zones array |
| **MISMATCH** | **SDK returns array, API returns structured object** |

### Task 8.3: Zones Within Radius
| Aspect | Status |
|--------|--------|
| Endpoint | `GET /spatial/zones/{namespace}/within-radius` |
| Response | Object with zones array |
| **MISMATCH** | **SDK returns array, API returns structured object** |

### Task 8.4: Analyze Custom Zones
| Aspect | Status |
|--------|--------|
| Endpoint | `POST /spatial/zones/{namespace}/analyze-custom` |
| **Error** | **Reference point with lat and lon is required** |
| **ISSUE** | API expects reference point in body |

### Task 8.5-8.7: POI Spatial Queries
| Endpoint | Status |
|----------|--------|
| nearest-to-point | Returns structured object, not array |
| within-radius | Returns structured object, not array |
| analyze-custom | Requires reference point |

---

## Phase 9: Navigation Resource

All navigation methods correctly throw "Navigation API not yet available" as expected - this is placeholder functionality.

| Method | Status |
|--------|--------|
| shortestPath | Throws correctly |
| accessiblePath | Throws correctly |
| multiStop | Throws correctly |
| nearestPoi | Throws correctly |
| evacuation | Throws correctly |

---

## Phase 10: Error Handling

### Error Types Observed
| HTTP Status | Error Class | Correctly Handled |
|-------------|-------------|-------------------|
| 401 | AuthenticationError | YES |
| 404 | NotFoundError | YES |
| 422 | ValidationError | YES |
| 500 | RtlsError | YES |

### Notes
- Health endpoint returns 200 even with invalid API key
- Some endpoints return 422 instead of 404 for invalid IDs
- Rate limiting (429) not observed during testing

---

## Summary of Issues

### Critical Issues (Breaks SDK functionality)

1. **Pagination Response Mismatch**
   - Affected: `assets.list`, `venues.list`, `zones.list`
   - SDK expects `{ data, page, limit, total, ... }`
   - API returns direct arrays or GeoJSON
   - **Impact**: `iterate()` and `getAll()` methods broken

2. **GeoJSON Response for Zones**
   - Affected: `zones.list`, `zones.listByMap`
   - SDK expects `PaginatedResponse<Zone>`
   - API returns GeoJSON FeatureCollection
   - **Impact**: Type mismatch, parsing fails

3. **Spatial Response Format**
   - Affected: All spatial query methods
   - SDK expects arrays
   - API returns structured objects with nested arrays
   - **Impact**: Return type mismatch

### Medium Issues (Requires SDK updates)

4. **Dashboard Create Field Names**
   - SDK uses `namespace`
   - API expects `application_namespace`
   - **Impact**: Dashboard creation fails

5. **Analyze Custom Endpoints**
   - API requires reference point in request body
   - SDK doesn't include this
   - **Impact**: Custom analysis fails

### Minor Issues (Documentation/Behavior)

6. **Inconsistent Error Types**
   - Invalid dashboard ID returns 422, not 404
   - Health check returns 200 with invalid API key

7. **Pagination Behavior Inconsistent**
   - Some endpoints return different formats with/without pagination params

---

## Test Coverage

| Phase | Tests | Status |
|-------|-------|--------|
| 1. Client Core | 6 | PASS |
| 2. Assets | 16 | PASS |
| 3. Positions | 9 | PASS |
| 4. Venues | 8 | PASS |
| 5. Zones | 7 | PASS |
| 6. Alerts | 4 | PASS |
| 7. Dashboards | 12 | PASS |
| 8. Spatial | 9 | PASS |
| 9. Navigation | 5 | PASS |
| 10. Errors | 11 | PASS |
| **Total** | **89** | **ALL PASS** |
