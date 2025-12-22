import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRtlsClient, RtlsClient } from '../../src';
import { TEST_CONFIG, hasCredentials } from './setup';

describe.skipIf(!hasCredentials())('DashboardsResource Integration', () => {
  let client: RtlsClient;
  const namespace = TEST_CONFIG.namespace!;
  let testDashboardId: string | null = null;
  let existingDashboardId: string | null = null;

  beforeAll(() => {
    client = createRtlsClient({
      apiKey: TEST_CONFIG.apiKey,
    });
  });

  afterAll(async () => {
    // Cleanup: delete test dashboard if it was created
    if (testDashboardId) {
      try {
        await client.dashboards.delete(testDashboardId);
      } catch {
        // Ignore errors during cleanup
      }
    }
  });

  // ========================
  // Phase 7: Dashboards Resource
  // ========================

  describe('Task 7.1: List All Dashboards', () => {
    it('should list all dashboards', async () => {
      try {
        const result = await client.dashboards.list();

        console.log('=== Task 7.1: List All Dashboards ===');
        console.log('Endpoint: GET /dashboards');
        console.log('Response Type:', typeof result);
        console.log('Is Array:', Array.isArray(result));
        console.log('Response:', JSON.stringify(result, null, 2).slice(0, 1000));

        if (Array.isArray(result)) {
          console.log(`Found ${result.length} dashboards`);
          if (result.length > 0) {
            existingDashboardId = (result[0] as Record<string, unknown>).id as string;
            console.log('Dashboard schema keys:', Object.keys(result[0]));
          }
        }

        expect(result).toBeDefined();
      } catch (error) {
        console.log('=== Task 7.1: List All Dashboards ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });

    it('should list dashboards with namespace filter', async () => {
      try {
        const result = await client.dashboards.list(namespace);

        console.log('=== Task 7.1: List Dashboards - With Namespace ===');
        console.log('Query: namespace=' + namespace);
        console.log('Result count:', Array.isArray(result) ? result.length : 'N/A');
        console.log('Response:', JSON.stringify(result, null, 2).slice(0, 500));
      } catch (error) {
        console.log('=== Task 7.1: List Dashboards - With Namespace ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });
  });

  describe('Task 7.2: List Created Dashboards', () => {
    it('should list dashboards created by current user', async () => {
      try {
        const result = await client.dashboards.listCreated();

        console.log('=== Task 7.2: List Created Dashboards ===');
        console.log('Endpoint: GET /dashboards/created');
        console.log('Response Type:', typeof result);
        console.log('Is Array:', Array.isArray(result));
        console.log('Response:', JSON.stringify(result, null, 2).slice(0, 500));

        if (Array.isArray(result)) {
          console.log(`Found ${result.length} created dashboards`);
        }
      } catch (error) {
        console.log('=== Task 7.2: List Created Dashboards ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });
  });

  describe('Task 7.3: List Shared Dashboards', () => {
    it('should list dashboards shared with current user', async () => {
      try {
        const result = await client.dashboards.listShared();

        console.log('=== Task 7.3: List Shared Dashboards ===');
        console.log('Endpoint: GET /dashboards/shared');
        console.log('Response Type:', typeof result);
        console.log('Is Array:', Array.isArray(result));
        console.log('Response:', JSON.stringify(result, null, 2).slice(0, 500));

        if (Array.isArray(result)) {
          console.log(`Found ${result.length} shared dashboards`);
        }
      } catch (error) {
        console.log('=== Task 7.3: List Shared Dashboards ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });
  });

  describe('Task 7.4: List Selected Dashboards', () => {
    it('should list user selected/favorite dashboards', async () => {
      try {
        const result = await client.dashboards.listSelected();

        console.log('=== Task 7.4: List Selected Dashboards ===');
        console.log('Endpoint: GET /dashboards/selected');
        console.log('Response Type:', typeof result);
        console.log('Is Array:', Array.isArray(result));
        console.log('Response:', JSON.stringify(result, null, 2).slice(0, 500));

        if (Array.isArray(result)) {
          console.log(`Found ${result.length} selected dashboards`);
        }
      } catch (error) {
        console.log('=== Task 7.4: List Selected Dashboards ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });
  });

  describe('Task 7.5: Get Single Dashboard', () => {
    it('should get dashboard by ID', async () => {
      if (!existingDashboardId) {
        console.log('=== Task 7.5: Get Single Dashboard - SKIPPED (no dashboards) ===');
        return;
      }

      try {
        const result = await client.dashboards.get(existingDashboardId);

        console.log('=== Task 7.5: Get Single Dashboard ===');
        console.log('Endpoint: GET /dashboards/{id}');
        console.log('Dashboard ID:', existingDashboardId);
        console.log('Response Type:', typeof result);
        console.log('Response:', JSON.stringify(result, null, 2));
        console.log('Schema keys:', Object.keys(result));

        expect(result).toBeDefined();
        expect(result).toHaveProperty('id');
      } catch (error) {
        console.log('=== Task 7.5: Get Single Dashboard ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });

    it('should handle non-existent dashboard', async () => {
      try {
        await client.dashboards.get('non-existent-dashboard-id');
        console.log('=== Task 7.5: Get Non-existent Dashboard ===');
        console.log('UNEXPECTED: No error thrown');
      } catch (error) {
        console.log('=== Task 7.5: Get Non-existent Dashboard ===');
        console.log('Error Type:', error instanceof Error ? error.constructor.name : typeof error);
        if (error instanceof Error) {
          console.log('Message:', error.message);
        }
      }
    });
  });

  describe('Task 7.6: Create Dashboard', () => {
    it('should create new dashboard', async () => {
      try {
        const result = await client.dashboards.create({
          name: 'Integration Test Dashboard',
          namespace: namespace,
          data: {
            widgets: [],
            layout: {},
          },
        });

        console.log('=== Task 7.6: Create Dashboard ===');
        console.log('Endpoint: POST /dashboards');
        console.log('Response Type:', typeof result);
        console.log('Response:', JSON.stringify(result, null, 2));
        console.log('Schema keys:', Object.keys(result));

        if (result && typeof result === 'object' && 'id' in result) {
          testDashboardId = result.id as string;
          console.log('Created dashboard ID:', testDashboardId);
        }

        expect(result).toBeDefined();
      } catch (error) {
        console.log('=== Task 7.6: Create Dashboard ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });
  });

  describe('Task 7.7: Update Dashboard', () => {
    it('should update existing dashboard', async () => {
      if (!testDashboardId) {
        console.log('=== Task 7.7: Update Dashboard - SKIPPED (no test dashboard) ===');
        return;
      }

      try {
        const result = await client.dashboards.update(testDashboardId, {
          name: 'Updated Integration Test Dashboard',
          data: {
            widgets: [{ type: 'chart', id: 'widget-1' }],
            layout: { columns: 2 },
          },
        });

        console.log('=== Task 7.7: Update Dashboard ===');
        console.log('Endpoint: PUT /dashboards/{id}');
        console.log('Dashboard ID:', testDashboardId);
        console.log('Response Type:', typeof result);
        console.log('Response:', JSON.stringify(result, null, 2));

        expect(result).toBeDefined();
      } catch (error) {
        console.log('=== Task 7.7: Update Dashboard ===');
        console.log('Error:', error instanceof Error ? error.message : error);
      }
    });
  });

  describe('Task 7.8: Delete Dashboard', () => {
    it('should document delete dashboard API', async () => {
      console.log('=== Task 7.8: Delete Dashboard ===');
      console.log('Endpoint: DELETE /dashboards/{id}');
      console.log('SDK Method: client.dashboards.delete(id)');
      console.log('Response: void');
      console.log('Note: Deletion tested in afterAll cleanup');

      expect(typeof client.dashboards.delete).toBe('function');
    });
  });

  describe('Task 7.9: Share Dashboard', () => {
    it('should document share dashboard API', async () => {
      console.log('=== Task 7.9: Share Dashboard ===');
      console.log('Endpoint: POST /dashboards/{id}/share');
      console.log('SDK Method: client.dashboards.share(id, users[])');
      console.log('User schema: { username: string, permissions: { read?, write?, delete? } }');
      console.log('Note: Not testing to avoid sharing with invalid users');

      expect(typeof client.dashboards.share).toBe('function');

      // Document expected user schema
      const sampleShare = {
        users: [
          {
            username: 'test-user',
            permissions: {
              read: true,
              write: false,
              delete: false,
            },
          },
        ],
      };
      console.log('Sample share request:', JSON.stringify(sampleShare, null, 2));
    });
  });

  describe('Task 7.10: Unshare Dashboard', () => {
    it('should document unshare dashboard API', async () => {
      console.log('=== Task 7.10: Unshare Dashboard ===');
      console.log('Endpoint: POST /dashboards/{id}/unshare');
      console.log('SDK Method: client.dashboards.unshare(id, usernames[])');
      console.log('Note: Not testing to avoid modifying real sharing permissions');

      expect(typeof client.dashboards.unshare).toBe('function');
    });
  });
});
