# Asset Tracking Guide

This guide covers common asset tracking patterns with the Ubudu RTLS SDK.

## Overview

Asset tracking is the core functionality of the RTLS system. Assets represent physical items (forklifts, containers, personnel) equipped with tracking tags.

## Quick Reference

| Operation | Method | Returns |
|-----------|--------|---------|
| List assets | `client.assets.list()` | `Asset[]` |
| Get single asset | `client.assets.get(mac)` | `Asset` |
| Create asset | `client.assets.create(mac, data)` | `Asset` |
| Update asset | `client.assets.update(mac, updates)` | `Asset` |
| Delete asset | `client.assets.delete(mac)` | `void` |
| Get positions | `client.positions.listCached()` | `Position[]` |
| Get history | `client.assets.getHistory(mac, range)` | `Position[]` |

> **Note:** All methods use the default namespace from client configuration. You can override per-call with `{ namespace: 'other' }` or use explicit namespace as first argument for backward compatibility.

## Listing Assets

### TypeScript

```typescript
import { createRtlsClient, type Asset, filters } from '@ubudu/rtls-sdk';

// Configure with default namespace
const client = createRtlsClient({
  apiKey: 'your-key',
  namespace: 'your-namespace',
});

// List all assets (uses default namespace)
const assets = await client.assets.list();
console.log(`Found ${assets.length} assets`);

// With filtering
const forklifts = await client.assets.list({
  ...filters.equals('user_type', 'forklift')
});

// Override namespace for specific call
const otherAssets = await client.assets.list({ namespace: 'other-ns' });
```

### JavaScript

```javascript
import { createRtlsClient, filters } from '@ubudu/rtls-sdk';

const client = createRtlsClient({
  apiKey: 'your-key',
  namespace: 'your-namespace',
});

const assets = await client.assets.list();
console.log(`Found ${assets.length} assets`);
```

## Real-Time Positions

Cached positions provide the last known location of all active assets.

```typescript
// Uses default namespace
const positions = await client.positions.listCached();

for (const pos of positions) {
  console.log(`${pos.user_udid} at (${pos.lat}, ${pos.lon})`);
}
```

## Position History

Retrieve historical positions for analysis and reporting.

```typescript
const endTime = Date.now();
const startTime = endTime - 24 * 60 * 60 * 1000; // 24 hours ago

// Uses default namespace
const history = await client.assets.getHistory('AA:BB:CC:DD:EE:FF', {
  startTime,
  endTime
});

console.log(`Found ${history.length} position records`);
```

## Iterating Large Datasets

For memory-efficient processing of large asset lists:

```typescript
// Uses default namespace
for await (const asset of client.assets.iterate()) {
  // Process each asset
  console.log(asset.user_name);
}
```

## Asset Statistics

Get aggregated statistics for your fleet:

```typescript
// Uses default namespace
const stats = await client.assets.getStats({
  startTime: Date.now() - 86400000,
  endTime: Date.now()
});
```

## Creating Assets

```typescript
// Uses default namespace
const newAsset = await client.assets.create('AA:BB:CC:DD:EE:FF', {
  user_name: 'Forklift 1',
  user_type: 'forklift',
  color: '#FF5500',
  tags: ['warehouse', 'section-a'],
  data: { department: 'logistics' }
});
```

## Updating Assets

```typescript
// Uses default namespace
const updated = await client.assets.update('AA:BB:CC:DD:EE:FF', {
  user_name: 'Forklift 1 - Updated',
  tags: ['warehouse', 'section-b']
});
```

## Deleting Assets

```typescript
// Uses default namespace
await client.assets.delete('AA:BB:CC:DD:EE:FF');
```

## Batch Operations

For bulk operations:

```typescript
// Uses default namespace
// Create/update multiple assets
await client.assets.batchSave([
  { user_udid: 'AA:BB:CC:DD:EE:01', user_name: 'Asset 1' },
  { user_udid: 'AA:BB:CC:DD:EE:02', user_name: 'Asset 2' },
]);

// Delete multiple assets
await client.assets.batchDelete([
  'AA:BB:CC:DD:EE:01',
  'AA:BB:CC:DD:EE:02'
]);
```

## Common Patterns

### Tracking Active Assets

```typescript
// Uses default namespace from client
async function getActiveAssets() {
  const positions = await client.positions.listCached();
  const activeIds = new Set(positions.map(p => p.user_udid));

  const assets = await client.assets.list();
  return assets.filter(a => activeIds.has(a.user_udid));
}
```

### Finding Assets by Type

```typescript
import { filters } from '@ubudu/rtls-sdk';

// Uses default namespace
const forklifts = await client.assets.list({
  ...filters.equals('user_type', 'forklift')
});
```

### Multi-venue Asset Tracking

```typescript
// Create venue-scoped clients
const venue1Client = client.forVenue(123);
const venue2Client = client.forVenue(456);

// Track assets in parallel
const [venue1Assets, venue2Assets] = await Promise.all([
  venue1Client.assets.list(),
  venue2Client.assets.list(),
]);
```

### Finding Assets in a Zone

See the [Zone & Geofencing Guide](./zone-geofencing.md) for spatial queries.

## Error Handling

```typescript
import { NotFoundError, ContextError, RtlsError } from '@ubudu/rtls-sdk';

try {
  const asset = await client.assets.get('invalid-mac');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log('Asset not found');
  } else if (error instanceof ContextError) {
    console.log(`Missing context: ${error.field}`);
  } else if (error instanceof RtlsError) {
    console.log(`API error: ${error.status} - ${error.message}`);
  }
}
```

## See Also

- [Getting Started](./getting-started.md)
- [Error Handling](./error-handling.md)
- [Pagination & Filtering](./advanced-patterns.md)
- [Migration Guide](./migration-v2.md)
