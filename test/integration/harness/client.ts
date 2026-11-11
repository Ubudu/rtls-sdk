// Live SDK clients (P0 §6.2 client.ts). `createLiveClient` builds the SDK client of the run with the guarded
// fetch; `createUnreachableClient` builds one whose base URL is unreachable and whose key is the dummy key
// (LIVE-TESTING §6): the configured key or token is never attached, so the request passes G1 and fails with a
// network error (default target: the RFC 5737 address, within Node's 10 s connect timeout; 'refused' fails
// at once).
import { createRtlsClient, type RtlsClient, type RtlsClientOptions } from '../../../src';
import { activeHarness } from './active';
import { guardedFetch } from './guard';
import { DUMMY_API_KEY, UNREACHABLE_BASE_URLS, type UnreachableTarget } from './policy';

export function createLiveClient(
  overrides: Omit<Partial<RtlsClientOptions>, 'namespace'> & { namespace?: string | null } = {}
): RtlsClient {
  const h = activeHarness();
  const { namespace, ...rest } = overrides;
  const ns = namespace === null ? undefined : (namespace ?? h.env.namespace);
  return createRtlsClient({
    apiKey: h.env.apiKey,
    baseUrl: h.env.baseUrl,
    ...(ns !== undefined ? { namespace: ns } : {}),
    fetch: guardedFetch,
    ...rest,
  });
}

export function createUnreachableClient(
  options: { target?: UnreachableTarget } & Omit<
    Partial<RtlsClientOptions>,
    'baseUrl' | 'apiKey' | 'accessToken'
  > = {}
): RtlsClient {
  const { target, ...rest } = options;
  // `retry`, `timeoutMs`, `fetch` (a wrapper of guardedFetch) and the other options pass through.
  return createLiveClient({
    ...rest,
    baseUrl: UNREACHABLE_BASE_URLS[target ?? 'blackhole'],
    apiKey: DUMMY_API_KEY,
    accessToken: undefined,
  });
}
