/**
 * WebSocket Unified Client Example
 *
 * Demonstrates using the unified RtlsWebSocketClient that provides both
 * subscription and publishing capabilities in a single client.
 *
 * Prerequisites:
 * - Set RTLS_API_KEY, APP_NAMESPACE, and MAP_UUID environment variables
 *
 * Run: npx ts-node examples/websocket-unified.ts
 */

import { RtlsWebSocketClient, SubscriptionType } from '../src';

async function main() {
  // Create unified client (requires mapUuid for publishing capability)
  const client = new RtlsWebSocketClient({
    apiKey: process.env.RTLS_API_KEY!,
    namespace: process.env.APP_NAMESPACE!,
    mapUuid: process.env.MAP_UUID!, // Required for publisher
    debug: process.env.DEBUG === 'true',
  });

  // ─── Event Handlers ─────────────────────────────────────────────────────────

  // Position updates (from subscriber)
  client.on('POSITIONS', (msg) => {
    console.log(`[POSITION] ${msg.user_name || msg.user_uuid}: (${msg.lat}, ${msg.lon})`);
  });

  // Zone events (from subscriber)
  client.on('ZONES_ENTRIES_EVENTS', (msg) => {
    const event = msg.event_type?.includes('ENTER') ? 'ENTERED' : 'EXITED';
    console.log(`[ZONE] Tag ${msg.user_uuid} ${event} zone ${msg.zone_uuid}`);
  });

  // Alerts (from subscriber)
  client.on('ALERTS', (msg) => {
    console.log(`[ALERT] ${msg.alert_type}: ${msg.message || 'No message'}`);
  });

  // Connection events
  client.on('connected', ({ timestamp }) => {
    console.log(`[${timestamp.toISOString()}] Connected to RTLS WebSocket`);
  });

  client.on('disconnected', ({ code, reason }) => {
    console.log(`[DISCONNECTED] Code: ${code}, Reason: ${reason || 'No reason'}`);
  });

  client.on('error', ({ error }) => {
    console.error('[ERROR]', error.message);
  });

  // ─── Connect ────────────────────────────────────────────────────────────────

  try {
    console.log('Connecting to RTLS WebSocket (unified mode)...');
    await client.connect();

    // Check connection status
    const status = client.getConnectionStatus();
    console.log(`Subscriber: ${status.subscriber.state}`);
    console.log(`Publisher: ${status.publisher?.state || 'Not configured'}`);

    // ─── Subscribe to Events ──────────────────────────────────────────────────

    console.log('\nSubscribing to position and zone events...');
    const subscribeResult = await client.subscribe([
      SubscriptionType.POSITIONS,
      SubscriptionType.ZONES_ENTRIES_EVENTS,
      SubscriptionType.ALERTS,
    ]);

    if (subscribeResult.success) {
      console.log('Subscribed successfully!');
      console.log('Active subscriptions:', client.getActiveSubscriptions());
    } else {
      console.error('Subscription failed:', subscribeResult.error);
    }

    // ─── Publish Positions ────────────────────────────────────────────────────

    console.log('\nPublishing test positions...\n');

    // Simulate a moving forklift
    const forkliftMac = 'aa11bb22cc33';
    const baseCoords = { lat: 48.8566, lon: 2.3522 };

    for (let i = 0; i < 5; i++) {
      // Simulate movement
      const lat = baseCoords.lat + i * 0.0001;
      const lon = baseCoords.lon + i * 0.00015;

      const result = await client.sendPosition({
        macAddress: forkliftMac,
        latitude: lat,
        longitude: lon,
        name: 'Forklift-01',
        color: '#FF5500',
        data: {
          battery: 85 - i * 2,
          speed: 2.5 + Math.random(),
        },
      });

      if (result.success) {
        console.log(`✓ Published position ${i + 1}: (${lat.toFixed(6)}, ${lon.toFixed(6)})`);
      } else {
        console.log(`✗ Failed to publish: ${result.error}`);
      }

      // Small delay between publishes
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // ─── Listen for a While ───────────────────────────────────────────────────

    const listenDuration = parseInt(process.env.LISTEN_DURATION ?? '10000', 10);
    console.log(`\nListening for events for ${listenDuration / 1000} seconds...`);
    console.log('(You should see your published positions echoed back)\n');

    await new Promise((resolve) => setTimeout(resolve, listenDuration));

    // ─── Batch Publishing ─────────────────────────────────────────────────────

    console.log('\nSending batch update...');

    const batchResult = await client.sendBatch([
      { macAddress: 'aa11bb22cc33', latitude: 48.8570, longitude: 2.3530, name: 'Forklift-01' },
      { macAddress: 'dd44ee55ff66', latitude: 48.8571, longitude: 2.3531, name: 'Pallet-Jack-01' },
      { macAddress: '112233445566', latitude: 48.8572, longitude: 2.3532, name: 'Worker-01' },
    ]);

    console.log(`Batch: ${batchResult.sent} sent, ${batchResult.failed} failed`);

    // ─── Unsubscribe ──────────────────────────────────────────────────────────

    console.log('\nUnsubscribing from alerts...');
    const unsubResult = await client.unsubscribe([SubscriptionType.ALERTS]);
    if (unsubResult.success) {
      console.log('Unsubscribed from alerts');
      console.log('Remaining subscriptions:', client.getActiveSubscriptions());
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    // ─── Cleanup ──────────────────────────────────────────────────────────────

    console.log('\nDisconnecting...');
    await client.disconnect();

    const status = client.getConnectionStatus();
    console.log(`Final status - Subscriber: ${status.subscriber.state}, Publisher: ${status.publisher?.state}`);
    console.log('Done!');
  }
}

// ─── Environment Check ────────────────────────────────────────────────────────

if (!process.env.RTLS_API_KEY || !process.env.APP_NAMESPACE || !process.env.MAP_UUID) {
  console.error('Error: RTLS_API_KEY, APP_NAMESPACE, and MAP_UUID environment variables are required');
  console.error('\nUsage:');
  console.error(
    '  RTLS_API_KEY=key APP_NAMESPACE=ns MAP_UUID=uuid npx ts-node examples/websocket-unified.ts'
  );
  process.exit(1);
}

main().catch(console.error);
