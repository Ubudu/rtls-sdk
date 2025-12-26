/**
 * RtlsWebSocketClient (Unified) Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RtlsWebSocketClient, SubscriptionType } from '../../src/websocket';
import {
  MockWebSocket,
  setupWebSocketMock,
  teardownWebSocketMock,
  flushPromises,
} from './mocks/websocket';
import {
  TEST_CONFIG,
  createPositionMessage,
} from './mocks/fixtures';

describe('RtlsWebSocketClient', () => {
  beforeEach(() => {
    setupWebSocketMock();
  });

  afterEach(() => {
    teardownWebSocketMock();
  });

  describe('constructor', () => {
    it('should create client with subscriber only (no mapUuid)', () => {
      const client = new RtlsWebSocketClient({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
      });

      expect(client).toBeInstanceOf(RtlsWebSocketClient);
      expect(client.getPublisher()).toBeNull();
      expect(client.getSubscriber()).not.toBeNull();
    });

    it('should create client with both subscriber and publisher', () => {
      const client = new RtlsWebSocketClient({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
        mapUuid: TEST_CONFIG.mapUuid,
      });

      expect(client).toBeInstanceOf(RtlsWebSocketClient);
      expect(client.getPublisher()).not.toBeNull();
      expect(client.getSubscriber()).not.toBeNull();
    });

    it('should throw if no auth provided', () => {
      expect(() => {
        new RtlsWebSocketClient({
          namespace: TEST_CONFIG.namespace,
        });
      }).toThrow(/apiKey or token/);
    });

    it('should throw if no namespace provided', () => {
      expect(() => {
        new RtlsWebSocketClient({
          apiKey: TEST_CONFIG.apiKey,
          namespace: '',
        });
      }).toThrow(/namespace/);
    });
  });

  describe('connect()', () => {
    it('should connect subscriber only when no mapUuid', async () => {
      const client = new RtlsWebSocketClient({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
      });

      await client.connect();
      await flushPromises();

      expect(client.isSubscriberConnected()).toBe(true);
      expect(client.isPublisherConnected()).toBe(false);
    });

    it('should connect both subscriber and publisher when mapUuid provided', async () => {
      const client = new RtlsWebSocketClient({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
        mapUuid: TEST_CONFIG.mapUuid,
      });

      await client.connect();
      await flushPromises();

      expect(client.isSubscriberConnected()).toBe(true);
      expect(client.isPublisherConnected()).toBe(true);
    });

    it('should connect only subscriber with subscriberOnly option', async () => {
      const client = new RtlsWebSocketClient({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
        mapUuid: TEST_CONFIG.mapUuid,
      });

      await client.connect({ subscriberOnly: true });
      await flushPromises();

      expect(client.isSubscriberConnected()).toBe(true);
      expect(client.isPublisherConnected()).toBe(false);
    });

    it('should connect only publisher with publisherOnly option', async () => {
      const client = new RtlsWebSocketClient({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
        mapUuid: TEST_CONFIG.mapUuid,
      });

      await client.connect({ publisherOnly: true });
      await flushPromises();

      expect(client.isSubscriberConnected()).toBe(false);
      expect(client.isPublisherConnected()).toBe(true);
    });
  });

  describe('subscribe()', () => {
    it('should delegate to subscriber', async () => {
      const client = new RtlsWebSocketClient({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
      });

      await client.connect();
      await flushPromises();

      // Get the mock for subscriber
      const mockWs = MockWebSocket.lastInstance!;

      const subscribePromise = client.subscribe([SubscriptionType.POSITIONS]);
      await flushPromises();

      mockWs.simulateSubscriptionConfirmation([SubscriptionType.POSITIONS]);
      const result = await subscribePromise;

      expect(result.success).toBe(true);
    });

    it('should track active subscriptions', async () => {
      const client = new RtlsWebSocketClient({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
      });

      await client.connect();
      await flushPromises();

      const mockWs = MockWebSocket.lastInstance!;

      const subscribePromise = client.subscribe([
        SubscriptionType.POSITIONS,
        SubscriptionType.ALERTS,
      ]);

      await flushPromises();
      mockWs.simulateSubscriptionConfirmation();
      await subscribePromise;

      const active = client.getActiveSubscriptions();
      expect(active).toContain(SubscriptionType.POSITIONS);
      expect(active).toContain(SubscriptionType.ALERTS);
    });
  });

  describe('on()/off()/once()', () => {
    it('should delegate event handlers to subscriber', async () => {
      const client = new RtlsWebSocketClient({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
      });

      const positionHandler = vi.fn();
      client.on('POSITIONS', positionHandler);

      await client.connect();
      await flushPromises();

      const mockWs = MockWebSocket.lastInstance!;
      mockWs.simulateMessage(createPositionMessage());

      expect(positionHandler).toHaveBeenCalled();
    });

    it('should return unsubscribe function', async () => {
      const client = new RtlsWebSocketClient({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
      });

      const positionHandler = vi.fn();
      const unsubscribe = client.on('POSITIONS', positionHandler);

      await client.connect();
      await flushPromises();

      unsubscribe();

      const mockWs = MockWebSocket.lastInstance!;
      mockWs.simulateMessage(createPositionMessage());

      expect(positionHandler).not.toHaveBeenCalled();
    });

    it('should support once() for one-time handlers', async () => {
      const client = new RtlsWebSocketClient({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
      });

      const positionHandler = vi.fn();
      client.once('POSITIONS', positionHandler);

      await client.connect();
      await flushPromises();

      const mockWs = MockWebSocket.lastInstance!;
      mockWs.simulateMessage(createPositionMessage());
      mockWs.simulateMessage(createPositionMessage());

      expect(positionHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendPosition()', () => {
    it('should delegate to publisher', async () => {
      const client = new RtlsWebSocketClient({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
        mapUuid: TEST_CONFIG.mapUuid,
      });

      await client.connect();
      await flushPromises();

      const result = await client.sendPosition({
        macAddress: 'aabbccddeeff',
        latitude: 48.8566,
        longitude: 2.3522,
      });

      expect(result.success).toBe(true);
    });

    it('should return error if no publisher configured', async () => {
      const client = new RtlsWebSocketClient({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
        // No mapUuid = no publisher
      });

      await client.connect();
      await flushPromises();

      const result = await client.sendPosition({
        macAddress: 'aabbccddeeff',
        latitude: 48.8566,
        longitude: 2.3522,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Publisher not configured');
    });
  });

  describe('sendBatch()', () => {
    it('should delegate to publisher', async () => {
      const client = new RtlsWebSocketClient({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
        mapUuid: TEST_CONFIG.mapUuid,
      });

      await client.connect();
      await flushPromises();

      const result = await client.sendBatch([
        { macAddress: 'aabbccddeeff', latitude: 48.8566, longitude: 2.3522 },
        { macAddress: '112233445566', latitude: 48.8570, longitude: 2.3530 },
      ]);

      expect(result.success).toBe(true);
      expect(result.sent).toBe(2);
    });

    it('should return error if no publisher configured', async () => {
      const client = new RtlsWebSocketClient({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
      });

      await client.connect();
      await flushPromises();

      const result = await client.sendBatch([
        { macAddress: 'aabbccddeeff', latitude: 48.8566, longitude: 2.3522 },
      ]);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('getConnectionStatus()', () => {
    it('should return status for both subscriber and publisher', async () => {
      const client = new RtlsWebSocketClient({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
        mapUuid: TEST_CONFIG.mapUuid,
      });

      let status = client.getConnectionStatus();
      expect(status.subscriber.state).toBe('DISCONNECTED');
      expect(status.publisher?.state).toBe('DISCONNECTED');

      await client.connect();
      await flushPromises();

      status = client.getConnectionStatus();
      expect(status.subscriber.state).toBe('CONNECTED');
      expect(status.publisher?.state).toBe('CONNECTED');
    });

    it('should return null for publisher when not configured', () => {
      const client = new RtlsWebSocketClient({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
      });

      const status = client.getConnectionStatus();
      expect(status.publisher).toBeNull();
    });
  });

  describe('isConnected()', () => {
    it('should return true when subscriber connected (no publisher)', async () => {
      const client = new RtlsWebSocketClient({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
      });

      await client.connect();
      await flushPromises();

      expect(client.isConnected()).toBe(true);
    });

    it('should return true only when both connected (with publisher)', async () => {
      const client = new RtlsWebSocketClient({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
        mapUuid: TEST_CONFIG.mapUuid,
      });

      // Connect only subscriber
      await client.connect({ subscriberOnly: true });
      await flushPromises();

      expect(client.isConnected()).toBe(false); // Publisher not connected

      // Now connect publisher too
      await client.connect({ publisherOnly: true });
      await flushPromises();

      expect(client.isConnected()).toBe(true);
    });
  });

  describe('disconnect()', () => {
    it('should disconnect all connections', async () => {
      const client = new RtlsWebSocketClient({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
        mapUuid: TEST_CONFIG.mapUuid,
      });

      await client.connect();
      await flushPromises();

      expect(client.isSubscriberConnected()).toBe(true);
      expect(client.isPublisherConnected()).toBe(true);

      await client.disconnect();
      await flushPromises();

      expect(client.isSubscriberConnected()).toBe(false);
      expect(client.isPublisherConnected()).toBe(false);
    });
  });

  describe('getConfig()', () => {
    it('should return a copy of the configuration', () => {
      const client = new RtlsWebSocketClient({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
        mapUuid: TEST_CONFIG.mapUuid,
      });

      const config = client.getConfig();

      expect(config.apiKey).toBe(TEST_CONFIG.apiKey);
      expect(config.namespace).toBe(TEST_CONFIG.namespace);
      expect(config.mapUuid).toBe(TEST_CONFIG.mapUuid);
    });
  });

  describe('getNamespace()', () => {
    it('should return the configured namespace', () => {
      const client = new RtlsWebSocketClient({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
      });

      expect(client.getNamespace()).toBe(TEST_CONFIG.namespace);
    });
  });
});
