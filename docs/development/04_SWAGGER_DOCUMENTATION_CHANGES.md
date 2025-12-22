# Proposed Swagger Documentation Changes

## Overview

This document outlines proposed changes to the RTLS API Swagger documentation (`https://rtls.ubudu.com/api/docs/swagger.json`) to better align the documentation with the actual API implementation.

**Purpose**: Improve SDK code generation accuracy and developer experience by ensuring Swagger specs match actual API behavior.

**Note**: These are recommendations for the RTLS API team. No changes should be made to `/home/ubuntu/rtls-api`.

---

## Priority 1: Critical Schema Fixes

### 1.1 Zone List Response Schema

**Endpoint**: `GET /venues/{namespace}/{venueId}/zones`

**Current Documentation** (assumed): Returns array of Zone objects or paginated response

**Actual Behavior**: Returns GeoJSON FeatureCollection

**Proposed Swagger Change**:
```yaml
/venues/{namespace}/{venueId}/zones:
  get:
    summary: List zones for a venue
    description: Returns zones as GeoJSON FeatureCollection with Polygon geometries
    responses:
      200:
        description: GeoJSON FeatureCollection containing zone features
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ZoneFeatureCollection'

components:
  schemas:
    ZoneFeatureCollection:
      type: object
      required:
        - type
        - features
        - metadata
      properties:
        type:
          type: string
          enum: ['FeatureCollection']
        features:
          type: array
          items:
            $ref: '#/components/schemas/ZoneFeature'
        metadata:
          type: object
          properties:
            type:
              type: string
              enum: ['zones']
            count:
              type: integer
            timestamp:
              type: string
              format: date-time

    ZoneFeature:
      type: object
      required:
        - type
        - geometry
        - properties
      properties:
        type:
          type: string
          enum: ['Feature']
        geometry:
          $ref: '#/components/schemas/PolygonGeometry'
        properties:
          $ref: '#/components/schemas/ZoneProperties'

    ZoneProperties:
      type: object
      required:
        - id
        - name
        - level
      properties:
        id:
          type: integer
        name:
          type: string
        level:
          type: integer
        rgb_color:
          type: string
          description: Hex color code (e.g., "#FF0000")
        tags:
          type: array
          items:
            type: string
        type:
          type: string
          enum: ['map_zone']

    PolygonGeometry:
      type: object
      required:
        - type
        - coordinates
      properties:
        type:
          type: string
          enum: ['Polygon']
        coordinates:
          type: array
          items:
            type: array
            items:
              type: array
              items:
                type: number
```

---

### 1.2 POI List Response Schema

**Endpoint**: `GET /venues/{namespace}/{venueId}/pois`

**Current Documentation** (assumed): Returns array of POI objects

**Actual Behavior**: Returns GeoJSON FeatureCollection with Point geometries

**Proposed Swagger Change**:
```yaml
/venues/{namespace}/{venueId}/pois:
  get:
    summary: List POIs for a venue
    description: Returns POIs as GeoJSON FeatureCollection with Point geometries
    responses:
      200:
        description: GeoJSON FeatureCollection containing POI features
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/POIFeatureCollection'

components:
  schemas:
    POIFeatureCollection:
      type: object
      required:
        - type
        - features
        - metadata
      properties:
        type:
          type: string
          enum: ['FeatureCollection']
        features:
          type: array
          items:
            $ref: '#/components/schemas/POIFeature'
        metadata:
          type: object
          properties:
            type:
              type: string
              enum: ['pois']
            count:
              type: integer
            timestamp:
              type: string
              format: date-time

    POIFeature:
      type: object
      required:
        - type
        - geometry
        - properties
      properties:
        type:
          type: string
          enum: ['Feature']
        geometry:
          $ref: '#/components/schemas/PointGeometry'
        properties:
          $ref: '#/components/schemas/POIProperties'

    POIProperties:
      type: object
      required:
        - id
        - name
      properties:
        id:
          type: integer
        name:
          type: string
        description:
          type: string
        level:
          type: integer
        color:
          type: string
        tags:
          type: array
          items:
            type: string
        coordinates:
          type: object
          properties:
            lat:
              type: number
            lng:
              type: number
        _id:
          type: string
          description: MongoDB ObjectId
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time
        externalId:
          type: integer
        externalVenueId:
          type: integer
        externalApplicationId:
          type: integer
        index:
          type: integer

    PointGeometry:
      type: object
      required:
        - type
        - coordinates
      properties:
        type:
          type: string
          enum: ['Point']
        coordinates:
          type: array
          items:
            type: number
          minItems: 2
          maxItems: 2
          description: '[longitude, latitude]'
```

