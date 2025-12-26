# WebSocket Real-Time Streaming Guide

This guide covers real-time data streaming using the SDK's WebSocket client.

## Overview

The RTLS WebSocket API provides real-time streaming of:
- **Positions**: Tag location updates
- **Zone Events**: Entry/exit notifications
- **Zone Stats**: Occupancy counters
- **Alerts**: System notifications
- **Assets**: Asset CRUD events

## Quick Start

### Subscriber Only

```typescript
import { RtlsWebSocketSubscriber, SubscriptionType } from 'ubudu-rtls-sdk';

const subscriber = new RtlsWebSocketSubscriber({
  apiKey: 'your-api-key',
  namespace: 'your-namespace',
});

// Register handlers BEFORE connecting
subscriber.on('POSITIONS', (position) => {
  console.log(`Tag ${position.user_uuid} at ${position.lat}, ${position.lon}`);
});

subscriber.on('ALERTS', (alert) => {
  console.log(`Alert: ${alert.params.title}`);
});

subscriber.on('connected', () => {
  console.log('Connected to WebSocket');
});

subscriber.on('disconnected', ({ code, reason }) => {
  console.log(`Disconnected: ${code} - ${reason}`);
});

// Connect and subscribe
await subscriber.connect();
await subscriber.subscribe([
  SubscriptionType.POSITIONS,
  SubscriptionType.ALERTS,
]);

// Later: disconnect
await subscriber.disconnect();
```

### Publisher Only

```typescript
import { RtlsWebSocketPublisher } from 'ubudu-rtls-sdk';

const publisher = new RtlsWebSocketPublisher({
  apiKey: 'your-api-key',
  namespace: 'your-namespace',
  mapUuid: 'your-map-uuid', // Required for publishing
});

await publisher.connect();

// Send a position
const result = await publisher.sendPosition({
  macAddress: 'aabbccddeeff',
  latitude: 48.8566,
  longitude: 2.3522,
  name: 'Forklift-42',
  color: '#FF5500',
});

console.log(result.success); // true

await publisher.disconnect();
```

### Unified Client

```typescript
import { RtlsWebSocketClient, SubscriptionType } from 'ubudu-rtls-sdk';

const client = new RtlsWebSocketClient({
  apiKey: 'your-api-key',
  namespace: 'your-namespace',
  mapUuid: 'your-map-uuid',
});

// Event handlers
client.on('POSITIONS', (pos) => console.log(pos));

// Connect both publisher and subscriber
await client.connect();
await client.subscribe([SubscriptionType.POSITIONS]);

// Send and receive
await client.sendPosition({
  macAddress: 'aabbccddeeff',
  latitude: 48.8566,
  longitude: 2.3522,
});

await client.disconnect();
```

### Creating from RtlsClient

```typescript
import { RtlsClient, SubscriptionType } from 'ubudu-rtls-sdk';

const client = new RtlsClient({
  apiKey: 'your-api-key',
  namespace: 'your-namespace',
});

// Create WebSocket client that shares config
const ws = client.createWebSocket({ mapUuid: 'map-id' });

ws.on('POSITIONS', (pos) => console.log(pos));
await ws.connect();
await ws.subscribe([SubscriptionType.POSITIONS]);
```

## Authentication

WebSocket connections are authenticated via query parameters:

```
wss://rtls.ubudu.com/api/ws/subscriber?apiKey=YOUR_API_KEY
wss://rtls.ubudu.com/api/ws/subscriber?token=YOUR_JWT_TOKEN
```

The SDK handles this automatically when you provide `apiKey` or `token` in the config.

## Subscription Types

| Type | Description |
|------|-------------|
| `POSITIONS` | Real-time tag positions |
| `ZONES_ENTRIES_EVENTS` | Zone entry/exit events |
| `ZONE_STATS_EVENTS` | Zone occupancy statistics |
| `ALERTS` | System alerts and notifications |
| `ASSETS` | Asset create/update/delete events |

```typescript
import { SubscriptionType } from 'ubudu-rtls-sdk';

// Subscribe to all
await subscriber.subscribe([]);

// Subscribe to specific types
await subscriber.subscribe([
  SubscriptionType.POSITIONS,
  SubscriptionType.ALERTS,
]);

// Subscribe to single type
await subscriber.subscribe(SubscriptionType.POSITIONS);
```

## Event Handling

### Type-Safe Events

