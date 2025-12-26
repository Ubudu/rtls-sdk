/**
 * 06 - Pagination & Filtering with Ubudu RTLS SDK
 *
 * This example covers:
 * - Using async iterators
 * - Collecting all results
 * - Filter operators
 * - Batch processing
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import { createRtlsClient, filters, combineFilters, filter } from '@ubudu/rtls-sdk';

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

console.log('Ubudu RTLS SDK - Pagination & Filtering\n');

// =============================================================================
// 1. Async Iterator
// =============================================================================

async function asyncIterator() {
  console.log('1. Async Iterator...');

  let count = 0;
  for await (const asset of client.assets.iterate()) {
    console.log(`   [${count + 1}] ${asset.user_name}`);
    count++;
    if (count >= 5) {
      console.log('   ... (first 5 shown)');
      break;
    }
  }
}

// =============================================================================
// 2. Collect All
// =============================================================================

async function collectAll() {
  console.log('\n2. Collect All Results...');

  const allAssets = await client.assets.getAll();
  console.log(`   Total: ${allAssets.length} asset(s)`);

  // Count by type
  const types = allAssets.reduce((acc, a) => {
    const type = a.user_type || 'unknown';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  Object.entries(types)
    .slice(0, 3)
    .forEach(([type, count]) => {
      console.log(`   - ${type}: ${count}`);
    });
}

// =============================================================================
// 3. Filter Operators
// =============================================================================

function showFilterOperators() {
  console.log('\n3. Filter Operators...');
  console.log('   Equality: equals, notEquals');
  console.log('   Comparison: greaterThan, lessThan, between');
  console.log('   String: contains, startsWith, endsWith, matches');
  console.log('   Array: in, notIn, all, size');
  console.log('   Other: exists');
}

// =============================================================================
// 4. Apply Filter
// =============================================================================

async function applyFilter() {
  console.log('\n4. Apply Filter...');

  const allAssets = await client.assets.list();
  const types = [...new Set(allAssets.map((a) => a.user_type))];

  if (types.length > 0) {
    const firstType = types[0];
    console.log(`   Filtering by type: "${firstType}"`);

    const filtered = await client.assets.list({
      ...filters.equals('user_type', firstType),
    });

    console.log(`   Matched: ${filtered.length} asset(s)`);
  }
}

// =============================================================================
// 5. Combine Filters
// =============================================================================

async function combineFiltersExample() {
  console.log('\n5. Combine Filters...');

  const filterA = filters.exists('user_type', true);
  const filterB = filters.exists('user_name', true);
  const combined = combineFilters(filterA, filterB);

  console.log(`   Combined: ${JSON.stringify(combined)}`);

  const assets = await client.assets.list(combined);
  console.log(`   Results: ${assets.length} asset(s)`);
}

// =============================================================================
// 6. Raw Filter Function
// =============================================================================

function rawFilterExample() {
  console.log('\n6. Raw Filter Function...');

  const customFilter = filter('user_type', 'exists', true);
  console.log(`   filter('user_type', 'exists', true)`);
  console.log(`   Result: ${JSON.stringify(customFilter)}`);
}

// =============================================================================
// 7. Batch Processing
// =============================================================================

async function batchProcessing() {
  console.log('\n7. Batch Processing...');

  const assets = await client.assets.list();
  const batchSize = 5;
  const batches = [];

  for (let i = 0; i < assets.length; i += batchSize) {
    batches.push(assets.slice(i, i + batchSize));
  }

  console.log(`   Total: ${assets.length} assets`);
  console.log(`   Batch size: ${batchSize}`);
  console.log(`   Batches: ${batches.length}`);
}

// =============================================================================
// 8. Venue and Zone Iteration
// =============================================================================

async function venueZoneIteration() {
  console.log('\n8. Venue and Zone Iteration...');

  let venueCount = 0;
  for await (const venue of client.venues.iterate()) {
    console.log(`   Venue: ${venue.name}`);

    let zoneCount = 0;
    for await (const zone of client.zones.iterate({ venueId: venue.id })) {
      console.log(`   - Zone: ${zone.name}`);
      zoneCount++;
      if (zoneCount >= 2) break;
    }

    venueCount++;
    if (venueCount >= 2) break;
  }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  try {
    await asyncIterator();
    await collectAll();
    showFilterOperators();
    await applyFilter();
    await combineFiltersExample();
    rawFilterExample();
    await batchProcessing();
    await venueZoneIteration();

    console.log('\nDone!');
  } catch (error) {
    console.error('Failed:', error.message);
    process.exit(1);
  }
}

main();
