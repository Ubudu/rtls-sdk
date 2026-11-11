// Recording fetch of the core live tests (P1 §9): wraps the harness's guarded fetch, counts the calls and keeps, per
// call, the method, the request header NAMES and whether `authorization` starts with `Bearer `. It never keeps a
// header value, a URL or a body, so nothing it records can carry a credential, the namespace or live data.

export interface RecordedCall {
  method: string;
  /** Lowercase header names, sorted. */
  headerNames: string[];
  /** `authorization` is present and starts with `Bearer `. */
  bearer: boolean;
}

export interface RecordingFetch {
  readonly fetch: typeof fetch;
  readonly calls: readonly RecordedCall[];
}

export interface RecordingFetchOptions {
  /** Called once a call rejects (no response), with the number of calls made so far. */
  onReject?: (calls: number) => void;
}

function headersOf(input: RequestInfo | URL, init?: RequestInit): Headers {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
  return headers;
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  return (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
}

/** A fetch that records every call (names only) and then delegates to `inner`. */
export function recordingFetch(
  inner: typeof fetch,
  options: RecordingFetchOptions = {}
): RecordingFetch {
  const calls: RecordedCall[] = [];
  const wrapped: typeof fetch = async (input, init) => {
    const headers = headersOf(input, init);
    const names: string[] = [];
    headers.forEach((_value, name) => names.push(name.toLowerCase()));
    calls.push({
      method: methodOf(input, init),
      headerNames: names.sort(),
      bearer: (headers.get('authorization') ?? '').startsWith('Bearer '),
    });
    try {
      return await inner(input, init);
    } catch (error) {
      options.onReject?.(calls.length);
      throw error;
    }
  };
  return { fetch: wrapped, calls };
}

/** True when both lists hold the same strings (order and duplicates ignored). */
export function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((x) => right.has(x));
}
