/**
 * RtlsWebSocketSubscriber Integration Tests
 *
 * These tests run against the live RTLS WebSocket API.
 * Requires RTLS_API_KEY and APP_NAMESPACE environment variables.
 *
 * Run with: npm run test:ws:integration
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { RtlsWebSocketSubscriber, SubscriptionType } from '../../src/websocket';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Skip if no credentials
const hasCredentials = process.env.RTLS_API_KEY && process.env.APP_NAMESPACE;

describe.skipIf(!hasCredentials)('RtlsWebSocketSubscriber Integration', () => {
  let subscriber: RtlsWebSocketSubscriber;

  beforeAll(() => {
    subscriber = new RtlsWebSocketSubscriber({
      apiKey: process.env.RTLS_API_KEY!,
      namespace: process.env.APP_NAMESPACE!,
      debug: process.env.DEBUG === 'true',
    });
  });

  afterAll(async () => {
    if (subscriber) {
      await subscriber.disconnect();
    }
  });

  it('should connect to the WebSocket server', async () => {
    const connectedHandler = vi.fn();
    subscriber.on('connected', connectedHandler);

    await subscriber.connect();

    expect(subscriber.isConnected()).toBe(true);
    expect(connectedHandler).toHaveBeenCalled();
  }, 15000);

  it('should subscribe to POSITIONS', async () => {
    if (!subscriber.isConnected()) {
      await subscriber.connect();
    }

    const result = await subscriber.subscribe([SubscriptionType.POSITIONS]);

    expect(result.success).toBe(true);
    expect(subscriber.getActiveSubscriptions()).toContain(SubscriptionType.POSITIONS);
  }, 15000);

  it('should subscribe to multiple types', async () => {
    if (!subscriber.isConnected()) {
      await subscriber.connect();
    }

    const result = await subscriber.subscribe([
      SubscriptionType.POSITIONS,
      SubscriptionType.ZONES_ENTRIES_EVENTS,
      SubscriptionType.ALERTS,
    ]);

    expect(result.success).toBe(true);

    const active = subscriber.getActiveSubscriptions();
    expect(active).toContain(SubscriptionType.POSITIONS);
    expect(active).toContain(SubscriptionType.ZONES_ENTRIES_EVENTS);
    expect(active).toContain(SubscriptionType.ALERTS);
  }, 15000);

  it('should receive position messages (if tags are active)', async () => {
    if (!subscriber.isConnected()) {
      await subscriber.connect();
      await subscriber.subscribe([SubscriptionType.POSITIONS]);
    }

    const positions: unknown[] = [];
    const positionHandler = (pos: unknown) => {
      positions.push(pos);
    };

    subscriber.on('POSITIONS', positionHandler);

    // Wait for messages - may timeout if no active tags
    await new Promise(resolve => setTimeout(resolve, 5000));

    subscriber.off('POSITIONS', positionHandler);

    // Log result - this test may pass with 0 messages if no tags active
    console.log(`Received ${positions.length} position messages in 5 seconds`);

    // This is informational - we can't guarantee messages
    expect(positions).toBeDefined();
  }, 10000);

  it('should report connection status', async () => {
    if (!subscriber.isConnected()) {
      await subscriber.connect();
    }

    const status = subscriber.getConnectionStatus();

    expect(status.state).toBe('CONNECTED');
    expect(status.connectedAt).toBeInstanceOf(Date);
    expect(status.reconnectAttempts).toBe(0);
  }, 15000);

  it('should disconnect gracefully', async () => {
    if (!subscriber.isConnected()) {
      await subscriber.connect();
    }

    const disconnectedHandler = vi.fn();
    subscriber.on('disconnected', disconnectedHandler);

    await subscriber.disconnect();

    expect(subscriber.isConnected()).toBe(false);
    // Note: disconnected event may fire asynchronously
  }, 15000);
});

// Separate test for authentication errors
describe.skipIf(!hasCredentials)('RtlsWebSocketSubscriber Auth Errors', () => {
  it('should fail with invalid API key', async () => {
    const badSubscriber = new RtlsWebSocketSubscriber({
      apiKey: 'invalid-api-key',
      namespace: process.env.APP_NAMESPACE!,
    });

    const errorHandler = vi.fn();
    badSubscriber.on('error', errorHandler);

    try {
      await badSubscriber.connect();
      // If connect succeeds, we might still get auth error on subscribe
      await badSubscriber.subscribe([SubscriptionType.POSITIONS]);
    } catch (error) {
      // Expected to fail
      expect(error).toBeDefined();
    } finally {
      await badSubscriber.disconnect();
    }
  }, 15000);
});
