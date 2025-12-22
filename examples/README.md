# Ubudu RTLS SDK Examples

Runnable examples demonstrating common use cases for the Ubudu RTLS SDK.

## Prerequisites

1. Copy `.env.example` to `.env` in the project root
2. Add your API credentials:
   ```
   APP_NAMESPACE=your-namespace
   RTLS_API_KEY=your-api-key
   ```

## Running Examples

### TypeScript Examples

```bash
# Install dependencies
npm install

# Run individual examples
npm run ts:getting-started
npm run ts:asset-tracking
npm run ts:zone-geofencing
npm run ts:navigation
npm run ts:error-handling
npm run ts:pagination

# Run all TypeScript examples
npm run ts:all
```

### JavaScript Examples

```bash
npm run js:getting-started
npm run js:asset-tracking
npm run js:zone-geofencing
npm run js:navigation
npm run js:error-handling
npm run js:pagination

# Run all JavaScript examples
npm run js:all
```

## Example Categories

| Example | Description |
|---------|-------------|
| 01-getting-started | Basic SDK setup, health check, first API call |
| 02-asset-tracking | Asset CRUD, positions, history, statistics |
| 03-zone-geofencing | Zones, spatial queries, presence detection |
| 04-navigation | POIs, paths, indoor routing |
| 05-error-handling | Error types, retry strategies, validation |
| 06-pagination-filtering | Iterators, filters, batch operations |
