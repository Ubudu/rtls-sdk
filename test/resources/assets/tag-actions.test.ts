// tagActions.send (P2 §6.2, §8.1): the real request builder against MSW. Every answer comes from server.use();
// request assertions read recordRequests().
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import {
  AbortError,
  AuthenticationError,
  ContextError,
  createRtlsClient,
  PayloadTooLargeError,
  ServerError,
  ServiceUnavailableError,
  ValidationError,
  type RtlsClient,
  type RtlsClientOptions,
} from '../../../src';
import type { TagAction, TagActionType } from '../../../src/types/assets';
import { fixtureResponse, loadFixture } from '../../contract/fixtures';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';

const API = 'https://rtls.test/api';
const ROUTE = `${API}/tag-actions/:ns`;

const client = (options: RtlsClientOptions = {}): RtlsClient =>
  createRtlsClient({ baseUrl: API, apiKey: 'test-api-key', namespace: 'test-ns', ...options });

const fixture = (name: string): Response => fixtureResponse(loadFixture('assets', name));

function only(rec: { requests: readonly RecordedRequest[] }): RecordedRequest {
  expect(rec.requests).toHaveLength(1);
  return rec.requests[0] as RecordedRequest;
}

const OK = {
  message: 'Actions sent successfully',
  tagCount: 2,
  results: [
    { action: 'ptlGreen', success: true, count: 1, statusCode: 200 },
    { action: 'ptlRed', success: true, count: 1, statusCode: 200 },
  ],
  success: true,
};

const ALL_ACTIONS: TagActionType[] = [
  'ptlRed',
  'ptlGreen',
  'ptlBlue',
  'ptlYellow',
  'ptlWhite',
  'ptlCyan',
  'ptlMagenta',
  'ptlAquamarine',
  'uwbBlink',
  'ptlRedUwbBlink',
  'ptlGreenUwbBlink',
];

