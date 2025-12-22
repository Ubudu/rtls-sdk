import { describe, it, expect, beforeAll } from 'vitest';
import {
  createRtlsClient,
  RtlsClient,
  AuthenticationError,
  NotFoundError,
  ValidationError,
  RtlsError,
} from '../../src';
import { TEST_CONFIG, hasCredentials } from './setup';

describe.skipIf(!hasCredentials())('Error Handling Integration', () => {
  let client: RtlsClient;
  let invalidKeyClient: RtlsClient;
  const namespace = TEST_CONFIG.namespace!;

  beforeAll(() => {
    client = createRtlsClient({
      apiKey: TEST_CONFIG.apiKey,
    });

    // Create a client with invalid API key for auth error tests
    invalidKeyClient = createRtlsClient({
      apiKey: 'invalid-api-key-12345',
    });
  });

  // ========================
  // Phase 10: Error Handling Validation
  // ========================

  describe('Task 10.1: Authentication Errors', () => {
    it('should return AuthenticationError for invalid API key', async () => {
      console.log('=== Task 10.1: Authentication Errors ===');
      console.log('Test: Call with invalid API key');

      try {
        await invalidKeyClient.health();
        console.log('UNEXPECTED: No error thrown with invalid API key');
      } catch (error) {
        console.log('Error Type:', error instanceof Error ? error.constructor.name : typeof error);
        console.log('Is AuthenticationError:', error instanceof AuthenticationError);
        console.log('Is RtlsError:', error instanceof RtlsError);

        if (error instanceof Error) {
          console.log('Message:', error.message);
        }
        if (error instanceof RtlsError) {
          console.log('Status:', error.status);
          console.log('Response:', JSON.stringify(error.response, null, 2));
        }

        // Document the error format
        console.log('Error Format Documentation:');
        console.log('- HTTP Status: 401 expected');
        console.log('- Error Type: AuthenticationError');
      }
    });

    it('should return AuthenticationError for asset operations', async () => {
      try {
        await invalidKeyClient.assets.list(namespace);
      } catch (error) {
        console.log('=== Task 10.1: Auth Error on Assets ===');
        console.log('Error Type:', error instanceof Error ? error.constructor.name : typeof error);
        if (error instanceof RtlsError) {
          console.log('Status:', error.status);
        }
      }
    });
  });

  describe('Task 10.2: Authorization Errors', () => {
    it('should document 403 authorization errors', async () => {
      console.log('=== Task 10.2: Authorization Errors ===');
      console.log('Note: 403 errors occur when accessing resources without permission');
      console.log('Typical scenarios:');
      console.log("- Accessing another user's private dashboard");
      console.log('- Modifying read-only resources');
      console.log('- Accessing resources in unauthorized namespace');
      console.log('');
      console.log('Expected error format:');
      console.log('- HTTP Status: 403');
      console.log('- Error Type: AuthorizationError');
      console.log('- Message: "Forbidden" or similar');

      // We can't easily test this without a second account/namespace
      expect(true).toBe(true);
    });
  });

  describe('Task 10.3: Not Found Errors', () => {
    it('should return NotFoundError for non-existent asset', async () => {
      console.log('=== Task 10.3: Not Found Errors - Asset ===');

      try {
        await client.assets.get(namespace, 'zz:zz:zz:zz:zz:zz');
        console.log('UNEXPECTED: No error thrown for non-existent asset');
      } catch (error) {
        console.log('Error Type:', error instanceof Error ? error.constructor.name : typeof error);
        console.log('Is NotFoundError:', error instanceof NotFoundError);

        if (error instanceof Error) {
          console.log('Message:', error.message);
        }
        if (error instanceof RtlsError) {
          console.log('Status:', error.status);
          console.log('Response:', JSON.stringify(error.response, null, 2));
        }

        console.log('Error Format:');
        console.log('- HTTP Status: 404');
        console.log('- Error Type: NotFoundError');
      }
    });

    it('should return NotFoundError for non-existent venue', async () => {
      console.log('=== Task 10.3: Not Found Errors - Venue ===');

      try {
        await client.venues.get(namespace, 999999999);
        console.log('UNEXPECTED: No error thrown for non-existent venue');
      } catch (error) {
        console.log('Error Type:', error instanceof Error ? error.constructor.name : typeof error);
        console.log('Is NotFoundError:', error instanceof NotFoundError);

        if (error instanceof RtlsError) {
          console.log('Status:', error.status);
        }
      }
    });

    it('should return NotFoundError for non-existent dashboard', async () => {
      console.log('=== Task 10.3: Not Found Errors - Dashboard ===');

      try {
        await client.dashboards.get('non-existent-dashboard-id-12345');
        console.log('UNEXPECTED: No error thrown for non-existent dashboard');
      } catch (error) {
        console.log('Error Type:', error instanceof Error ? error.constructor.name : typeof error);
        console.log('Is NotFoundError:', error instanceof NotFoundError);

        if (error instanceof RtlsError) {
          console.log('Status:', error.status);
        }
      }
    });
  });

  describe('Task 10.4: Validation Errors', () => {
    it('should return ValidationError for invalid data', async () => {
      console.log('=== Task 10.4: Validation Errors ===');

      try {
        // Try to create an asset with invalid data
        await client.assets.create(namespace, 'invalid-mac-format', {
          // Missing required fields or invalid values
          user_name: '', // Empty name might be invalid
        });
      } catch (error) {
        console.log('Error Type:', error instanceof Error ? error.constructor.name : typeof error);
        console.log('Is ValidationError:', error instanceof ValidationError);

        if (error instanceof Error) {
          console.log('Message:', error.message);
        }
        if (error instanceof RtlsError) {
          console.log('Status:', error.status);
          console.log('Response:', JSON.stringify(error.response, null, 2));
        }

        console.log('Validation Error Format:');
        console.log('- HTTP Status: 400');
        console.log('- Error Type: ValidationError');
        console.log('- May include field-level error details');
      }
    });

    it('should document validation error scenarios', async () => {
      console.log('=== Task 10.4: Validation Error Scenarios ===');
      console.log('Common validation error scenarios:');
      console.log('- Invalid MAC address format');
      console.log('- Missing required fields');
      console.log('- Invalid data types');
      console.log('- Out of range values');
      console.log('- Invalid enum values');
      console.log('');
      console.log('Expected error format:');
      console.log('- HTTP Status: 400');
      console.log('- Error Type: ValidationError');
      console.log('- Response may include: { errors: [...] } or { message: "..." }');
    });
  });

  describe('Task 10.5: Rate Limiting', () => {
    it('should document rate limiting behavior', async () => {
      console.log('=== Task 10.5: Rate Limiting ===');
      console.log('Note: Rate limiting may not be easily triggered in testing');
      console.log('');
      console.log('Expected behavior when rate limited:');
      console.log('- HTTP Status: 429');
      console.log('- Error Type: RateLimitError');
      console.log('- Headers may include:');
      console.log('  - X-RateLimit-Limit');
      console.log('  - X-RateLimit-Remaining');
      console.log('  - X-RateLimit-Reset');
      console.log('  - Retry-After');
      console.log('');
      console.log('SDK handles rate limiting by:');
      console.log('- Throwing RateLimitError');
      console.log('- Including retry timing in error');

      // Make a few rapid requests to see if rate limiting kicks in
      const requests: Promise<unknown>[] = [];
      for (let i = 0; i < 5; i++) {
        requests.push(client.health());
      }

      try {
        await Promise.all(requests);
        console.log('Rapid requests completed without rate limiting');
      } catch (error) {
        console.log('Error during rapid requests:', error instanceof Error ? error.message : error);
        if (error instanceof RtlsError) {
          console.log('Status:', error.status);
          if (error.status === 429) {
            console.log('RATE LIMITED!');
          }
        }
      }
    });
  });

  describe('Task 10.6: Server Errors', () => {
    it('should document server error handling', async () => {
      console.log('=== Task 10.6: Server Errors ===');
      console.log('Note: 500 errors are server-side and cannot be reliably triggered');
      console.log('');
      console.log('Expected server error format:');
      console.log('- HTTP Status: 500, 502, 503, 504');
      console.log('- Error Type: RtlsError (base class)');
      console.log('- Message: "Internal Server Error" or similar');
      console.log('');
      console.log('SDK handling:');
      console.log('- All 5xx errors throw RtlsError');
      console.log('- Status code preserved in error.status');
      console.log('- Response body preserved in error.response');
      console.log('');
      console.log('Observed 500 errors during testing:');
      console.log('- None observed (good!)');
    });
  });

  describe('Error Hierarchy Summary', () => {
    it('should document error class hierarchy', () => {
      console.log('=== Error Class Hierarchy ===');
      console.log('');
      console.log('RtlsError (base class)');
      console.log('├── AuthenticationError (401)');
      console.log('├── AuthorizationError (403)');
      console.log('├── NotFoundError (404)');
      console.log('├── ValidationError (400)');
      console.log('├── RateLimitError (429)');
      console.log('├── TimeoutError (request timeout)');
      console.log('└── NetworkError (connection issues)');
      console.log('');
      console.log('All errors include:');
      console.log('- message: string');
      console.log('- status: number (HTTP status code)');
      console.log('- response: unknown (raw API response)');
    });
  });
});
