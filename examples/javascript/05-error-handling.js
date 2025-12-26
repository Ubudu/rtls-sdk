/**
 * 05 - Error Handling with Ubudu RTLS SDK
 *
 * This example covers:
 * - Error class hierarchy
 * - Catching specific error types
 * - ContextError for missing context
 * - Retry strategies
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
  ContextError,
} from '@ubudu/rtls-sdk';

// =============================================================================
// Configuration
// =============================================================================

const NAMESPACE = process.env.APP_NAMESPACE;
const API_KEY = process.env.RTLS_API_KEY;

if (!NAMESPACE || !API_KEY) {
  console.error('Missing APP_NAMESPACE or RTLS_API_KEY in .env');
  process.exit(1);
}

const client = createRtlsClient({
  apiKey: API_KEY,
  namespace: NAMESPACE,
});

console.log('Ubudu RTLS SDK - Error Handling\n');

// =============================================================================
// 1. Error Class Hierarchy
// =============================================================================

function showErrorHierarchy() {
  console.log('1. Error Class Hierarchy');
  console.log('   RtlsError (base class)');
  console.log('   ├── AuthenticationError (401)');
  console.log('   ├── AuthorizationError (403)');
  console.log('   ├── NotFoundError (404)');
  console.log('   ├── ValidationError (400/422)');
  console.log('   ├── RateLimitError (429)');
  console.log('   ├── TimeoutError');
  console.log('   └── NetworkError');
  console.log('   ContextError (missing required context)');
}

// =============================================================================
// 2. ContextError Example
// =============================================================================

async function contextErrorExample() {
  console.log('\n2. ContextError Example...');

  // Create client without namespace
  const emptyClient = createRtlsClient({ apiKey: API_KEY });

  try {
    await emptyClient.assets.list();
    console.log('   Unexpected: succeeded');
  } catch (error) {
    if (error instanceof ContextError) {
      console.log(`   Caught ContextError: ${error.field}`);
      console.log(`   Suggestion: ${error.suggestion}`);
    } else {
      throw error;
    }
  }
}

// =============================================================================
// 3. NotFoundError Example
// =============================================================================

async function notFoundExample() {
  console.log('\n3. NotFoundError Example...');

  try {
    await client.assets.get('NONEXISTENT:12:34:56:78:90');
    console.log('   Unexpected: found');
  } catch (error) {
    if (error instanceof NotFoundError) {
      console.log(`   Caught NotFoundError: ${error.status}`);
    } else if (error instanceof RtlsError) {
      console.log(`   Caught RtlsError: ${error.message}`);
    } else {
      throw error;
    }
  }
}

// =============================================================================
// 4. AuthenticationError Example
// =============================================================================

async function authErrorExample() {
  console.log('\n4. AuthenticationError Example...');

  const badClient = createRtlsClient({
    apiKey: 'invalid-key-12345',
    namespace: NAMESPACE,
  });

  try {
    await badClient.assets.list();
    console.log('   Unexpected: succeeded');
  } catch (error) {
    if (error instanceof AuthenticationError) {
      console.log(`   Caught AuthenticationError: ${error.status}`);
    } else if (error instanceof RtlsError) {
      console.log(`   Caught RtlsError: ${error.message}`);
    } else {
      throw error;
    }
  }
}

// =============================================================================
// 5. TimeoutError Example
// =============================================================================

async function timeoutExample() {
  console.log('\n5. TimeoutError Example...');

  const fastClient = createRtlsClient({
    apiKey: API_KEY,
    namespace: NAMESPACE,
    timeoutMs: 1, // Very short timeout
  });

  try {
    await fastClient.assets.list();
    console.log('   Request completed');
  } catch (error) {
    if (error instanceof TimeoutError) {
      console.log('   Caught TimeoutError');
    } else {
      console.log(`   Caught: ${error.constructor.name}`);
    }
  }
}

// =============================================================================
// 6. Comprehensive Error Handler
// =============================================================================

async function handleError(error) {
  if (error instanceof ContextError) {
    return `Missing ${error.field}: ${error.suggestion}`;
  } else if (error instanceof AuthenticationError) {
    return 'Invalid API key';
  } else if (error instanceof AuthorizationError) {
    return 'Access denied';
  } else if (error instanceof NotFoundError) {
    return 'Resource not found';
  } else if (error instanceof ValidationError) {
    return 'Invalid parameters';
  } else if (error instanceof RateLimitError) {
    return 'Rate limited - retry later';
  } else if (error instanceof TimeoutError) {
    return 'Request timed out';
  } else if (error instanceof NetworkError) {
    return 'Network error';
  } else if (error instanceof RtlsError) {
    return `API error: ${error.status}`;
  }
  return 'Unknown error';
}

async function comprehensiveHandler() {
  console.log('\n6. Comprehensive Error Handler...');

  try {
    const result = await client.assets.list();
    console.log(`   Success: ${result.length} assets`);
  } catch (error) {
    console.log(`   ${await handleError(error)}`);
  }
}

// =============================================================================
// 7. Retry with Backoff
// =============================================================================

async function withRetry(operation, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Don't retry client errors
      if (
        error instanceof AuthenticationError ||
        error instanceof NotFoundError ||
        error instanceof ValidationError ||
        error instanceof ContextError
      ) {
        throw error;
      }

      // Retry transient errors
      if (attempt < maxRetries) {
        const delay = 1000 * Math.pow(2, attempt - 1);
        console.log(`   Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

async function retryExample() {
  console.log('\n7. Retry with Backoff...');

  try {
    const result = await withRetry(() => client.assets.list());
    console.log(`   Success: ${result.length} assets`);
  } catch (error) {
    console.log(`   Failed after retries: ${error.message}`);
  }
}

// =============================================================================
// 8. Type Guards
// =============================================================================

function isRetryable(error) {
  return (
    error instanceof RateLimitError ||
    error instanceof TimeoutError ||
    error instanceof NetworkError ||
    (error instanceof RtlsError && error.status >= 500)
  );
}

function typeGuardsExample() {
  console.log('\n8. Type Guards...');

  const errors = [
    new AuthenticationError('Invalid key'),
    new RateLimitError('Too many requests'),
    new TimeoutError('Timed out'),
  ];

  errors.forEach((error) => {
    console.log(`   ${error.constructor.name}: retryable=${isRetryable(error)}`);
  });
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  try {
    showErrorHierarchy();
    await contextErrorExample();
    await notFoundExample();
    await authErrorExample();
    await timeoutExample();
    await comprehensiveHandler();
    await retryExample();
    typeGuardsExample();

    console.log('\nDone!');
  } catch (error) {
    console.error('Failed:', error.message);
    process.exit(1);
  }
}

main();