```typescript
import { PositionMessage, AlertMessage } from 'ubudu-rtls-sdk';

subscriber.on('POSITIONS', (pos: PositionMessage) => {
  console.log(pos.lat, pos.lon);
  console.log(pos.user_uuid);    // MAC address
  console.log(pos.user_name);    // Tag name
  console.log(pos.map_uuid);     // Map ID
  console.log(pos.data);         // Custom data
});

subscriber.on('ALERTS', (alert: AlertMessage) => {
  console.log(alert.params.title);
  console.log(alert.params.text);
  console.log(alert.params.style); // 'info' | 'warning' | 'error'
});

subscriber.on('ZONES_ENTRIES_EVENTS', (event) => {
  console.log(event.event_type);  // 'ENTER_ZONE' | 'EXIT_ZONE'
  console.log(event.zone);        // Zone GeoJSON
  console.log(event.user_uuid);   // Tag MAC
});

subscriber.on('ASSETS', (asset) => {
  console.log(asset.action);      // 'create' | 'update' | 'delete'
  console.log(asset.mac_address);
  console.log(asset.data);
});
```

### Connection Events

```typescript
subscriber.on('connected', ({ timestamp }) => {
  console.log('Connected at', timestamp);
});

subscriber.on('disconnected', ({ code, reason }) => {
  console.log(`Disconnected: ${code} - ${reason}`);
});

subscriber.on('reconnecting', ({ attempt, delay }) => {
  console.log(`Reconnecting attempt ${attempt} in ${delay}ms`);
});

subscriber.on('error', ({ error }) => {
  console.error('Error:', error);
});
```

### Unsubscribing

```typescript
// Method 1: Use returned unsubscribe function
const unsubscribe = subscriber.on('POSITIONS', handler);
unsubscribe(); // Later: remove handler

// Method 2: Use off()
subscriber.off('POSITIONS', handler);
```

## Reconnection

The client automatically reconnects with exponential backoff:

```typescript
const subscriber = new RtlsWebSocketSubscriber({
  apiKey: 'key',
  namespace: 'ns',
  reconnectInterval: 5000,      // Base interval (ms)
  maxReconnectAttempts: 10,     // Max attempts (default: Infinity)
  connectionTimeout: 10000,     // Connection timeout (ms)
});

// Listen for reconnection events
subscriber.on('disconnected', ({ code, reason }) => {
  console.log('Disconnected, will attempt reconnect');
});

subscriber.on('reconnecting', ({ attempt, delay }) => {
  console.log(`Reconnect attempt ${attempt} in ${delay}ms`);
});

subscriber.on('connected', () => {
  console.log('Connected (or reconnected)');
});
```

### Reconnection Formula

```
delay = min(baseInterval * 2^attempts, maxDelay)
```

With defaults (5000ms base, 30000ms max):
- Attempt 1: 5 seconds
- Attempt 2: 10 seconds
- Attempt 3: 20 seconds
- Attempt 4+: 30 seconds

## Error Handling

```typescript
import {
  WebSocketError,
  WebSocketConnectionError,
  WebSocketAuthenticationError,
  WebSocketSubscriptionError,
} from 'ubudu-rtls-sdk';

subscriber.on('error', ({ error }) => {
  if (error instanceof WebSocketAuthenticationError) {
    console.error('Authentication failed - check API key');
  } else if (error instanceof WebSocketConnectionError) {
    console.error('Connection error:', error.message);
  } else if (error instanceof WebSocketSubscriptionError) {
    console.error('Subscription failed:', error.message);
  } else {
    console.error('WebSocket error:', error);
  }
});

try {
  await subscriber.connect();
} catch (error) {
  if (error instanceof WebSocketConnectionError) {
    console.error('Failed to connect:', error.message);
  }
}
```

## Publishing Positions

### Single Position

```typescript
const result = await publisher.sendPosition({
  macAddress: 'AA:BB:CC:DD:EE:FF',  // Any format, normalized automatically
  latitude: 48.8566,
  longitude: 2.3522,
  name: 'Asset-123',               // Optional
  color: '#FF0000',                // Optional
  model: 'ForkLift-3000',          // Optional
  data: {                          // Optional custom data
    battery: 85,
    operator: 'John Doe',
  },
});

if (!result.success) {
  console.error('Send failed:', result.error);
}
```

### Batch Publishing

