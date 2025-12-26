# Advanced Patterns Guide

This guide covers pagination, filtering, and advanced usage patterns with the Ubudu RTLS SDK.

> **Note:** All examples assume you have configured a client with default context:
> ```typescript
> const client = createRtlsClient({
>   apiKey: 'your-key',
>   namespace: 'your-namespace',
>   venueId: 123,
> });
> ```

## Pagination

### Async Iterator Pattern

The SDK provides async iterators for memory-efficient data processing:

```typescript
// Process items one at a time (uses default namespace)
for await (const asset of client.assets.iterate()) {
  console.log(asset.user_name);

  // Can break early
  if (someCondition) break;
}
```

### Collecting All Results

```typescript
// Get all assets as array (uses default namespace)
const assets = await client.assets.getAll();

// Equivalent to
const assets2 = await client.assets.list();
```

### Batch Processing

```typescript
async function processBatches<T>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<void>
) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await processor(batch);
  }
}

// Uses default namespace
const assets = await client.assets.list();
await processBatches(assets, 10, async (batch) => {
  // Process batch of 10 assets
  console.log(`Processing ${batch.length} assets`);
});
```

## Filtering

### Filter DSL

The SDK provides a fluent filter DSL:

```typescript
import { filters, combineFilters, filter } from '@ubudu/rtls-sdk';
```

### Basic Operators

```typescript
// Equality
filters.equals('user_type', 'forklift')      // user_type = 'forklift'
filters.notEquals('status', 'inactive')       // status != 'inactive'

// Comparison
filters.greaterThan('count', 10)              // count > 10
filters.greaterThanOrEqual('count', 10)       // count >= 10
filters.lessThan('count', 10)                 // count < 10
filters.lessThanOrEqual('count', 10)          // count <= 10

// String matching
filters.contains('user_name', 'truck')        // user_name contains 'truck'
filters.startsWith('user_name', 'Fork')       // user_name starts with 'Fork'
filters.endsWith('user_name', 'Bot')          // user_name ends with 'Bot'
filters.matches('user_name', '^F.*k$')        // regex match
```

### Array Operators

```typescript
// Array membership
filters.in('status', ['active', 'idle'])      // status in ['active', 'idle']
filters.notIn('type', ['test', 'demo'])       // type not in ['test', 'demo']

// Array content
filters.all('tags', ['priority', 'urgent'])   // tags has all values
filters.size('tags', 3)                       // tags array has 3 items

// Field existence
filters.exists('metadata', true)              // metadata field exists
filters.exists('deleted_at', false)           // deleted_at doesn't exist
```

### Range Operators

```typescript
// Range
filters.between('value', 0, 100)              // 0 <= value <= 100
```

### Combining Filters

```typescript
// Combine multiple filters (AND logic)
const combined = combineFilters(
  filters.equals('user_type', 'forklift'),
  filters.contains('user_name', 'warehouse'),
  filters.exists('last_seen', true)
);

// Uses default namespace
const assets = await client.assets.list(combined);
```

### Raw Filter Function

For custom operators:

```typescript
// filter(field, operator, value)
const customFilter = filter('custom_field', 'eq', 'value');

// Available operators:
// eq, ne, gt, gte, lt, lte, contains, starts, ends
// regex, in, nin, exists, between, size, all, elem
```

### Applying Filters

```typescript
// Uses default namespace
const forklifts = await client.assets.list({
  ...filters.equals('user_type', 'forklift')
});

// With iteration (uses default namespace)
for await (const asset of client.assets.iterate({
  ...filters.equals('user_type', 'forklift')
})) {
  console.log(asset);
}
```

## Advanced Patterns

### Parallel Processing

```typescript
async function processInParallel<T, R>(
  items: T[],
  concurrency: number,
  processor: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];

  for (const item of items) {
    const p = processor(item).then(r => { results.push(r); });
    executing.push(p);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
      executing.splice(executing.findIndex(e => e === p), 1);
    }
  }

  await Promise.all(executing);
  return results;
}

// Process 5 assets at a time (uses default namespace)
const assets = await client.assets.list();
await processInParallel(assets.slice(0, 20), 5, async (asset) => {
  const history = await client.assets.getHistory(asset.user_udid, {
    startTime: Date.now() - 3600000,
    endTime: Date.now()
  });
  return { asset, historyCount: history.length };
});
```

### Caching Results

```typescript
class AssetCache {
  private cache = new Map<string, { data: unknown; expires: number }>();
  private ttlMs: number;

  constructor(ttlMs: number = 60000) {
    this.ttlMs = ttlMs;
  }

  async get<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.data as T;
    }

    const data = await fetcher();
    this.cache.set(key, { data, expires: Date.now() + this.ttlMs });
    return data;
  }
}

const cache = new AssetCache(60000); // 1 minute TTL

// Uses default namespace
const assets = await cache.get('all-assets', () =>
  client.assets.list()
);
```

### Rate Limiting

