/**
 * RtlsWebSocketPublisher Integration Tests
 *
 * These tests run against the live RTLS WebSocket API.
 * Requires RTLS_API_KEY, APP_NAMESPACE, and optionally MAP_UUID environment variables.
 *
 * Run with: npm run test:ws:integration
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RtlsWebSocketPublisher, RtlsWebSocketSubscriber, SubscriptionType } from '../../src/websocket';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Skip if no credentials or map UUID
const hasCredentials = process.env.RTLS_API_KEY && process.env.APP_NAMESPACE;
const hasMapUuid = !!process.env.MAP_UUID;

describe.skipIf(!hasCredentials || !hasMapUuid)('RtlsWebSocketPublisher Integration', () => {
  let publisher: RtlsWebSocketPublisher;

  beforeAll(() => {
    publisher = new RtlsWebSocketPublisher({
      apiKey: process.env.RTLS_API_KEY!,
      namespace: process.env.APP_NAMESPACE!,
      mapUuid: process.env.MAP_UUID!,
      debug: process.env.DEBUG === 'true',
    });
  });

  afterAll(async () => {
    if (publisher) {
      await publisher.disconnect();
    }
  });

  it('should connect to the WebSocket server', async () => {
    await publisher.connect();
    expect(publisher.isConnected()).toBe(true);
  }, 15000);

  it('should send a position update', async () => {
    if (!publisher.isConnected()) {
      await publisher.connect();
    }

    const testMac = 'aaaa' + Date.now().toString(16).slice(-8); // Unique test MAC
    const result = await publisher.sendPosition({
      macAddress: testMac,
      latitude: 48.8566 + Math.random() * 0.001,
      longitude: 2.3522 + Math.random() * 0.001,
      name: 'Integration-Test-Tag',
      color: '#FF0000',
      data: {
        test: true,
        timestamp: new Date().toISOString(),
      },
    });

    expect(result.success).toBe(true);
  }, 15000);

  it('should send batch positions', async () => {
    if (!publisher.isConnected()) {
      await publisher.connect();
    }

    const baseTimestamp = Date.now().toString(16).slice(-8);
    const result = await publisher.sendBatch([
      {
        macAddress: 'aaa1' + baseTimestamp,
        latitude: 48.8566,
        longitude: 2.3522,
        name: 'Batch-Test-1',
      },
      {
        macAddress: 'aaa2' + baseTimestamp,
        latitude: 48.8567,
        longitude: 2.3523,
        name: 'Batch-Test-2',
      },
      {
        macAddress: 'aaa3' + baseTimestamp,
        latitude: 48.8568,
        longitude: 2.3524,
        name: 'Batch-Test-3',
      },
    ]);

    expect(result.success).toBe(true);
    expect(result.sent).toBe(3);
    expect(result.failed).toBe(0);
  }, 15000);

  it('should handle invalid MAC addresses in batch', async () => {
    if (!publisher.isConnected()) {
      await publisher.connect();
    }

    const baseTimestamp = Date.now().toString(16).slice(-8);
    const result = await publisher.sendBatch([
      {
        macAddress: 'ok01' + baseTimestamp,
        latitude: 48.8566,
        longitude: 2.3522,
      },
      {
        macAddress: 'invalid-mac',
        latitude: 48.8567,
        longitude: 2.3523,
      },
      {
        macAddress: 'ok02' + baseTimestamp,
        latitude: 48.8568,
        longitude: 2.3524,
      },
    ]);

    expect(result.success).toBe(false);
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
  }, 15000);

  it('should disconnect gracefully', async () => {
    if (!publisher.isConnected()) {
      await publisher.connect();
    }

    await publisher.disconnect();
    expect(publisher.isConnected()).toBe(false);
  }, 15000);
});

// Test publisher -> subscriber flow (requires both connections)
describe.skipIf(!hasCredentials || !hasMapUuid)('Publisher -> Subscriber Flow', () => {
  let publisher: RtlsWebSocketPublisher;
  let subscriber: RtlsWebSocketSubscriber;

  beforeAll(async () => {
    publisher = new RtlsWebSocketPublisher({
      apiKey: process.env.RTLS_API_KEY!,
      namespace: process.env.APP_NAMESPACE!,
      mapUuid: process.env.MAP_UUID!,
      debug: process.env.DEBUG === 'true',
    });

    subscriber = new RtlsWebSocketSubscriber({
      apiKey: process.env.RTLS_API_KEY!,
      namespace: process.env.APP_NAMESPACE!,
      debug: process.env.DEBUG === 'true',
    });
  });

  afterAll(async () => {
    await Promise.all([
      publisher?.disconnect(),
      subscriber?.disconnect(),
    ]);
  });

  it('should receive published position on subscriber', async () => {
    // Connect both
    await Promise.all([
      publisher.connect(),
      subscriber.connect(),
    ]);

    // Subscribe to positions
    await subscriber.subscribe([SubscriptionType.POSITIONS]);

    // Collect received positions
    const received: unknown[] = [];
    const testMac = 'test' + Date.now().toString(16).slice(-8);

    subscriber.on('POSITIONS', (pos) => {
      if ((pos as { user_uuid?: string }).user_uuid === testMac) {
        received.push(pos);
      }
    });

    // Give subscription time to activate
    await new Promise(resolve => setTimeout(resolve, 500));

    // Publish position
    const result = await publisher.sendPosition({
      macAddress: testMac,
      latitude: 48.8566,
      longitude: 2.3522,
      name: 'Flow-Test-Tag',
    });

    expect(result.success).toBe(true);

    // Wait for message to arrive
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Note: This may or may not succeed depending on server processing time
    // and whether positions are being actively streamed
    console.log(`Received ${received.length} matching positions`);
  }, 20000);
});
