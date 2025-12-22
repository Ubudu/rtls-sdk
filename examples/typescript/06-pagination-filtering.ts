/**
 * 06 - Pagination & Filtering with Ubudu RTLS SDK
 *
 * This example demonstrates:
 * - Using async iterators (iterate())
 * - Collecting all results (getAll())
 * - Filter operators and DSL
 * - Combining multiple filters
 * - Batch operations
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import {
  createRtlsClient,
  filters,
  combineFilters,
  filter,
} from '@ubudu/rtls-sdk';

const NAMESPACE = process.env.APP_NAMESPACE!;
const API_KEY = process.env.RTLS_API_KEY!;

if (!NAMESPACE || !API_KEY) {
  console.error('Missing APP_NAMESPACE or RTLS_API_KEY in .env');
  process.exit(1);
}

const client = createRtlsClient({ apiKey: API_KEY });

console.log('Ubudu RTLS SDK - Pagination & Filtering Example\n');
console.log('================================================\n');

// =============================================================================
// Example 1: Async Iterator Pattern
// =============================================================================

async function asyncIteratorPattern(): Promise<void> {
  console.log('1. Async Iterator Pattern');
  console.log('   Using: for await...of with client.assets.iterate()\n');

  let count = 0;
  const maxItems = 5;

  console.log('   Iterating through assets:');
  for await (const asset of client.assets.iterate(NAMESPACE)) {
    const a = asset as { user_udid: string; user_name: string };
    console.log(`   [${count + 1}] ${a.user_name} (${a.user_udid})`);
    count++;
    if (count >= maxItems) {
      console.log(`   ... (stopped after ${maxItems} items)\n`);
      break;
    }
  }

  console.log('   Benefits:');
  console.log('   - Memory efficient (processes one at a time)');
  console.log('   - Can break early without fetching all data');
  console.log('   - Clean async syntax\n');
}

// =============================================================================
// Example 2: Collect All Results
// =============================================================================

async function collectAllResults(): Promise<void> {
  console.log('2. Collect All Results');
  console.log('   Using: client.assets.getAll() or list()\n');

  const allAssets = await client.assets.getAll(NAMESPACE);
  console.log(`   Total assets collected: ${allAssets.length}`);

  // Show type distribution
  const types: Record<string, number> = {};
  for (const a of allAssets) {
    const type = (a as { user_type: string }).user_type || 'unknown';
    types[type] = (types[type] || 0) + 1;
  }

  console.log('   Asset types:');
  Object.entries(types).forEach(([type, count]) => {
    console.log(`   - ${type}: ${count}`);
  });
  console.log();
}

// =============================================================================
// Example 3: Filter Operators
// =============================================================================

async function filterOperators(): Promise<void> {
  console.log('3. Filter Operators (DSL)');
  console.log('   Available operators:\n');

  console.log('   Equality:');
  console.log('   - filters.equals(field, value)      // field = value');
  console.log('   - filters.notEquals(field, value)   // field != value\n');

  console.log('   Comparison:');
  console.log('   - filters.greaterThan(field, n)     // field > n');
  console.log('   - filters.greaterThanOrEqual(f, n)  // field >= n');
  console.log('   - filters.lessThan(field, n)        // field < n');
  console.log('   - filters.lessThanOrEqual(f, n)     // field <= n\n');

  console.log('   String:');
  console.log('   - filters.contains(field, str)      // field contains str');
  console.log('   - filters.startsWith(field, str)    // field starts with str');
  console.log('   - filters.endsWith(field, str)      // field ends with str');
  console.log('   - filters.matches(field, regex)     // regex match\n');

  console.log('   Array:');
  console.log('   - filters.in(field, values)         // field in [values]');
  console.log('   - filters.notIn(field, values)      // field not in [values]');
  console.log('   - filters.all(field, values)        // field has all values');
  console.log('   - filters.size(field, n)            // array size = n\n');

  console.log('   Other:');
  console.log('   - filters.exists(field, bool)       // field exists/not exists');
  console.log('   - filters.between(field, min, max)  // min <= field <= max');
  console.log();
}

// =============================================================================
// Example 4: Applying Single Filter
// =============================================================================

async function applySingleFilter(): Promise<void> {
  console.log('4. Applying Single Filter');
  console.log('   Example: Filter by user_type\n');

  // Get all assets first to see types
  const allAssets = await client.assets.list(NAMESPACE);
  const types = new Set(allAssets.map((a) => (a as { user_type: string }).user_type));
  console.log(`   Available types: ${[...types].join(', ')}`);

  if (types.size > 0) {
    const firstType = [...types][0];
    console.log(`\n   Filtering for type: "${firstType}"`);
    console.log('   Code: filters.equals("user_type", "${firstType}")\n');

    const filtered = await client.assets.list(NAMESPACE, {
      ...filters.equals('user_type', firstType),
    });

    console.log(`   Matched: ${filtered.length} assets`);
    filtered.slice(0, 3).forEach((a, i) => {
      const asset = a as { user_name: string; user_type: string };
      console.log(`   [${i + 1}] ${asset.user_name} (type: ${asset.user_type})`);
    });
  }
  console.log();
}

// =============================================================================
// Example 5: Combining Multiple Filters
// =============================================================================

async function combineMultipleFilters(): Promise<void> {
  console.log('5. Combining Multiple Filters');
  console.log('   Using: combineFilters(...filterObjects)\n');

  // Demonstrate filter combination
  const filterA = filters.exists('user_type', true);
  const filterB = filters.exists('user_name', true);

  const combined = combineFilters(filterA, filterB);

  console.log('   Combined filter object:', JSON.stringify(combined, null, 2));

  const assets = await client.assets.list(NAMESPACE, combined);
  console.log(`\n   Results: ${assets.length} assets\n`);
}

// =============================================================================
// Example 6: Raw Filter Function
// =============================================================================

async function rawFilterFunction(): Promise<void> {
  console.log('6. Raw Filter Function');
  console.log('   Using: filter(field, operator, value)\n');

  // Create custom filter
  const customFilter = filter('user_type', 'exists', true);

  console.log('   Custom filter:', JSON.stringify(customFilter));
  console.log('\n   Available operators:');
  console.log('   eq, ne, gt, gte, lt, lte, contains, starts, ends');
  console.log('   regex, in, nin, exists, between, size, all, elem\n');
}

// =============================================================================
// Example 7: Processing with Iterator + Transform
// =============================================================================

async function iteratorWithTransform(): Promise<void> {
  console.log('7. Processing with Iterator + Transform');
  console.log('   Collecting and transforming data\n');

  const names: string[] = [];
  let count = 0;
  const maxItems = 10;

  for await (const asset of client.assets.iterate(NAMESPACE)) {
    const a = asset as { user_name: string };
    names.push(a.user_name);
    count++;
    if (count >= maxItems) break;
  }

  console.log(`   Collected ${names.length} names:`);
  names.forEach((name, i) => {
    console.log(`   [${i + 1}] ${name}`);
  });
  console.log();
}

// =============================================================================
// Example 8: Batch Processing Pattern
// =============================================================================

async function batchProcessingPattern(): Promise<void> {
  console.log('8. Batch Processing Pattern');
  console.log('   Processing in chunks\n');

  const assets = await client.assets.list(NAMESPACE);
  const batchSize = 5;
  const batches = [];

  for (let i = 0; i < assets.length; i += batchSize) {
    batches.push(assets.slice(i, i + batchSize));
  }

  console.log(`   Total assets: ${assets.length}`);
  console.log(`   Batch size: ${batchSize}`);
  console.log(`   Number of batches: ${batches.length}`);

  batches.slice(0, 3).forEach((batch, i) => {
    console.log(`\n   Batch ${i + 1}: ${batch.length} items`);
    batch.forEach((a, j) => {
      const asset = a as { user_name: string };
      console.log(`   - ${asset.user_name}`);
    });
  });

  if (batches.length > 3) {
    console.log(`\n   ... (${batches.length - 3} more batches)`);
  }
  console.log();
}

// =============================================================================
// Example 9: Venues and Zones Iteration
// =============================================================================

async function venuesAndZonesIteration(): Promise<void> {
  console.log('9. Venues and Zones Iteration');
  console.log('   Iterating through nested resources\n');

  let venueCount = 0;
  for await (const venue of client.venues.iterate(NAMESPACE)) {
    const v = venue as { id: number; name: string };
    console.log(`   Venue: ${v.name} (ID: ${v.id})`);

    let zoneCount = 0;
    for await (const zone of client.zones.iterate(NAMESPACE, v.id)) {
      console.log(`   - Zone: ${zone.name}`);
      zoneCount++;
      if (zoneCount >= 3) {
        console.log(`     ... (showing first 3 zones)`);
        break;
      }
    }

    venueCount++;
    if (venueCount >= 2) {
      console.log('   ... (showing first 2 venues)\n');
      break;
    }
  }
}

// =============================================================================
// Example 10: Building Query Strings
// =============================================================================

async function buildingQueryStrings(): Promise<void> {
  console.log('10. Building Query Strings');
  console.log('    Filter DSL generates query parameters\n');

  // Show what filters generate
  const examples = [
    { name: 'equals', filter: filters.equals('user_type', 'forklift') },
    { name: 'greaterThan', filter: filters.greaterThan('count', 10) },
    { name: 'contains', filter: filters.contains('user_name', 'truck') },
    { name: 'in', filter: filters.in('status', ['active', 'idle']) },
    { name: 'between', filter: filters.between('value', 0, 100) },
  ];

  examples.forEach(({ name, filter }) => {
    console.log(`    ${name}:`);
    console.log(`    ${JSON.stringify(filter)}`);
  });
  console.log();
}

// =============================================================================
// Main Execution
// =============================================================================

async function main(): Promise<void> {
  try {
    await asyncIteratorPattern();
    await collectAllResults();
    await filterOperators();
    await applySingleFilter();
    await combineMultipleFilters();
    await rawFilterFunction();
    await iteratorWithTransform();
    await batchProcessingPattern();
    await venuesAndZonesIteration();
    await buildingQueryStrings();

    console.log('================================================');
    console.log('Pagination & filtering example completed!');
  } catch (error) {
    console.error('Example failed:', error);
    process.exit(1);
  }
}

main();
