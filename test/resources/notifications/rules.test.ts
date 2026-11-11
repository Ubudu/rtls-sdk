// Unit tests of client.notifications.rules (P6 §8.1 R1–R8): the real resource through the P1 transport against MSW.
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';
import { loadFixture } from '../../contract/fixtures';
import {
  createRtlsClient,
  NotFoundError,
  ValidationError,
  type NotificationRule,
  type NotificationRuleInput,
} from '../../../src';

const API = 'https://rtls.ubudu.com/api/notifications/ns-test';
const ID = '65a000000000000000000001';
const client = createRtlsClient({ apiKey: 'k', namespace: 'ns-test' });
const rules = client.notifications.rules;

function only(rec: { requests: readonly RecordedRequest[] }): RecordedRequest {
  expect(rec.requests).toHaveLength(1);
  return rec.requests[0] as RecordedRequest;
}

async function expectJsonBody(r: RecordedRequest, body: unknown): Promise<void> {
  expect(r.headers.get('content-type')).toMatch(/^application\/json/);
  expect(JSON.parse(await r.text())).toEqual(body);
}

async function expectNoBody(r: RecordedRequest): Promise<void> {
  expect(r.headers.get('content-type')).toBeNull();
  expect(await r.text()).toBe('');
}

function expectRequest(r: RecordedRequest, method: string, path: string): void {
  expect(r.method).toBe(method);
  expect(`${r.url.origin}${r.url.pathname}`).toBe(`${API}${path}`);
  expect(r.url.search).toBe('');
  expect(r.headers.get('x-api-key')).toBe('k');
}

describe('notifications.rules', () => {
  it('R1 list() → GET /rules, the fixture typed NotificationRule[]', async () => {
    const rec = recordRequests();
    const list: NotificationRule[] = await rules.list();
    const r = only(rec);
    expectRequest(r, 'GET', '/rules');
    await expectNoBody(r);
    expect(list).toEqual(loadFixture('notifications', 'rules.list').body);
    expect(list[0]?.enabled).toBe(false);
  });

  it('R2 get(id) → GET /rules/<id>; 404 → NotFoundError', async () => {
    const rec = recordRequests();
    const rule = await rules.get(ID);
    expectRequest(only(rec), 'GET', `/rules/${ID}`);
    expect(rule).toEqual(loadFixture('notifications', 'rule').body);

    server.use(
      http.get(`${API}/rules/:id`, () => HttpResponse.json({ error: 'not_found' }, { status: 404 }))
    );
    const missing = rules.get('65a0000000000000000000ff');
    await expect(missing).rejects.toBeInstanceOf(NotFoundError);
    await expect(missing).rejects.toMatchObject({ status: 404, apiCode: 'not_found' });
  });

  it('R3 create(input) → POST /rules with the input as body; 201 typed', async () => {
    const input: NotificationRuleInput = {
      enabled: false,
      name: 'n',
      match: { kinds: ['alert'], event_types: ['e'] },
      channels: ['inapp'],
      throttle: { coalesce_seconds: 60 },
    };
    const rec = recordRequests();
    const created: NotificationRule = await rules.create(input);
    const r = only(rec);
    expectRequest(r, 'POST', '/rules');
    await expectJsonBody(r, input);
    expect(created).toEqual(loadFixture('notifications', 'rule.created').body);
  });

  it('R4 create without a boolean enabled → ValidationError, no request', async () => {
    const rec = recordRequests();
    await expect(rules.create({ name: 'n' } as never)).rejects.toMatchObject({
      name: 'ValidationError',
      status: 0,
      details: ['enabled'],
    });
    await expect(rules.create({ name: 'n', enabled: 'false' } as never)).rejects.toBeInstanceOf(
      ValidationError
    );
    await expect(rules.create(null as never)).rejects.toBeInstanceOf(ValidationError);
    expect(rec.requests).toHaveLength(0);
  });

  it('R5 update(id, patch) → PATCH /rules/<id> with exactly the patch', async () => {
    const rec = recordRequests();
    const updated = await rules.update(ID, { name: 'm' });
    const r = only(rec);
    expectRequest(r, 'PATCH', `/rules/${ID}`);
    await expectJsonBody(r, { name: 'm' });
    expect(updated).toEqual(loadFixture('notifications', 'rule.updated').body);
  });

  it('R6 400 bad_request → ValidationError with the server message', async () => {
    server.use(
      http.patch(`${API}/rules/:id`, () =>
        HttpResponse.json(
          { error: 'bad_request', message: 'channels has an invalid value' },
          { status: 400 }
        )
      )
    );
    const p = rules.update(ID, { channels: ['pager' as never] });
    await expect(p).rejects.toBeInstanceOf(ValidationError);
    await expect(p).rejects.toMatchObject({
      status: 400,
      apiCode: 'bad_request',
      message: 'channels has an invalid value',
    });
  });

  it('R7 delete(id) → DELETE /rules/<id>, 204 resolves undefined', async () => {
    const rec = recordRequests();
    await expect(rules.delete(ID)).resolves.toBeUndefined();
    const r = only(rec);
    expectRequest(r, 'DELETE', `/rules/${ID}`);
    await expectNoBody(r);
  });

  it('R8 get/update/delete refuse an id that is not an ObjectId, no request', async () => {
    const rec = recordRequests();
    for (const bad of ['not-an-id', '', 'stream', `${ID}0`, ID.slice(1)]) {
      await expect(rules.get(bad)).rejects.toMatchObject({ status: 0, details: ['id'] });
      await expect(rules.update(bad, {})).rejects.toBeInstanceOf(ValidationError);
      await expect(rules.delete(bad)).rejects.toBeInstanceOf(ValidationError);
    }
    expect(rec.requests).toHaveLength(0);
  });
});
