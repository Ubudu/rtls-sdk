# Error Handling Guide

This guide covers error handling patterns and best practices with the Ubudu RTLS SDK.

## Error Hierarchy

The SDK provides a typed error hierarchy for precise error handling:

```
RtlsError (base class)
├── AuthenticationError (401)
├── AuthorizationError (403)
├── NotFoundError (404)
├── ValidationError (400/422)
├── RateLimitError (429)
├── TimeoutError (request timeout)
└── NetworkError (connection issues)
```

## Importing Error Classes

```typescript
import {
  RtlsError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  TimeoutError,
  NetworkError,
} from '@ubudu/rtls-sdk';
```

## Error Properties

All error classes extend `RtlsError` and share these properties:

```typescript
interface RtlsError {
  message: string;      // Human-readable error message
  status: number;       // HTTP status code (0 for network/timeout)
  body: unknown;        // Raw API response body
  code: string;         // Error code string
  name: string;         // Error class name
}
```

## Error Methods

```typescript
const error = new RtlsError('Error', 500, null);

// Check specific status
error.isStatus(500);      // true
error.isStatus(404);      // false

// Check error category
error.isClientError();    // false (4xx)
error.isServerError();    // true (5xx)
```

## Catching Specific Errors

### Basic Pattern

```typescript
import { createRtlsClient, NotFoundError, RtlsError } from '@ubudu/rtls-sdk';

const client = createRtlsClient({ apiKey: 'your-key' });

try {
  const asset = await client.assets.get('namespace', 'AA:BB:CC:DD:EE:FF');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log('Asset not found');
  } else if (error instanceof RtlsError) {
    console.log(`API error: ${error.status} - ${error.message}`);
  } else {
    throw error; // Unexpected error
  }
}
```

### Comprehensive Handler

```typescript
async function handleApiCall<T>(operation: () => Promise<T>): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      console.error('Authentication failed - check API key');
    } else if (error instanceof AuthorizationError) {
      console.error('Access denied - check permissions');
    } else if (error instanceof NotFoundError) {
      console.error('Resource not found');
    } else if (error instanceof ValidationError) {
      console.error('Validation failed:', error.errors);
    } else if (error instanceof RateLimitError) {
      console.error('Rate limited - retry after:', error.retryAfter);
    } else if (error instanceof TimeoutError) {
      console.error('Request timed out');
    } else if (error instanceof NetworkError) {
      console.error('Network error:', error.networkCause?.message);
    } else if (error instanceof RtlsError) {
      console.error(`API error (${error.status}): ${error.message}`);
    } else {
      throw error;
    }
    return null;
  }
}
```

## Retry Strategies

### Identifying Retryable Errors

```typescript
function isRetryableError(error: unknown): boolean {
  return (
    error instanceof RateLimitError ||
    error instanceof TimeoutError ||
    error instanceof NetworkError ||
    (error instanceof RtlsError && error.status >= 500)
  );
}

function isClientError(error: unknown): boolean {
  return (
    error instanceof AuthenticationError ||
    error instanceof AuthorizationError ||
    error instanceof NotFoundError ||
    error instanceof ValidationError
  );
}
```

### Exponential Backoff

```typescript
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      // Don't retry client errors
      if (isClientError(error)) {
        throw error;
      }

      // Retry transient errors
      if (isRetryableError(error) && attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

// Usage
const assets = await withRetry(() => client.assets.list('namespace'));
```

### Rate Limit Handling

```typescript
async function handleRateLimit<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof RateLimitError) {
      const retryAfter = error.retryAfter ?? 1000;
      console.log(`Rate limited, waiting ${retryAfter}ms...`);
      await new Promise(resolve => setTimeout(resolve, retryAfter));
      return operation(); // Retry once
    }
    throw error;
  }
}
```

## Timeout Configuration

```typescript
// Configure timeout when creating client
const client = createRtlsClient({
  apiKey: 'your-key',
  timeoutMs: 30000, // 30 seconds (default)
});

// Or per-request
const assets = await client.assets.list('namespace', undefined, {
  timeout: 5000, // 5 second timeout for this request
});
```

## Validation Errors

```typescript
try {
  await client.assets.create('namespace', 'invalid-mac', {
    user_name: '', // Empty name
  });
} catch (error) {
  if (error instanceof ValidationError) {
    console.log('Validation errors:', error.errors);
    // { user_name: ['Name is required'] }
  }
}
```

## Network Errors

```typescript
try {
  await client.assets.list('namespace');
} catch (error) {
  if (error instanceof NetworkError) {
    console.log('Network issue:', error.message);
    console.log('Cause:', error.networkCause?.message);
    // Possible causes: DNS failure, connection refused, SSL error
  }
}
```

## Error Factory

The SDK provides a `createError` factory for creating appropriate error types:

```typescript
import { createError } from '@ubudu/rtls-sdk';

const error = createError(404, { message: 'Asset not found' });
console.log(error instanceof NotFoundError); // true
```

## Common Patterns

### Safe Get with Default

```typescript
async function getAssetOrDefault(
  namespace: string,
  macAddress: string,
  defaultValue: Asset | null = null
): Promise<Asset | null> {
  try {
    return await client.assets.get(namespace, macAddress);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return defaultValue;
    }
    throw error;
  }
}
```

### Batch Operations with Error Collection

```typescript
async function batchGetAssets(
  namespace: string,
  macAddresses: string[]
): Promise<{ assets: Asset[]; errors: Map<string, Error> }> {
  const assets: Asset[] = [];
  const errors = new Map<string, Error>();

  await Promise.all(
    macAddresses.map(async (mac) => {
      try {
        const asset = await client.assets.get(namespace, mac);
        assets.push(asset);
      } catch (error) {
        errors.set(mac, error as Error);
      }
    })
  );

  return { assets, errors };
}
```

### Logging Errors

```typescript
function logError(context: string, error: unknown): void {
  if (error instanceof RtlsError) {
    console.error(`[${context}] ${error.name}: ${error.message}`, {
      status: error.status,
      code: error.code,
      body: error.body,
    });
  } else {
    console.error(`[${context}] Unexpected error:`, error);
  }
}
```

## See Also

- [Getting Started](./getting-started.md)
- [Advanced Patterns](./advanced-patterns.md)
