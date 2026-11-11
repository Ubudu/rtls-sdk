import { setupServer } from 'msw/node';
import { onTestFinished } from 'vitest';
import { handlers } from './handlers';

export const server = setupServer(...handlers);

/** One request seen by MSW, as a clone taken when it started. Header names are lower-case. */
export interface RecordedRequest {
  method: string;
  url: URL;
  headers: Headers;
  text(): Promise<string>;
  formData(): Promise<FormData>;
}

export interface RequestRecorder {
  /** Requests started since the recorder was created, in order. */
  readonly requests: readonly RecordedRequest[];
  /** Stops recording (also done automatically when the current test finishes). */
  stop(): void;
}

/**
 * The single request-capture helper of the unit suites (CONVENTIONS §1, P1 §8): records every request MSW sees
 * from now until `stop()` or the end of the current test. "No request was sent" is
 * `expect(rec.requests).toHaveLength(0)` on a recorder started before the call. Call it inside a test.
 *
 * @example
 * ```typescript
 * const rec = recordRequests();
 * await client.health();
 * expect(rec.requests[0]?.url.pathname).toBe('/api/health');
 * ```
 */
export function recordRequests(): RequestRecorder {
  const requests: RecordedRequest[] = [];
  let active = true;
  const listener = ({ request }: { request: Request }): void => {
    const copy = request.clone();
    requests.push({
      method: copy.method,
      url: new URL(copy.url),
      headers: copy.headers,
      text: () => copy.text(),
      formData: () => copy.formData(),
    });
  };
  server.events.on('request:start', listener);
  const stop = (): void => {
    if (!active) return;
    active = false;
    server.events.removeListener('request:start', listener);
  };
  onTestFinished(stop);
  return { requests, stop };
}
