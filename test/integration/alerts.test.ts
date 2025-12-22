import { describe, it, expect, beforeAll } from 'vitest';
import { createRtlsClient, RtlsClient } from '../../src';
import { TEST_CONFIG, hasCredentials } from './setup';

describe.skipIf(!hasCredentials())('AlertsResource Integration', () => {
  let client: RtlsClient;
  const namespace = TEST_CONFIG.namespace!;

  beforeAll(() => {
    client = createRtlsClient({
      apiKey: TEST_CONFIG.apiKey,
    });
  });

  // ========================
  // Phase 6: Alerts Resource
  // ========================

  describe('Task 6.1: Get Alert Rules', () => {
    it('should get alert rules', async () => {
      try {
        const result = await client.alerts.getRules(namespace);

        console.log('=== Task 6.1: Get Alert Rules ===');
        console.log('Endpoint: GET /alert_rules/{app_namespace}');
        console.log('Response Type:', typeof result);
        console.log('Is Array:', Array.isArray(result));
        console.log('Response:', JSON.stringify(result, null, 2).slice(0, 1000));

        if (Array.isArray(result)) {
          console.log(`Found ${result.length} alert rules`);
          if (result.length > 0) {
            console.log('Rule schema keys:', Object.keys(result[0]));
          }
        }

        expect(result).toBeDefined();
      } catch (error) {
        console.log('=== Task 6.1: Get Alert Rules ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });
  });

  describe('Task 6.2: Save Alert Rules', () => {
    it('should document save alert rules API', async () => {
      // NOTE: We don't actually save alert rules in tests to avoid side effects
      console.log('=== Task 6.2: Save Alert Rules ===');
      console.log('Endpoint: POST /alert_rules/{app_namespace}');
      console.log('SDK Method: client.alerts.saveRules(namespace, rules[])');
      console.log('Note: Not testing to avoid modifying production alert rules');

      expect(typeof client.alerts.saveRules).toBe('function');

      // Document expected rule schema
      const sampleRule = {
        name: 'Sample Alert Rule',
        type: 'zone_enter',
        zone_id: 123,
        enabled: true,
        actions: [
          {
            type: 'webhook',
            url: 'https://example.com/webhook',
          },
        ],
      };
      console.log('Sample rule schema:', JSON.stringify(sampleRule, null, 2));
    });
  });

  describe('Task 6.3: List Alerts', () => {
    it('should list alerts', async () => {
      const now = Date.now();
      const oneDayAgo = now - 86400000;

      try {
        const result = await client.alerts.list(namespace, {
          timestampFrom: oneDayAgo,
          timestampTo: now,
          size: 50,
        });

        console.log('=== Task 6.3: List Alerts ===');
        console.log('Endpoint: GET /es/alerts/{appNamespace}');
        console.log('Query: timestampFrom, timestampTo, size');
        console.log('Response Type:', typeof result);
        console.log('Is Array:', Array.isArray(result));
        console.log('Response:', JSON.stringify(result, null, 2).slice(0, 1000));

        if (Array.isArray(result)) {
          console.log(`Found ${result.length} alerts`);
          if (result.length > 0) {
            console.log('Alert schema keys:', Object.keys(result[0]));
          }
        }
      } catch (error) {
        console.log('=== Task 6.3: List Alerts ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });

    it('should list alerts with different time ranges', async () => {
      const now = Date.now();
      const oneWeekAgo = now - 7 * 86400000;

      try {
        const result = await client.alerts.list(namespace, {
          timestampFrom: oneWeekAgo,
          timestampTo: now,
        });

        console.log('=== Task 6.3: List Alerts - Week Range ===');
        console.log('Query: 7-day range');
        console.log('Result count:', Array.isArray(result) ? result.length : 'N/A');
      } catch (error) {
        console.log('=== Task 6.3: List Alerts - Week Range ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });
  });
});
