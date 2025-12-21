# @ubudu/rtls-sdk

Official TypeScript SDK for the [Ubudu RTLS API](https://rtls.ubudu.com) - Real-Time Location System for indoor positioning and asset tracking.

## Features

- Full TypeScript support with auto-generated types from OpenAPI spec
- Works in Node.js and browsers
- Async pagination helpers
- Fluent filter API
- Comprehensive error handling
- ESM and CommonJS support

## Installation

```bash
npm install @ubudu/rtls-sdk
```

## Quick Start

```typescript
import { RtlsClient } from '@ubudu/rtls-sdk';

const client = new RtlsClient({
  apiKey: 'your-api-key',
});

// List assets in a namespace
const assets = await client.assets.list('your-namespace');
console.log(assets.data);

// Get real-time positions
const positions = await client.positions.list('your-namespace');

// Use filters
import { filters } from '@ubudu/rtls-sdk';

const lowBatteryAssets = await client.assets.list('your-namespace', {
  ...filters.lessThan('battery', 20),
});
```

## Authentication

The SDK supports two authentication methods:

```typescript
// API Key authentication
const client = new RtlsClient({
  apiKey: 'your-api-key',
});

// Bearer token authentication
const client = new RtlsClient({
  accessToken: 'your-access-token',
});
```

## Pagination

The SDK provides utilities for handling paginated responses:

```typescript
import { paginate, collectAll } from '@ubudu/rtls-sdk';

// Async iterator for memory-efficient processing
for await (const asset of paginate((page, limit) =>
  client.assets.list('namespace', { page, limit })
)) {
  console.log(asset);
}

// Collect all items at once
const allAssets = await collectAll((page, limit) =>
  client.assets.list('namespace', { page, limit })
);
```

## Filtering

Build type-safe filters using the filter helpers:

```typescript
import { filters, combineFilters } from '@ubudu/rtls-sdk';

const query = combineFilters(
  filters.equals('status', 'active'),
  filters.greaterThan('battery', 50),
  filters.contains('name', 'forklift'),
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

## Error Handling

The SDK provides typed errors for different failure scenarios:

```typescript
import {
  RtlsError,
  AuthenticationError,
  NotFoundError,
  ValidationError,
  RateLimitError
} from '@ubudu/rtls-sdk';

try {
  await client.assets.get('namespace', 'invalid-mac');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log('Asset not found');
  } else if (error instanceof AuthenticationError) {
    console.log('Check your API key');
  } else if (error instanceof RateLimitError) {
    console.log(`Retry after ${error.retryAfter} seconds`);
  } else if (error instanceof RtlsError) {
    console.log(`API error: ${error.status} - ${error.message}`);
  }
}
```

## Resources

The SDK exposes the following resource namespaces:

- `client.assets` - Asset management
- `client.positions` - Real-time and historical positions
- `client.zones` - Zone definitions and geofencing
- `client.venues` - Venue configuration
- `client.pois` - Points of interest
- `client.alerts` - Alert rules and history
- `client.navigation` - Indoor navigation and routing

## Configuration Options

```typescript
const client = new RtlsClient({
  baseUrl: 'https://rtls.ubudu.com/api',  // API base URL
  apiKey: 'your-api-key',                  // API key authentication
  accessToken: 'your-token',               // Bearer token authentication
  timeoutMs: 30000,                         // Request timeout (default: 30s)
  headers: { 'X-Custom': 'value' },        // Additional headers
  fetch: customFetch,                       // Custom fetch implementation
});
```

## Low-Level Access

For advanced use cases, access the underlying `openapi-fetch` client:

```typescript
const response = await client.raw.GET('/health');
```

## Requirements

- Node.js >= 18
- TypeScript >= 5.0 (for TypeScript users)

## License

MIT

## Links

- [API Documentation](https://rtls.ubudu.com/api/docs)
- [Ubudu Website](https://www.ubudu.com)
