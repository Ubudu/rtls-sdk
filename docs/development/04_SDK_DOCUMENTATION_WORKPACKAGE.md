# SDK Documentation Work Package

## Implementation Status: PENDING

**Target Version**: 1.1.0
**Estimated Tasks**: 52

---

## Overview

This work package creates comprehensive SDK documentation with testable examples in both TypeScript and JavaScript. All examples are runnable scripts tested against the live API using `.env` credentials.

**Goals**:
1. Runnable examples in `examples/` directory covering key use cases
2. TSDoc comments for all public API methods
3. Tutorial-style guides in `docs/guides/`
4. Quick start documentation in README
5. Integration test suite to prevent example regressions

**Use Cases Covered**:
- Asset tracking workflows (list, track, history, metadata)
- Zone & geofencing (presence, spatial queries, alerts)
- Navigation & wayfinding (routing, POIs, path planning)

---

## Prerequisites

- Node.js >= 18
- npm installed
- `.env` file with `APP_NAMESPACE` and `RTLS_API_KEY`
- WP 03 (SDK Alignment) completed

---

## Directory Structure

```
examples/
├── typescript/
│   ├── 01-getting-started.ts
│   ├── 02-asset-tracking.ts
│   ├── 03-zone-geofencing.ts
│   ├── 04-navigation.ts
│   ├── 05-error-handling.ts
│   ├── 06-pagination-filtering.ts
│   └── tsconfig.json
├── javascript/
│   ├── 01-getting-started.js
│   ├── 02-asset-tracking.js
│   ├── 03-zone-geofencing.js
│   ├── 04-navigation.js
│   ├── 05-error-handling.js
│   └── 06-pagination-filtering.js
├── package.json
└── README.md

docs/
├── guides/
│   ├── getting-started.md
│   ├── asset-tracking.md
│   ├── zone-geofencing.md
│   ├── navigation.md
│   ├── error-handling.md
│   └── advanced-patterns.md
└── api/
    └── README.md (generated API reference)
```

---

## Phase 1: Examples Infrastructure (4 tasks)

### Task 1.1: Create Examples Package Configuration

**File**: `examples/package.json`

**Implementation**:
```json
{
  "name": "@ubudu/rtls-sdk-examples",
  "version": "1.0.0",
  "private": true,
  "description": "Example scripts for Ubudu RTLS SDK",
  "type": "module",
  "scripts": {
    "ts:getting-started": "npx tsx typescript/01-getting-started.ts",
    "ts:asset-tracking": "npx tsx typescript/02-asset-tracking.ts",
    "ts:zone-geofencing": "npx tsx typescript/03-zone-geofencing.ts",
    "ts:navigation": "npx tsx typescript/04-navigation.ts",
    "ts:error-handling": "npx tsx typescript/05-error-handling.ts",
    "ts:pagination": "npx tsx typescript/06-pagination-filtering.ts",
    "ts:all": "npm run ts:getting-started && npm run ts:asset-tracking && npm run ts:zone-geofencing && npm run ts:navigation && npm run ts:error-handling && npm run ts:pagination",
    "js:getting-started": "node javascript/01-getting-started.js",
    "js:asset-tracking": "node javascript/02-asset-tracking.js",
    "js:zone-geofencing": "node javascript/03-zone-geofencing.js",
    "js:navigation": "node javascript/04-navigation.js",
    "js:error-handling": "node javascript/05-error-handling.js",
    "js:pagination": "node javascript/06-pagination-filtering.js",
    "js:all": "npm run js:getting-started && npm run js:asset-tracking && npm run js:zone-geofencing && npm run js:navigation && npm run js:error-handling && npm run js:pagination",
    "all": "npm run ts:all && npm run js:all"
  },
  "dependencies": {
    "@ubudu/rtls-sdk": "file:.."
  },
  "devDependencies": {
    "tsx": "^4.7.0",
    "dotenv": "^16.3.1"
  }
}
```

**Verification**:
```bash
cd examples && npm install
```

---

### Task 1.2: Create TypeScript Configuration for Examples

**File**: `examples/typescript/tsconfig.json`

**Implementation**:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false,
    "outDir": "../dist"
  },
  "include": ["./*.ts"]
}
```

**Verification**:
```bash
cd examples && npx tsc --noEmit -p typescript/tsconfig.json
```

---

### Task 1.3: Create Examples README

**File**: `examples/README.md`

**Implementation**:
```markdown
# Ubudu RTLS SDK Examples

Runnable examples demonstrating common use cases for the Ubudu RTLS SDK.

## Prerequisites

1. Copy `.env.example` to `.env` in the project root
2. Add your API credentials:
   ```
   APP_NAMESPACE=your-namespace
   RTLS_API_KEY=your-api-key
   ```

## Running Examples

### TypeScript Examples

```bash
# Install dependencies
npm install

# Run individual examples
npm run ts:getting-started
npm run ts:asset-tracking
npm run ts:zone-geofencing
npm run ts:navigation
npm run ts:error-handling
npm run ts:pagination

# Run all TypeScript examples
npm run ts:all
```

### JavaScript Examples

```bash
npm run js:getting-started
npm run js:asset-tracking
npm run js:zone-geofencing
npm run js:navigation
npm run js:error-handling
npm run js:pagination

# Run all JavaScript examples
npm run js:all
```

## Example Categories

| Example | Description |
|---------|-------------|
| 01-getting-started | Basic SDK setup, health check, first API call |
| 02-asset-tracking | Asset CRUD, positions, history, statistics |
| 03-zone-geofencing | Zones, spatial queries, presence detection |
| 04-navigation | POIs, paths, indoor routing |
| 05-error-handling | Error types, retry strategies, validation |
| 06-pagination-filtering | Iterators, filters, batch operations |
```

**Verification**:
```bash
cat examples/README.md
```

---

### Task 1.4: Add Example Test Script to Root Package

**File**: `package.json` (update scripts section)

**Changes**: Add `test:examples` script

**Implementation** (add to scripts):
```json
{
  "scripts": {
    "test:examples": "cd examples && npm install && npm run all",
    "test:examples:ts": "cd examples && npm install && npm run ts:all",
    "test:examples:js": "cd examples && npm install && npm run js:all"
  }
}
```

**Verification**:
```bash
npm run test:examples:ts
```

---

## Phase 2: Getting Started Examples (4 tasks)

### Task 2.1: TypeScript Getting Started Example

**File**: `examples/typescript/01-getting-started.ts`

**Implementation**:
```typescript
/**
 * 01 - Getting Started with Ubudu RTLS SDK
 *
 * This example demonstrates:
 * - Setting up the SDK client
 * - Checking API health
 * - Making your first API call
 * - Understanding the response format
 */

import 'dotenv/config';
import { createRtlsClient, RtlsError, AuthenticationError } from '@ubudu/rtls-sdk';

// =============================================================================
// Configuration
// =============================================================================

