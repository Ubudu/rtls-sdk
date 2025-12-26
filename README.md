# ubudu-rtls-sdk

Official TypeScript SDK for the [Ubudu RTLS API](https://rtls.ubudu.com/api/docs).

[![npm version](https://badge.fury.io/js/ubudu-rtls-sdk.svg)](https://www.npmjs.com/package/ubudu-rtls-sdk)

## Features

- Works with JavaScript and TypeScript
- ESM, CommonJS, and browser builds included
- Full TypeScript support with auto-generated types from OpenAPI spec
- Simple, ergonomic API with default context
- **WebSocket support** for real-time position streaming and publishing
- Built-in async iterators for memory-efficient processing
- Filter DSL for building queries
- Comprehensive error handling with typed error classes
- Request timeout and cancellation support

## Installation

```bash
npm install ubudu-rtls-sdk
```

## Quick Start

### JavaScript (ESM)

```javascript
import { createRtlsClient } from 'ubudu-rtls-sdk';

// Configure once with default context
const client = createRtlsClient({
  apiKey: process.env.RTLS_API_KEY,
  namespace: 'my-namespace',
});

// List assets (uses default namespace)
const assets = await client.assets.list();

// Get real-time positions
const positions = await client.positions.listCached();

// Set venue for venue-scoped calls
client.setVenue(123);
const zones = await client.zones.list();
```

### TypeScript

```typescript
import { createRtlsClient, Asset, Position } from 'ubudu-rtls-sdk';

const client = createRtlsClient({
  apiKey: process.env.RTLS_API_KEY,
  namespace: 'my-namespace',
  venueId: 123,
});

// Full type safety
const assets: Asset[] = await client.assets.list();
const positions: Position[] = await client.positions.listCached();

// Spatial queries
const nearbyZones = await client.spatial.nearestZones({
  lat: 48.8566,
  lon: 2.3522,
  limit: 5,
});
```

### CommonJS

```javascript
const { createRtlsClient } = require('ubudu-rtls-sdk');

const client = createRtlsClient({
  apiKey: process.env.RTLS_API_KEY,
  namespace: 'my-namespace',
});
```

## Documentation

- [Getting Started](docs/guides/getting-started.md) - Installation and first API calls
- [Asset Tracking](docs/guides/asset-tracking.md) - Asset CRUD, positions, history
- [Zone & Geofencing](docs/guides/zone-geofencing.md) - Spatial queries and presence
- [Navigation](docs/guides/navigation.md) - POIs, paths, indoor routing
- [WebSocket Streaming](docs/guides/websocket.md) - Real-time data streaming
- [Error Handling](docs/guides/error-handling.md) - Error types and retry strategies
- [Advanced Patterns](docs/guides/advanced-patterns.md) - Pagination, filtering, patterns
- [Migration Guide v2](docs/guides/migration-v2.md) - Migrating to default context
- [API Reference](docs/api/README.md) - Complete API documentation

## Examples

Both JavaScript and TypeScript examples are available in [examples/](examples/):

```bash
cd examples
npm install
cp .env.example .env  # Add your credentials
```

### JavaScript Examples

```bash
npm run js:getting-started     # Basic SDK setup
npm run js:asset-tracking      # Assets and positions
npm run js:zone-geofencing     # Zones and spatial queries
npm run js:navigation          # POIs and navigation paths
npm run js:error-handling      # Error types and retry
npm run js:pagination          # Iterators and filters
npm run js:default-context     # Default context patterns
npm run js:websocket-subscriber  # Real-time event subscription
npm run js:websocket-publisher   # Position publishing
npm run js:websocket-unified     # Combined pub/sub client
npm run js:all                 # Run all JS examples (except WebSocket)
```

### TypeScript Examples

```bash
npm run ts:getting-started
npm run ts:asset-tracking
npm run ts:zone-geofencing
npm run ts:navigation
npm run ts:error-handling
npm run ts:pagination
npm run ts:default-context
npm run ts:websocket-subscriber  # Real-time event subscription
npm run ts:websocket-publisher   # Position publishing
npm run ts:websocket-unified     # Combined pub/sub client
npm run ts:all                 # Run all TS examples (except WebSocket)
```

> **Note**: WebSocket examples require `MAP_UUID` environment variable for publishing.
> They are not included in `js:all`/`ts:all` since they require additional setup.

## Resources

The SDK provides access to these API resources:

| Resource | Description |
|----------|-------------|
| `client.assets` | Asset CRUD, history, statistics |
| `client.positions` | Real-time and historical positions |
| `client.venues` | Venues, maps, POIs, paths |
| `client.zones` | Zone management and presence |
| `client.spatial` | Spatial queries (containing point, nearest, within radius) |
| `client.alerts` | Alert rules |
| `client.dashboards` | Dashboard configuration |
| `client.navigation` | Indoor routing |

## WebSocket Streaming

Real-time position updates, zone events, and alerts via WebSocket:

```typescript
import { RtlsWebSocketSubscriber, SubscriptionType } from 'ubudu-rtls-sdk';

const subscriber = new RtlsWebSocketSubscriber({
  apiKey: 'your-api-key',
  namespace: 'your-namespace',
});

// Register event handlers
subscriber.on('POSITIONS', (pos) => {
  console.log(`Tag ${pos.user_uuid} at ${pos.lat}, ${pos.lon}`);
});

subscriber.on('ALERTS', (alert) => {
  console.log(`Alert: ${alert.params.title}`);
});

// Connect and subscribe
await subscriber.connect();
await subscriber.subscribe([
  SubscriptionType.POSITIONS,
  SubscriptionType.ALERTS,
]);

// Later: disconnect
await subscriber.disconnect();
```

### Publishing Positions

Publish positions from external tracking sources:

```typescript
import { RtlsWebSocketPublisher } from 'ubudu-rtls-sdk';

const publisher = new RtlsWebSocketPublisher({
  apiKey: 'your-api-key',
  namespace: 'your-namespace',
  mapUuid: 'your-map-uuid',  // Required for publishing
});

await publisher.connect();
await publisher.sendPosition({
  macAddress: 'aabbccddeeff',
  latitude: 48.8566,
  longitude: 2.3522,
  name: 'Asset-123',
});
```

### Creating from REST Client

```typescript
const client = createRtlsClient({
  apiKey: 'your-api-key',
  namespace: 'my-namespace',
});

// Create WebSocket client that shares configuration
const ws = client.createWebSocket({ mapUuid: 'map-uuid' });
await ws.connect();
```

For Node.js environments, install the `ws` package:

```bash
npm install ws
```

See [WebSocket Guide](docs/guides/websocket.md) for complete documentation.

## Filtering

Build filters using the filter helpers:

```javascript
import { createRtlsClient, filters, combineFilters } from 'ubudu-rtls-sdk';

const client = createRtlsClient({
  apiKey: process.env.RTLS_API_KEY,
  namespace: 'my-namespace',
});

const query = combineFilters(
  filters.equals('user_type', 'forklift'),
  filters.contains('user_name', 'warehouse'),
);

const assets = await client.assets.list(query);
```

### Available Filter Operators

| Helper | Operator | Description |
|--------|----------|-------------|
| `equals` | `eq` | Exact match |
| `notEquals` | `ne` | Not equal |
| `greaterThan` | `gt` | Greater than |
| `greaterThanOrEqual` | `gte` | Greater than or equal |
| `lessThan` | `lt` | Less than |
| `lessThanOrEqual` | `lte` | Less than or equal |
| `contains` | `contains` | String contains |
| `startsWith` | `starts` | String starts with |
| `endsWith` | `ends` | String ends with |
| `matches` | `regex` | Regex match |
| `in` | `in` | Value in array |
| `notIn` | `nin` | Value not in array |
| `exists` | `exists` | Field exists |
| `between` | `between` | Value in range |

## Async Iteration

Memory-efficient processing of large datasets:

```javascript
// Uses default namespace from client
for await (const asset of client.assets.iterate()) {
  console.log(asset.user_name);

  // Can break early without fetching all data
  if (someCondition) break;
}
```

## Error Handling

The SDK provides typed errors for different failure scenarios:

```javascript
import {
  createRtlsClient,
  RtlsError,
  AuthenticationError,
  NotFoundError,
  ContextError,
} from 'ubudu-rtls-sdk';

const client = createRtlsClient({
  apiKey: process.env.RTLS_API_KEY,
  namespace: 'my-namespace',
});

try {
  await client.assets.get('invalid-mac');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log('Asset not found');
  } else if (error instanceof AuthenticationError) {
    console.log('Check your API key');
  } else if (error instanceof ContextError) {
    console.log(`Missing: ${error.field} - ${error.suggestion}`);
  } else if (error instanceof RtlsError) {
    console.log(`API error: ${error.status} - ${error.message}`);
  }
}
```

## Configuration Options

```javascript
const client = createRtlsClient({
  apiKey: 'your-api-key',           // Required: API key
  baseUrl: 'https://rtls.ubudu.com/api', // Optional: API base URL
  timeoutMs: 30000,                  // Optional: Request timeout (default: 30s)
  namespace: 'my-namespace',         // Optional: Default namespace
  venueId: 123,                      // Optional: Default venue ID
  mapId: 456,                        // Optional: Default map ID
  level: 0,                          // Optional: Default floor level
});
```

## Default Context

Configure defaults once and use throughout your application:

```javascript
// Create client with defaults
const client = createRtlsClient({
  apiKey: 'your-api-key',
  namespace: 'production',
});

// Discover and set venue at runtime
const venues = await client.venues.list();
client.setVenue(venues[0].id);

// All calls use defaults - no parameters needed
const assets = await client.assets.list();
const zones = await client.zones.list();

// Override for specific calls
const stagingAssets = await client.assets.list({ namespace: 'staging' });

// Chainable setters
client.setNamespace('other').setVenue(456).setLevel(0);

// Create scoped clients (immutable)
const venue2Client = client.forVenue(789);
```

## Requirements

- Node.js >= 18 (JavaScript or TypeScript)
- TypeScript >= 5.0 (optional, for type checking)

### Browser Support

| Browser | Minimum Version | Released |
|---------|-----------------|----------|
| Chrome | 94+ | Sep 2021 |
| Firefox | 93+ | Oct 2021 |
| Safari | 15+ | Sep 2021 |
| Edge | 94+ | Sep 2021 |

## Development

For contributors and maintainers, see [CLAUDE.md](CLAUDE.md) for development guidance.

### Quick Start (Development)

```bash
npm install          # Install dependencies
npm run generate     # Generate types from OpenAPI spec
npm run build        # Build the SDK
npm run test         # Run unit tests
npm run test:integration  # Run integration tests (requires .env)
```

## License

MIT

## Links

- [Documentation](docs/README.md)
- [API Documentation](https://rtls.ubudu.com/api/docs)
- [Ubudu Website](https://www.ubudu.com)
