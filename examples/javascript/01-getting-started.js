/**
 * 01 - Getting Started with Ubudu RTLS SDK
 *
 * This example covers:
 * - Creating an SDK client with default namespace
 * - Checking API health
 * - Listing venues and assets
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import { createRtlsClient, RtlsError, AuthenticationError } from '@ubudu/rtls-sdk';

// =============================================================================
// Configuration
// =============================================================================

const NAMESPACE = process.env.APP_NAMESPACE;
const API_KEY = process.env.RTLS_API_KEY;

if (!NAMESPACE || !API_KEY) {
  console.error('Error: Missing APP_NAMESPACE or RTLS_API_KEY in .env file');
  process.exit(1);
}

// =============================================================================
// Create the SDK Client
// =============================================================================

// Set namespace once here - all API calls will use it automatically
const client = createRtlsClient({
  apiKey: API_KEY,
  namespace: NAMESPACE,
  timeoutMs: 10000,
});

console.log('Ubudu RTLS SDK - Getting Started\n');

// =============================================================================
// 1. Health Check
// =============================================================================

async function checkHealth() {
  console.log('1. Checking API Health...');

  try {
    const health = await client.health();
    console.log('   Status:', health.status);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      console.error('   Error: Invalid API key');
    } else if (error instanceof RtlsError) {
      console.error('   Error:', error.message);
    }
    throw error;
  }
}

// =============================================================================
// 2. List Venues
// =============================================================================

async function listVenues() {
  console.log('\n2. Listing Venues...');

  try {
    const venues = await client.venues.list();
    console.log(`   Found ${venues.length} venue(s)`);

    if (venues.length > 0) {
      const venue = venues[0];
      console.log(`   First: ${venue.name} (ID: ${venue.id})`);
      return venue.id;
    }
    return null;
  } catch (error) {
    if (error instanceof RtlsError) {
      console.error(`   Error: ${error.message}`);
    }
    throw error;
  }
}

// =============================================================================
// 3. List Assets
// =============================================================================

async function listAssets() {
  console.log('\n3. Listing Assets...');

  try {
    const assets = await client.assets.list();
    console.log(`   Found ${assets.length} asset(s)`);

    assets.slice(0, 3).forEach((asset) => {
      console.log(`   - ${asset.user_name} (${asset.user_udid})`);
    });
  } catch (error) {
    if (error instanceof RtlsError) {
      console.error(`   Error: ${error.message}`);
    }
    throw error;
  }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  try {
    await checkHealth();
    await listVenues();
    await listAssets();
    console.log('\nDone!');
  } catch (error) {
    console.error('\nFailed:', error.message);
    process.exit(1);
  }
}

main();
