// Unit tests of notifications.send and notifications.sendToSelf (P6 §8.1 N1–N10): the real resource through the P1
// transport against MSW; request assertions through recordRequests().
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';
import { fixtureResponse, loadFixture } from '../../contract/fixtures';
import {
  AuthorizationError,
  createRtlsClient,
  RateLimitError,
  ResponseParseError,
  ServerError,
  ValidationError,
  type NotificationItem,
  type NotificationSendRequest,
} from '../../../src';

const ROOT = 'https://rtls.ubudu.com/api/notifications';
const API = `${ROOT}/ns-test`;
const RECIPIENTS: NotificationSendRequest['recipients'] = [{ target_type: 'user', id: 'u1' }];

function newClient(): ReturnType<typeof createRtlsClient> {
  return createRtlsClient({ apiKey: 'k', namespace: 'ns-test' });
}

function only(rec: { requests: readonly RecordedRequest[] }): RecordedRequest {
  expect(rec.requests).toHaveLength(1);
  return rec.requests[0] as RecordedRequest;
}

async function expectSend(r: RecordedRequest, body: unknown, ns = 'ns-test'): Promise<void> {
  expect(r.method).toBe('POST');
  expect(`${r.url.origin}${r.url.pathname}`).toBe(`${ROOT}/${ns}/send`);
  expect(r.url.search).toBe('');
  expect(r.headers.get('x-api-key')).toBe('k');
  expect(r.headers.get('content-type')).toMatch(/^application\/json/);
  expect(JSON.parse(await r.text())).toEqual(body);
}

function expectPolicyGet(r: RecordedRequest, ns = 'ns-test'): void {
  expect(r.method).toBe('GET');
  expect(`${r.url.origin}${r.url.pathname}`).toBe(`${ROOT}/${ns}/cleanup-policy`);
  expect(r.url.search).toBe('');
}

const selfId = (loadFixture('notifications', 'cleanup-policy.default').body as { user_id: string })
  .user_id;

describe('notifications.send', () => {
  it('N1 minimal request → body exactly { recipients, title } (no kind, no source)', async () => {
    const rec = recordRequests();
    await newClient().notifications.send({ recipients: RECIPIENTS, title: 't' });
    await expectSend(only(rec), { recipients: RECIPIENTS, title: 't' });
  });

  it('N2 full request → body mirrors it, mission.due as epoch ms', async () => {
    const rec = recordRequests();
    await newClient().notifications.send({
      recipients: RECIPIENTS,
      kind: 'mission',
      severity: 'warning',
      title: 't',
      body: '**b**',
      params: { zone: 'freezer' },
      channels: ['inapp'],
      conversation_id: 'c1',
      mission_id: 'm1',
      mission: { assignee: 'u1', status: 'open', due: new Date(7000) },
      event_type: 'sdk-test',
    });
    await expectSend(only(rec), {
      recipients: RECIPIENTS,
      kind: 'mission',
      severity: 'warning',
      title: 't',
      body: '**b**',
      params: { zone: 'freezer' },
      channels: ['inapp'],
      conversation_id: 'c1',
      mission_id: 'm1',
      mission: { assignee: 'u1', status: 'open', due: 7000 },
      event_type: 'sdk-test',
    });
  });

  it('N2 undefined keys and unknown keys (source, zone) are not sent', async () => {
    const rec = recordRequests();
    await newClient().notifications.send({
      recipients: RECIPIENTS,
      title: undefined,
      mission: { status: 'open', due: undefined },
      source: 'system',
      zone: { id: 1 },
    } as unknown as NotificationSendRequest);
    await expectSend(only(rec), { recipients: RECIPIENTS, mission: { status: 'open' } });
  });

  it('N3 recipients: [] or a bad request → ValidationError, no request', async () => {
    const notifications = newClient().notifications;
    const rec = recordRequests();
    await expect(notifications.send({ recipients: [] })).rejects.toEqual(
      expect.objectContaining({ status: 0, details: ['recipients'] })
    );
    await expect(notifications.send({} as never)).rejects.toBeInstanceOf(ValidationError);
    await expect(notifications.send(null as never)).rejects.toBeInstanceOf(ValidationError);
    await expect(
      notifications.send({ recipients: RECIPIENTS, mission: { due: 'soon' } })
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      notifications.send({ recipients: RECIPIENTS, mission: 'x' as never })
    ).rejects.toEqual(expect.objectContaining({ details: ['mission'] }));
    expect(rec.requests).toHaveLength(0);
  });

  it('N4 201 array → NotificationItem[] (send.created.json)', async () => {
    const items: NotificationItem[] = await newClient().notifications.send({
      recipients: RECIPIENTS,
    });
    expect(items).toEqual(loadFixture('notifications', 'send.created').body);
    expect(items[0]).not.toHaveProperty('deliveries');
  });

  it('N5 400 no_resolvable_recipients → ValidationError status 400 with apiCode', async () => {
    server.use(
      http.post(`${API}/send`, () =>
        fixtureResponse(loadFixture('notifications', 'error.no-resolvable-recipients'))
      )
    );
    await expect(newClient().notifications.send({ recipients: RECIPIENTS })).rejects.toSatisfy(
      (e) =>
        e instanceof ValidationError && e.status === 400 && e.apiCode === 'no_resolvable_recipients'
    );
  });

  it('N6 403 insufficient_role → AuthorizationError', async () => {
    server.use(
      http.post(`${API}/send`, () =>
        fixtureResponse(loadFixture('notifications', 'error.insufficient-role'))
      )
    );
    await expect(newClient().notifications.send({ recipients: RECIPIENTS })).rejects.toSatisfy(
      (e) => e instanceof AuthorizationError && e.apiCode === 'insufficient_role'
    );
  });

  it('N7 429 rate_limited + Retry-After: 17 → RateLimitError retryAfter 17000', async () => {
    server.use(
      http.post(`${API}/send`, () =>
        fixtureResponse(loadFixture('notifications', 'error.rate-limited'))
      )
    );
    await expect(newClient().notifications.send({ recipients: RECIPIENTS })).rejects.toSatisfy(
      (e) => e instanceof RateLimitError && e.retryAfter === 17000 && e.apiCode === 'rate_limited'
    );
  });

  it('N8 503 with the opt-in retry policy (POST included) → exactly one request', async () => {
    const retrying = createRtlsClient({
      apiKey: 'k',
      namespace: 'ns-test',
      retry: { retries: 3, methods: ['GET', 'POST'], baseDelayMs: 1, maxDelayMs: 1 },
    });
    server.use(
      http.post(`${API}/send`, () => HttpResponse.json({ error: 'unavailable' }, { status: 503 }))
    );
    const rec = recordRequests();
    await expect(retrying.notifications.send({ recipients: RECIPIENTS })).rejects.toBeInstanceOf(
      ServerError
    );
    expect(rec.requests).toHaveLength(1);
  });
});

