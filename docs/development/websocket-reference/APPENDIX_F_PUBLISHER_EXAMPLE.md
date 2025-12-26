# Appendix F: Complete Publisher Example

Full working example from `examples/publisher-only.js`:

```javascript
/**
 * Publisher-only example for the Ubudu WebSocket API
 * Demonstrates sending position data for tags to the RTLS server.
 */

'use strict';
require('dotenv').config();

const { UbuduWebsocketPublisher } = require('../src');

// Create publisher instance
const publisher = new UbuduWebsocketPublisher({
  appNamespace: process.env.APP_NAMESPACE || 'your-app-namespace',
  mapUuid: process.env.MAP_UUID || 'your-map-uuid',
  debug: true
});

// Example tags with initial positions
const tags = [
  {
    name: 'Forklift-01',
    macAddress: '001a2b3c4d5e',
    latitude: 48.8566,
    longitude: 2.3522,
    color: '#FF5500',
    additionalData: { altitude: 35, battery_level: 90, num_sat: 8 }
  },
  {
    name: 'Pallet-42',
    macAddress: '002a3b4c5d6e',
    latitude: 48.8584,
    longitude: 2.2945,
    color: '#3355FF',
    additionalData: { altitude: 15, battery_level: 85, num_sat: 9 }
  }
];

/**
 * Generate nearby position within ~100m
 */
function generateNearbyPosition(lat, lon) {
  const latOffset = (Math.random() * 0.0018 - 0.0009);
  const lonOffset = (Math.random() * 0.0018 - 0.0009) / Math.cos(lat * Math.PI / 180);
  return { latitude: lat + latOffset, longitude: lon + lonOffset };
}

/**
 * Move a tag and update its data
 */
function moveTag(tag) {
  const newPos = generateNearbyPosition(tag.latitude, tag.longitude);
  tag.latitude = newPos.latitude;
  tag.longitude = newPos.longitude;
  tag.additionalData.battery_level = Math.max(0, tag.additionalData.battery_level - Math.random());
  return tag;
}

/**
 * Send tag location
 */
async function publishTagLocation(tag) {
  console.log(`Publishing: ${tag.name} at [${tag.latitude.toFixed(6)}, ${tag.longitude.toFixed(6)}]`);

  const result = await publisher.sendTagLocation(
    tag.macAddress,
    tag.latitude,
    tag.longitude,
    {
      name: tag.name,
      model: 'GenericTag',
      color: tag.color,
      additionalData: tag.additionalData
    }
  );

  if (result.success) {
    console.log('  ✓ Published successfully');
  } else {
    console.error('  ✗ Failed:', result.error);
  }

  return result.success;
}

// Main function
async function main() {
  console.log('Starting publisher example...\n');

  // Send initial positions
  for (const tag of tags) {
    await publishTagLocation(tag);
    await new Promise(r => setTimeout(r, 500));
  }

  // Simulate movement for 30 seconds
  console.log('\nSimulating movement for 30 seconds...');
  const interval = setInterval(async () => {
    for (const tag of tags) {
      moveTag(tag);
      await publishTagLocation(tag);
    }
  }, 5000);

  // Stop after 30 seconds
  setTimeout(async () => {
    clearInterval(interval);
    console.log('\nShutting down publisher...');
    await publisher.shutdown();
    console.log('Done.');
    process.exit(0);
  }, 30000);
}

main().catch(console.error);

process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await publisher.shutdown();
  process.exit(0);
});
```

## Key Patterns

1. **mapUuid required**: Publisher MUST have mapUuid configured
2. **MAC address format**: Uses lowercase without colons
3. **Result handling**: Check `result.success` and handle errors
4. **Periodic updates**: Use interval for simulating movement
5. **Graceful shutdown**: Call `shutdown()` before exit
