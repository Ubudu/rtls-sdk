# Getting Started Guide

This guide covers setting up and making your first API calls with the Ubudu RTLS SDK.

## Installation

```bash
npm install @ubudu/rtls-sdk
```

## Quick Start

### TypeScript

```typescript
import { createRtlsClient } from '@ubudu/rtls-sdk';

// Configure with default namespace (recommended)
const client = createRtlsClient({
  apiKey: 'your-api-key',
  namespace: 'your-namespace',  // Default for all calls
});

// Check API health
const health = await client.health();
console.log('API Status:', health);

// List assets (uses default namespace)
const assets = await client.assets.list();
console.log(`Found ${assets.length} assets`);
```

### JavaScript

```javascript
import { createRtlsClient } from '@ubudu/rtls-sdk';

const client = createRtlsClient({
  apiKey: process.env.RTLS_API_KEY,
  namespace: process.env.APP_NAMESPACE,
});

const assets = await client.assets.list();
```

## Configuration

### Client Options

```typescript
import { createRtlsClient, type RtlsClientOptions } from '@ubudu/rtls-sdk';

const options: RtlsClientOptions = {
  apiKey: 'your-api-key',       // Required: API key for authentication
  baseUrl: 'https://rtls.ubudu.com/api', // Optional: API base URL
  timeoutMs: 30000,             // Optional: Request timeout (default: 30s)
  namespace: 'my-namespace',    // Optional: Default namespace
  venueId: 123,                 // Optional: Default venue ID
  mapId: 456,                   // Optional: Default map ID
  level: 0,                     // Optional: Default floor level
};

const client = createRtlsClient(options);
```

### Environment Variables

We recommend using environment variables for credentials:

```bash
# .env file
APP_NAMESPACE=your-namespace
RTLS_API_KEY=your-api-key
```

```typescript
import 'dotenv/config';

const client = createRtlsClient({
  apiKey: process.env.RTLS_API_KEY!,
  namespace: process.env.APP_NAMESPACE,
});
```

## Default Context

Configure default values at client creation to avoid repetitive parameters:

### Setting Defaults

```typescript
const client = createRtlsClient({
  apiKey: 'your-api-key',
  namespace: 'production',    // Default namespace
  venueId: 123,               // Default venue ID
  mapId: 456,                 // Default map ID
  level: 0,                   // Default floor level
});

// All calls use defaults
const assets = await client.assets.list();
const zones = await client.zones.list();
const pois = await client.venues.listPois();
```

### Overriding Defaults

Override defaults for specific calls:

```typescript
// Override in options
const otherAssets = await client.assets.list({ namespace: 'staging' });

// Override venue and map
const otherZones = await client.zones.listByMap({ venueId: 789, mapId: 101 });
```

### Runtime Changes

Change defaults at runtime:

```typescript
// Mutable setters (chainable)
client
  .setNamespace('new-namespace')
  .setVenue(999)
  .setLevel(2);

// Set multiple at once
client.setContext({ namespace: 'ns', venueId: 100 });

// Clear all defaults
client.clearContext();
```

### Scoped Clients

Create immutable scoped clients for different contexts:

```typescript
// Original client unchanged
const venue1Client = client.forVenue(123);
const venue2Client = client.forVenue(456);

// Work with different venues
const venue1Assets = await venue1Client.assets.list();
const venue2Assets = await venue2Client.assets.list();

// Create fully scoped client
const scopedClient = client.withContext({
  namespace: 'production',
  venueId: 789,
  mapId: 101,
});
```

### Backward Compatibility

Legacy explicit parameters still work:

```typescript
// Legacy style (still supported)
const assets = await client.assets.list('my-namespace');
const zones = await client.zones.list('my-namespace', 123);

// New style
const assets2 = await client.assets.list();
const zones2 = await client.zones.list();
```

## API Resources

The SDK organizes the API into resource classes:

| Resource | Description |
|----------|-------------|
| `client.assets` | Asset management (CRUD, history, stats) |
| `client.positions` | Real-time and historical positions |
| `client.venues` | Venues, maps, POIs, paths |
| `client.zones` | Zones and geofencing |
| `client.spatial` | Spatial queries |
| `client.alerts` | Alert rules management |
| `client.dashboards` | Dashboard configuration |
| `client.navigation` | Indoor routing |

## Basic Operations

### Health Check

```typescript
const health = await client.health();
console.log('API is healthy:', health);
```

### List Venues

```typescript
// Uses default namespace from client
const venues = await client.venues.list();

venues.forEach(venue => {
  console.log(`Venue: ${venue.name} (ID: ${venue.id})`);
});
```

### List Assets

```typescript
// Uses default namespace from client
const assets = await client.assets.list();

assets.forEach(asset => {
  console.log(`Asset: ${asset.user_name} (${asset.user_udid})`);
});
```

### Get Cached Positions

```typescript
// Uses default namespace from client
const positions = await client.positions.listCached();

positions.forEach(pos => {
  console.log(`${pos.user_udid} at (${pos.lat}, ${pos.lon})`);
});
```

## Error Handling

The SDK provides typed error classes:

```typescript
import {
  createRtlsClient,
  NotFoundError,
  AuthenticationError,
  ContextError,
  RtlsError,
} from '@ubudu/rtls-sdk';

try {
  const asset = await client.assets.get('AA:BB:CC:DD:EE:FF');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log('Asset not found');
  } else if (error instanceof AuthenticationError) {
    console.log('Invalid API key');
  } else if (error instanceof ContextError) {
    console.log(`Missing context: ${error.field}`);
    console.log(`Solution: ${error.suggestion}`);
  } else if (error instanceof RtlsError) {
    console.log(`API error: ${error.status} - ${error.message}`);
  }
}
```

## Iterating Results

For memory-efficient processing:

```typescript
// Uses default namespace from client
for await (const asset of client.assets.iterate()) {
  console.log(asset.user_name);

  // Can break early
  if (someCondition) break;
}
```

## Filtering

```typescript
import { filters } from '@ubudu/rtls-sdk';

// Filter by type (uses default namespace)
const forklifts = await client.assets.list({
  ...filters.equals('user_type', 'forklift'),
});

// Combine filters
import { combineFilters } from '@ubudu/rtls-sdk';

const query = combineFilters(
  filters.equals('user_type', 'forklift'),
  filters.contains('user_name', 'warehouse'),
);

const assets = await client.assets.list(query);
```

## TypeScript Types

The SDK exports types for all resources:

```typescript
import type {
  Asset,
  AssetPosition,
  Venue,
  Zone,
  POI,
  PathNode,
  PathSegment,
  RtlsContext,
  CallContext,
} from '@ubudu/rtls-sdk';

// Uses default namespace from client
const asset: Asset = await client.assets.get('AA:BB:CC:DD:EE:FF');
```

## Running Examples

Clone the SDK and run examples:

```bash
# Install dependencies
cd examples
npm install

# Set up credentials
cp .env.example .env
# Edit .env with your credentials

# Run TypeScript examples
npm run ts:getting-started
npm run ts:asset-tracking
npm run ts:zone-geofencing
npm run ts:default-context

# Run JavaScript examples
npm run js:getting-started
```

## Next Steps

- [Asset Tracking](./asset-tracking.md) - Managing assets and positions
- [Zone & Geofencing](./zone-geofencing.md) - Spatial queries and geofencing
- [Navigation](./navigation.md) - Indoor routing and POIs
- [Error Handling](./error-handling.md) - Handling errors and retries
- [Advanced Patterns](./advanced-patterns.md) - Pagination, filtering, patterns
- [Migration Guide v2](./migration-v2.md) - Migrating to default context
