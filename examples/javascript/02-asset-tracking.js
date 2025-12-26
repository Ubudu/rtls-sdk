/**
 * 02 - Asset Tracking with Ubudu RTLS SDK
 *
 * This example covers:
 * - Listing assets and getting details
 * - Real-time cached positions
 * - Position history
 * - Iterating through assets
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import {
  createRtlsClient,
  RtlsError,
  NotFoundError,
} from '@ubudu/rtls-sdk';

// =============================================================================
// Configuration
// =============================================================================

const NAMESPACE = process.env.APP_NAMESPACE;
const API_KEY = process.env.RTLS_API_KEY;

if (!NAMESPACE || !API_KEY) {
  console.error('Missing APP_NAMESPACE or RTLS_API_KEY in .env');
  process.exit(1);
}

const client = createRtlsClient({
  apiKey: API_KEY,
  namespace: NAMESPACE,
});

console.log('Ubudu RTLS SDK - Asset Tracking\n');

// =============================================================================
// 1. List All Assets
// =============================================================================

async function listAssets() {
  console.log('1. Listing Assets...');

  const assets = await client.assets.list();
  console.log(`   Found ${assets.length} asset(s)`);

  if (assets.length > 0) {
    const first = assets[0];
    console.log(`   First: ${first.user_name} (${first.user_udid})`);
    return first.user_udid;
  }
  return null;
}

// =============================================================================
// 2. Get Cached Positions (Real-time)
// =============================================================================

async function getCachedPositions() {
  console.log('\n2. Getting Cached Positions...');

  const positions = await client.positions.listCached();
  console.log(`   Active: ${positions.length} position(s)`);

  if (positions.length > 0) {
    const pos = positions[0];
    console.log(`   Latest: ${pos.user_udid} at (${pos.lat}, ${pos.lon})`);
  }
}

// =============================================================================
// 3. Get Asset Details
// =============================================================================

async function getAssetDetails(macAddress) {
  console.log('\n3. Getting Asset Details...');

  try {
    const asset = await client.assets.get(macAddress);
    console.log(`   Name: ${asset.user_name}`);
    console.log(`   Type: ${asset.user_type}`);
    console.log(`   Tags: ${asset.tags?.join(', ') || 'none'}`);
  } catch (error) {
    if (error instanceof NotFoundError) {
      console.log(`   Asset ${macAddress} not found`);
    } else {
      throw error;
    }
  }
}

// =============================================================================
// 4. Asset Position History
// =============================================================================

async function getAssetHistory(macAddress) {
  console.log('\n4. Getting Position History (last 24h)...');

  const endTime = Date.now();
  const startTime = endTime - 24 * 60 * 60 * 1000;

  try {
    const history = await client.positions.getHistory({
      macAddress,
      startTime,
      endTime,
    });
    console.log(`   Found ${history.length} position(s)`);

    if (history.length > 0) {
      const latest = history[history.length - 1];
      console.log(`   Latest: (${latest.lat}, ${latest.lon})`);
    }
  } catch (error) {
    if (error instanceof RtlsError) {
      console.log(`   History not available: ${error.message}`);
    } else {
      throw error;
    }
  }
}

// =============================================================================
// 5. Iterate Through Assets
// =============================================================================

async function iterateAssets() {
  console.log('\n5. Iterating Assets...');

  let count = 0;
  for await (const asset of client.assets.iterate()) {
    console.log(`   [${count + 1}] ${asset.user_name}`);
    count++;
    if (count >= 5) {
      console.log(`   ... (showing first 5)`);
      break;
    }
  }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  try {
    const firstMac = await listAssets();
    await getCachedPositions();

    if (firstMac) {
      await getAssetDetails(firstMac);
      await getAssetHistory(firstMac);
    }

    await iterateAssets();

    console.log('\nDone!');
  } catch (error) {
    console.error('Failed:', error.message);
    process.exit(1);
  }
}

main();
