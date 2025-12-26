/**
 * RtlsWebSocketSubscriber Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RtlsWebSocketSubscriber, SubscriptionType } from '../../src/websocket';
import {
  MockWebSocket,
  setupWebSocketMock,
  teardownWebSocketMock,
  flushPromises,
} from './mocks/websocket';
import {
  TEST_CONFIG,
  createPositionMessage,
  createZoneEntryMessage,
  createAlertMessage,
} from './mocks/fixtures';

describe('RtlsWebSocketSubscriber', () => {
  beforeEach(() => {
    setupWebSocketMock();
  });

  afterEach(() => {
    teardownWebSocketMock();
  });

  describe('constructor', () => {
    it('should create subscriber with apiKey', () => {
      const subscriber = new RtlsWebSocketSubscriber({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
      });

      expect(subscriber).toBeInstanceOf(RtlsWebSocketSubscriber);
    });

    it('should create subscriber with token', () => {
      const subscriber = new RtlsWebSocketSubscriber({
        token: 'jwt-token',
        namespace: TEST_CONFIG.namespace,
      });

      expect(subscriber).toBeInstanceOf(RtlsWebSocketSubscriber);
    });

    it('should throw if no auth provided', () => {
      expect(() => {
        new RtlsWebSocketSubscriber({
          namespace: TEST_CONFIG.namespace,
        });
      }).toThrow(/apiKey or token/);
    });

    it('should throw if no namespace provided', () => {
      expect(() => {
        new RtlsWebSocketSubscriber({
          apiKey: TEST_CONFIG.apiKey,
          namespace: '',
        });
      }).toThrow(/namespace/);
    });
  });

  describe('connect()', () => {
    it('should connect to WebSocket server', async () => {
      const subscriber = new RtlsWebSocketSubscriber({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
      });

      const connectPromise = subscriber.connect();
      await flushPromises();

      // Mock should auto-open
      await connectPromise;

      expect(subscriber.isConnected()).toBe(true);
    });

    it('should emit connected event', async () => {
      const subscriber = new RtlsWebSocketSubscriber({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
      });

      const connectedHandler = vi.fn();
      subscriber.on('connected', connectedHandler);

      await subscriber.connect();
      await flushPromises();

      expect(connectedHandler).toHaveBeenCalled();
      expect(connectedHandler.mock.calls[0][0]).toHaveProperty('timestamp');
    });

    it('should build URL with apiKey query param', async () => {
      const subscriber = new RtlsWebSocketSubscriber({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
      });

      await subscriber.connect();
      await flushPromises();

      const mockWs = MockWebSocket.lastInstance;
      expect(mockWs?.url).toContain('apiKey=' + TEST_CONFIG.apiKey);
    });

    it('should build URL with token query param when using token', async () => {
      const subscriber = new RtlsWebSocketSubscriber({
        token: 'my-jwt-token',
        namespace: TEST_CONFIG.namespace,
      });

      await subscriber.connect();
      await flushPromises();

      const mockWs = MockWebSocket.lastInstance;
      expect(mockWs?.url).toContain('token=my-jwt-token');
    });
  });

  describe('subscribe()', () => {
    it('should send SUBSCRIBE message to server', async () => {
      const subscriber = new RtlsWebSocketSubscriber({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
      });

      await subscriber.connect();
      await flushPromises();

      const mockWs = MockWebSocket.lastInstance!;

      // Start subscription (don't await yet)
      const subscribePromise = subscriber.subscribe([SubscriptionType.POSITIONS]);

      await flushPromises();

      // Check that SUBSCRIBE message was sent
      const sentMessages = mockWs.getSentMessages();
      expect(sentMessages).toContainEqual(expect.objectContaining({
        type: 'SUBSCRIBE',
        app_namespace: TEST_CONFIG.namespace,
        data_type_filter: [SubscriptionType.POSITIONS],
      }));

      // Simulate confirmation
      mockWs.simulateSubscriptionConfirmation([SubscriptionType.POSITIONS]);

      const result = await subscribePromise;
      expect(result.success).toBe(true);
    });

    it('should accept single subscription type', async () => {
      const subscriber = new RtlsWebSocketSubscriber({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
      });

      await subscriber.connect();
      await flushPromises();

      const mockWs = MockWebSocket.lastInstance!;
      const subscribePromise = subscriber.subscribe(SubscriptionType.ALERTS);

      await flushPromises();
      mockWs.simulateSubscriptionConfirmation([SubscriptionType.ALERTS]);

      const result = await subscribePromise;
      expect(result.success).toBe(true);
    });

    it('should throw if not connected', async () => {
      const subscriber = new RtlsWebSocketSubscriber({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
      });

      await expect(subscriber.subscribe([SubscriptionType.POSITIONS]))
        .rejects.toThrow(/not connected/);
    });

    it('should throw for invalid subscription type', async () => {
      const subscriber = new RtlsWebSocketSubscriber({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
      });

      await subscriber.connect();
      await flushPromises();

      await expect(subscriber.subscribe(['INVALID' as SubscriptionType]))
        .rejects.toThrow(/Invalid subscription type/);
    });

    it('should include map_uuid when configured', async () => {
      const subscriber = new RtlsWebSocketSubscriber({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
        mapUuid: TEST_CONFIG.mapUuid,
      });

      await subscriber.connect();
      await flushPromises();

      const mockWs = MockWebSocket.lastInstance!;
      const subscribePromise = subscriber.subscribe([SubscriptionType.POSITIONS]);

      await flushPromises();

      const sentMessages = mockWs.getSentMessages();
      expect(sentMessages).toContainEqual(expect.objectContaining({
        map_uuid: TEST_CONFIG.mapUuid,
      }));

      mockWs.simulateSubscriptionConfirmation();
      await subscribePromise;
    });

    it('should track active subscriptions', async () => {
      const subscriber = new RtlsWebSocketSubscriber({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
      });

      await subscriber.connect();
      await flushPromises();

      const mockWs = MockWebSocket.lastInstance!;

      const subscribePromise = subscriber.subscribe([
        SubscriptionType.POSITIONS,
        SubscriptionType.ALERTS,
      ]);

      await flushPromises();
      mockWs.simulateSubscriptionConfirmation();
      await subscribePromise;

      const active = subscriber.getActiveSubscriptions();
      expect(active).toContain(SubscriptionType.POSITIONS);
      expect(active).toContain(SubscriptionType.ALERTS);
    });
  });

  describe('event handling', () => {
    it('should emit POSITIONS events', async () => {
      const subscriber = new RtlsWebSocketSubscriber({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
      });

      const positionHandler = vi.fn();
      subscriber.on('POSITIONS', positionHandler);

      await subscriber.connect();
      await flushPromises();

      const mockWs = MockWebSocket.lastInstance!;
      const position = createPositionMessage();
      mockWs.simulateMessage(position);

      expect(positionHandler).toHaveBeenCalledWith(position);
    });

    it('should emit ZONES_ENTRIES_EVENTS events', async () => {
      const subscriber = new RtlsWebSocketSubscriber({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
      });

      const zoneHandler = vi.fn();
      subscriber.on('ZONES_ENTRIES_EVENTS', zoneHandler);

      await subscriber.connect();
      await flushPromises();

      const mockWs = MockWebSocket.lastInstance!;
      const zoneEntry = createZoneEntryMessage();
      mockWs.simulateMessage(zoneEntry);

      expect(zoneHandler).toHaveBeenCalledWith(zoneEntry);
    });

    it('should emit ALERTS events', async () => {
      const subscriber = new RtlsWebSocketSubscriber({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
      });

      const alertHandler = vi.fn();
      subscriber.on('ALERTS', alertHandler);

      await subscriber.connect();
      await flushPromises();

      const mockWs = MockWebSocket.lastInstance!;
      const alert = createAlertMessage();
      mockWs.simulateMessage(alert);

      expect(alertHandler).toHaveBeenCalledWith(alert);
    });

    it('should emit message event for all messages', async () => {
      const subscriber = new RtlsWebSocketSubscriber({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
      });

      const messageHandler = vi.fn();
      subscriber.on('message', messageHandler);

      await subscriber.connect();
      await flushPromises();

      const mockWs = MockWebSocket.lastInstance!;
      const position = createPositionMessage();
      mockWs.simulateMessage(position);

      expect(messageHandler).toHaveBeenCalledWith(position);
    });

    it('should allow unsubscribing from events', async () => {
      const subscriber = new RtlsWebSocketSubscriber({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
      });

      const positionHandler = vi.fn();
      const unsubscribe = subscriber.on('POSITIONS', positionHandler);

      await subscriber.connect();
      await flushPromises();

      // Unsubscribe
      unsubscribe();

      const mockWs = MockWebSocket.lastInstance!;
      mockWs.simulateMessage(createPositionMessage());

      expect(positionHandler).not.toHaveBeenCalled();
    });
  });

  describe('disconnect()', () => {
    it('should disconnect from server', async () => {
      const subscriber = new RtlsWebSocketSubscriber({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
      });

      await subscriber.connect();
      await flushPromises();

      expect(subscriber.isConnected()).toBe(true);

      await subscriber.disconnect();
      await flushPromises();

      expect(subscriber.isConnected()).toBe(false);
    });

    it('should emit disconnected event', async () => {
      const subscriber = new RtlsWebSocketSubscriber({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
      });

      const disconnectedHandler = vi.fn();
      subscriber.on('disconnected', disconnectedHandler);

      await subscriber.connect();
      await flushPromises();

      await subscriber.disconnect();
      await flushPromises();

      expect(disconnectedHandler).toHaveBeenCalled();
    });
  });

  describe('getConnectionStatus()', () => {
    it('should return connection status', async () => {
      const subscriber = new RtlsWebSocketSubscriber({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
      });

      let status = subscriber.getConnectionStatus();
      expect(status.state).toBe('DISCONNECTED');

      await subscriber.connect();
      await flushPromises();

      status = subscriber.getConnectionStatus();
      expect(status.state).toBe('CONNECTED');
      expect(status.connectedAt).toBeInstanceOf(Date);
      expect(status.reconnectAttempts).toBe(0);
    });
  });
});
