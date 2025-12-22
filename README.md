# @ubudu/rtls-sdk

Official TypeScript SDK for the [Ubudu RTLS API](https://rtls.ubudu.com/api/docs).

[![npm version](https://badge.fury.io/js/%40ubudu%2Frtls-sdk.svg)](https://www.npmjs.com/package/@ubudu/rtls-sdk)
[![CI](https://github.com/ubudu/rtls-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/ubudu/rtls-sdk/actions/workflows/ci.yml)

## Features

- Full TypeScript support with auto-generated types from OpenAPI spec
- Works in Node.js (>=18) and modern browsers
- Simple, ergonomic API design
- Built-in async iterators for memory-efficient processing
- Type-safe filter DSL
- Comprehensive error handling with typed error classes
- Request timeout and cancellation support
- Tree-shakeable ESM and CJS builds

## Installation

```bash
npm install @ubudu/rtls-sdk
```

## Quick Start

```typescript
import { createRtlsClient } from '@ubudu/rtls-sdk';

const client = createRtlsClient({
  apiKey: process.env.RTLS_API_KEY,
});

// Check API health
const health = await client.health();

// List assets
const assets = await client.assets.list('my-namespace');

// Get real-time positions
const positions = await client.positions.listCached('my-namespace');

// Spatial query
const nearbyZones = await client.spatial.nearestZones('my-namespace', {
  lat: 48.8566,
  lon: 2.3522,
  limit: 5,
});
```

## Documentation

- [Getting Started](docs/guides/getting-started.md) - Installation and first API calls
- [Asset Tracking](docs/guides/asset-tracking.md) - Asset CRUD, positions, history
- [Zone & Geofencing](docs/guides/zone-geofencing.md) - Spatial queries and presence
- [Navigation](docs/guides/navigation.md) - POIs, paths, indoor routing
- [Error Handling](docs/guides/error-handling.md) - Error types and retry strategies
- [Advanced Patterns](docs/guides/advanced-patterns.md) - Pagination, filtering, patterns
- [API Reference](docs/api/README.md) - Complete API documentation

## Examples

Run the examples in the [examples/](examples/) directory:

```bash
cd examples
npm install
cp .env.example .env  # Add your credentials

# TypeScript examples
npm run ts:getting-started
npm run ts:asset-tracking
npm run ts:zone-geofencing
npm run ts:navigation
npm run ts:error-handling
npm run ts:pagination

# JavaScript examples
npm run js:all
```

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

## Filtering

Build type-safe filters using the filter helpers:

```typescript
import { filters, combineFilters } from '@ubudu/rtls-sdk';

const query = combineFilters(
  filters.equals('user_type', 'forklift'),
  filters.contains('user_name', 'warehouse'),
);

const assets = await client.assets.list('namespace', query);
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

```typescript
for await (const asset of client.assets.iterate('namespace')) {
  console.log(asset.user_name);

  // Can break early
  if (someCondition) break;
}
```

## Error Handling

The SDK provides typed errors for different failure scenarios:

```typescript
import {
  RtlsError,
  AuthenticationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  TimeoutError,
  NetworkError,
} from '@ubudu/rtls-sdk';

try {
  await client.assets.get('namespace', 'invalid-mac');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log('Asset not found');
  } else if (error instanceof AuthenticationError) {
    console.log('Check your API key');
  } else if (error instanceof RateLimitError) {
    console.log(`Retry after ${error.retryAfter}ms`);
  } else if (error instanceof RtlsError) {
    console.log(`API error: ${error.status} - ${error.message}`);
  }
}
```

## Configuration Options

```typescript
const client = createRtlsClient({
  apiKey: 'your-api-key',           // Required: API key
  baseUrl: 'https://rtls.ubudu.com/api', // Optional: API base URL
  timeoutMs: 30000,                  // Optional: Request timeout (default: 30s)
});
```

## Requirements

- Node.js >= 18
- TypeScript >= 5.0 (for TypeScript users)

## Development

For contributors and maintainers, see [CLAUDE.md](CLAUDE.md) for development guidance.

### Work Packages

| Status | Work Package | Description |
|--------|--------------|-------------|
| Done | [WP1: SDK Implementation](docs/development/01_WORK_PACKAGE.md) | Core SDK implementation (47 tasks) |
| Done | [WP2: API Validation](docs/development/02_API_VALIDATION_WORKPACKAGE.md) | Live API testing (68 tasks) |
| Done | [WP3: SDK Alignment](docs/development/03_SDK_ALIGNMENT_WORKPACKAGE.md) | v1.0.0 breaking changes (28 tasks) |
| Done | [WP4: SDK Documentation](docs/development/04_SDK_DOCUMENTATION_WORKPACKAGE.md) | Examples & guides (52 tasks) |

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
