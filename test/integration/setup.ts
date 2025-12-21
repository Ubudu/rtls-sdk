import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env file
config({ path: resolve(__dirname, '../../.env') });

export const TEST_CONFIG = {
  apiKey: process.env.RTLS_API_KEY,
  namespace: process.env.APP_NAMESPACE,
};

export function hasCredentials(): boolean {
  return Boolean(TEST_CONFIG.apiKey && TEST_CONFIG.namespace);
}

export function skipIfNoCredentials(): void {
  if (!hasCredentials()) {
    console.log('Skipping integration tests: RTLS_API_KEY and APP_NAMESPACE not set in .env');
  }
}
