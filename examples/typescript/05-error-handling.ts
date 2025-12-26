/**
 * 05 - Error Handling with Ubudu RTLS SDK
 *
 * This example demonstrates:
 * - Error class hierarchy
 * - Catching specific error types
 * - Retry strategies
 * - Validation error handling
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import {
  createRtlsClient,
  RtlsError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  TimeoutError,
  NetworkError,
} from '@ubudu/rtls-sdk';

const NAMESPACE = process.env.APP_NAMESPACE!;
const API_KEY = process.env.RTLS_API_KEY!;

if (!NAMESPACE || !API_KEY) {
  console.error('Missing APP_NAMESPACE or RTLS_API_KEY in .env');
  process.exit(1);
}

console.log('Ubudu RTLS SDK - Error Handling Example\n');
console.log('========================================\n');

// =============================================================================
// Example 1: Error Class Hierarchy
// =============================================================================

function showErrorHierarchy(): void {
  console.log('1. Error Class Hierarchy\n');
  console.log('   RtlsError (base class)');
  console.log('   ├── AuthenticationError (401)');
  console.log('   ├── AuthorizationError (403)');
  console.log('   ├── NotFoundError (404)');
  console.log('   ├── ValidationError (400/422)');
  console.log('   ├── RateLimitError (429)');
  console.log('   ├── TimeoutError (request timeout)');
  console.log('   └── NetworkError (connection issues)\n');

  console.log('   All errors include:');
  console.log('   - message: string');
  console.log('   - status: number (HTTP status code)');
  console.log('   - body: unknown (raw API response)');
  console.log('   - code: string (error code)\n');
}

// =============================================================================
// Example 2: Catching Specific Errors
// =============================================================================

async function catchSpecificErrors(): Promise<void> {
  console.log('2. Catching Specific Error Types\n');

  const client = createRtlsClient({
    apiKey: API_KEY,
    namespace: NAMESPACE, // Default namespace for all calls
  });

  // Try to get a non-existent asset
  console.log('   Attempting to get non-existent asset...');

  try {
    // Uses default namespace from client config
    await client.assets.get('NONEXISTENT:12:34:56:78:90');
    console.log('   Unexpected: Asset was found');
  } catch (error) {
    if (error instanceof NotFoundError) {
      console.log('   Caught NotFoundError (expected)');
      console.log(`   - Status: ${error.status}`);
      console.log(`   - Message: ${error.message}\n`);
    } else if (error instanceof AuthenticationError) {
      console.log('   Caught AuthenticationError');
      console.log('   - Check your API key\n');
    } else if (error instanceof RtlsError) {
      console.log(`   Caught RtlsError: ${error.status}`);
      console.log(`   - Message: ${error.message}\n`);
    } else {
      throw error;
    }
  }
}

// =============================================================================
// Example 3: Authentication Error
// =============================================================================

async function demonstrateAuthError(): Promise<void> {
  console.log('3. Authentication Error (Invalid API Key)\n');

  const badClient = createRtlsClient({
    apiKey: 'invalid-key-12345',
    namespace: NAMESPACE, // Default namespace
  });

  try {
    // Uses default namespace from client config
    await badClient.assets.list();
    console.log('   Unexpected: Request succeeded');
  } catch (error) {
    if (error instanceof AuthenticationError) {
      console.log('   Caught AuthenticationError');
      console.log(`   - Status: ${error.status}`);
      console.log('   - Action: Verify API key is correct\n');
    } else if (error instanceof RtlsError) {
      // Some APIs may return different status codes
      console.log(`   Caught RtlsError: ${error.status}`);
      console.log(`   - Message: ${error.message}\n`);
    } else {
      throw error;
    }
  }
}

// =============================================================================
// Example 4: Timeout Handling
// =============================================================================

async function demonstrateTimeout(): Promise<void> {
  console.log('4. Timeout Handling\n');

  // Create client with very short timeout
  const client = createRtlsClient({
    apiKey: API_KEY,
    namespace: NAMESPACE, // Default namespace
    timeoutMs: 1, // 1ms timeout (will likely timeout)
  });

  console.log('   Making request with 1ms timeout...');

  try {
    // Uses default namespace from client config
    await client.assets.list();
    console.log('   Request completed (surprisingly fast!)\n');
  } catch (error) {
    if (error instanceof TimeoutError) {
      console.log('   Caught TimeoutError (expected)');
      console.log('   - Action: Increase timeout or retry\n');
    } else if (error instanceof RtlsError) {
      console.log(`   Caught RtlsError: ${error.status}`);
      console.log(`   - Message: ${error.message}\n`);
    } else {
      // Other errors (network, etc.)
      console.log(`   Caught error: ${error}\n`);
    }
  }
}

// =============================================================================
// Example 5: Comprehensive Error Handler
// =============================================================================

async function comprehensiveErrorHandler<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T | null> {
  console.log(`5. Comprehensive Error Handler: ${operationName}\n`);

  try {
    const result = await operation();
    console.log(`   ${operationName} succeeded\n`);
    return result;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      console.log('   ERROR: Authentication failed');
      console.log('   - Verify your API key');
      console.log('   - Check if key has expired');
    } else if (error instanceof AuthorizationError) {
      console.log('   ERROR: Not authorized');
      console.log('   - Check permissions for this resource');
      console.log('   - Verify namespace access');
    } else if (error instanceof NotFoundError) {
      console.log('   ERROR: Resource not found');
      console.log('   - Verify the ID/MAC address exists');
      console.log('   - Check the namespace');
    } else if (error instanceof ValidationError) {
      console.log('   ERROR: Validation failed');
      console.log('   - Check request parameters');
      console.log('   - Verify data format');
    } else if (error instanceof RateLimitError) {
      console.log('   ERROR: Rate limited');
      console.log('   - Wait and retry');
      console.log('   - Implement exponential backoff');
    } else if (error instanceof TimeoutError) {
      console.log('   ERROR: Request timed out');
      console.log('   - Retry with longer timeout');
      console.log('   - Check network connectivity');
    } else if (error instanceof NetworkError) {
      console.log('   ERROR: Network error');
      console.log('   - Check internet connection');
      console.log('   - Verify API endpoint is reachable');
    } else if (error instanceof RtlsError) {
      console.log(`   ERROR: API error (${error.status})`);
      console.log(`   - Message: ${error.message}`);
    } else {
      console.log('   ERROR: Unexpected error');
      console.log(`   - ${error}`);
    }
    console.log();
    return null;
  }
}

// =============================================================================
// Example 6: Retry with Exponential Backoff
// =============================================================================

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

      // Don't retry certain errors
      if (
        error instanceof AuthenticationError ||
        error instanceof AuthorizationError ||
        error instanceof NotFoundError ||
        error instanceof ValidationError
      ) {
        throw error;
      }

      // Retry for transient errors
      if (
        error instanceof RateLimitError ||
        error instanceof TimeoutError ||
        error instanceof NetworkError ||
        (error instanceof RtlsError && error.status >= 500)
      ) {
        if (attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt - 1);
          console.log(`   Attempt ${attempt} failed, retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      }

      throw error;
    }
  }

  throw lastError;
}

async function demonstrateRetry(): Promise<void> {
  console.log('6. Retry with Exponential Backoff\n');

  const client = createRtlsClient({
    apiKey: API_KEY,
    namespace: NAMESPACE, // Default namespace
  });

  console.log('   Demonstrating retry logic (will succeed on first try):\n');

  try {
    const result = await withRetry(
      () => client.assets.list(), // Uses default namespace from client config
      3,
      1000
    );
    console.log(`   Success: Got ${result.length} assets\n`);
  } catch (error) {
    console.log(`   Failed after retries: ${error}\n`);
  }
}

// =============================================================================
// Example 7: Type Guards for Error Handling
// =============================================================================

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

function demonstrateTypeGuards(): void {
  console.log('7. Type Guards for Error Classification\n');

  const errors = [
    new AuthenticationError('Invalid key'),
    new NotFoundError('Asset not found'),
    new RateLimitError('Too many requests'),
    new TimeoutError('Request timed out'),
    new RtlsError('Server error', 500, null),
  ];

  errors.forEach((error) => {
    const retryable = isRetryableError(error);
    const clientError = isClientError(error);
    console.log(`   ${error.constructor.name}:`);
    console.log(`   - Retryable: ${retryable}`);
    console.log(`   - Client error: ${clientError}\n`);
  });
}

// =============================================================================
// Example 8: Error Properties and Methods
// =============================================================================

function demonstrateErrorProperties(): void {
  console.log('8. Error Properties and Methods\n');

  const error = new RtlsError('Test error', 500, { detail: 'Server issue' }, 'SERVER_ERROR');

  console.log('   RtlsError properties:');
  console.log(`   - message: ${error.message}`);
  console.log(`   - status: ${error.status}`);
  console.log(`   - code: ${error.code}`);
  console.log(`   - body: ${JSON.stringify(error.body)}`);
  console.log(`   - name: ${error.name}`);

  console.log('\n   RtlsError methods:');
  console.log(`   - isStatus(500): ${error.isStatus(500)}`);
  console.log(`   - isStatus(404): ${error.isStatus(404)}`);
  console.log(`   - isClientError(): ${error.isClientError()}`);
  console.log(`   - isServerError(): ${error.isServerError()}\n`);
}

// =============================================================================
// Main Execution
// =============================================================================

async function main(): Promise<void> {
  showErrorHierarchy();
  await catchSpecificErrors();
  await demonstrateAuthError();
  await demonstrateTimeout();

  const client = createRtlsClient({
    apiKey: API_KEY,
    namespace: NAMESPACE, // Default namespace
  });
  await comprehensiveErrorHandler(
    () => client.assets.list(), // Uses default namespace from client config
    'List Assets'
  );

  await demonstrateRetry();
  demonstrateTypeGuards();
  demonstrateErrorProperties();

  console.log('========================================');
  console.log('Error handling example completed!');
}

main();
