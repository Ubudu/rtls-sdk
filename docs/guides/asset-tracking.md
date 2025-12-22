# Asset Tracking Guide

This guide covers common asset tracking patterns with the Ubudu RTLS SDK.

## Overview

Asset tracking is the core functionality of the RTLS system. Assets represent physical items (forklifts, containers, personnel) equipped with tracking tags.

## Quick Reference

| Operation | Method | Returns |
|-----------|--------|---------|
| List assets | `client.assets.list(namespace)` | `Asset[]` |
| Get single asset | `client.assets.get(namespace, mac)` | `Asset` |
| Create asset | `client.assets.create(namespace, mac, data)` | `Asset` |
| Update asset | `client.assets.update(namespace, mac, updates)` | `Asset` |
| Delete asset | `client.assets.delete(namespace, mac)` | `void` |
| Get positions | `client.positions.listCached(namespace)` | `Position[]` |
| Get history | `client.assets.getHistory(namespace, mac, range)` | `Position[]` |

## Listing Assets

### TypeScript

```typescript
import { createRtlsClient, type Asset } from '@ubudu/rtls-sdk';

const client = createRtlsClient({ apiKey: 'your-key' });

// List all assets
const assets = await client.assets.list('your-namespace');
console.log(`Found ${assets.length} assets`);

// With filtering
import { filters } from '@ubudu/rtls-sdk';

const forklifts = await client.assets.list('namespace', {
  ...filters.equals('user_type', 'forklift')
});
```

### JavaScript

```javascript
import { createRtlsClient, filters } from '@ubudu/rtls-sdk';

const client = createRtlsClient({ apiKey: 'your-key' });

const assets = await client.assets.list('your-namespace');
console.log(`Found ${assets.length} assets`);
```

## Real-Time Positions

Cached positions provide the last known location of all active assets.

```typescript
const positions = await client.positions.listCached('namespace');

for (const pos of positions) {
  console.log(`${pos.user_udid} at (${pos.lat}, ${pos.lon})`);
}
```

## Position History

Retrieve historical positions for analysis and reporting.

```typescript
const endTime = Date.now();
const startTime = endTime - 24 * 60 * 60 * 1000; // 24 hours ago

const history = await client.assets.getHistory('namespace', 'AA:BB:CC:DD:EE:FF', {
  startTime,
  endTime
});

console.log(`Found ${history.length} position records`);
```

## Iterating Large Datasets

For memory-efficient processing of large asset lists:

```typescript
for await (const asset of client.assets.iterate('namespace')) {
  // Process each asset
  console.log(asset.user_name);
}
```

## Asset Statistics

Get aggregated statistics for your fleet:

```typescript
const stats = await client.assets.getStats('namespace', {
  startTime: Date.now() - 86400000,
  endTime: Date.now()
});
```

## Creating Assets

```typescript
const newAsset = await client.assets.create('namespace', 'AA:BB:CC:DD:EE:FF', {
  user_name: 'Forklift 1',
  user_type: 'forklift',
  color: '#FF5500',
  tags: ['warehouse', 'section-a'],
  data: { department: 'logistics' }
});
```

## Updating Assets

```typescript
const updated = await client.assets.update('namespace', 'AA:BB:CC:DD:EE:FF', {
  user_name: 'Forklift 1 - Updated',
  tags: ['warehouse', 'section-b']
});
```

## Deleting Assets

```typescript
await client.assets.delete('namespace', 'AA:BB:CC:DD:EE:FF');
```

## Batch Operations

For bulk operations:

```typescript
// Create/update multiple assets
await client.assets.batchSave('namespace', [
  { user_udid: 'AA:BB:CC:DD:EE:01', user_name: 'Asset 1' },
  { user_udid: 'AA:BB:CC:DD:EE:02', user_name: 'Asset 2' },
]);

// Delete multiple assets
await client.assets.batchDelete('namespace', [
  'AA:BB:CC:DD:EE:01',
  'AA:BB:CC:DD:EE:02'
]);
```

## Common Patterns

### Tracking Active Assets

```typescript
async function getActiveAssets(namespace: string) {
  const positions = await client.positions.listCached(namespace);
  const activeIds = new Set(positions.map(p => p.user_udid));

  const assets = await client.assets.list(namespace);
  return assets.filter(a => activeIds.has(a.user_udid));
}
```

### Finding Assets by Type

```typescript
import { filters } from '@ubudu/rtls-sdk';

const forklifts = await client.assets.list('namespace', {
  ...filters.equals('user_type', 'forklift')
});
```

### Finding Assets in a Zone

See the [Zone & Geofencing Guide](./zone-geofencing.md) for spatial queries.

## Error Handling

```typescript
import { NotFoundError, RtlsError } from '@ubudu/rtls-sdk';

try {
  const asset = await client.assets.get('namespace', 'invalid-mac');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log('Asset not found');
  } else if (error instanceof RtlsError) {
    console.log(`API error: ${error.status} - ${error.message}`);
  }
}
```

## See Also

- [Getting Started](./getting-started.md)
- [Error Handling](./error-handling.md)
- [Pagination & Filtering](./advanced-patterns.md)
