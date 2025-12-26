# Appendix G: Complete Unified Client Example

Full working example from `examples/unified-client.js`:

```javascript
/**
 * Unified client example - both publish and subscribe in one application
 */

'use strict';
require('dotenv').config();

const { UbuduWebsocketClient, SUBSCRIPTION_TYPES } = require('../src');

const client = new UbuduWebsocketClient({
  appNamespace: process.env.APP_NAMESPACE || 'your-namespace',
  mapUuid: process.env.MAP_UUID || 'your-map-uuid',
  debug: true,
});

// Track message statistics
const stats = { sent: 0, received: { POSITIONS: 0, ZONES_ENTRIES_EVENTS: 0, ALERTS: 0 } };

// Example tags
const tags = [
  { name: 'Tag-1', macAddress: 'aabbccddeeff01', lat: 48.8566, lon: 2.3522, color: '#FF5500' },
  { name: 'Tag-2', macAddress: 'aabbccddeeff02', lat: 48.8584, lon: 2.2945, color: '#3355FF' }
];

// Event handlers
client.on('POSITIONS', (data) => {
  stats.received.POSITIONS++;
  console.log(`📍 Position: ${data.user_name || data.user_uuid} at [${data.lat}, ${data.lon}]`);
});

client.on('ZONES_ENTRIES_EVENTS', (data) => {
  stats.received.ZONES_ENTRIES_EVENTS++;
  console.log(`🔶 Zone: ${data.event_type} - ${data.zone?.properties?.name || 'unknown'}`);
});

client.on('ALERTS', (data) => {
  stats.received.ALERTS++;
  console.log(`⚠️ Alert: ${data.params?.title} - ${data.params?.text}`);
});

client.on('connected', (info) => console.log(`✅ Connected at ${info.timestamp}`));
client.on('disconnected', (info) => console.log(`❌ Disconnected: ${info.reason}`));
client.on('error', (error) => console.error('🚨 Error:', error));

// Send position
async function sendPosition(tag) {
  const result = await client.sendTagLocation(tag.macAddress, tag.lat, tag.lon, {
    name: tag.name,
    color: tag.color,
    additionalData: { battery_level: 85 + Math.random() * 10 }
  });
  if (result.success) stats.sent++;
  console.log(`📤 Sent ${tag.name}: ${result.success ? '✓' : '✗'}`);
}

// Move tag randomly
function moveTag(tag) {
  tag.lat += (Math.random() - 0.5) * 0.001;
  tag.lon += (Math.random() - 0.5) * 0.001;
  return tag;
}

// Main
async function run() {
  console.log('Connecting...');
  await client.connect();
  console.log('Status:', client.getConnectionStatus());

  console.log('Subscribing...');
  const subResult = await client.subscribe([
    SUBSCRIPTION_TYPES.POSITIONS,
    SUBSCRIPTION_TYPES.ZONES_ENTRIES_EVENTS,
    SUBSCRIPTION_TYPES.ALERTS
  ]);
  console.log('Subscription:', subResult);

  // Send initial positions
  for (const tag of tags) await sendPosition(tag);

  // Update positions every 5 seconds for 60 seconds
  const interval = setInterval(async () => {
    for (const tag of tags) {
      moveTag(tag);
      await sendPosition(tag);
    }
    console.log(`📊 Stats: sent=${stats.sent}, received=`, stats.received);
  }, 5000);

  setTimeout(async () => {
    clearInterval(interval);
    console.log('\nFinal stats:', stats);
    await client.disconnect();
    console.log('Done.');
    process.exit(0);
  }, 60000);
}

run().catch(console.error);

process.on('SIGINT', async () => {
  await client.disconnect();
  process.exit(0);
});
```

## Key Patterns

1. **Unified client**: Combines both publisher and subscriber functionality
2. **Full configuration**: Requires both `appNamespace` and `mapUuid`
3. **Event handlers**: Register handlers for all expected event types
4. **Statistics tracking**: Track sent/received message counts
5. **Connection status**: Use `getConnectionStatus()` to check state
6. **Two-step flow**: `connect()` then `subscribe()`
