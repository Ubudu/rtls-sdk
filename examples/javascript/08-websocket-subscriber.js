/**
 * 08 - WebSocket Subscriber Example
 *
 * Demonstrates subscribing to real-time position updates, zone events, and alerts.
 *
 * Prerequisites:
 * - Set RTLS_API_KEY and APP_NAMESPACE environment variables
 *
 * Run: node examples/javascript/08-websocket-subscriber.js
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import { RtlsWebSocketSubscriber, SubscriptionType } from '@ubudu/rtls-sdk';

// =============================================================================
// Configuration
// =============================================================================

const NAMESPACE = process.env.APP_NAMESPACE;
const API_KEY = process.env.RTLS_API_KEY;

if (!NAMESPACE || !API_KEY) {
  console.error('Error: RTLS_API_KEY and APP_NAMESPACE environment variables are required');
  console.error('\nUsage:');
  console.error('  RTLS_API_KEY=your-key APP_NAMESPACE=your-ns node examples/javascript/08-websocket-subscriber.js');
  process.exit(1);
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  // Create subscriber
  const subscriber = new RtlsWebSocketSubscriber({
    apiKey: API_KEY,
    namespace: NAMESPACE,
    debug: process.env.DEBUG === 'true',
  });

  // ─── Connection Event Handlers ────────────────────────────────────────────

  subscriber.on('connected', ({ timestamp }) => {
    console.log(`[${timestamp.toISOString()}] Connected to RTLS WebSocket`);
  });

  subscriber.on('disconnected', ({ code, reason }) => {
    console.log(`[DISCONNECTED] Code: ${code}, Reason: ${reason || 'No reason'}`);
  });

  subscriber.on('reconnecting', ({ attempt, delay }) => {
    console.log(`[RECONNECTING] Attempt ${attempt} in ${delay}ms...`);
  });

  subscriber.on('error', ({ error }) => {
    console.error('[ERROR]', error.message);
  });

  // ─── Message Event Handlers ───────────────────────────────────────────────

  subscriber.on('POSITIONS', (pos) => {
    const name = pos.user_name ?? pos.user_uuid ?? 'unknown';
    console.log(`[POSITION] ${name}: (${pos.lat.toFixed(6)}, ${pos.lon.toFixed(6)})`);
  });

  subscriber.on('ZONES_ENTRIES_EVENTS', (event) => {
    const name = event.user_name ?? event.user_uuid ?? 'unknown';
    const zoneName = typeof event.zone === 'object' ? event.zone?.properties?.name : 'unknown';
    console.log(`[ZONE] ${name} -> ${event.event_type} ${zoneName}`);
  });

  subscriber.on('ZONE_STATS_EVENTS', (stats) => {
    console.log(`[ZONE STATS] ${stats.zone_name}: ${stats.total_count} total (${stats.tag_count} tags, ${stats.mobile_count} mobile)`);
  });

  subscriber.on('ALERTS', (alert) => {
    const style = alert.params.style ?? 'info';
    console.log(`[ALERT] [${style.toUpperCase()}] ${alert.params.title}: ${alert.params.text}`);
  });

  subscriber.on('ASSETS', (asset) => {
    console.log(`[ASSET] ${asset.action}: ${asset.mac_address}`);
  });

  // ─── Connect and Subscribe ────────────────────────────────────────────────

  try {
    console.log('Connecting to RTLS WebSocket...');
    await subscriber.connect();

    console.log('Subscribing to events...');
    const result = await subscriber.subscribe([
      SubscriptionType.POSITIONS,
      SubscriptionType.ZONES_ENTRIES_EVENTS,
      SubscriptionType.ZONE_STATS_EVENTS,
      SubscriptionType.ALERTS,
      SubscriptionType.ASSETS,
    ]);

    console.log('Subscription result:', result);
    console.log('Active subscriptions:', subscriber.getActiveSubscriptions());

    // ─── Keep Running ─────────────────────────────────────────────────────────

    const runTime = parseInt(process.env.RUN_TIME_SECONDS ?? '60', 10);
    console.log(`\nListening for events for ${runTime} seconds...\n`);

    await new Promise((resolve) => setTimeout(resolve, runTime * 1000));
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    console.log('\nDisconnecting...');
    await subscriber.disconnect();
    console.log('Disconnected');
  }
}

main().catch(console.error);