describe('tagActions.send', () => {
  it('POST /tag-actions/<ns>: JSON body with normalised MACs and duration kept; 200 → typed body', async () => {
    server.use(http.post(ROUTE, () => HttpResponse.json(OK)));
    const rec = recordRequests();
    const result = await client().tagActions.send([
      { macAddress: 'AA:BB:CC:DD:EE:FF', action: 'ptlGreen', duration: 30 },
      { macAddress: '11-22-33-44-55-66', action: 'ptlRed' },
    ]);
    expect(result).toStrictEqual(OK);
    expect(result.results[0]?.statusCode).toBe(200);
    const request = only(rec);
    expect(request.method).toBe('POST');
    expect(request.url.href).toBe(`${API}/tag-actions/test-ns`);
    expect(request.headers.get('content-type')).toBe('application/json');
    expect(request.headers.get('x-api-key')).toBe('test-api-key');
    expect(request.headers.get('authorization')).toBeNull();
    await expect(request.text()).resolves.toBe(
      JSON.stringify([
        { macAddress: 'aabbccddeeff', action: 'ptlGreen', duration: 30 },
        { macAddress: '112233445566', action: 'ptlRed' },
      ])
    );
  });

  it('accepts each of the 11 actions and the duration bounds 1 and 3600', async () => {
    server.use(http.post(ROUTE, () => HttpResponse.json(OK)));
    const rec = recordRequests();
    const actions: TagAction[] = ALL_ACTIONS.map((action, i) => ({
      macAddress: `0000000000${(i + 16).toString(16)}`,
      action,
      ...(i === 0 ? { duration: 1 } : i === 1 ? { duration: 3600 } : {}),
    }));
    await client().tagActions.send(actions);
    const body = JSON.parse(await only(rec).text()) as TagAction[];
    expect(body.map((a) => a.action)).toStrictEqual(ALL_ACTIONS);
  });

  it('[] is sent as [] and resolves the empty answer', async () => {
    server.use(http.post(ROUTE, () => fixture('tag-actions-200-empty')));
    const rec = recordRequests();
    await expect(client().tagActions.send([])).resolves.toStrictEqual({
      message: 'Actions sent successfully',
      tagCount: 0,
      results: [],
      success: true,
    });
    await expect(only(rec).text()).resolves.toBe('[]');
  });

  it.each<[string, unknown]>([
    ['an unknown action', [{ macAddress: 'aabbccddeeff', action: 'ptlPink' }]],
    ['duration 0', [{ macAddress: 'aabbccddeeff', action: 'ptlBlue', duration: 0 }]],
    ['duration 3601', [{ macAddress: 'aabbccddeeff', action: 'ptlBlue', duration: 3601 }]],
    ['duration 1.5', [{ macAddress: 'aabbccddeeff', action: 'ptlBlue', duration: 1.5 }]],
    ['a string duration', [{ macAddress: 'aabbccddeeff', action: 'ptlBlue', duration: '5' }]],
    ['an invalid MAC', [{ macAddress: 'zz', action: 'ptlRed' }]],
    ['a missing MAC', [{ action: 'ptlRed' }]],
    ['a null item', [{ macAddress: 'aabbccddeeff', action: 'ptlRed' }, null]],
    ['an array item', [['aabbccddeeff', 'ptlRed']]],
    ['a non-array', { macAddress: 'aabbccddeeff', action: 'ptlRed' }],
  ])('%s → ValidationError status 0, nothing sent', async (_label, actions) => {
    const rec = recordRequests();
    const call = client().tagActions.send(actions as TagAction[]);
    await expect(call).rejects.toBeInstanceOf(ValidationError);
    await expect(call).rejects.toMatchObject({ status: 0 });
    expect(rec.requests).toHaveLength(0);
  });

  it('the failing item is named in the error details', async () => {
    const call = client().tagActions.send([
      { macAddress: 'aabbccddeeff', action: 'ptlRed' },
      { macAddress: 'aabbccddeeff', action: 'ptlRed', duration: 0 },
    ]);
    await expect(call).rejects.toMatchObject({ details: ['actions[1].duration'] });
  });

  it('500 with per-action results (ESL-only colour on a BLE tag) → resolved with success: false (USI-P2-8)', async () => {
    server.use(http.post(ROUTE, () => fixture('tag-actions-500-esl-only')));
    const result = await client().tagActions.send([
      { macAddress: '025d4b000001', action: 'ptlBlue' },
    ]);
    expect(result.success).toBe(false);
    expect(result.message).toBe('Some actions failed');
    expect(result.results[0]?.statusCode).toBe(400);
    expect(result.results[0]?.error).toContain('ESL-only');
  });

  it('500 { error: "No BLE comms configuration…" } → ServerError with the server message', async () => {
    server.use(http.post(ROUTE, () => fixture('tag-actions-500-no-config')));
    const call = client().tagActions.send([{ macAddress: '025d4b000001', action: 'ptlRed' }]);
    await expect(call).rejects.toBeInstanceOf(ServerError);
    await expect(call).rejects.toMatchObject({
      status: 500,
      message: 'No BLE comms configuration for namespace: test-namespace',
    });
  });

  it('500 with results but no boolean success → ServerError (not resolved)', async () => {
    server.use(
      http.post(ROUTE, () =>
        HttpResponse.json({ message: 'Some actions failed', results: [] }, { status: 500 })
      )
    );
    const call = client().tagActions.send([{ macAddress: '025d4b000001', action: 'ptlRed' }]);
    await expect(call).rejects.toBeInstanceOf(ServerError);
  });

  it('400 { error } → ValidationError status 400 with the server message', async () => {
    server.use(
      http.post(ROUTE, () =>
        HttpResponse.json({ error: 'Request body must be an array' }, { status: 400 })
      )
    );
    const call = client().tagActions.send([{ macAddress: '025d4b000001', action: 'ptlRed' }]);
    await expect(call).rejects.toBeInstanceOf(ValidationError);
    await expect(call).rejects.toMatchObject({
      status: 400,
      message: 'Request body must be an array',
    });
  });

  it('413 HTML page → PayloadTooLargeError', async () => {
    server.use(
      http.post(
        ROUTE,
        () =>
          new HttpResponse(
            '<html><body><pre>PayloadTooLargeError: request entity too large</pre></body></html>',
            {
              status: 413,
              headers: { 'content-type': 'text/html; charset=utf-8' },
            }
          )
      )
    );
    const call = client().tagActions.send([{ macAddress: '025d4b000001', action: 'ptlRed' }]);
    await expect(call).rejects.toBeInstanceOf(PayloadTooLargeError);
  });

  it('401 → AuthenticationError', async () => {
    server.use(
      http.post(ROUTE, () =>
        HttpResponse.json({ error: 'No authentication credentials provided' }, { status: 401 })
      )
    );
    await expect(
      client().tagActions.send([{ macAddress: '025d4b000001', action: 'ptlRed' }])
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('{ namespace } overrides the client default', async () => {
    server.use(http.post(ROUTE, () => HttpResponse.json(OK)));
    const rec = recordRequests();
    await client().tagActions.send([{ macAddress: '025d4b000001', action: 'ptlRed' }], {
      namespace: 'other-ns',
    });
    expect(only(rec).url.pathname).toBe('/api/tag-actions/other-ns');
  });

  it('no namespace → ContextError, nothing sent', async () => {
    const rec = recordRequests();
    await expect(
      createRtlsClient({ baseUrl: API, apiKey: 'test-api-key' }).tagActions.send([
        { macAddress: '025d4b000001', action: 'ptlRed' },
      ])
    ).rejects.toBeInstanceOf(ContextError);
    expect(rec.requests).toHaveLength(0);
  });

  it('a pre-aborted signal → AbortError, nothing sent', async () => {
    server.use(http.post(ROUTE, () => HttpResponse.json(OK)));
    const rec = recordRequests();
    await expect(
      client().tagActions.send([{ macAddress: '025d4b000001', action: 'ptlRed' }], {
        signal: AbortSignal.abort(),
      })
    ).rejects.toBeInstanceOf(AbortError);
    expect(rec.requests).toHaveLength(0);
  });

  it('a 503 is not retried even when the client retries POST (exactly one request)', async () => {
    server.use(http.post(ROUTE, () => HttpResponse.json({}, { status: 503 })));
    const rec = recordRequests();
    const call = client({
      retry: { methods: ['GET', 'POST'], retries: 3, baseDelayMs: 0, maxDelayMs: 0 },
    }).tagActions.send([{ macAddress: '025d4b000001', action: 'ptlRed' }]);
    await expect(call).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(rec.requests).toHaveLength(1);
  });
});