```typescript
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;

  constructor(requestsPerSecond: number) {
    this.maxTokens = requestsPerSecond;
    this.tokens = requestsPerSecond;
    this.refillRate = 1000 / requestsPerSecond;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens < 1) {
      const waitTime = this.refillRate - (Date.now() - this.lastRefill);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.refill();
    }

    this.tokens--;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed / this.refillRate;
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

const limiter = new RateLimiter(10); // 10 requests per second

async function rateLimitedFetch() {
  await limiter.acquire();
  // Uses default namespace
  return client.assets.list();
}
```

### Stream Processing

```typescript
async function* transformStream<T, R>(
  source: AsyncIterable<T>,
  transform: (item: T) => R
): AsyncGenerator<R> {
  for await (const item of source) {
    yield transform(item);
  }
}

// Transform assets as they're fetched (uses default namespace)
const names = transformStream(
  client.assets.iterate(),
  (asset) => asset.user_name
);

for await (const name of names) {
  console.log(name);
}
```

### Aggregation

```typescript
async function aggregate<T, A>(
  source: AsyncIterable<T>,
  reducer: (acc: A, item: T) => A,
  initial: A
): Promise<A> {
  let accumulator = initial;
  for await (const item of source) {
    accumulator = reducer(accumulator, item);
  }
  return accumulator;
}

// Count assets by type (uses default namespace)
const typeCounts = await aggregate(
  client.assets.iterate(),
  (acc, asset) => {
    const type = asset.user_type || 'unknown';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  },
  {} as Record<string, number>
);

console.log(typeCounts);
```

### Nested Resource Iteration

```typescript
// Iterate through venues and their zones (uses default namespace)
for await (const venue of client.venues.iterate()) {
  console.log(`Venue: ${venue.name}`);

  // Create venue-scoped client for zone iteration
  const venueClient = client.forVenue(venue.id);
  for await (const zone of venueClient.zones.iterate()) {
    console.log(`  Zone: ${zone.name}`);
  }
}
```

### Error Recovery Pattern

```typescript
async function* resilientIterator<T>(
  source: () => AsyncIterable<T>,
  maxRetries: number = 3
): AsyncGenerator<T> {
  let retries = 0;

  while (retries <= maxRetries) {
    try {
      for await (const item of source()) {
        yield item;
        retries = 0; // Reset on success
      }
      return; // Completed successfully
    } catch (error) {
      retries++;
      if (retries > maxRetries) throw error;

      const delay = 1000 * Math.pow(2, retries - 1);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// Use with recovery (uses default namespace)
for await (const asset of resilientIterator(
  () => client.assets.iterate()
)) {
  console.log(asset);
}
```

## Query Building

### Building Complex Queries

```typescript
class QueryBuilder {
  private filters: Record<string, string>[] = [];

  equals(field: string, value: string | number) {
    this.filters.push(filters.equals(field, value));
    return this;
  }

  contains(field: string, value: string) {
    this.filters.push(filters.contains(field, value));
    return this;
  }

  between(field: string, min: number, max: number) {
    this.filters.push(filters.between(field, min, max));
    return this;
  }

  build() {
    return combineFilters(...this.filters);
  }
}

const query = new QueryBuilder()
  .equals('user_type', 'forklift')
  .contains('user_name', 'warehouse')
  .build();

// Uses default namespace
const assets = await client.assets.list(query);
```

## Context Patterns

### Multi-tenant Applications

```typescript
// Base client with shared configuration
const baseClient = createRtlsClient({
  apiKey: process.env.RTLS_API_KEY,
});

// Create tenant-specific clients
function getClientForTenant(tenantNamespace: string) {
  return baseClient.forNamespace(tenantNamespace);
}

const tenant1Client = getClientForTenant('tenant-1');
const tenant2Client = getClientForTenant('tenant-2');

// Each client uses its own namespace
const tenant1Assets = await tenant1Client.assets.list();
const tenant2Assets = await tenant2Client.assets.list();
```

### Parallel Multi-venue Operations

```typescript
// Work with multiple venues in parallel
const venueIds = [123, 456, 789];

const venueClients = venueIds.map(id => client.forVenue(id));

const allZones = await Promise.all(
  venueClients.map(c => c.zones.listAsArray())
);

console.log(`Total zones across ${venueIds.length} venues: ${allZones.flat().length}`);
```

### Context-aware Utility Functions

```typescript
// Utility that works with any scoped client
async function getVenueStats(scopedClient: RtlsClient) {
  const [zones, pois, assets] = await Promise.all([
    scopedClient.zones.listAsArray(),
    scopedClient.venues.listPoisAsArray(),
    scopedClient.assets.list(),
  ]);

  return {
    zoneCount: zones.length,
    poiCount: pois.length,
    assetCount: assets.length,
  };
}

// Use with scoped clients
const venue1Stats = await getVenueStats(client.forVenue(123));
const venue2Stats = await getVenueStats(client.forVenue(456));
```

## See Also

- [Getting Started](./getting-started.md)
- [Asset Tracking](./asset-tracking.md)
- [Error Handling](./error-handling.md)
- [Migration Guide](./migration-v2.md)
