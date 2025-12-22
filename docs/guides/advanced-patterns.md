# Advanced Patterns Guide

This guide covers pagination, filtering, and advanced usage patterns with the Ubudu RTLS SDK.

## Pagination

### Async Iterator Pattern

The SDK provides async iterators for memory-efficient data processing:

```typescript
// Process items one at a time
for await (const asset of client.assets.iterate('namespace')) {
  console.log(asset.user_name);

  // Can break early
  if (someCondition) break;
}
```

### Collecting All Results

```typescript
// Get all assets as array
const assets = await client.assets.getAll('namespace');

// Equivalent to
const assets = await client.assets.list('namespace');
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

const assets = await client.assets.list('namespace');
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

const assets = await client.assets.list('namespace', combined);
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
const forklifts = await client.assets.list('namespace', {
  ...filters.equals('user_type', 'forklift')
});

// With iteration
for await (const asset of client.assets.iterate('namespace', {
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

// Process 5 assets at a time
const assets = await client.assets.list('namespace');
await processInParallel(assets.slice(0, 20), 5, async (asset) => {
  const history = await client.assets.getHistory('namespace', asset.user_udid, {
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

const assets = await cache.get('all-assets', () =>
  client.assets.list('namespace')
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
  return client.assets.list('namespace');
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

// Transform assets as they're fetched
const names = transformStream(
  client.assets.iterate('namespace'),
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

// Count assets by type
const typeCounts = await aggregate(
  client.assets.iterate('namespace'),
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
// Iterate through venues and their zones
for await (const venue of client.venues.iterate('namespace')) {
  console.log(`Venue: ${venue.name}`);

  for await (const zone of client.zones.iterate('namespace', venue.id)) {
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

// Use with recovery
for await (const asset of resilientIterator(
  () => client.assets.iterate('namespace')
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

const assets = await client.assets.list('namespace', query);
```

## See Also

- [Getting Started](./getting-started.md)
- [Asset Tracking](./asset-tracking.md)
- [Error Handling](./error-handling.md)