---

### 1.3 Path List Response Schema

**Endpoint**: `GET /venues/{namespace}/{venueId}/paths`

**Actual Behavior**: Returns GeoJSON FeatureCollection with mixed Point (nodes) and LineString (segments) geometries

**Proposed Swagger Change**:
```yaml
/venues/{namespace}/{venueId}/paths:
  get:
    summary: List navigation paths for a venue
    description: |
      Returns navigation graph as GeoJSON FeatureCollection containing:
      - Path nodes (Point geometries): waypoints, entrances, exits, elevators, stairs
      - Path segments (LineString geometries): connections between nodes
    responses:
      200:
        description: GeoJSON FeatureCollection containing path features
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/PathFeatureCollection'

components:
  schemas:
    PathFeatureCollection:
      type: object
      required:
        - type
        - features
        - metadata
      properties:
        type:
          type: string
          enum: ['FeatureCollection']
        features:
          type: array
          items:
            oneOf:
              - $ref: '#/components/schemas/PathNodeFeature'
              - $ref: '#/components/schemas/PathSegmentFeature'
        metadata:
          type: object
          properties:
            type:
              type: string
              enum: ['paths']
            timestamp:
              type: string
              format: date-time

    PathNodeFeature:
      type: object
      properties:
        type:
          type: string
          enum: ['Feature']
        geometry:
          $ref: '#/components/schemas/PointGeometry'
        properties:
          type: object
          properties:
            id:
              type: integer
            external_id:
              type: integer
            type:
              type: string
              enum: ['path_node']
            node_type:
              type: string
              enum: ['waypoint', 'entrance', 'exit', 'elevator', 'stairs']
            name:
              type: string
            level:
              type: integer
            is_active:
              type: boolean
            cross_level_connections:
              type: array
              items:
                type: integer
            tags:
              type: array
              items:
                type: string

    PathSegmentFeature:
      type: object
      properties:
        type:
          type: string
          enum: ['Feature']
        geometry:
          $ref: '#/components/schemas/LineStringGeometry'
        properties:
          type: object
          properties:
            id:
              type: integer
            type:
              type: string
              enum: ['path_segment']
            start_node_id:
              type: integer
            end_node_id:
              type: integer
            is_bidirectional:
              type: boolean
            weight:
              type: number
            level:
              type: integer

    LineStringGeometry:
      type: object
      required:
        - type
        - coordinates
      properties:
        type:
          type: string
          enum: ['LineString']
        coordinates:
          type: array
          items:
            type: array
            items:
              type: number
            minItems: 2
            maxItems: 2
```

---

## Priority 2: Spatial Endpoint Schemas

### 2.1 Zones Containing Point Response

**Endpoint**: `GET /spatial/zones/{namespace}/containing-point`

**Current Documentation** (assumed): Returns array of zones

**Actual Behavior**: Returns structured object with metadata

**Proposed Swagger Change**:
```yaml
/spatial/zones/{namespace}/containing-point:
  get:
    summary: Find zones containing a geographic point
    parameters:
      - name: namespace
        in: path
        required: true
        schema:
          type: string
      - name: lat
        in: query
        required: true
        schema:
          type: number
          format: double
      - name: lon
        in: query
        required: true
        schema:
          type: number
          format: double
      - name: level
        in: query
        required: false
        schema:
          type: integer
        description: Filter by floor level
    responses:
      200:
        description: Zones containing the specified point
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ZonesContainingPointResponse'

components:
  schemas:
    ZonesContainingPointResponse:
      type: object
      required:
        - reference_point
        - containing_zones
        - total
      properties:
        reference_point:
          type: object
          properties:
            lat:
              type: number
            lon:
              type: number
        level:
          type: integer
          nullable: true
        containing_zones:
          type: array
          items:
            $ref: '#/components/schemas/ZoneWithDistance'
        total:
          type: integer
```

---

### 2.2 Nearest Zones Response

**Endpoint**: `GET /spatial/zones/{namespace}/nearest-to-point`

