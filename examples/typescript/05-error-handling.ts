// Write section: tier none; budget positions=0 notifications=0 ble=0 etl=0; read skips none
/**
 * 05 - Error handling
 *
 * Provokes one error of each common class and prints status, code, apiCode and message. The script fails when a
 * case does not raise the class it expects. Read-only: the wrong-credential case uses a dummy key, the network
 * case an unroutable documentation address (RFC 5737), never the configured key. The network case takes about
 * ten seconds.
 *
 *   npm run ts -- typescript/05-error-handling.ts      (from examples/)
 */
import {
  AbortError,
  AuthenticationError,
  ContextError,
  createRtlsClient,
  NetworkError,
  NotFoundError,
  RateLimitError,
  RtlsError,
  ServerError,
  TimeoutError,
  ValidationError,
} from 'ubudu-rtls-sdk';
import { createExampleClient, runExample, unreachableConfig } from '../shared/config.js';

/** One line per error: the class, then the fields worth logging (never request headers or the raw body). */
function describeError(e: unknown): string {
  if (!(e instanceof RtlsError)) return `not an SDK error: ${String(e)}`;
  let kind: string;
  if (e instanceof AuthenticationError) kind = 'credential not accepted';
  else if (e instanceof NotFoundError) kind = 'no such resource';
  else if (e instanceof ValidationError)
    kind = e.status === 0 ? 'rejected before sending' : 'rejected by the server';
  else if (e instanceof ContextError) kind = `missing context (${e.field})`;
  else if (e instanceof TimeoutError) kind = 'no answer in time';
  else if (e instanceof AbortError) kind = 'cancelled by the caller';
  else if (e instanceof NetworkError) kind = 'no response';
  else if (e instanceof RateLimitError)
    kind = `rate limited, retry after ${e.retryAfter ?? '?'} ms`;
  else if (e instanceof ServerError) kind = 'server failure';
  else kind = 'other SDK error';
  return `${e.name} (${kind}): status=${e.status} code=${e.code} apiCode=${e.apiCode ?? '-'} message=${e.message}`;
}

await runExample('05-error-handling', async ({ client, config, log }) => {
  const unexpected: string[] = [];

  /** Runs `call`, prints the error it raises and records a case whose error is not an instance of `expected`. */
  async function expectError(
    label: string,
    expected: new (...args: never[]) => RtlsError,
    call: () => Promise<unknown>
  ): Promise<void> {
    try {
      await call();
      log(`${label}: no error`);
      unexpected.push(`${label}: no error (expected ${expected.name})`);
    } catch (e) {
      log(`${label}: ${describeError(e)}`);
      if (!(e instanceof expected)) unexpected.push(`${label}: expected ${expected.name}`);
    }
  }

  // 1. 401: a dummy key that the configured host does not accept.
  const wrongKey = createExampleClient({ apiKey: unreachableConfig().apiKey });
  await expectError('wrong API key', AuthenticationError, () => wrongKey.venues.list());

  // 2. 404: an asset MAC that does not exist (the server answers with an empty body).
  await expectError('unknown asset', NotFoundError, () => client.assets.get('025d4bfffffe'));

  // 3. 400 from the server: a negative search radius.
  await expectError('invalid radius', ValidationError, () =>
    client.spatial.zonesWithinRadius({ lat: 48.85, lon: 2.35, radiusMeters: -1 })
  );

  // 4. Missing context: no namespace configured, nothing is sent. ContextError is also an RtlsError.
  const noNamespace = createRtlsClient({ apiKey: config.apiKey, baseUrl: config.baseUrl });
  await expectError('no namespace', ContextError, () => noNamespace.assets.list());

  // 5. Per-call timeout of 1 ms.
  await expectError('1 ms timeout', TimeoutError, () => client.venues.list({ timeoutMs: 1 }));

  // 6. A signal that is already aborted: nothing is sent.
  const controller = new AbortController();
  controller.abort();
  await expectError('aborted signal', AbortError, () =>
    client.venues.list({ signal: controller.signal })
  );

  // 7. No response at all: an unroutable address with the dummy key.
  const unreachable = createExampleClient(unreachableConfig());
  await expectError('unreachable host', NetworkError, () => unreachable.venues.list());

  // 8. Opt-in retries: idempotent requests are retried on 429, 502, 503 and 504, honouring Retry-After.
  const retrying = createExampleClient({ retry: true });
  const venues = await retrying.venues.list();
  log(`retry-enabled client: ${venues.length} venue(s)`);

  if (unexpected.length > 0) throw new Error(`unexpected outcomes: ${unexpected.join('; ')}`);
  log('every case raised the expected class');
});
