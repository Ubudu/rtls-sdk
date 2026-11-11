// Unit tests of client.notifications.connections (P6 §8.1 C1–C9).
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';
import { fixtureResponse, loadFixture } from '../../contract/fixtures';
import {
  createRtlsClient,
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
  type NotificationConnection,
  type NotificationConnectionTestResult,
} from '../../../src';

const API = 'https://rtls.ubudu.com/api/notifications/ns-test';
const ID = '65b000000000000000000003';
const client = createRtlsClient({ apiKey: 'k', namespace: 'ns-test' });
const connections = client.notifications.connections;

function only(rec: { requests: readonly RecordedRequest[] }): RecordedRequest {
  expect(rec.requests).toHaveLength(1);
  return rec.requests[0] as RecordedRequest;
}

function expectRequest(r: RecordedRequest, method: string, path: string): void {
  expect(r.method).toBe(method);
  expect(`${r.url.origin}${r.url.pathname}`).toBe(`${API}${path}`);
  expect(r.url.search).toBe('');
  expect(r.headers.get('x-api-key')).toBe('k');
}

async function expectNoBody(r: RecordedRequest): Promise<void> {
  expect(r.headers.get('content-type')).toBeNull();
  expect(await r.text()).toBe('');
}

function answerTest(status: number, body: Record<string, unknown>): void {
  server.use(http.post(`${API}/connections/:id/test`, () => HttpResponse.json(body, { status })));
}

