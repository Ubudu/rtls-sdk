/**
 * RtlsWebSocketPublisher Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RtlsWebSocketPublisher, POSITION_ORIGIN } from '../../src/websocket';
import {
  MockWebSocket,
  setupWebSocketMock,
  teardownWebSocketMock,
  flushPromises,
} from './mocks/websocket';
import { TEST_CONFIG } from './mocks/fixtures';

describe('RtlsWebSocketPublisher', () => {
  beforeEach(() => {
    setupWebSocketMock();
  });

  afterEach(() => {
    teardownWebSocketMock();
  });

  describe('constructor', () => {
    it('should create publisher with required config', () => {
      const publisher = new RtlsWebSocketPublisher({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
        mapUuid: TEST_CONFIG.mapUuid,
      });

      expect(publisher).toBeInstanceOf(RtlsWebSocketPublisher);
    });

    it('should throw if mapUuid not provided', () => {
      expect(() => {
        new RtlsWebSocketPublisher({
          apiKey: TEST_CONFIG.apiKey,
          namespace: TEST_CONFIG.namespace,
          mapUuid: '', // Empty is also invalid
        } as { apiKey: string; namespace: string; mapUuid: string });
      }).toThrow(/mapUuid/);
    });

    it('should throw if no auth provided', () => {
      expect(() => {
        new RtlsWebSocketPublisher({
          namespace: TEST_CONFIG.namespace,
          mapUuid: TEST_CONFIG.mapUuid,
        });
      }).toThrow(/apiKey or token/);
    });
  });

  describe('connect()', () => {
    it('should connect to publisher WebSocket', async () => {
      const publisher = new RtlsWebSocketPublisher({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
        mapUuid: TEST_CONFIG.mapUuid,
      });

      await publisher.connect();
      await flushPromises();

      expect(publisher.isConnected()).toBe(true);
    });

    it('should use publisher URL', async () => {
      const publisher = new RtlsWebSocketPublisher({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
        mapUuid: TEST_CONFIG.mapUuid,
      });

      await publisher.connect();
      await flushPromises();

      const mockWs = MockWebSocket.lastInstance;
      expect(mockWs?.url).toContain('/ws/publisher');
    });

    it('should use custom publisher URL when provided', async () => {
      const customUrl = 'wss://custom.example.com/publisher';
      const publisher = new RtlsWebSocketPublisher({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
        mapUuid: TEST_CONFIG.mapUuid,
        publisherUrl: customUrl,
      });

      await publisher.connect();
      await flushPromises();

      const mockWs = MockWebSocket.lastInstance;
      expect(mockWs?.url).toContain('custom.example.com');
    });
  });

  describe('sendPosition()', () => {
    it('should send position message', async () => {
      const publisher = new RtlsWebSocketPublisher({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
        mapUuid: TEST_CONFIG.mapUuid,
      });

      await publisher.connect();
      await flushPromises();

      const mockWs = MockWebSocket.lastInstance!;

      const result = await publisher.sendPosition({
        macAddress: 'AA:BB:CC:DD:EE:FF',
        latitude: 48.8566,
        longitude: 2.3522,
      });

      expect(result.success).toBe(true);

      const sentMessages = mockWs.getSentMessages();
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0]).toMatchObject({
        lat: 48.8566,
        lon: 2.3522,
        user_uuid: 'aabbccddeeff', // Normalized
        origin: POSITION_ORIGIN.EXTERNAL_API,
      });
    });

    it('should normalize MAC address', async () => {
      const publisher = new RtlsWebSocketPublisher({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
        mapUuid: TEST_CONFIG.mapUuid,
      });

      await publisher.connect();
      await flushPromises();

      const mockWs = MockWebSocket.lastInstance!;

      await publisher.sendPosition({
        macAddress: 'AA:BB:CC:DD:EE:FF',
        latitude: 48.8566,
        longitude: 2.3522,
      });

      const sentMessages = mockWs.getSentMessages();
      expect(sentMessages[0]).toHaveProperty('user_uuid', 'aabbccddeeff');
    });

    it('should include custom data', async () => {
      const publisher = new RtlsWebSocketPublisher({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
        mapUuid: TEST_CONFIG.mapUuid,
      });

      await publisher.connect();
      await flushPromises();

      const mockWs = MockWebSocket.lastInstance!;

      await publisher.sendPosition({
        macAddress: 'aabbccddeeff',
        latitude: 48.8566,
        longitude: 2.3522,
        name: 'Forklift-42',
        color: '#FF5500',
        model: 'ForkLift-3000',
        data: {
          battery: 85,
          operator: 'John Doe',
        },
      });

      const sentMessages = mockWs.getSentMessages();
      expect(sentMessages[0]).toMatchObject({
        user_name: 'Forklift-42',
        color: '#FF5500',
        model: 'ForkLift-3000',
        data: {
          battery: 85,
          operator: 'John Doe',
        },
      });
    });

    it('should include namespace and mapUuid', async () => {
      const publisher = new RtlsWebSocketPublisher({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
        mapUuid: TEST_CONFIG.mapUuid,
      });

      await publisher.connect();
      await flushPromises();

      const mockWs = MockWebSocket.lastInstance!;

      await publisher.sendPosition({
        macAddress: 'aabbccddeeff',
        latitude: 48.8566,
        longitude: 2.3522,
      });

      const sentMessages = mockWs.getSentMessages();
      expect(sentMessages[0]).toMatchObject({
        app_namespace: TEST_CONFIG.namespace,
        map_uuid: TEST_CONFIG.mapUuid,
      });
    });

    it('should auto-connect if not connected', async () => {
      const publisher = new RtlsWebSocketPublisher({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
        mapUuid: TEST_CONFIG.mapUuid,
      });

      expect(publisher.isConnected()).toBe(false);

      const resultPromise = publisher.sendPosition({
        macAddress: 'aabbccddeeff',
        latitude: 48.8566,
        longitude: 2.3522,
      });

      await flushPromises();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(publisher.isConnected()).toBe(true);
    });

    it('should return error for invalid MAC address', async () => {
      const publisher = new RtlsWebSocketPublisher({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
        mapUuid: TEST_CONFIG.mapUuid,
      });

      await publisher.connect();
      await flushPromises();

      const result = await publisher.sendPosition({
        macAddress: 'invalid-mac',
        latitude: 48.8566,
        longitude: 2.3522,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid MAC address');
    });

    it('should allow overriding namespace and mapUuid per-message', async () => {
      const publisher = new RtlsWebSocketPublisher({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
        mapUuid: TEST_CONFIG.mapUuid,
      });

      await publisher.connect();
      await flushPromises();

      const mockWs = MockWebSocket.lastInstance!;

      await publisher.sendPosition({
        macAddress: 'aabbccddeeff',
        latitude: 48.8566,
        longitude: 2.3522,
        appNamespace: 'override-namespace',
        mapUuid: 'override-map-uuid',
      });

      const sentMessages = mockWs.getSentMessages();
      expect(sentMessages[0]).toMatchObject({
        app_namespace: 'override-namespace',
        map_uuid: 'override-map-uuid',
      });
    });
  });

  describe('sendBatch()', () => {
    it('should send multiple positions', async () => {
      const publisher = new RtlsWebSocketPublisher({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
        mapUuid: TEST_CONFIG.mapUuid,
      });

      await publisher.connect();
      await flushPromises();

      const mockWs = MockWebSocket.lastInstance!;

      const result = await publisher.sendBatch([
        { macAddress: 'aabbccddeeff', latitude: 48.8566, longitude: 2.3522 },
        { macAddress: '112233445566', latitude: 48.8570, longitude: 2.3530 },
        { macAddress: 'ffeeddccbbaa', latitude: 48.8575, longitude: 2.3540 },
      ]);

      expect(result.success).toBe(true);
      expect(result.sent).toBe(3);
      expect(result.failed).toBe(0);

      const sentMessages = mockWs.getSentMessages();
      expect(sentMessages).toHaveLength(3);
    });

    it('should report partial failures', async () => {
      const publisher = new RtlsWebSocketPublisher({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
        mapUuid: TEST_CONFIG.mapUuid,
      });

      await publisher.connect();
      await flushPromises();

      const result = await publisher.sendBatch([
        { macAddress: 'aabbccddeeff', latitude: 48.8566, longitude: 2.3522 },
        { macAddress: 'invalid-mac', latitude: 48.8570, longitude: 2.3530 },
        { macAddress: 'ffeeddccbbaa', latitude: 48.8575, longitude: 2.3540 },
      ]);

      expect(result.success).toBe(false);
      expect(result.sent).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0]).toContain('invalid-mac');
    });

    it('should auto-connect if not connected', async () => {
      const publisher = new RtlsWebSocketPublisher({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
        mapUuid: TEST_CONFIG.mapUuid,
      });

      const resultPromise = publisher.sendBatch([
        { macAddress: 'aabbccddeeff', latitude: 48.8566, longitude: 2.3522 },
      ]);

      await flushPromises();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(publisher.isConnected()).toBe(true);
    });
  });

  describe('getMapUuid()', () => {
    it('should return configured mapUuid', () => {
      const publisher = new RtlsWebSocketPublisher({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
        mapUuid: TEST_CONFIG.mapUuid,
      });

      expect(publisher.getMapUuid()).toBe(TEST_CONFIG.mapUuid);
    });
  });

  describe('disconnect()', () => {
    it('should disconnect from server', async () => {
      const publisher = new RtlsWebSocketPublisher({
        apiKey: TEST_CONFIG.apiKey,
        namespace: TEST_CONFIG.namespace,
        mapUuid: TEST_CONFIG.mapUuid,
      });

      await publisher.connect();
      await flushPromises();

      expect(publisher.isConnected()).toBe(true);

      await publisher.disconnect();
      await flushPromises();

      expect(publisher.isConnected()).toBe(false);
    });
  });
});
