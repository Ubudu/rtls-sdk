/**
 * Example 07: Default Context
 *
 * Demonstrates how to configure default context at client creation
 * and override it for specific calls.
 */

import { createRtlsClient, ContextError } from '../../src';
import { NAMESPACE, API_KEY } from './config';

async function main() {
  console.log('=== Default Context Example ===\n');

  // ─── 1. Create Client with Default Context ──────────────────────────────────

  console.log('1. Creating client with default context...');

  const client = createRtlsClient({
    apiKey: API_KEY,
    namespace: NAMESPACE,
    // venueId: 123,  // Uncomment if you have a default venue
  });

  console.log(`   Default namespace: ${client.namespace}`);
  console.log(`   Default venueId: ${client.venueId ?? 'not set'}`);
  console.log();

  // ─── 2. Use Default Context ─────────────────────────────────────────────────

  console.log('2. Using default context (no namespace parameter needed)...');

  const assets = await client.assets.list();
  console.log(`   Found ${assets.length} assets\n`);

  // ─── 3. Override Context ────────────────────────────────────────────────────

  console.log('3. Override context for specific call...');

  // This would use a different namespace for just this call
  // const otherAssets = await client.assets.list({ namespace: 'other-ns' });

  console.log('   (Skipped - requires another valid namespace)\n');

  // ─── 4. Runtime Context Changes ─────────────────────────────────────────────

  console.log('4. Change context at runtime...');

  // Chainable setters
  client.setNamespace(NAMESPACE!).setLevel(0);

  console.log(`   Updated namespace: ${client.namespace}`);
  console.log(`   Updated level: ${client.level}`);

  // Set multiple values
  client.setContext({ venueId: 100, mapId: 200 });
  console.log(`   Set venueId: ${client.venueId}, mapId: ${client.mapId}\n`);

  // ─── 5. Scoped Clients ──────────────────────────────────────────────────────

  console.log('5. Create scoped clients (immutable)...');

  // Create a client scoped to a specific venue
  // const venueClient = client.forVenue(456);
  // console.log(`   Scoped client venueId: ${venueClient.venueId}`);
  // console.log(`   Original client venueId: ${client.venueId}`);

  // Create with full context override
  const scopedClient = client.withContext({
    namespace: NAMESPACE,
    venueId: 999,
    level: 2,
  });
  console.log(`   Scoped client: ns=${scopedClient.namespace}, venue=${scopedClient.venueId}, level=${scopedClient.level}`);
  console.log(`   Original unchanged: ns=${client.namespace}, venue=${client.venueId}, level=${client.level}\n`);

  // ─── 6. Error Handling ──────────────────────────────────────────────────────

  console.log('6. ContextError handling...');

  const emptyClient = createRtlsClient({ apiKey: API_KEY });

  try {
    await emptyClient.assets.list();
  } catch (error) {
    if (error instanceof ContextError) {
      console.log(`   ContextError caught!`);
      console.log(`   Field: ${error.field}`);
      console.log(`   Suggestion: ${error.suggestion}`);
    }
  }

  console.log();

  // ─── 7. Legacy Syntax ───────────────────────────────────────────────────────

  console.log('7. Legacy syntax (still works)...');

  const legacyAssets = await client.assets.list(NAMESPACE!);
  console.log(`   Legacy call returned ${legacyAssets.length} assets`);

  console.log('\n=== Done ===');
}

main().catch(console.error);
