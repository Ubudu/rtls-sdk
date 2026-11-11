// Shared set-up of the harness unit tests (P0 §8.1): MSW at https://rtls.test/api, namespace `test-ns`, a
// temporary state folder per context, hand-made live-shaped bodies (no recorded data, no real identifiers).
// Nothing here reads the real `.env`.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { setActiveHarness } from './active';
import {
  blockStorage,
  createHarnessContext,
  type ConfigGate,
  type Harness,
  type LiveBlockRuntime,
} from './context';
import { makeLiveEnv, type Tier } from './env';
import type { DomainKey, PreflightVerdicts } from './policy';

export const TEST_BASE_URL = 'https://rtls.test/api';
export const TEST_NS = 'test-ns';
/** Stand-in for the configured key (not a real credential). */
export const TEST_KEY = 'unit-test-configured-key';
export const TEST_RUN_ID = '3fa9c0de';
export const RUN_PREFIX = `sdk-test-${TEST_RUN_ID}-`;
export const SELF_USER = 'self-user-1';
/** A test MAC of this run and one outside the range. */
export const TEST_MAC = '025d4b3fa901';
export const FOREIGN_MAC = 'aabbccddeeff';

export const SAFE_PREFLIGHT: PreflightVerdicts = {
  ruleEngineSafe: true,
  positionSafe: true,
  declaredPositionSafe: true,
  linkedNamespaceSafe: true,
  linkedCount: 0,
  blocking: [],
};

export function tempDir(label: string): string {
  return mkdtempSync(join(tmpdir(), `rtls-harness-${label}-`));
}

export interface TestHarness {
  h: Harness;
  /** requests that reached the underlying fetch */
  calls: Request[];
  stateDir: string;
  mainStateDir: string;
}

export interface MakeHarnessOptions {
  tiers?: Partial<Record<Tier, boolean>>;
  mode?: 'integration' | 'example';
  exampleWrite?: boolean;
  preflight?: PreflightVerdicts | null;
  features?: Partial<Record<'notifications' | 'etl', boolean>>;
  apiKey?: string;
  baseUrl?: string;
  /** keep the bucket's real setTimeout sleep (rate tests); default: no waiting */
  realSleep?: boolean;
  fetchImpl?: typeof fetch;
  configGate?: ConfigGate;
  stateDir?: string;
  mainStateDir?: string;
  allowlistDir?: string;
  fixturesDir?: string;
}

/** Creates a context on a temp folder, installs it as the active harness and records underlying calls. */
export function makeHarness(options: MakeHarnessOptions = {}): TestHarness {
  const root = tempDir('ctx');
  const stateDir = options.stateDir ?? join(root, 'run');
  const mainStateDir = options.mainStateDir ?? join(root, 'main');
  const calls: Request[] = [];
  const env = makeLiveEnv({
    apiKey: options.apiKey ?? TEST_KEY,
    namespace: TEST_NS,
    baseUrl: options.baseUrl ?? TEST_BASE_URL,
    tiers: { R: true, W: false, C: false, S: false, ...options.tiers },
  });
  const underlying = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  const h = createHarnessContext({
    env,
    runId: TEST_RUN_ID,
    stateDir,
    mainStateDir,
    mode: options.mode,
    exampleWrite: options.exampleWrite,
    preflight: options.preflight === undefined ? SAFE_PREFLIGHT : options.preflight,
    features: options.features,
    configGate: options.configGate,
    allowlistDir: options.allowlistDir ?? join(root, 'allowlist'),
    fixturesDir: options.fixturesDir ?? join(root, 'fixtures'),
    ...(options.realSleep ? {} : { sleep: async () => undefined }),
    fetchImpl: async (input, init) => {
      const request = new Request(input, init);
      calls.push(request.clone());
      return underlying(request);
    },
  });
  setActiveHarness(h);
  return { h, calls, stateDir, mainStateDir };
}

/** Runs `fn` as if inside a describeLive block of `tier` (domain `harness` unless given). */
export async function inBlock<T>(
  h: Harness,
  tier: Tier,
  fn: () => Promise<T>,
  domain: DomainKey | null = 'harness'
): Promise<T> {
  const block: LiveBlockRuntime = {
    id: `t-${tier}-${h.blocks.length}`,
    tier,
    name: 'unit',
    domain,
  };
  h.blocks.push(block);
  try {
    return await blockStorage.run(block, fn);
  } finally {
    h.blocks.splice(h.blocks.lastIndexOf(block), 1);
  }
}

/** Default MSW answers for rtls.test and the unreachable origins (no request leaves the process). */
export function useDefaultApi(): void {
  const answer = ({ request }: { request: Request }): Response => {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/cleanup-policy') && request.method === 'GET') {
      return HttpResponse.json({
        app_namespace: TEST_NS,
        user_id: SELF_USER,
        auto_archive_days: 30,
      });
    }
    if (url.pathname.endsWith('/send'))
      return HttpResponse.json([{ _id: 'sent-item-1' }], { status: 201 });
    if (url.pathname.endsWith('/health')) return HttpResponse.json({ status: 'OK' });
    if (request.method === 'GET') return HttpResponse.json([]);
    return HttpResponse.json({ _id: 'created-id-1' }, { status: 201 });
  };
  server.use(
    http.all(`${TEST_BASE_URL}/*`, answer),
    http.all('http://192.0.2.1/*', answer),
    http.all('http://127.0.0.1:9/*', answer),
    http.all('https://rtls.invalid/*', answer)
  );
}

export function apiUrl(path: string): string {
  return `${TEST_BASE_URL}${path.replaceAll('{ns}', TEST_NS)}`;
}

export function jsonInit(method: string, body: unknown, key: string = TEST_KEY): RequestInit {
  return {
    method,
    headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export function getInit(key: string = TEST_KEY): RequestInit {
  return { method: 'GET', headers: { 'X-API-Key': key } };
}