const NAMESPACE = process.env.APP_NAMESPACE;
const API_KEY = process.env.RTLS_API_KEY;

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
```

**Verification**:
```bash
cd examples && npm run ts:getting-started
```

---

### Task 2.2: JavaScript Getting Started Example

**File**: `examples/javascript/01-getting-started.js`

**Implementation**:
```javascript
/**
 * 01 - Getting Started with Ubudu RTLS SDK (JavaScript)
 *
 * This example demonstrates:
 * - Setting up the SDK client
 * - Checking API health
 * - Making your first API call
 * - Understanding the response format
 */

import 'dotenv/config';
import { createRtlsClient, RtlsError, AuthenticationError } from '@ubudu/rtls-sdk';

// =============================================================================
// Configuration
// =============================================================================

const NAMESPACE = process.env.APP_NAMESPACE;
const API_KEY = process.env.RTLS_API_KEY;

if (!NAMESPACE || !API_KEY) {
  console.error('Error: Missing required environment variables');
  console.error('Please set APP_NAMESPACE and RTLS_API_KEY in your .env file');
  process.exit(1);
}

// =============================================================================
// Initialize the SDK Client
// =============================================================================

const client = createRtlsClient({
  apiKey: API_KEY,
  timeoutMs: 10000,
});

console.log('Ubudu RTLS SDK - Getting Started Example (JavaScript)\n');
console.log('=====================================================\n');

// =============================================================================
// Example 1: Health Check
// =============================================================================

