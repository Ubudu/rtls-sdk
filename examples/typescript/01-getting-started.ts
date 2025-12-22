/**
 * 01 - Getting Started with Ubudu RTLS SDK
 *
 * This example demonstrates:
 * - Setting up the SDK client
 * - Checking API health
 * - Making your first API call
 * - Understanding the response format
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

const NAMESPACE = process.env.APP_NAMESPACE!;
const API_KEY = process.env.RTLS_API_KEY!;

if (!NAMESPACE || !API_KEY) {
  console.error('Error: Missing required environment variables');
  console.error('Please set APP_NAMESPACE and RTLS_API_KEY in your .env file');
  process.exit(1);
}

// =============================================================================
// Initialize the SDK Client
// =============================================================================

// Create a client instance with your API key
const client = createRtlsClient({
  apiKey: API_KEY,
  // Optional: customize timeout (default: 30000ms)
  timeoutMs: 10000,
});

console.log('Ubudu RTLS SDK - Getting Started Example\n');
console.log('========================================\n');

// =============================================================================
// Example 1: Health Check
// =============================================================================

async function checkHealth(): Promise<void> {
  console.log('1. Checking API Health...');
  console.log('   Endpoint: GET /health\n');

  try {
    const health = await client.health();
    console.log('   Status:', health);
    console.log('   Result: API is healthy and ready\n');
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
// Example 2: List Venues
// =============================================================================

async function listVenues(): Promise<number | null> {
  console.log('2. Listing Venues...');
  console.log(`   Endpoint: GET /venues/${NAMESPACE}\n`);

  try {
    const venues = await client.venues.list(NAMESPACE);

    console.log(`   Found ${venues.length} venue(s)\n`);

    if (venues.length > 0) {
      const venue = venues[0] as { id: number; name: string; address?: string };
      console.log('   First venue:');
      console.log(`   - ID: ${venue.id}`);
      console.log(`   - Name: ${venue.name}`);
      console.log(`   - Address: ${venue.address || 'N/A'}\n`);
      return venue.id;
    }

    return null;
  } catch (error) {
    if (error instanceof RtlsError) {
      console.error(`   Error (${error.status}):`, error.message);
    }
    throw error;
  }
}

// =============================================================================
// Example 3: List Assets
// =============================================================================

async function listAssets(): Promise<void> {
  console.log('3. Listing Assets...');
  console.log(`   Endpoint: GET /assets/${NAMESPACE}\n`);

  try {
    const assets = await client.assets.list(NAMESPACE);

    console.log(`   Found ${assets.length} asset(s)\n`);

    // Show first 3 assets
    const sample = assets.slice(0, 3) as Array<{
      user_udid: string;
      user_name: string;
      user_type: string;
    }>;

    sample.forEach((asset, i) => {
      console.log(`   Asset ${i + 1}:`);
      console.log(`   - MAC: ${asset.user_udid}`);
      console.log(`   - Name: ${asset.user_name}`);
      console.log(`   - Type: ${asset.user_type}\n`);
    });
  } catch (error) {
    if (error instanceof RtlsError) {
      console.error(`   Error (${error.status}):`, error.message);
    }
    throw error;
  }
}

// =============================================================================
// Main Execution
// =============================================================================

async function main(): Promise<void> {
  try {
    await checkHealth();
    await listVenues();
    await listAssets();

    console.log('========================================');
    console.log('Getting started example completed successfully!');
    console.log('\nNext steps:');
    console.log('- Run 02-asset-tracking.ts for asset management');
    console.log('- Run 03-zone-geofencing.ts for spatial queries');
    console.log('- Run 04-navigation.ts for indoor routing');
  } catch (error) {
    console.error('\nExample failed:', error);
    process.exit(1);
  }
}

main();