describe('notifications.sendToSelf', () => {
  it('N9 GET /cleanup-policy then POST /send to the caller; cached per namespace', async () => {
    const notifications = newClient().notifications;
    const rec = recordRequests();
    const item: NotificationItem = await notifications.sendToSelf({ title: 't' });
    expect(rec.requests).toHaveLength(2);
    expectPolicyGet(rec.requests[0]!);
    await expectSend(rec.requests[1]!, {
      recipients: [{ target_type: 'user', id: selfId }],
      title: 't',
    });
    expect(item).toEqual((loadFixture('notifications', 'send.created').body as unknown[])[0]);

    await notifications.sendToSelf({ title: 'again', severity: 'warning' });
    expect(rec.requests).toHaveLength(3);
    await expectSend(rec.requests[2]!, {
      recipients: [{ target_type: 'user', id: selfId }],
      title: 'again',
      severity: 'warning',
    });

    await notifications.sendToSelf({ title: 'o' }, { namespace: 'other' });
    expect(rec.requests).toHaveLength(5);
    expectPolicyGet(rec.requests[3]!, 'other');
    await expectSend(
      rec.requests[4]!,
      { recipients: [{ target_type: 'user', id: selfId }], title: 'o' },
      'other'
    );
  });

  it('N9 a recipients key passed by a JavaScript caller is replaced by self', async () => {
    const rec = recordRequests();
    await newClient().notifications.sendToSelf({
      recipients: [{ target_type: 'user', id: 'someone' }],
    } as never);
    await expectSend(rec.requests[1]!, { recipients: [{ target_type: 'user', id: selfId }] });
  });

  it('N10 a failed cleanup-policy GET is not cached; an empty 201 array → ResponseParseError', async () => {
    const notifications = newClient().notifications;
    server.use(
      http.get(
        `${API}/cleanup-policy`,
        () => fixtureResponse(loadFixture('notifications', 'error.internal')),
        { once: true }
      )
    );
    const rec = recordRequests();
    await expect(notifications.sendToSelf({ title: 't' })).rejects.toBeInstanceOf(ServerError);
    expect(rec.requests).toHaveLength(1);
    await notifications.sendToSelf({ title: 't' });
    expect(rec.requests).toHaveLength(3);
    expectPolicyGet(rec.requests[1]!);

    server.use(http.post(`${API}/send`, () => HttpResponse.json([], { status: 201 })));
    await expect(notifications.sendToSelf({ title: 't' })).rejects.toSatisfy(
      (e) => e instanceof ResponseParseError && e.status === 201
    );
    expect(rec.requests).toHaveLength(4);
  });

  it('a cleanup policy without user_id → ResponseParseError, not cached', async () => {
    const notifications = newClient().notifications;
    server.use(
      http.get(`${API}/cleanup-policy`, () => HttpResponse.json({ app_namespace: 'ns-test' }), {
        once: true,
      })
    );
    const rec = recordRequests();
    await expect(notifications.sendToSelf({})).rejects.toBeInstanceOf(ResponseParseError);
    await notifications.sendToSelf({});
    expect(rec.requests.map((r) => r.method)).toEqual(['GET', 'GET', 'POST']);
  });

  it('an invalid message is refused before any request', async () => {
    const notifications = newClient().notifications;
    const rec = recordRequests();
    await expect(notifications.sendToSelf({ mission: { due: 'never' } })).rejects.toBeInstanceOf(
      ValidationError
    );
    await expect(notifications.sendToSelf(null as never)).rejects.toEqual(
      expect.objectContaining({ details: ['message'] })
    );
    expect(rec.requests).toHaveLength(0);
  });
});
