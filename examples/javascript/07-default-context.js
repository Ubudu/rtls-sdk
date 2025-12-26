/**
 * 07 - Default Context with Ubudu RTLS SDK
 *
 * This example covers:
 * - Setting default namespace/venueId at client creation
 * - Changing context at runtime
 * - Creating scoped clients
 * - ContextError handling
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import { createRtlsClient, ContextError } from '@ubudu/rtls-sdk';

// =============================================================================
// Configuration
// =============================================================================

const NAMESPACE = process.env.APP_NAMESPACE;
const API_KEY = process.env.RTLS_API_KEY;

if (!NAMESPACE || !API_KEY) {
  console.error('Missing APP_NAMESPACE or RTLS_API_KEY in .env');
  process.exit(1);
}

console.log('Ubudu RTLS SDK - Default Context\n');

// =============================================================================
// 1. Create Client with Defaults
// =============================================================================

async function createWithDefaults() {
  console.log('1. Create Client with Defaults...');

  // Set namespace once - all calls use it automatically
  const client = createRtlsClient({
    apiKey: API_KEY,
    namespace: NAMESPACE,
  });

  console.log(`   namespace: ${client.namespace}`);
  console.log(`   venueId: ${client.venueId ?? 'not set'}`);

  return client;
}

// =============================================================================
// 2. Use Default Context
// =============================================================================

async function useDefaults(client) {
  console.log('\n2. Use Default Context...');

  // No namespace needed in these calls
  const assets = await client.assets.list();
  console.log(`   assets.list() → ${assets.length}`);

  const positions = await client.positions.listCached();
  console.log(`   positions.listCached() → ${positions.length}`);

  const venues = await client.venues.list();
  console.log(`   venues.list() → ${venues.length}`);

  return venues;
}

// =============================================================================
// 3. Set Venue at Runtime
// =============================================================================

async function setVenueRuntime(client, venues) {
  console.log('\n3. Set Venue at Runtime...');

  if (venues.length === 0) {
    console.log('   No venues available');
    return;
  }

  client.setVenue(venues[0].id);
  console.log(`   setVenue(${venues[0].id})`);

  // Now venue-scoped calls work without parameters
  const zones = await client.zones.list();
  console.log(`   zones.list() → ${zones.features.length} zones`);
}

// =============================================================================
// 4. Chainable Setters
// =============================================================================

function chainableSetters(client) {
  console.log('\n4. Chainable Setters...');

  client.setNamespace(NAMESPACE).setLevel(0);
  console.log(`   setNamespace().setLevel(0)`);
  console.log(`   level: ${client.level}`);
}

// =============================================================================
// 5. Scoped Clients
// =============================================================================

function scopedClients(client) {
  console.log('\n5. Scoped Clients (Immutable)...');

  // Create new client with different venue
  const scoped = client.withContext({
    namespace: NAMESPACE,
    venueId: 999,
    level: 2,
  });

  console.log(`   Original venueId: ${client.venueId}`);
  console.log(`   Scoped venueId: ${scoped.venueId}`);
}

// =============================================================================
// 6. ContextError Handling
// =============================================================================

async function contextErrorHandling() {
  console.log('\n6. ContextError Handling...');

  // Client without namespace
  const emptyClient = createRtlsClient({ apiKey: API_KEY });

  try {
    await emptyClient.assets.list();
    console.log('   Unexpected success');
  } catch (error) {
    if (error instanceof ContextError) {
      console.log(`   Caught: ${error.field} required`);
      console.log(`   Fix: ${error.suggestion}`);
    }
  }
}

// =============================================================================
// 7. Override for Specific Calls
// =============================================================================

async function overrideExample(client) {
  console.log('\n7. Override for Specific Calls...');

  // Override namespace for one call
  const assets = await client.assets.list({ namespace: NAMESPACE });
  console.log(`   list({ namespace: '...' }) → ${assets.length}`);
}

// =============================================================================
// 8. Practical Workflow
// =============================================================================

async function practicalWorkflow() {
  console.log('\n8. Practical Workflow...');

  // Step 1: Create client with namespace
  const client = createRtlsClient({
    apiKey: API_KEY,
    namespace: NAMESPACE,
  });
  console.log('   Created client with namespace');

  // Step 2: Discover and set venue
  const venues = await client.venues.list();
  if (venues.length > 0) {
    client.setVenue(venues[0].id);
    console.log(`   Set venue: ${venues[0].name}`);

    // Step 3: Clean API calls
    const zones = await client.zones.list();
    console.log(`   zones.list() → ${zones.features.length} zones`);
  }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  try {
    const client = await createWithDefaults();
    const venues = await useDefaults(client);
    await setVenueRuntime(client, venues);
    chainableSetters(client);
    scopedClients(client);
    await contextErrorHandling();
    await overrideExample(client);
    await practicalWorkflow();

    console.log('\nDone!');
  } catch (error) {
    console.error('Failed:', error.message);
    process.exit(1);
  }
}

main();
