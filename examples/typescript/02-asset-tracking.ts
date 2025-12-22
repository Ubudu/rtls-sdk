/**
 * 02 - Asset Tracking with Ubudu RTLS SDK
 *
 * This example demonstrates:
 * - Listing and searching assets
 * - Getting real-time cached positions
 * - Viewing asset position history
 * - Asset statistics and analytics
 * - Creating, updating, and deleting assets
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
  filters,
} from '@ubudu/rtls-sdk';

const NAMESPACE = process.env.APP_NAMESPACE!;
const API_KEY = process.env.RTLS_API_KEY!;

if (!NAMESPACE || !API_KEY) {
  console.error('Missing APP_NAMESPACE or RTLS_API_KEY in .env');
  process.exit(1);
}

const client = createRtlsClient({ apiKey: API_KEY });

console.log('Ubudu RTLS SDK - Asset Tracking Example\n');
console.log('========================================\n');

// =============================================================================
// Example 1: List All Assets
// =============================================================================

async function listAllAssets(): Promise<string | null> {
  console.log('1. Listing All Assets');
  console.log(`   Endpoint: GET /assets/${NAMESPACE}\n`);

  const assets = await client.assets.list(NAMESPACE);
  console.log(`   Total assets: ${assets.length}\n`);

  if (assets.length > 0) {
    const first = assets[0] as { user_udid: string; user_name: string };
    console.log('   First asset:', first.user_name);
    console.log(`   MAC Address: ${first.user_udid}\n`);
    return first.user_udid;
  }

  return null;
}

// =============================================================================
// Example 2: Get Cached Positions (Real-time)
// =============================================================================

async function getCachedPositions(): Promise<void> {
  console.log('2. Getting Cached Positions (Real-time)');
  console.log(`   Endpoint: GET /cache/${NAMESPACE}/positions\n`);

  const positions = await client.positions.listCached(NAMESPACE);
  console.log(`   Active positions: ${positions.length}\n`);

  if (positions.length > 0) {
    const pos = positions[0] as {
      user_udid: string;
      lat: number;
      lon: number;
      timestamp: number;
    };
    console.log('   Latest position:');
    console.log(`   - Asset: ${pos.user_udid}`);
    console.log(`   - Location: (${pos.lat}, ${pos.lon})`);
    console.log(`   - Time: ${new Date(pos.timestamp).toISOString()}\n`);
  }
}

// =============================================================================
// Example 3: Get Single Asset Details
// =============================================================================

async function getAssetDetails(macAddress: string): Promise<void> {
  console.log('3. Getting Asset Details');
  console.log(`   Endpoint: GET /assets/${NAMESPACE}/${macAddress}\n`);

  try {
    const asset = (await client.assets.get(NAMESPACE, macAddress)) as {
      user_name: string;
      user_type: string;
      color: string;
      tags?: string[];
    };
    console.log('   Asset found:');
    console.log(`   - Name: ${asset.user_name}`);
    console.log(`   - Type: ${asset.user_type}`);
    console.log(`   - Color: ${asset.color}`);
    console.log(`   - Tags: ${asset.tags?.join(', ') || 'none'}\n`);
  } catch (error) {
    if (error instanceof NotFoundError) {
      console.log(`   Asset ${macAddress} not found\n`);
    } else {
      throw error;
    }
  }
}

// =============================================================================
// Example 4: Asset Position History
// =============================================================================

async function getAssetHistory(macAddress: string): Promise<void> {
  console.log('4. Getting Asset Position History');
  console.log(`   Endpoint: GET /asset_history/${NAMESPACE}/${macAddress}\n`);

  // Get history for the last 24 hours
  const endTime = Date.now();
  const startTime = endTime - 24 * 60 * 60 * 1000;

  try {
    const history = await client.assets.getHistory(NAMESPACE, macAddress, {
      startTime,
      endTime,
    });

    console.log(`   History points (last 24h): ${history.length}`);

    if (history.length > 0) {
      const latest = history[history.length - 1] as {
        lat: number;
        lon: number;
        timestamp: number;
      };
      console.log('   Latest position in history:');
      console.log(`   - Location: (${latest.lat}, ${latest.lon})`);
      console.log(`   - Time: ${new Date(latest.timestamp).toISOString()}`);
    }
    console.log();
  } catch (error) {
    if (error instanceof RtlsError) {
      console.log(`   History not available: ${error.message}\n`);
    } else {
      throw error;
    }
  }
}

// =============================================================================
// Example 5: Asset Statistics
// =============================================================================

async function getAssetStats(): Promise<void> {
  console.log('5. Getting Asset Statistics');
  console.log(`   Endpoint: GET /asset_stats/${NAMESPACE}/...\n`);

  const endTime = Date.now();
  const startTime = endTime - 24 * 60 * 60 * 1000;

  try {
    const stats = await client.assets.getStats(NAMESPACE, {
      startTime,
      endTime,
    });

    console.log('   Statistics (last 24h):');
    console.log(`   - Response:`, JSON.stringify(stats, null, 2).slice(0, 200));
    console.log();
  } catch (error) {
    if (error instanceof RtlsError) {
      console.log(`   Stats not available: ${error.message}\n`);
    } else {
      throw error;
    }
  }
}

// =============================================================================
// Example 6: Iterate Through Assets (Async Generator)
// =============================================================================

async function iterateAssets(): Promise<void> {
  console.log('6. Iterating Through Assets (Async Generator)');
  console.log('   Using: client.assets.iterate()\n');

  let count = 0;
  const maxItems = 5;

  for await (const asset of client.assets.iterate(NAMESPACE)) {
    const a = asset as { user_udid: string; user_name: string };
    console.log(`   [${count + 1}] ${a.user_name} (${a.user_udid})`);
    count++;
    if (count >= maxItems) {
      console.log(`   ... (showing first ${maxItems} only)`);
      break;
    }
  }
  console.log();
}

// =============================================================================
// Example 7: Filter Assets
// =============================================================================

async function filterAssets(): Promise<void> {
  console.log('7. Filtering Assets');
  console.log('   Using: filters.equals(), filters.contains()\n');

  // Get all assets and show types distribution
  const allAssets = await client.assets.list(NAMESPACE);
  const typeCount: Record<string, number> = {};
  for (const a of allAssets) {
    const type = (a as { user_type: string }).user_type || 'unknown';
    typeCount[type] = (typeCount[type] || 0) + 1;
  }

  console.log('   Asset types distribution:');
  Object.entries(typeCount).forEach(([type, count]) => {
    console.log(`   - ${type}: ${count}`);
  });

  // Demonstrate filter syntax
  console.log('\n   Filter Examples (syntax):');
  console.log('   - filters.equals("user_type", "forklift")');
  console.log('   - filters.contains("user_name", "truck")');
  console.log('   - filters.in("user_type", ["forklift", "person"])');
  console.log();
}

// =============================================================================
// Example 8: Create and Delete Asset (Demo - Commented Out)
// =============================================================================

async function assetCrudDemo(): Promise<void> {
  console.log('8. Asset CRUD Operations (Read-Only Demo)');
  console.log('   Note: Create/Update/Delete are available but skipped\n');

  console.log('   Available methods:');
  console.log('   - client.assets.create(namespace, macAddress, data)');
  console.log('   - client.assets.update(namespace, macAddress, updates)');
  console.log('   - client.assets.delete(namespace, macAddress)');
  console.log('   - client.assets.batchSave(namespace, assets[])');
  console.log('   - client.assets.batchDelete(namespace, macAddresses[])\n');

  // Example code (not executed to avoid modifying data):
  /*
  // Create a new asset
  const newAsset = await client.assets.create(NAMESPACE, 'AA:BB:CC:DD:EE:FF', {
    user_name: 'Test Asset',
    user_type: 'forklift',
    color: '#FF5500',
    tags: ['test', 'demo'],
    data: { customField: 'value' }
  });

  // Update an asset
  const updated = await client.assets.update(NAMESPACE, 'AA:BB:CC:DD:EE:FF', {
    user_name: 'Updated Name',
    tags: ['updated']
  });

  // Delete an asset
  await client.assets.delete(NAMESPACE, 'AA:BB:CC:DD:EE:FF');
  */
}

// =============================================================================
// Main Execution
// =============================================================================

async function main(): Promise<void> {
  try {
    const firstMac = await listAllAssets();
    await getCachedPositions();

    if (firstMac) {
      await getAssetDetails(firstMac);
      await getAssetHistory(firstMac);
    }

    await getAssetStats();
    await iterateAssets();
    await filterAssets();
    await assetCrudDemo();

    console.log('========================================');
    console.log('Asset tracking example completed!');
  } catch (error) {
    console.error('Example failed:', error);
    process.exit(1);
  }
}

main();
