// Unit tests of notifications.bulk and notifications.undo (P6 §8.1 B1–B16): the real resource through the P1 transport
// against MSW; every client guard is checked with "no request made".
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';
import { fixtureResponse, loadFixture } from '../../contract/fixtures';
import {
  createRtlsClient,
  NotFoundError,
  PayloadTooLargeError,
  ServerError,
  ValidationError,
  type NotificationBulkRequest,
  type NotificationBulkResult,
  type NotificationUndoResult,
} from '../../../src';

const API = 'https://rtls.ubudu.com/api/notifications/ns-test';
const A = '665f1c2e9b1d4a0012345601';
const B = '665f1c2e9b1d4a0012345602';
const client = createRtlsClient({ apiKey: 'k', namespace: 'ns-test' });
const notifications = client.notifications;

function only(rec: { requests: readonly RecordedRequest[] }): RecordedRequest {
  expect(rec.requests).toHaveLength(1);
  return rec.requests[0] as RecordedRequest;
}

async function expectPost(r: RecordedRequest, path: string, body: unknown): Promise<void> {
  expect(r.method).toBe('POST');
  expect(`${r.url.origin}${r.url.pathname}`).toBe(`${API}${path}`);
  expect(r.url.search).toBe('');
  expect(r.headers.get('x-api-key')).toBe('k');
  expect(r.headers.get('content-type')).toMatch(/^application\/json/);
  expect(JSON.parse(await r.text())).toEqual(body);
}

async function expectGuard(request: unknown, detail?: string): Promise<void> {
  const rec = recordRequests();
  await expect(notifications.bulk(request as NotificationBulkRequest)).rejects.toSatisfy(
    (e) =>
      e instanceof ValidationError &&
      e.status === 0 &&
      (detail === undefined || (e.details as unknown[])[0] === detail)
  );
  expect(rec.requests).toHaveLength(0);
}

function hexId(n: number): string {
  return n.toString(16).padStart(24, '0');
}

