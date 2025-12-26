# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2025-12-26

### Added
- **WebSocket Client** for real-time position streaming and publishing
  - `RtlsWebSocketSubscriber` - Subscribe to positions, zone events, alerts, assets
  - `RtlsWebSocketPublisher` - Publish positions from external tracking sources
  - `RtlsWebSocketClient` - Unified client with both pub/sub capabilities
  - Automatic reconnection with exponential backoff
  - Type-safe event handling with `SubscriptionType` enum
  - MAC address normalization utilities
  - Message type guards (`isPositionMessage`, `isAlertMessage`, etc.)
- JavaScript examples for WebSocket functionality (subscriber, publisher, unified)
- WebSocket streaming guide (`docs/guides/websocket.md`)
- Default context support via `createRtlsClient()` factory
- GeoJSON type definitions for zones, POIs, and paths
- Flat type exports (`Zone`, `POI`, `PathNode`, `PathSegment`)
- Spatial response types with proper structures
- Response normalizer utilities (`normalizeListResponse`, `extractDataArray`)
- GeoJSON extraction utilities (`extractZonesFromGeoJSON`, `extractPoisFromGeoJSON`, etc.)
- Convenience methods for flat array access (`listAsArray`, `listPoisAsArray`, etc.)
- Path handling for venues (`listPaths`, `listPathNodes`, `listPathSegments`)

### Changed
- Zones now return GeoJSON FeatureCollection (API-aligned)
- POIs now return GeoJSON FeatureCollection (API-aligned)
- Paths now return GeoJSON FeatureCollection with nodes and segments
- Assets, venues, and maps now return direct arrays (API-aligned)
- Spatial endpoints now return structured results with metadata
- `analyzeCustomZones` and `analyzeCustomPois` now require `reference_point` in request body
- Dashboard `create` method now correctly maps `namespace` to `application_namespace`
- Cleaned up internal development documentation (removed work packages)

### Fixed
- Dashboard create endpoint field mapping for `application_namespace`
- Type conflicts between generated and custom zone/POI types

## [0.1.0] - YYYY-MM-DD

### Added
- Initial release
- Full TypeScript support with OpenAPI-generated types
- Asset management (CRUD, batch, history, stats)
- Position tracking (cached, historical, publishing)
- Zone management and presence tracking
- Venue, map, and POI operations
- Alert management
- Dashboard operations
- Navigation (shortest path, accessible, multi-stop, evacuation)
- Spatial analysis (proximity, containment, radius)
- Pagination helpers with async iterators
- Comprehensive error handling
- Request timeout and cancellation
- ESM and CJS builds
