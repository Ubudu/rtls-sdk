import { createRtlsClient, RtlsError, NotFoundError, filters } from '@ubudu/rtls-sdk';

const NAMESPACE = process.env.RTLS_NAMESPACE ?? 'demo-namespace';
const API_KEY = process.env.RTLS_API_KEY;

if (!API_KEY) {
  console.error('Please set RTLS_API_KEY environment variable');
  process.exit(1);
}

const rtls = createRtlsClient({
  apiKey: API_KEY,
  timeoutMs: 10000,
});

async function main() {
  console.log('Ubudu RTLS SDK Example\n');

  // Health check
  console.log('1. Checking API health...');
  try {
    const health = await rtls.health();
    console.log('   Status:', health);
  } catch (error) {
    console.error('   Failed:', error);
  }

  // List assets
  console.log('\n2. Listing assets...');
  try {
    const { data: assets, total } = await rtls.assets.list(NAMESPACE, { limit: 10 });
    console.log(`   Found ${total} assets`);
    assets.slice(0, 3).forEach((a) => console.log(`   - ${a.name} (${a.mac_address})`));
  } catch (error) {
    console.error('   Failed:', error);
  }

  // Filter assets
  console.log('\n3. Filtering assets...');
  try {
    const { data } = await rtls.assets.list(NAMESPACE, {
      ...filters.contains('name', 'test'),
      limit: 5,
    });
    console.log(`   Found ${data.length} matching assets`);
  } catch (error) {
    console.error('   Failed:', error);
  }

  // Error handling
  console.log('\n4. Error handling...');
  try {
    await rtls.assets.get(NAMESPACE, 'NONEXISTENT');
  } catch (error) {
    if (error instanceof NotFoundError) {
      console.log('   Caught NotFoundError (expected)');
    } else if (error instanceof RtlsError) {
      console.log(`   Caught RtlsError: ${error.status}`);
    }
  }

  console.log('\nDone!');
}

main().catch(console.error);
