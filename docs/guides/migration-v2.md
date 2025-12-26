# Migration Guide: v1.x to v2.x

## Overview

Version 2.0 introduces **default context** - the ability to configure namespace, venueId, mapId, and level at client creation. All changes are **backward compatible**.

## What's New

### Default Context at Client Creation

```typescript
// v1.x - Repeat namespace everywhere
const client = createRtlsClient({ apiKey: '...' });
await client.assets.list('my-namespace');
await client.positions.listCached('my-namespace');
await client.zones.list('my-namespace', 123);

// v2.x - Configure once
const client = createRtlsClient({
  apiKey: '...',
  namespace: 'my-namespace',
  venueId: 123,
});
await client.assets.list();
await client.positions.listCached();
await client.zones.list();
```

### New Client Methods

| Method | Description |
|--------|-------------|
| `client.namespace` | Get default namespace |
| `client.venueId` | Get default venue ID |
| `client.mapId` | Get default map ID |
| `client.level` | Get default level |
| `client.context` | Get all defaults (read-only) |
| `client.setNamespace(ns)` | Set default namespace |
| `client.setVenue(id)` | Set default venue ID |
| `client.setMap(id)` | Set default map ID |
| `client.setLevel(n)` | Set default level |
| `client.setContext({...})` | Set multiple defaults |
| `client.clearContext()` | Clear all defaults |
| `client.forNamespace(ns)` | Create scoped client |
| `client.forVenue(id)` | Create scoped client |
| `client.forMap(id)` | Create scoped client |
| `client.withContext({...})` | Create scoped client |

## Migration Steps

### Step 1: Update Client Creation (Optional)

Add default context to reduce repetition:

```typescript
// Before
const client = createRtlsClient({ apiKey: '...' });

// After (optional - adds convenience)
const client = createRtlsClient({
  apiKey: '...',
  namespace: 'my-namespace',
});
```

### Step 2: Simplify API Calls (Optional)

Remove explicit namespace from calls:

```typescript
// Before
const assets = await client.assets.list('my-namespace');

// After
const assets = await client.assets.list();
```

### Step 3: No Changes Required

All existing code continues to work:

```typescript
// This still works in v2.x
const assets = await client.assets.list('my-namespace');
const zones = await client.zones.list('my-namespace', 123);
```

## New Error: ContextError

If you call a method without providing required context:

```typescript
const client = createRtlsClient({ apiKey: '...' }); // No namespace

// Throws ContextError
await client.assets.list();
// Error: Namespace is required. Pass it to the method, set via createRtlsClient({ namespace: "..." }), or call client.setNamespace("...")
```

Handle with:

```typescript
import { ContextError } from '@ubudu/rtls-sdk';

try {
  await client.assets.list();
} catch (error) {
  if (error instanceof ContextError) {
    console.log(`Missing: ${error.field}`);
    console.log(`Fix: ${error.suggestion}`);
  }
}
```

## TypeScript Types

New types exported:

```typescript
import type {
  RtlsContext,
  CallContext,
  ResolvedNamespaceContext,
  ResolvedVenueContext,
  ResolvedMapContext,
} from '@ubudu/rtls-sdk';
```

## Common Patterns

### Multi-tenant Applications

```typescript
// Create base client with shared config
const baseClient = createRtlsClient({
  apiKey: process.env.RTLS_API_KEY,
});

// Create tenant-specific clients
function getClientForTenant(tenantNamespace: string) {
  return baseClient.forNamespace(tenantNamespace);
}

// Use per-tenant
const tenant1Client = getClientForTenant('tenant-1');
const tenant1Assets = await tenant1Client.assets.list();
```

### Venue-scoped Operations

```typescript
const client = createRtlsClient({
  apiKey: 'key',
  namespace: 'production',
});

// Work with specific venues
const venue1 = client.forVenue(123);
const venue2 = client.forVenue(456);

// Each has its own context
const venue1Zones = await venue1.zones.list();
const venue2Zones = await venue2.zones.list();
```

### Runtime Context Switching

```typescript
const client = createRtlsClient({
  apiKey: 'key',
  namespace: 'development',
});

// Switch to production
client.setNamespace('production');

// Or use scoped client (immutable)
const prodClient = client.forNamespace('production');
```

## Backward Compatibility Guarantee

All v1.x code works unchanged:

```typescript
// These all continue to work in v2.x:
await client.assets.list('namespace');
await client.assets.get('namespace', 'AA:BB:CC:DD:EE:FF');
await client.zones.list('namespace', 123);
await client.venues.listPois('namespace', 123, 456);
await client.positions.listCached('namespace');
```

The only change is that you now have the **option** to configure defaults and omit these parameters.

## See Also

- [Getting Started](./getting-started.md) - Default context setup
- [Advanced Patterns](./advanced-patterns.md) - More usage patterns
- [Error Handling](./error-handling.md) - Handling ContextError