**Proposed Swagger Change**:
```yaml
/spatial/zones/{namespace}/nearest-to-point:
  get:
    summary: Find nearest zones to a geographic point
    parameters:
      - name: namespace
        in: path
        required: true
        schema:
          type: string
      - name: lat
        in: query
        required: true
        schema:
          type: number
      - name: lon
        in: query
        required: true
        schema:
          type: number
      - name: limit
        in: query
        required: false
        schema:
          type: integer
          default: 10
      - name: level
        in: query
        required: false
        schema:
          type: integer
      - name: max_distance_meters
        in: query
        required: false
        schema:
          type: number
    responses:
      200:
        description: Nearest zones sorted by distance
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/NearestZonesResponse'

components:
  schemas:
    NearestZonesResponse:
      type: object
      required:
        - reference_point
        - zones
        - total_zones
        - hasMore
      properties:
        reference_point:
          type: object
          properties:
            lat:
              type: number
            lon:
              type: number
        level:
          type: integer
          nullable: true
        max_distance_meters:
          type: number
          nullable: true
        total_zones:
          type: integer
        zones:
          type: array
          items:
            $ref: '#/components/schemas/ZoneWithDistance'
        hasMore:
          type: boolean

    ZoneWithDistance:
      allOf:
        - $ref: '#/components/schemas/ZoneProperties'
        - type: object
          properties:
            distance_meters:
              type: number
              description: Distance from reference point in meters
            geometry:
              $ref: '#/components/schemas/PolygonGeometry'
```

---

### 2.3 Zones Within Radius Response

**Endpoint**: `GET /spatial/zones/{namespace}/within-radius`

**Proposed Swagger Change**:
```yaml
/spatial/zones/{namespace}/within-radius:
  get:
    summary: Find zones within a radius of a geographic point
    parameters:
      - name: namespace
        in: path
        required: true
        schema:
          type: string
      - name: lat
        in: query
        required: true
        schema:
          type: number
      - name: lon
        in: query
        required: true
        schema:
          type: number
      - name: radius_meters
        in: query
        required: true
        schema:
          type: number
      - name: level
        in: query
        required: false
        schema:
          type: integer
    responses:
      200:
        description: Zones within the specified radius
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ZonesWithinRadiusResponse'

components:
  schemas:
    ZonesWithinRadiusResponse:
      type: object
      required:
        - reference_point
        - radius_meters
        - zones
        - total_zones
      properties:
        reference_point:
          type: object
          properties:
            lat:
              type: number
            lon:
              type: number
        radius_meters:
          type: number
        level:
          type: integer
          nullable: true
        total_zones:
          type: integer
        zones:
          type: array
          items:
            $ref: '#/components/schemas/ZoneWithDistance'
```

---

### 2.4 Analyze Custom Zones Request Body

**Endpoint**: `POST /spatial/zones/{namespace}/analyze-custom`

**Issue**: API requires `reference_point` in request body, not documented

**Proposed Swagger Change**:
```yaml
/spatial/zones/{namespace}/analyze-custom:
  post:
    summary: Analyze custom zone geometries against a reference point
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required:
              - reference_point
              - zones
            properties:
              reference_point:
                type: object
                required:
                  - lat
                  - lon
                properties:
                  lat:
                    type: number
                    format: double
                  lon:
                    type: number
                    format: double
              zones:
                type: array
                items:
                  $ref: '#/components/schemas/ZoneFeature'
                description: GeoJSON Feature array with Polygon geometries
    responses:
      200:
        description: Analysis results
        content:
          application/json:
            schema:
              type: object
              properties:
                reference_point:
                  type: object
                  properties:
                    lat:
                      type: number
                    lon:
                      type: number
                analyzed_zones:
                  type: array
                  items:
                    type: object
```

---

## Priority 3: Asset Endpoint Clarifications

### 3.1 Asset List Response

**Endpoint**: `GET /assets/{app_namespace}`

**Issue**: Returns direct array, not paginated response

**Proposed Swagger Change**:
```yaml
/assets/{app_namespace}:
  get:
    summary: List all assets for a namespace
    description: |
      Returns all assets as a direct array. Pagination is not supported.
      For large datasets, consider using filtering or batching.
    parameters:
      - name: app_namespace
        in: path
        required: true
        schema:
          type: string
    responses:
      200:
        description: Array of assets
        content:
          application/json:
            schema:
              type: array
              items:
                $ref: '#/components/schemas/Asset'

components:
  schemas:
    Asset:
      type: object
      required:
        - user_udid
        - user_name
      properties:
        user_udid:
          type: string
          description: MAC address identifier
        user_name:
          type: string
        user_type:
          type: string
        user_motion:
          type: string
        color:
          type: string
          description: Hex color code
        model:
          type: string
        path:
          type: string
          description: Category path
        tags:
          type: array
          items:
            type: string
        data:
          type: object
          additionalProperties: true
        createdBy:
          type: string
        dateCreated:
          type: integer
          format: int64
          description: Unix timestamp in milliseconds
        targetApplications:
          type: array
          items:
            type: string
```

---

## Priority 4: Dashboard Endpoint Fixes

### 4.1 Dashboard Create Request

**Endpoint**: `POST /dashboards`

**Issue**: SDK uses `namespace`, API expects `application_namespace`