async function checkHealth() {
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

async function listVenues() {
  console.log('2. Listing Venues...');
  console.log(`   Endpoint: GET /venues/${NAMESPACE}\n`);

  try {
    const venues = await client.venues.list(NAMESPACE);

    console.log(`   Found ${venues.length} venue(s)\n`);

    if (venues.length > 0) {
      const venue = venues[0];
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

async function listAssets() {
  console.log('3. Listing Assets...');
  console.log(`   Endpoint: GET /assets/${NAMESPACE}\n`);

  try {
    const assets = await client.assets.list(NAMESPACE);

    console.log(`   Found ${assets.length} asset(s)\n`);

    // Show first 3 assets
    const sample = assets.slice(0, 3);

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

async function main() {
  try {
    await checkHealth();
    await listVenues();
    await listAssets();

    console.log('=====================================================');
    console.log('Getting started example completed successfully!');
  } catch (error) {
    console.error('\nExample failed:', error);
    process.exit(1);
  }
}

main();
```

**Verification**:
```bash
cd examples && npm run js:getting-started
```

---

### Task 2.3: Create .env.example for Examples

**File**: `examples/.env.example`

**Implementation**:
```bash
# Ubudu RTLS SDK Example Configuration
# Copy this file to .env and fill in your credentials

# Your application namespace (required)
APP_NAMESPACE=your-namespace-here

# Your RTLS API key (required)
RTLS_API_KEY=your-api-key-here
```

**Verification**:
```bash
cat examples/.env.example
```

---

### Task 2.4: Symlink Root .env to Examples

**Note**: Examples should use the root `.env` file. Update the examples to load from parent directory.

**Implementation**: Update dotenv loading in all examples:
```typescript
// At top of each example file
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from project root
config({ path: resolve(__dirname, '../../.env') });
```

**Alternative**: Create a shared config loader:

**File**: `examples/typescript/config.ts`

```typescript
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from project root
config({ path: resolve(__dirname, '../../.env') });

export const NAMESPACE = process.env.APP_NAMESPACE;
export const API_KEY = process.env.RTLS_API_KEY;

export function validateConfig(): void {
  if (!NAMESPACE || !API_KEY) {
    console.error('Error: Missing required environment variables');
    console.error('Please set APP_NAMESPACE and RTLS_API_KEY in root .env file');
    process.exit(1);
  }
}
```

**Verification**:
```bash
cd examples && npm run ts:getting-started
```

---

## Phase 3: Asset Tracking Examples (4 tasks)

### Task 3.1: TypeScript Asset Tracking Example

**File**: `examples/typescript/02-asset-tracking.ts`

**Implementation**:
```typescript
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
    const asset = await client.assets.get(NAMESPACE, macAddress);
    console.log('   Asset found:');
    console.log(`   - Name: ${asset.user_name}`);
    console.log(`   - Type: ${asset.user_type}`);
    console.log(`   - Color: ${asset.color}`);
    console.log(`   - Tags: ${(asset.tags as string[])?.join(', ') || 'none'}\n`);
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
    console.log(`   - Total: ${stats.total || 'N/A'}`);
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
  console.log('   Using: filters.contains(), filters.equals()\n');

  // Filter by type
  const ptlAssets = await client.assets.list(NAMESPACE, {
    ...filters.equals('user_type', 'ptl_ubudu'),
  });
  console.log(`   Assets of type 'ptl_ubudu': ${ptlAssets.length}`);

  // Get all assets and show types distribution
  const allAssets = await client.assets.list(NAMESPACE);
  const typeCount = allAssets.reduce(
    (acc, a) => {
      const type = (a as { user_type: string }).user_type || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  console.log('   Asset types distribution:');
  Object.entries(typeCount).forEach(([type, count]) => {
    console.log(`   - ${type}: ${count}`);
  });
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
```

**Verification**:
```bash
cd examples && npm run ts:asset-tracking
```

---

### Task 3.2: JavaScript Asset Tracking Example

**File**: `examples/javascript/02-asset-tracking.js`

**Implementation**: Same as TypeScript version but without type annotations.

**Verification**:
```bash
cd examples && npm run js:asset-tracking
```

---

### Task 3.3: TypeScript Asset Tracking Tests

Create integration test for asset tracking example.

**File**: `test/integration/examples/asset-tracking.test.ts`

**Implementation**:
```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createRtlsClient } from '../../../src';

describe('Asset Tracking Example Scenarios', () => {
  const NAMESPACE = process.env.APP_NAMESPACE!;
  const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY! });

  describe('List Assets', () => {
    it('should return array of assets', async () => {
      const assets = await client.assets.list(NAMESPACE);
      expect(Array.isArray(assets)).toBe(true);
    });
  });

  describe('Asset Iteration', () => {
    it('should iterate through assets', async () => {
      const items: unknown[] = [];
      for await (const asset of client.assets.iterate(NAMESPACE)) {
        items.push(asset);
        if (items.length >= 3) break;
      }
      expect(items.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Cached Positions', () => {
    it('should return cached positions', async () => {
      const positions = await client.positions.listCached(NAMESPACE);
      expect(Array.isArray(positions)).toBe(true);
    });
  });
});
```

**Verification**:
```bash
npm run test:integration -- --grep "Asset Tracking"
```

---

### Task 3.4: Document Asset Tracking Patterns

**File**: `docs/guides/asset-tracking.md`

**Implementation**:
```markdown
# Asset Tracking Guide

This guide covers common asset tracking patterns with the Ubudu RTLS SDK.

## Overview

Asset tracking is the core functionality of the RTLS system. Assets represent physical items (forklifts, containers, personnel) equipped with tracking tags.

## Quick Reference

| Operation | Method | Returns |
|-----------|--------|---------|
| List assets | `client.assets.list(namespace)` | `Asset[]` |
| Get single asset | `client.assets.get(namespace, mac)` | `Asset` |
| Create asset | `client.assets.create(namespace, mac, data)` | `Asset` |
| Update asset | `client.assets.update(namespace, mac, updates)` | `Asset` |
| Delete asset | `client.assets.delete(namespace, mac)` | `void` |
| Get positions | `client.positions.listCached(namespace)` | `Position[]` |
| Get history | `client.assets.getHistory(namespace, mac, range)` | `Position[]` |

## Listing Assets

### TypeScript

```typescript
import { createRtlsClient, type Asset } from '@ubudu/rtls-sdk';

const client = createRtlsClient({ apiKey: 'your-key' });

// List all assets
const assets = await client.assets.list('your-namespace');
console.log(`Found ${assets.length} assets`);

// With filtering
import { filters } from '@ubudu/rtls-sdk';

const forklifts = await client.assets.list('namespace', {
  ...filters.equals('user_type', 'forklift')
});
```

### JavaScript

```javascript
import { createRtlsClient, filters } from '@ubudu/rtls-sdk';

const client = createRtlsClient({ apiKey: 'your-key' });

const assets = await client.assets.list('your-namespace');
console.log(`Found ${assets.length} assets`);
```

## Real-Time Positions

Cached positions provide the last known location of all active assets.

```typescript
const positions = await client.positions.listCached('namespace');

for (const pos of positions) {
  console.log(`${pos.user_udid} at (${pos.lat}, ${pos.lon})`);
}
```

## Position History

Retrieve historical positions for analysis and reporting.

```typescript
const endTime = Date.now();
const startTime = endTime - 24 * 60 * 60 * 1000; // 24 hours ago

const history = await client.assets.getHistory('namespace', 'AA:BB:CC:DD:EE:FF', {
  startTime,
  endTime
});

console.log(`Found ${history.length} position records`);
```

## Iterating Large Datasets

For memory-efficient processing of large asset lists:

```typescript
for await (const asset of client.assets.iterate('namespace')) {
  // Process each asset
  console.log(asset.user_name);
}
```

## Asset Statistics

Get aggregated statistics for your fleet:

```typescript
const stats = await client.assets.getStats('namespace', {
  startTime: Date.now() - 86400000,
  endTime: Date.now()
});
```

## Common Patterns

### Tracking Active Assets

```typescript
async function getActiveAssets(namespace: string) {
  const positions = await client.positions.listCached(namespace);
  const activeIds = new Set(positions.map(p => p.user_udid));

  const assets = await client.assets.list(namespace);
  return assets.filter(a => activeIds.has(a.user_udid));
}
```

### Finding Assets in a Zone

See the [Zone & Geofencing Guide](./zone-geofencing.md) for spatial queries.

## Error Handling

```typescript
import { NotFoundError, RtlsError } from '@ubudu/rtls-sdk';

try {
  const asset = await client.assets.get('namespace', 'invalid-mac');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log('Asset not found');
  } else if (error instanceof RtlsError) {
    console.log(`API error: ${error.status} - ${error.message}`);
  }
}
```

## See Also

- [Getting Started](./getting-started.md)
- [Error Handling](./error-handling.md)
- [Pagination & Filtering](./advanced-patterns.md)
```

**Verification**:
```bash
cat docs/guides/asset-tracking.md
```

---

## Phase 4: Zone & Geofencing Examples (4 tasks)

### Task 4.1: TypeScript Zone Geofencing Example

**File**: `examples/typescript/03-zone-geofencing.ts`

**Implementation**:
```typescript
/**
 * 03 - Zone & Geofencing with Ubudu RTLS SDK
 *
 * This example demonstrates:
 * - Listing zones for a venue (GeoJSON format)
 * - Spatial queries (containing point, nearest, within radius)
 * - Zone presence detection
 * - Working with GeoJSON data
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import {
  createRtlsClient,
  RtlsError,
  extractZonesFromGeoJSON,
  type ZoneFeatureCollection,
  type Zone,
} from '@ubudu/rtls-sdk';

const NAMESPACE = process.env.APP_NAMESPACE!;
const API_KEY = process.env.RTLS_API_KEY!;

if (!NAMESPACE || !API_KEY) {
  console.error('Missing APP_NAMESPACE or RTLS_API_KEY in .env');
  process.exit(1);
}

const client = createRtlsClient({ apiKey: API_KEY });

console.log('Ubudu RTLS SDK - Zone & Geofencing Example\n');
console.log('==========================================\n');

// Store venue info for examples
let venueId: number | null = null;
let venueCoords: { lat: number; lng: number } | null = null;

// =============================================================================
// Example 1: Get Venue for Zone Operations
// =============================================================================

async function getFirstVenue(): Promise<void> {
  console.log('1. Getting First Venue');
  console.log(`   Endpoint: GET /venues/${NAMESPACE}\n`);

  const venues = await client.venues.list(NAMESPACE);

  if (venues.length === 0) {
    console.log('   No venues found. Create a venue first.\n');
    return;
  }

  const venue = venues[0] as {
    id: number;
    name: string;
    coordinates: { lat: number; lng: number };
  };

  venueId = venue.id;
  venueCoords = venue.coordinates;

  console.log(`   Venue: ${venue.name}`);
  console.log(`   ID: ${venueId}`);
  console.log(`   Coordinates: (${venueCoords.lat}, ${venueCoords.lng})\n`);
}

// =============================================================================
// Example 2: List Zones as GeoJSON
// =============================================================================

async function listZonesGeoJSON(): Promise<ZoneFeatureCollection | null> {
  if (!venueId) return null;

  console.log('2. Listing Zones as GeoJSON');
  console.log(`   Endpoint: GET /venues/${NAMESPACE}/${venueId}/zones\n`);

  const geoJson = await client.zones.list(NAMESPACE, venueId);

  console.log(`   GeoJSON Type: ${geoJson.type}`);
  console.log(`   Total Features: ${geoJson.features.length}`);
  console.log(`   Metadata: ${JSON.stringify(geoJson.metadata)}\n`);

  if (geoJson.features.length > 0) {
    const first = geoJson.features[0];
    console.log('   First Zone (GeoJSON Feature):');
    console.log(`   - Type: ${first.type}`);
    console.log(`   - Geometry: ${first.geometry.type}`);
    console.log(`   - Properties: ${first.properties.name} (ID: ${first.properties.id})`);
    console.log(`   - Level: ${first.properties.level}`);
    console.log(`   - Color: ${first.properties.rgb_color}\n`);
  }

  return geoJson;
}

// =============================================================================
// Example 3: List Zones as Flat Array
// =============================================================================

async function listZonesArray(): Promise<Zone[]> {
  if (!venueId) return [];

  console.log('3. Listing Zones as Flat Array');
  console.log('   Method: client.zones.listAsArray()\n');

  const zones = await client.zones.listAsArray(NAMESPACE, venueId);

  console.log(`   Total Zones: ${zones.length}\n`);

  zones.slice(0, 3).forEach((zone, i) => {
    console.log(`   Zone ${i + 1}: ${zone.name}`);
    console.log(`   - ID: ${zone.id}`);
    console.log(`   - Type: ${zone.type}`);
    console.log(`   - Level: ${zone.level}`);
    console.log(`   - Color: ${zone.color}\n`);
  });

  return zones;
}

// =============================================================================
// Example 4: Extract Zones from GeoJSON (Utility)
// =============================================================================

async function extractZonesDemo(geoJson: ZoneFeatureCollection | null): Promise<void> {
  if (!geoJson) return;

  console.log('4. Extracting Zones from GeoJSON (Utility)');
  console.log('   Using: extractZonesFromGeoJSON()\n');

  const zones = extractZonesFromGeoJSON(geoJson);
  console.log(`   Extracted ${zones.length} zones from GeoJSON`);

  if (zones.length > 0) {
    console.log(`   First zone: ${zones[0].name}`);
    console.log(`   Has geometry: ${zones[0].geometry ? 'yes' : 'no'}\n`);
  }
}

// =============================================================================
// Example 5: Spatial Query - Zones Containing Point
// =============================================================================

async function zonesContainingPoint(): Promise<void> {
  if (!venueCoords) return;

  console.log('5. Spatial Query: Zones Containing Point');
  console.log(`   Endpoint: GET /spatial/zones/${NAMESPACE}/containing-point\n`);

  const result = await client.spatial.zonesContainingPoint(NAMESPACE, {
    lat: venueCoords.lat,
    lon: venueCoords.lng,
  });

  console.log('   Result:');
  console.log(`   - Reference Point: (${result.reference_point.lat}, ${result.reference_point.lon})`);
  console.log(`   - Level: ${result.level ?? 'all'}`);
  console.log(`   - Containing Zones: ${result.total}`);

  if (result.containing_zones.length > 0) {
    result.containing_zones.forEach((zone) => {
      console.log(`     - ${zone.name} (ID: ${zone.id})`);
    });
  }
  console.log();
}

// =============================================================================
// Example 6: Spatial Query - Nearest Zones
// =============================================================================

async function nearestZones(): Promise<void> {
  if (!venueCoords) return;

  console.log('6. Spatial Query: Nearest Zones');
  console.log(`   Endpoint: GET /spatial/zones/${NAMESPACE}/nearest-to-point\n`);

  const result = await client.spatial.nearestZones(NAMESPACE, {
    lat: venueCoords.lat,
    lon: venueCoords.lng,
    limit: 5,
  });

  console.log('   Result:');
  console.log(`   - Reference Point: (${result.reference_point.lat}, ${result.reference_point.lon})`);
  console.log(`   - Total Zones: ${result.total_zones}`);
  console.log(`   - Has More: ${result.hasMore}`);

  if (result.zones.length > 0) {
    console.log('   - Nearest Zones:');
    result.zones.forEach((zone) => {
      const distance = zone.distance_meters?.toFixed(1) ?? 'N/A';
      console.log(`     - ${zone.name}: ${distance}m`);
    });
  }
  console.log();
}

// =============================================================================
// Example 7: Spatial Query - Zones Within Radius
// =============================================================================

async function zonesWithinRadius(): Promise<void> {
  if (!venueCoords) return;

  console.log('7. Spatial Query: Zones Within Radius');
  console.log(`   Endpoint: GET /spatial/zones/${NAMESPACE}/within-radius\n`);

  const result = await client.spatial.zonesWithinRadius(NAMESPACE, {
    lat: venueCoords.lat,
    lon: venueCoords.lng,
    radiusMeters: 500, // 500 meter radius
  });

  console.log('   Result:');
  console.log(`   - Reference Point: (${result.reference_point.lat}, ${result.reference_point.lon})`);
  console.log(`   - Radius: ${result.radius_meters}m`);
  console.log(`   - Total Zones: ${result.total_zones}`);

  if (result.zones.length > 0) {
    console.log('   - Zones in radius:');
    result.zones.slice(0, 5).forEach((zone) => {
      console.log(`     - ${zone.name}`);
    });
  }
  console.log();
}

// =============================================================================
// Example 8: Zone Presence Data
// =============================================================================

async function zonePresence(): Promise<void> {
  console.log('8. Zone Presence Data');
  console.log(`   Endpoint: GET /es/zone_presence/${NAMESPACE}\n`);

  const endTime = Date.now();
  const startTime = endTime - 60 * 60 * 1000; // Last hour

  try {
    const presence = await client.zones.getPresence(NAMESPACE, {
      timestampFrom: startTime,
      timestampTo: endTime,
      interval: '5m',
    });

    console.log(`   Presence records (last hour): ${presence.length}`);

    if (presence.length > 0) {
      console.log('   Sample record:', JSON.stringify(presence[0], null, 2).slice(0, 200));
    }
  } catch (error) {
    if (error instanceof RtlsError) {
      console.log(`   Presence data not available: ${error.message}`);
    } else {
      throw error;
    }
  }
  console.log();
}

// =============================================================================
// Example 9: Iterate Through Zones
// =============================================================================

async function iterateZones(): Promise<void> {
  if (!venueId) return;

  console.log('9. Iterating Through Zones');
  console.log('   Using: client.zones.iterate()\n');

  let count = 0;
  for await (const zone of client.zones.iterate(NAMESPACE, venueId)) {
    console.log(`   [${count + 1}] ${zone.name} (Level ${zone.level})`);
    count++;
    if (count >= 5) {
      console.log('   ... (showing first 5)');
      break;
    }
  }
  console.log();
}

// =============================================================================
// Main Execution
// =============================================================================

async function main(): Promise<void> {
  try {
    await getFirstVenue();

    const geoJson = await listZonesGeoJSON();
    await listZonesArray();
    await extractZonesDemo(geoJson);

    await zonesContainingPoint();
    await nearestZones();
    await zonesWithinRadius();

    await zonePresence();
    await iterateZones();

    console.log('==========================================');
    console.log('Zone & geofencing example completed!');
  } catch (error) {
    console.error('Example failed:', error);
    process.exit(1);
  }
}

main();
```

**Verification**:
```bash
cd examples && npm run ts:zone-geofencing
```

---

### Task 4.2: JavaScript Zone Geofencing Example

**File**: `examples/javascript/03-zone-geofencing.js`

**Implementation**: Same logic as TypeScript, without type annotations.

**Verification**:
```bash
cd examples && npm run js:zone-geofencing
```

---

### Task 4.3: Zone Integration Tests

**File**: `test/integration/examples/zone-geofencing.test.ts`

**Implementation**:
```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createRtlsClient } from '../../../src';

describe('Zone & Geofencing Example Scenarios', () => {
  const NAMESPACE = process.env.APP_NAMESPACE!;
  const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY! });
  let venueId: number | null = null;
  let venueCoords: { lat: number; lng: number } | null = null;

  beforeAll(async () => {
    const venues = await client.venues.list(NAMESPACE);
    if (venues.length > 0) {
      const venue = venues[0] as { id: number; coordinates: { lat: number; lng: number } };
      venueId = venue.id;
      venueCoords = venue.coordinates;
    }
  });

  describe('Zone Listing', () => {
    it('should return GeoJSON FeatureCollection', async () => {
      if (!venueId) return;

      const geoJson = await client.zones.list(NAMESPACE, venueId);
      expect(geoJson.type).toBe('FeatureCollection');
      expect(Array.isArray(geoJson.features)).toBe(true);
    });

    it('should return flat array from listAsArray', async () => {
      if (!venueId) return;

      const zones = await client.zones.listAsArray(NAMESPACE, venueId);
      expect(Array.isArray(zones)).toBe(true);
      if (zones.length > 0) {
        expect(zones[0]).toHaveProperty('id');
        expect(zones[0]).toHaveProperty('name');
      }
    });
  });

  describe('Spatial Queries', () => {
    it('should find zones containing point', async () => {
      if (!venueCoords) return;

      const result = await client.spatial.zonesContainingPoint(NAMESPACE, {
        lat: venueCoords.lat,
        lon: venueCoords.lng,
      });

      expect(result).toHaveProperty('reference_point');
      expect(result).toHaveProperty('containing_zones');
      expect(result).toHaveProperty('total');
    });

    it('should find nearest zones', async () => {
      if (!venueCoords) return;

      const result = await client.spatial.nearestZones(NAMESPACE, {
        lat: venueCoords.lat,
        lon: venueCoords.lng,
        limit: 5,
      });

      expect(result).toHaveProperty('zones');
      expect(result).toHaveProperty('total_zones');
    });
  });
});
```

**Verification**:
```bash
npm run test:integration -- --grep "Zone"
```

---

### Task 4.4: Document Zone Geofencing Guide

**File**: `docs/guides/zone-geofencing.md`

**Implementation**: Create guide covering zone operations, GeoJSON handling, and spatial queries.

**Verification**:
```bash
cat docs/guides/zone-geofencing.md
```

---

## Phase 5: Navigation Examples (4 tasks)

### Task 5.1: TypeScript Navigation Example

**File**: `examples/typescript/04-navigation.ts`

**Implementation**:
```typescript
/**
 * 04 - Navigation & Wayfinding with Ubudu RTLS SDK
 *
 * This example demonstrates:
 * - Listing POIs (Points of Interest)
 * - Working with navigation paths
 * - Path nodes and segments
 * - Indoor routing concepts
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import {
  createRtlsClient,
  extractPoisFromGeoJSON,
  extractPathNodesFromGeoJSON,
  extractPathSegmentsFromGeoJSON,
  type POIFeatureCollection,
  type PathFeatureCollection,
} from '@ubudu/rtls-sdk';

const NAMESPACE = process.env.APP_NAMESPACE!;
const API_KEY = process.env.RTLS_API_KEY!;

if (!NAMESPACE || !API_KEY) {
  console.error('Missing APP_NAMESPACE or RTLS_API_KEY in .env');
  process.exit(1);
}

const client = createRtlsClient({ apiKey: API_KEY });

console.log('Ubudu RTLS SDK - Navigation Example\n');
console.log('====================================\n');

let venueId: number | null = null;
let venueCoords: { lat: number; lng: number } | null = null;

// =============================================================================
// Example 1: Get Venue
// =============================================================================

async function getFirstVenue(): Promise<void> {
  console.log('1. Getting First Venue');
  console.log(`   Endpoint: GET /venues/${NAMESPACE}\n`);

  const venues = await client.venues.list(NAMESPACE);

  if (venues.length === 0) {
    console.log('   No venues found.\n');
    return;
  }

  const venue = venues[0] as {
    id: number;
    name: string;
    coordinates: { lat: number; lng: number };
  };

  venueId = venue.id;
  venueCoords = venue.coordinates;

  console.log(`   Venue: ${venue.name} (ID: ${venueId})\n`);
}

// =============================================================================
// Example 2: List POIs as GeoJSON
// =============================================================================

async function listPoisGeoJSON(): Promise<POIFeatureCollection | null> {
  if (!venueId) return null;

  console.log('2. Listing POIs as GeoJSON');
  console.log(`   Endpoint: GET /venues/${NAMESPACE}/${venueId}/pois\n`);

  const geoJson = await client.venues.listPois(NAMESPACE, venueId);

  console.log(`   GeoJSON Type: ${geoJson.type}`);
  console.log(`   Total Features: ${geoJson.features.length}`);

  if (geoJson.features.length > 0) {
    const first = geoJson.features[0];
    console.log('\n   First POI (GeoJSON Feature):');
    console.log(`   - Name: ${first.properties.name}`);
    console.log(`   - Description: ${first.properties.description || 'N/A'}`);
    console.log(`   - Level: ${first.properties.level}`);
    console.log(`   - Coordinates: [${first.geometry.coordinates}]`);
  }
  console.log();

  return geoJson;
}

// =============================================================================
// Example 3: List POIs as Flat Array
// =============================================================================

async function listPoisArray(): Promise<void> {
  if (!venueId) return;

  console.log('3. Listing POIs as Flat Array');
  console.log('   Method: client.venues.listPoisAsArray()\n');

  const pois = await client.venues.listPoisAsArray(NAMESPACE, venueId);

  console.log(`   Total POIs: ${pois.length}`);

  pois.slice(0, 3).forEach((poi, i) => {
    console.log(`\n   POI ${i + 1}: ${poi.name}`);
    console.log(`   - ID: ${poi.id}`);
    console.log(`   - Location: (${poi.lat}, ${poi.lng})`);
    console.log(`   - Level: ${poi.level}`);
    console.log(`   - Tags: ${poi.tags.join(', ') || 'none'}`);
  });
  console.log();
}

// =============================================================================
// Example 4: Nearest POIs (Spatial Query)
// =============================================================================

async function nearestPois(): Promise<void> {
  if (!venueCoords) return;

  console.log('4. Spatial Query: Nearest POIs');
  console.log(`   Endpoint: GET /spatial/pois/${NAMESPACE}/nearest-to-point\n`);

  const result = await client.spatial.nearestPois(NAMESPACE, {
    lat: venueCoords.lat,
    lon: venueCoords.lng,
    limit: 5,
  });

  console.log(`   Reference Point: (${result.reference_point.lat}, ${result.reference_point.lon})`);
  console.log(`   Total POIs: ${result.total_pois}`);
  console.log(`   Has More: ${result.hasMore}`);

  if (result.pois.length > 0) {
    console.log('\n   Nearest POIs:');
    result.pois.forEach((poi) => {
      const distance = poi.distance_meters?.toFixed(1) ?? 'N/A';
      console.log(`   - ${poi.name}: ${distance}m`);
    });
  }
  console.log();
}

// =============================================================================
// Example 5: POIs Within Radius
// =============================================================================

async function poisWithinRadius(): Promise<void> {
  if (!venueCoords) return;

  console.log('5. Spatial Query: POIs Within Radius');
  console.log(`   Endpoint: GET /spatial/pois/${NAMESPACE}/within-radius\n`);

  const result = await client.spatial.poisWithinRadius(NAMESPACE, {
    lat: venueCoords.lat,
    lon: venueCoords.lng,
    radiusMeters: 200,
  });

  console.log(`   Radius: ${result.radius_meters}m`);
  console.log(`   POIs found: ${result.total_pois}`);

  if (result.pois.length > 0) {
    console.log('\n   POIs in radius:');
    result.pois.forEach((poi) => {
      console.log(`   - ${poi.name}`);
    });
  }
  console.log();
}

// =============================================================================
// Example 6: List Navigation Paths (GeoJSON)
// =============================================================================

async function listPaths(): Promise<PathFeatureCollection | null> {
  if (!venueId) return null;

  console.log('6. Listing Navigation Paths (GeoJSON)');
  console.log(`   Endpoint: GET /venues/${NAMESPACE}/${venueId}/paths\n`);

  const geoJson = await client.venues.listPaths(NAMESPACE, venueId);

  console.log(`   GeoJSON Type: ${geoJson.type}`);
  console.log(`   Total Features: ${geoJson.features.length}`);

  // Count nodes vs segments
  const nodes = geoJson.features.filter((f) => f.properties.type === 'path_node');
  const segments = geoJson.features.filter((f) => f.properties.type === 'path_segment');

  console.log(`   - Path Nodes: ${nodes.length}`);
  console.log(`   - Path Segments: ${segments.length}`);

  if (nodes.length > 0) {
    const firstNode = nodes[0];
    console.log('\n   First Path Node:');
    console.log(`   - ID: ${firstNode.properties.id}`);
    console.log(`   - Name: ${firstNode.properties.name}`);
    console.log(`   - Node Type: ${firstNode.properties.node_type}`);
    console.log(`   - Level: ${firstNode.properties.level}`);
  }
  console.log();

  return geoJson;
}

// =============================================================================
// Example 7: Extract Path Nodes and Segments
// =============================================================================

async function extractPathData(): Promise<void> {
  if (!venueId) return;

  console.log('7. Extracting Path Nodes and Segments');
  console.log('   Using: client.venues.listPathNodes() / listPathSegments()\n');

  const nodes = await client.venues.listPathNodes(NAMESPACE, venueId);
  const segments = await client.venues.listPathSegments(NAMESPACE, venueId);

  console.log(`   Path Nodes: ${nodes.length}`);
  console.log(`   Path Segments: ${segments.length}`);

  if (nodes.length > 0) {
    const node = nodes[0];
    console.log('\n   Sample Node:');
    console.log(`   - ID: ${node.id}`);
    console.log(`   - Name: ${node.name}`);
    console.log(`   - Type: ${node.nodeType}`);
    console.log(`   - Location: (${node.lat}, ${node.lng})`);
    console.log(`   - Level: ${node.level}`);
    console.log(`   - Active: ${node.isActive}`);
  }

  if (segments.length > 0) {
    const segment = segments[0];
    console.log('\n   Sample Segment:');
    console.log(`   - ID: ${segment.id}`);
    console.log(`   - Start Node: ${segment.startNodeId}`);
    console.log(`   - End Node: ${segment.endNodeId}`);
    console.log(`   - Bidirectional: ${segment.isBidirectional}`);
    console.log(`   - Weight: ${segment.weight}`);
  }
  console.log();
}

// =============================================================================
// Example 8: Navigation API (Concept)
// =============================================================================

async function navigationConcept(): Promise<void> {
  console.log('8. Navigation API (Concept Overview)');
  console.log('   Available methods for indoor routing:\n');

  console.log('   client.navigation.shortestPath(namespace, request)');
  console.log('   - Find shortest path between two points');
  console.log('   - Request: { from: { lat, lon }, to: { lat, lon } }\n');

  console.log('   client.navigation.accessiblePath(namespace, request)');
  console.log('   - Find wheelchair-accessible path');
  console.log('   - Avoids stairs and inaccessible areas\n');

  console.log('   client.navigation.multiStop(namespace, request)');
  console.log('   - Plan route with multiple waypoints');
  console.log('   - Optimizes visit order\n');

  console.log('   Note: These require path data to be configured for the venue.\n');
}

// =============================================================================
// Main Execution
// =============================================================================

async function main(): Promise<void> {
  try {
    await getFirstVenue();
    await listPoisGeoJSON();
    await listPoisArray();
    await nearestPois();
    await poisWithinRadius();
    await listPaths();
    await extractPathData();
    await navigationConcept();

    console.log('====================================');
    console.log('Navigation example completed!');
  } catch (error) {
    console.error('Example failed:', error);
    process.exit(1);
  }
}

main();
```

**Verification**:
```bash
cd examples && npm run ts:navigation
```

---

### Task 5.2: JavaScript Navigation Example

**File**: `examples/javascript/04-navigation.js`

**Implementation**: Same as TypeScript without type annotations.

**Verification**:
```bash
cd examples && npm run js:navigation
```

---

### Task 5.3: Navigation Integration Tests

**File**: `test/integration/examples/navigation.test.ts`

**Verification**:
```bash
npm run test:integration -- --grep "Navigation"
```

---

### Task 5.4: Document Navigation Guide

**File**: `docs/guides/navigation.md`

**Verification**:
```bash
cat docs/guides/navigation.md
```

---

## Phase 6: Error Handling Examples (4 tasks)

### Task 6.1: TypeScript Error Handling Example

**File**: `examples/typescript/05-error-handling.ts`

**Implementation**:
```typescript
/**
 * 05 - Error Handling with Ubudu RTLS SDK
 *
 * This example demonstrates:
 * - Error class hierarchy
 * - Catching specific error types
 * - Retry strategies
 * - Validation error handling
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import {
  createRtlsClient,
  RtlsError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  TimeoutError,
  NetworkError,
} from '@ubudu/rtls-sdk';

const NAMESPACE = process.env.APP_NAMESPACE!;
const API_KEY = process.env.RTLS_API_KEY!;

if (!NAMESPACE || !API_KEY) {
  console.error('Missing APP_NAMESPACE or RTLS_API_KEY in .env');
  process.exit(1);
}

console.log('Ubudu RTLS SDK - Error Handling Example\n');
console.log('========================================\n');

// =============================================================================
// Example 1: Error Class Hierarchy
// =============================================================================

function showErrorHierarchy(): void {
  console.log('1. Error Class Hierarchy\n');
  console.log('   RtlsError (base class)');
  console.log('   ├── AuthenticationError (401)');
  console.log('   ├── AuthorizationError (403)');
  console.log('   ├── NotFoundError (404)');
  console.log('   ├── ValidationError (400)');
  console.log('   ├── RateLimitError (429)');
  console.log('   ├── TimeoutError (request timeout)');
  console.log('   └── NetworkError (connection issues)\n');

  console.log('   All errors include:');
  console.log('   - message: string');
  console.log('   - status: number (HTTP status code)');
  console.log('   - response: unknown (raw API response)\n');
}

// =============================================================================
// Example 2: Catching Specific Errors
// =============================================================================

async function catchSpecificErrors(): Promise<void> {
  console.log('2. Catching Specific Error Types\n');

  const client = createRtlsClient({ apiKey: API_KEY });

  // Try to get a non-existent asset
  console.log('   Attempting to get non-existent asset...');

  try {
    await client.assets.get(NAMESPACE, 'NONEXISTENT123456');
    console.log('   Unexpected: Asset was found');
  } catch (error) {
    if (error instanceof NotFoundError) {
      console.log('   Caught NotFoundError (expected)');
      console.log(`   - Status: ${error.status}`);
      console.log(`   - Message: ${error.message}\n`);
    } else if (error instanceof AuthenticationError) {
      console.log('   Caught AuthenticationError');
      console.log('   - Check your API key\n');
    } else if (error instanceof RtlsError) {
      console.log(`   Caught RtlsError: ${error.status}`);
      console.log(`   - Message: ${error.message}\n`);
    } else {
      throw error;
    }
  }
}

// =============================================================================
// Example 3: Authentication Error
// =============================================================================

async function demonstrateAuthError(): Promise<void> {
  console.log('3. Authentication Error (Invalid API Key)\n');

  const badClient = createRtlsClient({ apiKey: 'invalid-key' });

  try {
    await badClient.assets.list(NAMESPACE);
    console.log('   Unexpected: Request succeeded');
  } catch (error) {
    if (error instanceof AuthenticationError) {
      console.log('   Caught AuthenticationError');
      console.log(`   - Status: ${error.status}`);
      console.log('   - Action: Verify API key is correct\n');
    } else if (error instanceof RtlsError) {
      // Some APIs may return different status codes
      console.log(`   Caught RtlsError: ${error.status}`);
      console.log(`   - Message: ${error.message}\n`);
    } else {
      throw error;
    }
  }
}

// =============================================================================
// Example 4: Timeout Handling
// =============================================================================

async function demonstrateTimeout(): Promise<void> {
  console.log('4. Timeout Handling\n');

  // Create client with very short timeout
  const client = createRtlsClient({
    apiKey: API_KEY,
    timeoutMs: 1, // 1ms timeout (will likely timeout)
  });

  console.log('   Making request with 1ms timeout...');

  try {
    await client.assets.list(NAMESPACE);
    console.log('   Request completed (surprisingly fast!)\n');
  } catch (error) {
    if (error instanceof TimeoutError) {
      console.log('   Caught TimeoutError (expected)');
      console.log('   - Action: Increase timeout or retry\n');
    } else if (error instanceof RtlsError) {
      console.log(`   Caught RtlsError: ${error.status}`);
      console.log(`   - Message: ${error.message}\n`);
    } else {
      // Other errors (network, etc.)
      console.log(`   Caught error: ${error}\n`);
    }
  }
}

// =============================================================================
// Example 5: Comprehensive Error Handler
// =============================================================================

async function comprehensiveErrorHandler<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T | null> {
  console.log(`5. Comprehensive Error Handler: ${operationName}\n`);

  try {
    const result = await operation();
    console.log(`   ${operationName} succeeded\n`);
    return result;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      console.log('   ERROR: Authentication failed');
      console.log('   - Verify your API key');
      console.log('   - Check if key has expired');
    } else if (error instanceof AuthorizationError) {
      console.log('   ERROR: Not authorized');
      console.log('   - Check permissions for this resource');
      console.log('   - Verify namespace access');
    } else if (error instanceof NotFoundError) {
      console.log('   ERROR: Resource not found');
      console.log('   - Verify the ID/MAC address exists');
      console.log('   - Check the namespace');
    } else if (error instanceof ValidationError) {
      console.log('   ERROR: Validation failed');
      console.log('   - Check request parameters');
      console.log('   - Verify data format');
    } else if (error instanceof RateLimitError) {
      console.log('   ERROR: Rate limited');
      console.log('   - Wait and retry');
      console.log('   - Implement exponential backoff');
    } else if (error instanceof TimeoutError) {
      console.log('   ERROR: Request timed out');
      console.log('   - Retry with longer timeout');
      console.log('   - Check network connectivity');
    } else if (error instanceof NetworkError) {
      console.log('   ERROR: Network error');
      console.log('   - Check internet connection');
      console.log('   - Verify API endpoint is reachable');
    } else if (error instanceof RtlsError) {
      console.log(`   ERROR: API error (${error.status})`);
      console.log(`   - Message: ${error.message}`);
    } else {
      console.log('   ERROR: Unexpected error');
      console.log(`   - ${error}`);
    }
    console.log();
    return null;
  }
}

// =============================================================================
// Example 6: Retry with Exponential Backoff
// =============================================================================

async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      // Don't retry certain errors
      if (
        error instanceof AuthenticationError ||
        error instanceof AuthorizationError ||
        error instanceof NotFoundError ||
        error instanceof ValidationError
      ) {
        throw error;
      }

      // Retry for transient errors
      if (
        error instanceof RateLimitError ||
        error instanceof TimeoutError ||
        error instanceof NetworkError ||
        (error instanceof RtlsError && error.status >= 500)
      ) {
        if (attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt - 1);
          console.log(`   Attempt ${attempt} failed, retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      }

      throw error;
    }
  }

  throw lastError;
}

async function demonstrateRetry(): Promise<void> {
  console.log('6. Retry with Exponential Backoff\n');

  const client = createRtlsClient({ apiKey: API_KEY });

  console.log('   Demonstrating retry logic (will succeed on first try):\n');

  try {
    const result = await withRetry(
      () => client.assets.list(NAMESPACE),
      3,
      1000
    );
    console.log(`   Success: Got ${result.length} assets\n`);
  } catch (error) {
    console.log(`   Failed after retries: ${error}\n`);
  }
}

// =============================================================================
// Example 7: Type Guards for Error Handling
// =============================================================================

function isRetryableError(error: unknown): boolean {
  return (
    error instanceof RateLimitError ||
    error instanceof TimeoutError ||
    error instanceof NetworkError ||
    (error instanceof RtlsError && error.status >= 500)
  );
}

function isClientError(error: unknown): boolean {
  return (
    error instanceof AuthenticationError ||
    error instanceof AuthorizationError ||
    error instanceof NotFoundError ||
    error instanceof ValidationError
  );
}

function demonstrateTypeGuards(): void {
  console.log('7. Type Guards for Error Classification\n');

  const errors = [
    new AuthenticationError('Invalid key', 401),
    new NotFoundError('Asset not found', 404),
    new RateLimitError('Too many requests', 429),
    new TimeoutError('Request timed out'),
    new RtlsError('Server error', 500),
  ];

  errors.forEach((error) => {
    const retryable = isRetryableError(error);
    const clientError = isClientError(error);
    console.log(`   ${error.constructor.name}:`);
    console.log(`   - Retryable: ${retryable}`);
    console.log(`   - Client error: ${clientError}\n`);
  });
}

// =============================================================================
// Main Execution
// =============================================================================

async function main(): Promise<void> {
  showErrorHierarchy();
  await catchSpecificErrors();
  await demonstrateAuthError();
  await demonstrateTimeout();

  const client = createRtlsClient({ apiKey: API_KEY });
  await comprehensiveErrorHandler(
    () => client.assets.list(NAMESPACE),
    'List Assets'
  );

  await demonstrateRetry();
  demonstrateTypeGuards();

  console.log('========================================');
  console.log('Error handling example completed!');
}

main();
```

**Verification**:
```bash
cd examples && npm run ts:error-handling
```

---

### Task 6.2: JavaScript Error Handling Example

**File**: `examples/javascript/05-error-handling.js`

**Verification**:
```bash
cd examples && npm run js:error-handling
```

---

### Task 6.3: Error Handling Tests

**File**: `test/integration/examples/error-handling.test.ts`

---

### Task 6.4: Document Error Handling Guide

**File**: `docs/guides/error-handling.md`

---

## Phase 7: Pagination & Filtering Examples (4 tasks)

### Task 7.1: TypeScript Pagination/Filtering Example

**File**: `examples/typescript/06-pagination-filtering.ts`

**Implementation**: Demonstrate `iterate()`, `getAll()`, `filters.*`, `combineFilters()`.

---

### Task 7.2: JavaScript Pagination/Filtering Example

**File**: `examples/javascript/06-pagination-filtering.js`

---

### Task 7.3: Pagination/Filtering Tests

**File**: `test/integration/examples/pagination.test.ts`

---

### Task 7.4: Document Advanced Patterns Guide

**File**: `docs/guides/advanced-patterns.md`

---

## Phase 8: TSDoc Documentation (8 tasks)

Add comprehensive TSDoc comments to all public API methods.

### Task 8.1: Document RtlsClient

**File**: `src/client/index.ts`

Add TSDoc comments to:
- `createRtlsClient()`
- `RtlsClient` class
- `RtlsClientOptions` interface
- `health()` method

**Example**:
```typescript
/**
 * Creates a new RTLS API client instance.
 *
 * @param options - Client configuration options
 * @returns Configured RtlsClient instance
 *
 * @example
 * ```typescript
 * const client = createRtlsClient({
 *   apiKey: 'your-api-key',
 *   timeoutMs: 10000,
 * });
 * ```
 *
 * @example
 * ```javascript
 * const client = createRtlsClient({
 *   apiKey: process.env.RTLS_API_KEY,
 * });
 * ```
 */
export function createRtlsClient(options: RtlsClientOptions): RtlsClient {
  // ...
}
```

**Verification**:
```bash
npm run typecheck
```

---

### Task 8.2: Document AssetsResource

**File**: `src/resources/assets.ts`

Document all methods with TSDoc.

---

### Task 8.3: Document PositionsResource

**File**: `src/resources/positions.ts`

---

### Task 8.4: Document ZonesResource

**File**: `src/resources/zones.ts`

---

### Task 8.5: Document VenuesResource

**File**: `src/resources/venues.ts`

---

### Task 8.6: Document SpatialResource

**File**: `src/resources/spatial.ts`

---

### Task 8.7: Document DashboardsResource

**File**: `src/resources/dashboards.ts`

---

### Task 8.8: Document NavigationResource

**File**: `src/resources/navigation.ts`

---

## Phase 9: Guides Documentation (6 tasks)

### Task 9.1: Create Getting Started Guide

**File**: `docs/guides/getting-started.md`

---

### Task 9.2: Complete Asset Tracking Guide

**File**: `docs/guides/asset-tracking.md` (already started in Task 3.4)

---

### Task 9.3: Complete Zone Geofencing Guide

**File**: `docs/guides/zone-geofencing.md`

---

### Task 9.4: Complete Navigation Guide

**File**: `docs/guides/navigation.md`

---

### Task 9.5: Complete Error Handling Guide

**File**: `docs/guides/error-handling.md`

---

### Task 9.6: Complete Advanced Patterns Guide

**File**: `docs/guides/advanced-patterns.md`

---

## Phase 10: README Updates (4 tasks)

### Task 10.1: Update Main README

**File**: `README.md`

Update with:
- Link to examples directory
- Link to guides
- Update Quick Start section
- Add "Examples" section

---

### Task 10.2: Create Documentation Index

**File**: `docs/README.md`

Create index linking all guides and API reference.

---

### Task 10.3: Update CLAUDE.md

**File**: `CLAUDE.md`

Add documentation commands and structure.

---

### Task 10.4: Create API Reference Placeholder

**File**: `docs/api/README.md`

Create placeholder with instructions for generating API docs from TSDoc.

---

## Phase 11: Integration Tests (4 tasks)

### Task 11.1: Create Example Test Runner

**File**: `test/integration/examples/run-examples.test.ts`

Test that all examples run without errors.

---

### Task 11.2: Add Examples to CI

**File**: `.github/workflows/ci.yml` (if exists) or document in README

---

### Task 11.3: Create Test Fixtures

**File**: `test/fixtures/example-data.ts`

Shared test data for examples.

---

### Task 11.4: Verify All Examples

Run all examples and verify output.

**Verification**:
```bash
npm run test:examples
```

---

## Phase 12: Final Verification (4 tasks)

### Task 12.1: Verify TypeScript Examples

```bash
cd examples && npm run ts:all
```

---

### Task 12.2: Verify JavaScript Examples

```bash
cd examples && npm run js:all
```

---

### Task 12.3: Verify Documentation

Check all markdown files render correctly.

---

### Task 12.4: Update Version and CHANGELOG

**File**: `CHANGELOG.md`

Add entry for documentation improvements.

---

## Execution Checklist

- [ ] Phase 1: Examples Infrastructure (4 tasks)
- [ ] Phase 2: Getting Started Examples (4 tasks)
- [ ] Phase 3: Asset Tracking Examples (4 tasks)
- [ ] Phase 4: Zone & Geofencing Examples (4 tasks)
- [ ] Phase 5: Navigation Examples (4 tasks)
- [ ] Phase 6: Error Handling Examples (4 tasks)
- [ ] Phase 7: Pagination & Filtering Examples (4 tasks)
- [ ] Phase 8: TSDoc Documentation (8 tasks)
- [ ] Phase 9: Guides Documentation (6 tasks)
- [ ] Phase 10: README Updates (4 tasks)
- [ ] Phase 11: Integration Tests (4 tasks)
- [ ] Phase 12: Final Verification (4 tasks)

**Total Tasks**: 52

---

## AI Implementation Notes

### Autonomous Execution Guidelines

1. **Execute phases sequentially** - Infrastructure first, then examples, then docs
2. **Verify each example runs** - Test against live API before moving on
3. **TypeScript first, then JavaScript** - TS examples are source of truth
4. **Don't modify existing code** - Only add documentation comments
5. **Use .env from project root** - All examples should use the same credentials

### Key Principles

1. **Testable Examples**: Every example must be runnable with `npm run ts:<name>`
2. **Dual Language**: Every TypeScript example needs a JavaScript equivalent
3. **No Regressions**: Examples are in separate directory, don't affect SDK
4. **Real API Calls**: Examples use live API, verify with integration tests
5. **Progressive Learning**: Examples build on each other (01 → 02 → ...)

### Common Patterns

```typescript
// Standard example header
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

// Validate config
const NAMESPACE = process.env.APP_NAMESPACE!;
const API_KEY = process.env.RTLS_API_KEY!;

if (!NAMESPACE || !API_KEY) {
  console.error('Missing required environment variables');
  process.exit(1);
}
```

### Testing Strategy

1. **Unit**: TSDoc examples compile (typecheck)
2. **Integration**: Examples run against live API
3. **Snapshot**: Example output matches expected format
4. **Regression**: Existing SDK tests still pass

### File Naming Convention

- Examples: `{number}-{kebab-case}.{ts,js}`
- Guides: `{kebab-case}.md`
- Tests: `{example-name}.test.ts`
