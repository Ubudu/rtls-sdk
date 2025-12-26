# Appendix I: Test Patterns Reference

From the reference test files:

## Subscriber Tests Pattern

```typescript
describe('RtlsWebSocketSubscriber', () => {
  let subscriber: RtlsWebSocketSubscriber;

  beforeEach(() => {
    subscriber = new RtlsWebSocketSubscriber({
      apiKey: 'test-key',
      namespace: 'test-namespace',
      debug: false
    });
  });

  afterEach(async () => {
    await subscriber.disconnect().catch(() => {});
  });

  it('should be properly instantiated', () => {
    expect(subscriber.getConnectionStatus().state).toBe('DISCONNECTED');
    expect(subscriber.getActiveSubscriptions()).toEqual([]);
  });

  it('should connect to WebSocket server', async () => {
    await subscriber.connect();
    expect(subscriber.isConnected()).toBe(true);
  });

  it('should subscribe to event types', async () => {
    await subscriber.connect();
    const result = await subscriber.subscribe([SubscriptionType.POSITIONS]);
    expect(result.success).toBe(true);
  });

  it('should reject invalid subscription types', async () => {
    await subscriber.connect();
    await expect(subscriber.subscribe(['INVALID' as any]))
      .rejects.toThrow(/Invalid subscription type/);
  });

  it('should route messages to correct handlers', async () => {
    const handler = vi.fn();
    subscriber.on('POSITIONS', handler);

    await subscriber.connect();

    // Simulate receiving a position message
    (subscriber as any).handleMessage({
      lat: 48.8566,
      lon: 2.3522,
      user_uuid: 'test-tag'
    });

    expect(handler).toHaveBeenCalled();
  });
});
```

## Publisher Tests Pattern

```typescript
describe('RtlsWebSocketPublisher', () => {
  let publisher: RtlsWebSocketPublisher;

  beforeEach(() => {
    publisher = new RtlsWebSocketPublisher({
      apiKey: 'test-key',
      namespace: 'test-namespace',
      mapUuid: 'test-map-uuid',
      debug: false
    });
  });

  afterEach(async () => {
    await publisher.disconnect().catch(() => {});
  });

  it('should send position with correct format', async () => {
    await publisher.connect();

    // Mock the send method
    const sendSpy = vi.spyOn(publisher as any, 'send');

    await publisher.sendPosition({
      macAddress: 'aabbccddeeff',
      latitude: 48.8566,
      longitude: 2.3522,
      name: 'Test Tag'
    });

    expect(sendSpy).toHaveBeenCalled();
    const sentData = sendSpy.mock.calls[0][0];
    expect(sentData.lat).toBe(48.8566);
    expect(sentData.lon).toBe(2.3522);
    expect(sentData.user_uuid).toBe('aabbccddeeff'); // Lowercase, no colons
    expect(sentData.user_name).toBe('Test Tag');
    expect(sentData.app_namespace).toBe('test-namespace');
    expect(sentData.map_uuid).toBe('test-map-uuid');
    expect(sentData.origin).toBe(4);
  });
});
```

## Unified Client Tests Pattern

```typescript
describe('RtlsWebSocketClient', () => {
  let client: RtlsWebSocketClient;

  beforeEach(() => {
    client = new RtlsWebSocketClient({
      apiKey: 'test-key',
      namespace: 'test-namespace',
      mapUuid: 'test-map-uuid',
      debug: false
    });
  });

  afterEach(async () => {
    await client.disconnect().catch(() => {});
  });

  it('should connect both publisher and subscriber', async () => {
    await client.connect();
    const status = client.getConnectionStatus();
    expect(status.subscriber.state).toBe('CONNECTED');
    expect(status.publisher?.state).toBe('CONNECTED');
  });

  it('should connect publisher only', async () => {
    await client.connect({ publisherOnly: true });
    expect(client.isPublisherConnected()).toBe(true);
    expect(client.isSubscriberConnected()).toBe(false);
  });

  it('should connect subscriber only', async () => {
    await client.connect({ subscriberOnly: true });
    expect(client.isPublisherConnected()).toBe(false);
    expect(client.isSubscriberConnected()).toBe(true);
  });

  it('should delegate event handlers to subscriber', async () => {
    const handler = vi.fn();
    const unsubscribe = client.on('POSITIONS', handler);
    expect(typeof unsubscribe).toBe('function');
  });

  it('should delegate sendPosition to publisher', async () => {
    await client.connect({ publisherOnly: true });
    const result = await client.sendPosition({
      macAddress: 'aabbccddeeff',
      latitude: 48.8566,
      longitude: 2.3522
    });
    expect(result.success).toBe(true);
  });
});
```

## Key Test Patterns

1. **Setup/Teardown**: Create fresh instance in `beforeEach`, cleanup in `afterEach`
2. **Connection tests**: Verify state changes after connect/disconnect
3. **Subscription tests**: Verify subscription success and rejection of invalid types
4. **Message routing**: Use `vi.fn()` to track handler calls
5. **Publisher format**: Spy on `send` method to verify message format
6. **Unified client**: Test both selective connection modes
