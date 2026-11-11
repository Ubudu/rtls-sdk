// Core live tests L-E1…L-E10 and L-E13 (P1 §9): the error mapping, abort, timeout and network failure against
// production, tier R. Every request is a GET except L-E13's one oversize read-only POST, which the server's body
// parser rejects with 413 before any handler runs. Assertions compare classes, statuses, booleans and lengths;
// observations go to report.json.facts (recordFact), never a response value.
import {
  AbortError,
  AuthenticationError,
  NetworkError,
  NotFoundError,
  PayloadTooLargeError,
  RtlsError,
  TimeoutError,
  ValidationError,
} from '../../../src';
import {
  createLiveClient,
  createUnreachableClient,
  describeLive,
  getHarness,
  guardedFetch,
  recordFact,
  requestLog,
  testMac,
  testName,
} from '../harness';
import { recordingFetch } from './support/recording-fetch';
import { rejectionOf } from './support/rejection';
import { auditReadOnlyRequests } from './support/request-audit';

describeLive('R', 'core errors', () => {
  auditReadOnlyRequests();

  it('L-E1 a wrong API key gets AuthenticationError 401 with the server message (U2)', async () => {
    const client = createLiveClient({ apiKey: testName('invalid-key') });
    const error = await rejectionOf(client.getSettings());
    expect(error).toBeInstanceOf(AuthenticationError);
    const err = error as AuthenticationError;
    const body = err.body as { error?: unknown } | undefined;
    expect(err.status).toBe(401);
    expect(err.code).toBe('AUTHENTICATION_ERROR');
    expect(typeof body?.error === 'string' && body.error.length > 0).toBe(true);
    expect(err.message === body?.error).toBe(true);
    expect(RtlsError.is(err)).toBe(true);
    expect(err.isStatus(401)).toBe(true);
    expect(err.isClientError()).toBe(true);
    expect(err.isServerError()).toBe(false);
    recordFact(
      'U2.wrongKey401IsFailedToAuthenticateUser',
      err.message === 'Failed to authenticate user'
    );
    recordFact('U2.wrongKey401HasApiCode', err.apiCode !== undefined);
  });

  it('L-E2 an id that is not an ObjectId gets ValidationError 400 "Invalid dashboard ID" (U3)', async () => {
    const client = createLiveClient();
    const error = await rejectionOf(
      client.transport.request<unknown>('GET', '/dashboards/{id}', {
        params: { id: testName('not-an-id') },
      })
    );
    expect(error).toBeInstanceOf(ValidationError);
    const err = error as ValidationError;
    expect(err.status).toBe(400);
    expect(err.message).toBe('Invalid dashboard ID');
    expect(err.apiCode).toBeUndefined();
    recordFact(
      'U3.invalidDashboardIdIs400',
      err.status === 400 && err.message === 'Invalid dashboard ID'
    );
  });

  it('L-E3 an unknown ObjectId gets NotFoundError 404 "Dashboard not found"', async () => {
    const client = createLiveClient();
    const error = await rejectionOf(
      client.transport.request<unknown>('GET', '/dashboards/{id}', {
        params: { id: '0'.repeat(24) },
      })
    );
    expect(error).toBeInstanceOf(NotFoundError);
    const err = error as NotFoundError;
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Dashboard not found');
  });

  it('L-E4 an unknown asset gets NotFoundError 404 with an empty body and the fallback message', async () => {
    const client = createLiveClient();
    const error = await rejectionOf(
      client.transport.request<unknown>('GET', '/assets/{app_namespace}/{mac_address}', {
        params: { app_namespace: getHarness().env.namespace, mac_address: testMac(240) },
      })
    );
    expect(error).toBeInstanceOf(NotFoundError);
    const err = error as NotFoundError;
    expect(err.status).toBe(404);
    expect(err.message.startsWith('HTTP 404')).toBe(true);
    expect(err.body).toBeUndefined();
    expect(err.apiCode).toBeUndefined();
  });

  it('L-E5 timeoutMs: 1 ends the call with TimeoutError, not AbortError', async () => {
    const error = await rejectionOf(createLiveClient().getSettings({ timeoutMs: 1 }));
    expect(error).toBeInstanceOf(TimeoutError);
    expect(error).not.toBeInstanceOf(AbortError);
    const err = error as TimeoutError;
    expect(err.timeoutMs).toBe(1);
    expect(err.status).toBe(0);
    expect(err.code).toBe('TIMEOUT');
  });

  it('L-E6 a pre-aborted signal gets AbortError and sends nothing', async () => {
    const rec = recordingFetch(guardedFetch);
    const client = createLiveClient({ fetch: rec.fetch });
    const error = await rejectionOf(client.getSettings({ signal: AbortSignal.abort() }));
    expect(error).toBeInstanceOf(AbortError);
    expect((error as AbortError).status).toBe(0);
    expect(rec.calls).toHaveLength(0);
    expect(requestLog()).toHaveLength(0);
  });

  it('L-E7 aborting right after the start gets AbortError with the reason as cause', async () => {
    const controller = new AbortController();
    const pending = createLiveClient().getSettings({ signal: controller.signal });
    controller.abort(new Error('sdk-test-cancel'));
    const error = await rejectionOf(pending);
    expect(error).toBeInstanceOf(AbortError);
    const err = error as AbortError;
    expect(err.code).toBe('ABORTED');
    expect(err.cause).toBeInstanceOf(Error);
    expect((err.cause as Error).message).toBe('sdk-test-cancel');
  });

  it('L-E8 an unreachable base URL gets NetworkError before the SDK timer', async () => {
    const rec = recordingFetch(guardedFetch);
    const client = createUnreachableClient({ fetch: rec.fetch });
    const error = await rejectionOf(client.health());
    // A TimeoutError here would mean the address does not fail before the client timeout: a P0 defect (O14).
    expect(error).toBeInstanceOf(NetworkError);
    const err = error as NetworkError;
    expect(err.status).toBe(0);
    expect(err.code).toBe('NETWORK_ERROR');
    expect(err.cause).toBeInstanceOf(Error);
    expect(err.networkCause).toBe(err.cause);
    expect(rec.calls).toHaveLength(1);
  }, 45_000);

  it('L-E9 the retry policy retries a network failure of a GET once', async () => {
    const rec = recordingFetch(guardedFetch);
    const client = createUnreachableClient({
      fetch: rec.fetch,
      retry: { retries: 1, baseDelayMs: 1, maxDelayMs: 1 },
    });
    const error = await rejectionOf(client.health());
    expect(error).toBeInstanceOf(NetworkError);
    expect(rec.calls).toHaveLength(2);
  }, 90_000);

  it('L-E10 an abort during the retry backoff ends the call with AbortError after one attempt', async () => {
    const controller = new AbortController();
    const rec = recordingFetch(guardedFetch, { onReject: () => controller.abort() });
    const client = createUnreachableClient({
      fetch: rec.fetch,
      retry: { retries: 1, baseDelayMs: 5000, maxDelayMs: 5000 },
    });
    const error = await rejectionOf(client.health({ signal: controller.signal }));
    expect(error).toBeInstanceOf(AbortError);
    expect(rec.calls).toHaveLength(1);
  }, 45_000);

  it('L-E13 an oversize JSON body gets PayloadTooLargeError 413 from the HTML page', async () => {
    const namespace = getHarness().env.namespace;
    const features: unknown[] = [];
    const body = {
      reference_point: { lat: 0, lon: 0 },
      custom_zones: { type: 'FeatureCollection', features },
    };
    for (let i = 0; JSON.stringify(body).length < 105_000; i += 1) {
      const d = 0.0001 * (i + 1);
      features.push({
        type: 'Feature',
        properties: { name: testName(`pad-${i}`) },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [d, d],
              [d, d + 0.0001],
              [d + 0.0001, d + 0.0001],
              [d + 0.0001, d],
              [d, d],
            ],
          ],
        },
      });
    }
    const size = JSON.stringify(body).length;
    expect(size >= 105_000 && size <= 120_000).toBe(true);

    const client = createLiveClient();
    const error = await rejectionOf(
      client.transport.request<unknown>('POST', '/spatial/zones/{namespace}/analyze-custom', {
        params: { namespace },
        body,
      })
    );
    expect(error).toBeInstanceOf(PayloadTooLargeError);
    const err = error as PayloadTooLargeError;
    expect(err.status).toBe(413);
    expect(err.code).toBe('PAYLOAD_TOO_LARGE');
    expect(err.message.length > 0 && !/[<>\r\n]/.test(err.message)).toBe(true);
    expect(typeof err.body).toBe('string');
    const page = err.body as string;
    const log = requestLog();
    expect(log.map((e) => `${e.method} ${e.template} ${e.status}`)).toEqual([
      'POST /spatial/zones/{namespace}/analyze-custom 413',
    ]);
    recordFact('L-E13.requestBodyLength', size);
    recordFact('L-E13.contentType', log[0]?.responseHeaders?.['content-type'] ?? null);
    recordFact('L-E13.pageIsHtml', page.trimStart().startsWith('<'));
    recordFact('L-E13.pageHasPre', page.includes('<pre>'));
    recordFact('L-E13.messageIsPayloadTooLarge', err.message.startsWith('PayloadTooLargeError'));
  });
});