describe('notifications.bulk', () => {
  it('B1 ids → body { ids, action }', async () => {
    const rec = recordRequests();
    const result: NotificationBulkResult = await notifications.bulk({
      ids: [A, B],
      action: 'archive',
    });
    await expectPost(only(rec), '/bulk', { ids: [A, B], action: 'archive' });
    expect(result).toEqual(loadFixture('notifications', 'bulk.result').body);
  });

  it('B2 thread_key → body { thread_key, action }', async () => {
    const rec = recordRequests();
    await notifications.bulk({ thread_key: 'dm:x', action: 'read' });
    await expectPost(only(rec), '/bulk', { thread_key: 'dm:x', action: 'read' });
  });

  it('B3 filter → wire strings in the body', async () => {
    const rec = recordRequests();
    await notifications.bulk({
      filter: { state: 'unread', pinned: true, zone: 3 },
      action: 'read',
    });
    await expectPost(only(rec), '/bulk', {
      filter: { state: 'unread', pinned: 'true', zone: '3' },
      action: 'read',
    });
  });

  it('B4 snooze → snooze_until as epoch ms', async () => {
    const rec = recordRequests();
    await notifications.bulk({ ids: [A], action: 'snooze', snooze_until: new Date(9000) });
    await notifications.bulk({ thread_key: 't', action: 'snooze', snooze_until: '10000' });
    expect(rec.requests).toHaveLength(2);
    await expectPost(rec.requests[0]!, '/bulk', {
      ids: [A],
      action: 'snooze',
      snooze_until: 9000,
    });
    await expectPost(rec.requests[1]!, '/bulk', {
      thread_key: 't',
      action: 'snooze',
      snooze_until: 10000,
    });
  });

  it.each<[string, unknown]>([
    ['{}', {}],
    ['{ pinned: false }', { pinned: false }],
    ['{ state: undefined }', { state: undefined }],
    ["{ state: 'all' }", { state: 'all' }],
    ['{ to: now }', { to: Date.now() }],
    ["{ q: 'severity:bogus' }", { q: 'severity:bogus' }],
    ["{ kind: 'bogus' }", { kind: 'bogus' }],
    ["{ thread_key: '' }", { thread_key: '' }],
    ["{ thread_key: '  ' }", { thread_key: '  ' }],
    ["{ asset: '' }", { asset: '' }],
  ])('B5 filter %s → ValidationError, no request (USI-P6-4)', async (_label, filter) => {
    await expectGuard({ filter, action: 'read' }, undefined);
  });

  it('B5 a selective filter is sent: mark all as read', async () => {
    const rec = recordRequests();
    await notifications.bulk({ filter: { state: 'unread' }, action: 'read' });
    await expectPost(only(rec), '/bulk', { filter: { state: 'unread' }, action: 'read' });
  });

  it('B6 ids: [] → ValidationError, no request', async () => {
    await expectGuard({ ids: [], action: 'read' }, 'ids');
    await expectGuard({ ids: 'abc', action: 'read' }, 'ids');
  });

  it('B7 1000 ids → ValidationError, no request; 999 → sent', async () => {
    const ids = Array.from({ length: 1000 }, (_, i) => hexId(i + 1));
    await expectGuard({ ids, action: 'read' }, 'ids');
    const rec = recordRequests();
    await notifications.bulk({ ids: ids.slice(0, 999), action: 'read' });
    await expectPost(only(rec), '/bulk', { ids: ids.slice(0, 999), action: 'read' });
  });

  it('B8 an id that is not an ObjectId → ValidationError, no request', async () => {
    await expectGuard({ ids: ['zz'], action: 'read' }, 'ids');
    await expectGuard({ ids: [A, 7], action: 'read' }, 'ids');
  });

  it('B9 no selector or two selectors → ValidationError, no request', async () => {
    await expectGuard({ ids: [A], thread_key: 'x', action: 'read' }, 'selection');
    await expectGuard(
      { thread_key: 'x', filter: { state: 'unread' }, action: 'read' },
      'selection'
    );
    await expectGuard({ action: 'read' }, 'selection');
    await expectGuard(null, 'request');
  });

  it('B10 a blank thread_key → ValidationError, no request', async () => {
    await expectGuard({ thread_key: '  ', action: 'read' }, 'thread_key');
    await expectGuard({ thread_key: 3, action: 'read' }, 'thread_key');
  });

  it('B11 snooze without snooze_until, an unknown action → ValidationError, no request', async () => {
    await expectGuard({ ids: [A], action: 'snooze' }, 'snooze_until');
    await expectGuard({ ids: [A], action: 'snooze', snooze_until: 'later' }, 'time');
    await expectGuard({ ids: [A], action: 'nope' }, 'action');
    await expectGuard({ ids: [A] }, 'action');
  });

  it('B11 the guards run in the spec order (selector before action)', async () => {
    await expectGuard({ ids: [], action: 'nope' }, 'ids');
    await expectGuard({ filter: {}, action: 'nope' }, 'filter');
  });

  it('B12 { affected, undo_token } and { affected: 0 } are both typed results', async () => {
    const full: NotificationBulkResult = await notifications.bulk({ ids: [A], action: 'delete' });
    expect(full.affected).toBe(2);
    expect(typeof full.undo_token).toBe('string');
    server.use(
      http.post(`${API}/bulk`, () =>
        fixtureResponse(loadFixture('notifications', 'bulk.result-empty'))
      )
    );
    const empty: NotificationBulkResult = await notifications.bulk({ ids: [A], action: 'pin' });
    expect(empty).toEqual({ affected: 0 });
    expect(empty).not.toHaveProperty('undo_token');
  });

  it('B13 413 too_many_matched → PayloadTooLargeError', async () => {
    server.use(
      http.post(`${API}/bulk`, () =>
        fixtureResponse(loadFixture('notifications', 'error.too-many-matched'))
      )
    );
    await expect(
      notifications.bulk({ filter: { kind: 'alert' }, action: 'archive' })
    ).rejects.toSatisfy(
      (e) =>
        e instanceof PayloadTooLargeError &&
        e.status === 413 &&
        e.apiCode === 'too_many_matched' &&
        e.message === 'bulk selection matches 1000 or more items'
    );
  });

  it('bulk ignores an unknown extra key and a snooze_until on other actions (JS)', async () => {
    const rec = recordRequests();
    await notifications.bulk({
      ids: [A],
      action: 'mute',
      snooze_until: 5,
      source: 'system',
    } as unknown as NotificationBulkRequest);
    await expectPost(only(rec), '/bulk', { ids: [A], action: 'mute' });
  });
});

describe('notifications.undo', () => {
  it('B14 undo(token) → POST /bulk/undo { undo_token }; { restored: 2 }', async () => {
    const rec = recordRequests();
    const result: NotificationUndoResult = await notifications.undo('u');
    await expectPost(only(rec), '/bulk/undo', { undo_token: 'u' });
    expect(result).toEqual({ restored: 2 });
  });

  it('B15 404 undo_unavailable → NotFoundError; 501 → ServerError', async () => {
    server.use(
      http.post(`${API}/bulk/undo`, () =>
        fixtureResponse(loadFixture('notifications', 'error.undo-unavailable'))
      )
    );
    await expect(notifications.undo('u')).rejects.toSatisfy(
      (e) => e instanceof NotFoundError && e.apiCode === 'undo_unavailable'
    );
    server.use(
      http.post(`${API}/bulk/undo`, () =>
        fixtureResponse(loadFixture('notifications', 'error.not-implemented'))
      )
    );
    await expect(notifications.undo('u')).rejects.toSatisfy(
      (e) => e instanceof ServerError && e.status === 501 && e.apiCode === 'not_implemented'
    );
  });

  it('B16 undo("") → ValidationError, no request', async () => {
    const rec = recordRequests();
    await expect(notifications.undo('')).rejects.toEqual(
      expect.objectContaining({ status: 0, details: ['undoToken'] })
    );
    await expect(notifications.undo(undefined as never)).rejects.toBeInstanceOf(ValidationError);
    expect(rec.requests).toHaveLength(0);
  });

  it('a 500 on bulk is a ServerError', async () => {
    server.use(
      http.post(`${API}/bulk`, () =>
        HttpResponse.json({ error: 'internal_error' }, { status: 500 })
      )
    );
    await expect(notifications.bulk({ ids: [A], action: 'read' })).rejects.toBeInstanceOf(
      ServerError
    );
  });
});