**Proposed Swagger Change**:
```yaml
/dashboards:
  post:
    summary: Create a new dashboard
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required:
              - name
              - application_namespace
              - data
            properties:
              name:
                type: string
                description: Dashboard display name
              application_namespace:
                type: string
                description: |
                  Application namespace this dashboard belongs to.
                  Note: Field name is 'application_namespace', not 'namespace'.
              data:
                type: array
                items:
                  $ref: '#/components/schemas/DashboardWidget'
                description: Array of dashboard widgets
    responses:
      201:
        description: Dashboard created successfully
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Dashboard'
      400:
        description: Validation error
        content:
          application/json:
            schema:
              type: object
              properties:
                error:
                  type: string
                message:
                  type: string
                  example: "Missing required fields: name, application_namespace, and data are required"
```

---

## Priority 5: Error Response Standardization

### 5.1 Standard Error Response Schema

**Issue**: Error responses are inconsistent across endpoints

**Proposed Addition**:
```yaml
components:
  schemas:
    ErrorResponse:
      type: object
      required:
        - error
        - message
      properties:
        error:
          type: string
          description: Error type
          enum:
            - 'Unauthorized'
            - 'Forbidden'
            - 'Not Found'
            - 'Validation Error'
            - 'Internal Server Error'
        message:
          type: string
          description: Human-readable error message
        details:
          type: object
          additionalProperties: true
          description: Additional error details (optional)

  responses:
    UnauthorizedError:
      description: Invalid or missing API key
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          example:
            error: 'Unauthorized'
            message: 'Invalid API key'

    NotFoundError:
      description: Resource not found
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          example:
            error: 'Not Found'
            message: 'Resource not found'

    ValidationError:
      description: Request validation failed
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          example:
            error: 'Validation Error'
            message: 'Invalid request parameters'
```

---

## Priority 6: Venue Endpoint Clarifications

### 6.1 Venue List Response

**Endpoint**: `GET /venues/{namespace}`

**Issue**: Returns direct array, documentation may suggest pagination

**Proposed Swagger Change**:
```yaml
/venues/{namespace}:
  get:
    summary: List all venues for a namespace
    description: Returns all venues as a direct array. Pagination is not supported.
    responses:
      200:
        description: Array of venues
        content:
          application/json:
            schema:
              type: array
              items:
                $ref: '#/components/schemas/VenueListItem'

components:
  schemas:
    VenueListItem:
      type: object
      properties:
        id:
          type: integer
        name:
          type: string
        address:
          type: string
        coordinates:
          type: object
          properties:
            lat:
              type: number
            lng:
              type: number
              description: Note - uses 'lng' not 'lon'
        hasMetadata:
          type: boolean
        lastUpdated:
          type: string
          format: date-time
        statistics:
          type: object
          properties:
            zones:
              type: integer
            pois:
              type: integer
            pathNodes:
              type: integer
            pathSegments:
              type: integer
            floors:
              type: array
              items:
                type: integer
```

---

## Summary of Changes

| Endpoint | Issue | Change Required |
|----------|-------|-----------------|
| `GET /venues/{ns}/{id}/zones` | Returns GeoJSON, not array | Update response schema |
| `GET /venues/{ns}/{id}/pois` | Returns GeoJSON, not array | Update response schema |
| `GET /venues/{ns}/{id}/paths` | Returns GeoJSON with mixed types | Update response schema |
| `GET /assets/{ns}` | Returns array, not paginated | Document array response |
| `GET /venues/{ns}` | Returns array, not paginated | Document array response |
| `GET /spatial/zones/*/containing-point` | Returns object, not array | Update response schema |
| `GET /spatial/zones/*/nearest-to-point` | Returns object, not array | Update response schema |
| `GET /spatial/zones/*/within-radius` | Returns object, not array | Update response schema |
| `POST /spatial/zones/*/analyze-custom` | Missing reference_point | Document required field |
| `POST /dashboards` | Field name mismatch | Document application_namespace |

---

## Implementation Notes

### For RTLS API Team

1. **Backward Compatibility**: These changes document existing behavior, no API changes needed
2. **Code Generation**: Updated schemas will improve SDK generation accuracy
3. **Validation**: Consider adding OpenAPI schema validation to CI/CD
4. **Versioning**: If changing response formats in future, use API versioning

### Schema File Location

The Swagger spec should be updated at:
- Source: API codebase Swagger definitions
- Published: `https://rtls.ubudu.com/api/docs/swagger.json`

### Testing

After updating Swagger:
1. Regenerate SDK types with `npm run generate`
2. Verify generated types match these schemas
3. Run SDK test suite to validate compatibility
