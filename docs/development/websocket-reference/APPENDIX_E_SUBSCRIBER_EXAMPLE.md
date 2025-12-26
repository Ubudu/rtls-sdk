# Appendix E: Complete Subscriber Example

Full working example from `examples/subscriber-only.js`:

```javascript
/**
 * Subscriber-only example for the Ubudu WebSocket API
 * Demonstrates receiving real-time data from the RTLS server.
 */

'use strict';
require('dotenv').config();

const { UbuduWebsocketSubscriber, SUBSCRIPTION_TYPES } = require('../src');

// Create subscriber instance
const subscriber = new UbuduWebsocketSubscriber({
  appNamespace: process.env.APP_NAMESPACE || 'your-app-namespace',
  debug: true
});

// Utility function to display received data
function displayMessage(type, data) {
  console.log(`\n=== ${type} message received at ${new Date().toISOString()} ===`);

  switch (type) {
    case 'POSITIONS':
      console.log('Position data:');
      console.log(`  Tag: ${data.user_uuid || data.user_udid || 'unknown'}`);
      console.log(`  Location: [${data.lat}, ${data.lon}]`);
      if (data.user_name) console.log(`  Name: ${data.user_name}`);
      if (data.model) console.log(`  Model: ${data.model}`);
      if (data.data?.battery_level) console.log(`  Battery: ${data.data.battery_level}%`);
      break;

    case 'ZONES_ENTRIES_EVENTS':
      const action = data.event_type === 'ENTER_ZONE' ? 'entered' : 'exited';
      const tagId = data.user_udid || 'unknown-tag';
      const zoneName = data.zone?.properties?.name || 'unknown-zone';
      console.log(`Zone event: Tag ${tagId} ${action} zone ${zoneName}`);
      break;

    case 'ALERTS':
      if (data.event_type === 'NOTIFICATION' && data.params) {
        const style = data.params.style || 'info';
        console.log(`Alert [${style.toUpperCase()}]: ${data.params.title}`);
        console.log(`  Message: ${data.params.text}`);
        if (data.zone) console.log(`  Location: ${data.zone.properties.name}`);
      }
      break;

    default:
      console.log(`Raw ${type} message:`, JSON.stringify(data, null, 2));
  }
}

// Register event handlers
subscriber.on('connected', (event) => {
  console.log(`Connected to RTLS server at ${event.timestamp}`);
});

subscriber.on('disconnected', (event) => {
  console.log(`Disconnected: ${event.reason || 'Unknown reason'}`);
});

subscriber.on('error', (error) => {
  console.error('WebSocket error:', error);
});

subscriber.on('POSITIONS', (data) => displayMessage('POSITIONS', data));
subscriber.on('ZONES_ENTRIES_EVENTS', (data) => displayMessage('ZONES_ENTRIES_EVENTS', data));
subscriber.on('ALERTS', (data) => displayMessage('ALERTS', data));

// Connect and subscribe
subscriber.connect()
  .then(() => {
    console.log('Connected! Subscribing to event types...');
    return subscriber.subscribe([
      SUBSCRIPTION_TYPES.POSITIONS,
      SUBSCRIPTION_TYPES.ZONES_ENTRIES_EVENTS,
      SUBSCRIPTION_TYPES.ALERTS
    ]);
  })
  .then((result) => {
    console.log('Subscription result:', result);
    console.log('\nListening for events. Press Ctrl+C to exit.');
  })
  .catch(error => {
    console.error('Failed to connect or subscribe:', error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nDisconnecting...');
  await subscriber.disconnect();
  console.log('Disconnected.');
  process.exit(0);
});
```

## Key Patterns

1. **Two-step flow**: `connect()` then `subscribe()`
2. **Event handlers registered before connect**: Ensures no events missed
3. **Graceful shutdown**: Handle SIGINT to disconnect cleanly
4. **Message type handling**: Switch on message type for appropriate display
