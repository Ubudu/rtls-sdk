// Unit tests of client.notifications.savedViews (P6 §8.1 V1–V6).
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';
import { loadFixture } from '../../contract/fixtures';
import {
  createRtlsClient,
  NotFoundError,
  ValidationError,
  type NotificationSavedView,
} from '../../../src';

const API = 'https://rtls.ubudu.com/api/notifications/ns-test';
const ID = '65c000000000000000000001';
const client = createRtlsClient({ apiKey: 'k', namespace: 'ns-test' });
const views = client.notifications.savedViews;

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

async function expectJsonBody(r: RecordedRequest, body: unknown): Promise<void> {
  expect(r.headers.get('content-type')).toMatch(/^application\/json/);
  expect(JSON.parse(await r.text())).toEqual(body);
}

describe('notifications.savedViews', () => {
  it('V1 list() → GET /saved-views typed NotificationSavedView[]', async () => {
    const rec = recordRequests();
    const list: NotificationSavedView[] = await views.list();
    const r = only(rec);
    expectRequest(r, 'GET', '/saved-views');
    expect(await r.text()).toBe('');
    expect(list).toEqual(loadFixture('notifications', 'saved-views.list').body);
  });

  it('V2 get(id) → GET /saved-views/<id>; 404 → NotFoundError', async () => {
    const rec = recordRequests();
    const view = await views.get(ID);
    expectRequest(only(rec), 'GET', `/saved-views/${ID}`);
    expect(view).toEqual(loadFixture('notifications', 'saved-view').body);

    server.use(
      http.get(`${API}/saved-views/:id`, () =>
        HttpResponse.json({ error: 'not_found' }, { status: 404 })
      )
    );
    await expect(views.get(ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('V3 create stores from/to as epoch ms and the other keys as given', async () => {
    const rec = recordRequests();
    const created = await views.create({
      name: 'v',
      query: {
        state: 'unread',
        from: new Date(1000),
        to: '1970-01-01T00:00:02Z',
        group_by: 'zone',
      },
    });
    const r = only(rec);
    expectRequest(r, 'POST', '/saved-views');
    await expectJsonBody(r, {
      name: 'v',
      query: { state: 'unread', from: 1000, to: 2000, group_by: 'zone' },
    });
    expect(created).toEqual(loadFixture('notifications', 'saved-view.created').body);
  });

  it('V4 create without a query sends query {}; 400 name is required → ValidationError', async () => {
    const rec = recordRequests();
    await views.create({ name: 'v' });
    await expectJsonBody(only(rec), { name: 'v', query: {} });

    server.use(
      http.post(`${API}/saved-views`, () =>
        HttpResponse.json({ error: 'bad_request', message: 'name is required' }, { status: 400 })
      )
    );
    const p = views.create({ name: 'v' });
    await expect(p).rejects.toBeInstanceOf(ValidationError);
    await expect(p).rejects.toMatchObject({ status: 400, message: 'name is required' });
  });

  it('V5 delete(id) → DELETE /saved-views/<id>, 204 → undefined; ObjectId guard', async () => {
    const rec = recordRequests();
    await expect(views.delete(ID)).resolves.toBeUndefined();
    const r = only(rec);
    expectRequest(r, 'DELETE', `/saved-views/${ID}`);
    expect(await r.text()).toBe('');

    const none = recordRequests();
    for (const bad of ['not-an-id', '', 'export']) {
      await expect(views.get(bad)).rejects.toMatchObject({ status: 0, details: ['id'] });
      await expect(views.delete(bad)).rejects.toBeInstanceOf(ValidationError);
    }
    expect(none.requests).toHaveLength(0);
  });

  it('V6 a blank, empty or non-string name, a non-object query or a bad from → ValidationError, no request', async () => {
    const rec = recordRequests();
    await expect(views.create({ name: '   ' })).rejects.toMatchObject({
      status: 0,
      details: ['name'],
    });
    await expect(views.create({ name: '' })).rejects.toBeInstanceOf(ValidationError);
    await expect(views.create({ name: 3 } as never)).rejects.toBeInstanceOf(ValidationError);
    await expect(views.create(undefined as never)).rejects.toBeInstanceOf(ValidationError);
    await expect(views.create({ name: 'v', query: 'state=unread' } as never)).rejects.toMatchObject(
      { status: 0, details: ['query'] }
    );
    await expect(views.create({ name: 'v', query: { from: 'not a date' } })).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(rec.requests).toHaveLength(0);
  });
});