describe('notifications.connections', () => {
  it('C1 list() → GET /connections; the slack entry carries a redacted bot_token', async () => {
    const rec = recordRequests();
    const list: NotificationConnection[] = await connections.list();
    const r = only(rec);
    expectRequest(r, 'GET', '/connections');
    await expectNoBody(r);
    expect(list).toEqual(loadFixture('notifications', 'connections.list').body);
    const slack = list.find((c) => c.channel === 'slack');
    expect(slack?.credentials.bot_token).toEqual({ set: true, fingerprint: 'f' });
  });

  it('C2 get(id) → GET /connections/<id>; 404 → NotFoundError', async () => {
    const rec = recordRequests();
    const connection = await connections.get(ID);
    expectRequest(only(rec), 'GET', `/connections/${ID}`);
    expect(connection).toEqual(loadFixture('notifications', 'connection.get').body);

    server.use(
      http.get(`${API}/connections/:id`, () =>
        HttpResponse.json({ error: 'not_found' }, { status: 404 })
      )
    );
    await expect(connections.get(ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('C3 upsert(input) → POST /connections with the input as body', async () => {
    const rec = recordRequests();
    server.use(
      http.post(`${API}/connections`, () =>
        fixtureResponse(loadFixture('notifications', 'connection.inapp'))
      )
    );
    const inapp = await connections.upsert({ channel: 'inapp' });
    expect(inapp).toEqual(loadFixture('notifications', 'connection.inapp').body);

    server.use(
      http.post(`${API}/connections`, () =>
        fixtureResponse(loadFixture('notifications', 'connection.email-empty'))
      )
    );
    const email = await connections.upsert({
      channel: 'email',
      credentials: { address: 'addr-1' },
    });
    expect(email.verified).toBe(false);

    expect(rec.requests).toHaveLength(2);
    const [first, second] = rec.requests as RecordedRequest[];
    for (const r of [first, second] as RecordedRequest[]) {
      expectRequest(r, 'POST', '/connections');
      expect(r.headers.get('content-type')).toMatch(/^application\/json/);
    }
    expect(JSON.parse(await (first as RecordedRequest).text())).toEqual({ channel: 'inapp' });
    expect(JSON.parse(await (second as RecordedRequest).text())).toEqual({
      channel: 'email',
      credentials: { address: 'addr-1' },
    });
  });

  it('C3 the slack fixture types the redacted secret', async () => {
    server.use(
      http.post(`${API}/connections`, () =>
        fixtureResponse(loadFixture('notifications', 'connection.slack-redacted'))
      )
    );
    const slack = await connections.upsert({
      channel: 'slack',
      credentials: { webhook_url: 'https://hooks.example.invalid/x', bot_token: 's' },
    });
    expect(slack.credentials.bot_token).toEqual({ set: true, fingerprint: 'f' });
  });

  it('C4 400 ssrf_blocked → ValidationError with apiCode', async () => {
    server.use(
      http.post(`${API}/connections`, () =>
        HttpResponse.json(
          { error: 'ssrf_blocked', message: 'outbound URL rejected' },
          { status: 400 }
        )
      )
    );
    const p = connections.upsert({
      channel: 'teams',
      credentials: { workflow_url: 'http://127.0.0.1/' },
    });
    await expect(p).rejects.toBeInstanceOf(ValidationError);
    await expect(p).rejects.toMatchObject({
      status: 400,
      apiCode: 'ssrf_blocked',
      message: 'outbound URL rejected',
    });
  });

  it('C5 test(id) 200 → the verified result; POST /connections/<id>/test without a body', async () => {
    const rec = recordRequests();
    const result: NotificationConnectionTestResult = await connections.test(ID);
    const r = only(rec);
    expectRequest(r, 'POST', `/connections/${ID}/test`);
    await expectNoBody(r);
    expect(result).toEqual(loadFixture('notifications', 'connection.test-ok').body);
    expect(result).toMatchObject({
      verified: true,
      delivery: { channel: 'inapp', status: 'sent' },
    });
  });

  it('C6 test(id) 422 with a test result body resolves with it', async () => {
    server.use(
      http.post(`${API}/connections/:id/test`, () =>
        fixtureResponse(loadFixture('notifications', 'connection.test-422'))
      )
    );
    const result = await connections.test(ID);
    expect(result).toEqual({
      verified: false,
      delivery: { channel: 'email', status: 'skipped', error: 'not_connected', ts: 1730000001000 },
    });
  });

  it('C7 test(id) 422 without a test result body is rethrown as ValidationError', async () => {
    answerTest(422, { error: 'x' });
    const p = connections.test(ID);
    await expect(p).rejects.toBeInstanceOf(ValidationError);
    await expect(p).rejects.toMatchObject({ status: 422 });

    answerTest(422, { verified: 'no', delivery: {} });
    await expect(connections.test(ID)).rejects.toMatchObject({ status: 422 });
    answerTest(422, { verified: false, delivery: null });
    await expect(connections.test(ID)).rejects.toMatchObject({ status: 422 });
    server.use(
      http.post(`${API}/connections/:id/test`, () => new HttpResponse(null, { status: 422 }))
    );
    await expect(connections.test(ID)).rejects.toBeInstanceOf(ValidationError);
  });

  it('C8 test(id) 404 → NotFoundError; 503 router_unavailable → ServiceUnavailableError', async () => {
    answerTest(404, { error: 'not_found' });
    await expect(connections.test(ID)).rejects.toBeInstanceOf(NotFoundError);
    answerTest(503, { error: 'router_unavailable' });
    const p = connections.test(ID);
    await expect(p).rejects.toBeInstanceOf(ServiceUnavailableError);
    await expect(p).rejects.toMatchObject({ status: 503, apiCode: 'router_unavailable' });
  });

  it('C9 delete(id) → DELETE /connections/<id>, 204 → undefined', async () => {
    const rec = recordRequests();
    await expect(connections.delete(ID)).resolves.toBeUndefined();
    const r = only(rec);
    expectRequest(r, 'DELETE', `/connections/${ID}`);
    await expectNoBody(r);
  });

  it('C9 get/test/delete refuse an id that is not an ObjectId, no request', async () => {
    const rec = recordRequests();
    for (const bad of ['not-an-id', '', 'facets', 3 as never]) {
      await expect(connections.get(bad)).rejects.toMatchObject({ status: 0, details: ['id'] });
      await expect(connections.test(bad)).rejects.toBeInstanceOf(ValidationError);
      await expect(connections.delete(bad)).rejects.toBeInstanceOf(ValidationError);
    }
    expect(rec.requests).toHaveLength(0);
  });
});
