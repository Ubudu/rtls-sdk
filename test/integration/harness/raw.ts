// Raw authenticated request through the guarded fetch (P0 §6.2 raw.ts; P2, P5 H-P0-1). `{ns}` in the path is
// replaced by the run's namespace. The configured key is attached; the guard applies every rule.
import { activeHarness } from './active';
import { guardedFetch } from './guard';

export interface RawResponse {
  status: number;
  headers: Headers;
  /** parsed JSON body, or undefined when the body is empty or not JSON */
  json: unknown;
  text: string;
}

export async function rawRequest(
  method: string,
  path: string,
  init: {
    query?: Record<string, string | number | boolean>;
    body?: unknown;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  } = {}
): Promise<RawResponse> {
  const h = activeHarness();
  const expanded = path.replaceAll('{ns}', encodeURIComponent(h.env.namespace));
  const url = new URL(`${h.env.baseUrl}${expanded.startsWith('/') ? '' : '/'}${expanded}`);
  for (const [key, value] of Object.entries(init.query ?? {}))
    url.searchParams.set(key, String(value));
  const headers: Record<string, string> = {
    'X-API-Key': h.env.apiKey,
    Accept: 'application/json',
    ...init.headers,
  };
  let body: BodyInit | undefined;
  if (init.body !== undefined) {
    if (
      typeof init.body === 'string' ||
      init.body instanceof FormData ||
      init.body instanceof Blob
    ) {
      body = init.body;
    } else {
      body = JSON.stringify(init.body);
      headers['Content-Type'] ??= 'application/json';
    }
  }
  const response = await guardedFetch(url, {
    method: method.toUpperCase(),
    headers,
    body,
    signal: init.signal,
  });
  const text = await response.text();
  let json: unknown;
  try {
    json = text === '' ? undefined : JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: response.status, headers: response.headers, json, text };
}
