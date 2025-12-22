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

const client = createRtlsClient({
  apiKey: 'your-api-key',
});

// Check API health
const health = await client.health();
console.log('API Status:', health);

// List assets
const assets = await client.assets.list('your-namespace');
console.log(`Found ${assets.length} assets`);
```

### JavaScript

```javascript
import { createRtlsClient } from '@ubudu/rtls-sdk';

const client = createRtlsClient({
  apiKey: process.env.RTLS_API_KEY,
});

const assets = await client.assets.list('your-namespace');
```

## Configuration

### Client Options

```typescript
import { createRtlsClient, type RtlsClientOptions } from '@ubudu/rtls-sdk';

const options: RtlsClientOptions = {
  apiKey: 'your-api-key',       // Required: API key for authentication
  baseUrl: 'https://rtls.ubudu.com/api', // Optional: API base URL
  timeoutMs: 30000,             // Optional: Request timeout (default: 30s)
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
});
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
const venues = await client.venues.list('namespace');

venues.forEach(venue => {
  console.log(`Venue: ${venue.name} (ID: ${venue.id})`);
});
```

### List Assets

```typescript
const assets = await client.assets.list('namespace');

assets.forEach(asset => {
  console.log(`Asset: ${asset.user_name} (${asset.user_udid})`);
});
```

### Get Cached Positions

```typescript
const positions = await client.positions.listCached('namespace');

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
  RtlsError,
} from '@ubudu/rtls-sdk';

try {
  const asset = await client.assets.get('namespace', 'AA:BB:CC:DD:EE:FF');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log('Asset not found');
  } else if (error instanceof AuthenticationError) {
    console.log('Invalid API key');
  } else if (error instanceof RtlsError) {
    console.log(`API error: ${error.status} - ${error.message}`);
  }
}
```

## Iterating Results

For memory-efficient processing:

```typescript
for await (const asset of client.assets.iterate('namespace')) {
  console.log(asset.user_name);

  // Can break early
  if (someCondition) break;
}
```

## Filtering

```typescript
import { filters } from '@ubudu/rtls-sdk';

// Filter by type
const forklifts = await client.assets.list('namespace', {
  ...filters.equals('user_type', 'forklift'),
});

// Combine filters
import { combineFilters } from '@ubudu/rtls-sdk';

const query = combineFilters(
  filters.equals('user_type', 'forklift'),
  filters.contains('user_name', 'warehouse'),
);

const assets = await client.assets.list('namespace', query);
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
} from '@ubudu/rtls-sdk';

const asset: Asset = await client.assets.get('namespace', 'mac');
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

# Run JavaScript examples
npm run js:getting-started
```

## Next Steps

- [Asset Tracking](./asset-tracking.md) - Managing assets and positions
- [Zone & Geofencing](./zone-geofencing.md) - Spatial queries and geofencing
- [Navigation](./navigation.md) - Indoor routing and POIs
- [Error Handling](./error-handling.md) - Handling errors and retries
- [Advanced Patterns](./advanced-patterns.md) - Pagination, filtering, patterns