```typescript
const result = await publisher.sendBatch([
  { macAddress: 'aabbccddeeff', latitude: 48.8566, longitude: 2.3522 },
  { macAddress: '112233445566', latitude: 48.8570, longitude: 2.3530 },
  { macAddress: 'ffeeddccbbaa', latitude: 48.8575, longitude: 2.3540 },
]);

console.log(`Sent: ${result.sent}, Failed: ${result.failed}`);
if (result.errors) {
  console.log('Errors:', result.errors);
}
```

## MAC Address Handling

The SDK normalizes MAC addresses automatically:

```typescript
import { normalizeMacAddress, isValidMacAddress } from 'ubudu-rtls-sdk';

// All these become 'aabbccddeeff'
normalizeMacAddress('AA:BB:CC:DD:EE:FF');
normalizeMacAddress('aa:bb:cc:dd:ee:ff');
normalizeMacAddress('AA-BB-CC-DD-EE-FF');
normalizeMacAddress('AABBCCDDEEFF');

// Validate
isValidMacAddress('AA:BB:CC:DD:EE:FF'); // true
isValidMacAddress('invalid');            // false
```

## Type Guards

```typescript
import {
  isPositionMessage,
  isZoneEntryExitMessage,
  isAlertMessage,
  isAssetMessage,
  classifyMessage,
  SubscriptionType,
} from 'ubudu-rtls-sdk';

subscriber.on('message', (msg) => {
  if (isPositionMessage(msg)) {
    console.log('Position:', msg.lat, msg.lon);
  } else if (isZoneEntryExitMessage(msg)) {
    console.log('Zone event:', msg.event_type);
  } else if (isAlertMessage(msg)) {
    console.log('Alert:', msg.params.title);
  } else if (isAssetMessage(msg)) {
    console.log('Asset:', msg.action, msg.mac_address);
  }

  // Or use classifyMessage
  const type = classifyMessage(msg);
  if (type === SubscriptionType.POSITIONS) {
    // ...
  }
});
```

## Connection Status

```typescript
const status = subscriber.getConnectionStatus();
console.log(status.state);           // 'CONNECTED' | 'DISCONNECTED' | etc.
console.log(status.connectedAt);     // Date or undefined
console.log(status.reconnectAttempts);

// Unified client
const unifiedStatus = client.getConnectionStatus();
console.log(unifiedStatus.subscriber.state);
console.log(unifiedStatus.publisher?.state);
```

## Node.js Usage

For Node.js environments, install the `ws` package:

```bash
npm install ws
```

The SDK will automatically use it when the native `WebSocket` is not available.

## Best Practices

1. **Register handlers before connecting** - Ensures you don't miss messages
2. **Handle disconnection** - Implement retry logic or user notification
3. **Use specific subscription types** - Don't subscribe to everything if you don't need it
4. **Validate MAC addresses** - Use `isValidMacAddress()` before publishing
5. **Handle errors gracefully** - Listen for error events and connection failures
6. **Clean up on shutdown** - Always call `disconnect()` when done

## Complete Example

```typescript
import {
  RtlsWebSocketClient,
  SubscriptionType,
  PositionMessage,
} from 'ubudu-rtls-sdk';

async function main() {
  const client = new RtlsWebSocketClient({
    apiKey: process.env.RTLS_API_KEY!,
    namespace: process.env.APP_NAMESPACE!,
    mapUuid: process.env.MAP_UUID!,
    debug: true,
  });

  // Setup handlers
  client.on('connected', () => console.log('Connected'));
  client.on('disconnected', () => console.log('Disconnected'));
  client.on('error', ({ error }) => console.error('Error:', error));

  const positions = new Map<string, PositionMessage>();
  client.on('POSITIONS', (pos) => {
    positions.set(pos.user_uuid!, pos);
    console.log(`Tag ${pos.user_name} at ${pos.lat}, ${pos.lon}`);
  });

  try {
    // Connect and subscribe
    await client.connect();
    await client.subscribe([SubscriptionType.POSITIONS]);

    // Publish test position
    await client.sendPosition({
      macAddress: 'aabbccddeeff',
      latitude: 48.8566,
      longitude: 2.3522,
      name: 'Test-Tag',
    });

    // Run for 60 seconds
    await new Promise(resolve => setTimeout(resolve, 60000));

    console.log(`Tracked ${positions.size} unique tags`);
  } finally {
    await client.disconnect();
  }
}

main().catch(console.error);
```
