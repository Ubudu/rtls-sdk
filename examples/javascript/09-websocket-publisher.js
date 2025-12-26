/**
 * 09 - WebSocket Publisher Example
 *
 * Demonstrates publishing position updates from an external tracking source.
 *
 * Prerequisites:
 * - Set RTLS_API_KEY, APP_NAMESPACE, and MAP_UUID environment variables
 *
 * Run: node examples/javascript/09-websocket-publisher.js
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import { RtlsWebSocketPublisher } from '@ubudu/rtls-sdk';

// =============================================================================
// Configuration
// =============================================================================

const NAMESPACE = process.env.APP_NAMESPACE;
const API_KEY = process.env.RTLS_API_KEY;
const MAP_UUID = process.env.MAP_UUID;

if (!NAMESPACE || !API_KEY || !MAP_UUID) {
  console.error('Error: RTLS_API_KEY, APP_NAMESPACE, and MAP_UUID environment variables are required');
  console.error('\nUsage:');
  console.error('  RTLS_API_KEY=key APP_NAMESPACE=ns MAP_UUID=uuid node examples/javascript/09-websocket-publisher.js');
  process.exit(1);
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  // Create publisher
  const publisher = new RtlsWebSocketPublisher({
    apiKey: API_KEY,
    namespace: NAMESPACE,
    mapUuid: MAP_UUID,
    debug: process.env.DEBUG === 'true',
  });

  // ─── Connection Event Handlers ────────────────────────────────────────────

  publisher.on('connected', ({ timestamp }) => {
    console.log(`[${timestamp.toISOString()}] Connected to RTLS Publisher WebSocket`);
  });

  publisher.on('disconnected', ({ code, reason }) => {
    console.log(`[DISCONNECTED] Code: ${code}, Reason: ${reason || 'No reason'}`);
  });

  publisher.on('error', ({ error }) => {
    console.error('[ERROR]', error.message);
  });

  // ─── Connect ──────────────────────────────────────────────────────────────

  try {
    console.log('Connecting to RTLS Publisher WebSocket...');
    await publisher.connect();

    // ─── Simulate Moving Tags ─────────────────────────────────────────────────

    // Define simulated tags
    const tags = [
      { mac: 'aa11bb22cc33', name: 'Forklift-01', color: '#FF5500' },
      { mac: 'dd44ee55ff66', name: 'Pallet-Jack-02', color: '#00AA55' },
      { mac: '112233445566', name: 'Worker-Badge-03', color: '#5500FF' },
    ];

    // Base coordinates (somewhere in Paris)
    const baseCoords = {
      lat: 48.8566,
      lon: 2.3522,
    };

    console.log('\nPublishing simulated positions...\n');

    const interval = parseInt(process.env.INTERVAL_MS ?? '2000', 10);
    const iterations = parseInt(process.env.ITERATIONS ?? '10', 10);

    for (let i = 0; i < iterations; i++) {
      console.log(`\n--- Iteration ${i + 1}/${iterations} ---`);

      for (const tag of tags) {
        // Simulate movement (random walk)
        const lat = baseCoords.lat + (Math.random() - 0.5) * 0.001;
        const lon = baseCoords.lon + (Math.random() - 0.5) * 0.001;

        const result = await publisher.sendPosition({
          macAddress: tag.mac,
          latitude: lat,
          longitude: lon,
          name: tag.name,
          color: tag.color,
          data: {
            battery: Math.floor(80 + Math.random() * 20),
            iteration: i + 1,
            timestamp: new Date().toISOString(),
          },
        });

        if (result.success) {
          console.log(`  ${tag.name}: (${lat.toFixed(6)}, ${lon.toFixed(6)})`);
        } else {
          console.log(`  ${tag.name}: ${result.error}`);
        }
      }

      // Wait between iterations
      if (i < iterations - 1) {
        await new Promise((resolve) => setTimeout(resolve, interval));
      }
    }

    // ─── Batch Publishing Example ─────────────────────────────────────────────

    console.log('\nBatch publishing example...\n');

    const batchResult = await publisher.sendBatch(
      tags.map((tag, idx) => ({
        macAddress: tag.mac,
        latitude: baseCoords.lat + idx * 0.0001,
        longitude: baseCoords.lon + idx * 0.0001,
        name: tag.name,
        color: tag.color,
      }))
    );

    console.log(`Batch result: ${batchResult.sent} sent, ${batchResult.failed} failed`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    console.log('\nDisconnecting...');
    await publisher.disconnect();
    console.log('Done!');
  }
}

main().catch(console.error);
