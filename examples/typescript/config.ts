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
