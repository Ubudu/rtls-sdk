// Unit tests of client.notifications.cleanupPolicy (P6 §8.1 P1–P5).
import { describe, it, expect } from 'vitest';
import { http } from 'msw';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';
import { fixtureResponse, loadFixture } from '../../contract/fixtures';
import { createRtlsClient, ValidationError, type NotificationCleanupPolicy } from '../../../src';

const API = 'https://rtls.ubudu.com/api/notifications/ns-test';
const client = createRtlsClient({ apiKey: 'k', namespace: 'ns-test' });
const policy = client.notifications.cleanupPolicy;

function only(rec: { requests: readonly RecordedRequest[] }): RecordedRequest {
  expect(rec.requests).toHaveLength(1);
  return rec.requests[0] as RecordedRequest;
}

describe('notifications.cleanupPolicy', () => {
  it('P1 get() → GET /cleanup-policy; the defaults have no _id', async () => {
    server.use(
      http.get(`${API}/cleanup-policy`, () =>
        fixtureResponse(loadFixture('notifications', 'cleanup-policy.default'))
      )
    );
    const rec = recordRequests();
    const value: NotificationCleanupPolicy = await policy.get();
    const r = only(rec);
    expect(r.method).toBe('GET');
    expect(`${r.url.origin}${r.url.pathname}`).toBe(`${API}/cleanup-policy`);
    expect(r.url.search).toBe('');
    expect(r.headers.get('x-api-key')).toBe('k');
    expect(value).toEqual(loadFixture('notifications', 'cleanup-policy.default').body);
    expect(value).toMatchObject({ auto_archive_days: 30, auto_purge_days: 180 });
    expect(value).not.toHaveProperty('_id');
  });

  it('P2 get() returns a stored row with _id and updated_at', async () => {
    server.use(
      http.get(`${API}/cleanup-policy`, () =>
        fixtureResponse(loadFixture('notifications', 'cleanup-policy.stored'))
      )
    );
    const value = await policy.get();
    expect(value).toEqual(loadFixture('notifications', 'cleanup-policy.stored').body);
    expect(typeof value._id).toBe('string');
    expect(typeof value.updated_at).toBe('number');
  });

  it('P3/P5 replace(policy) → PUT /cleanup-policy with exactly both fields; the stored row typed', async () => {
    const rec = recordRequests();
    const value: NotificationCleanupPolicy = await policy.replace({
      auto_archive_days: 20,
      auto_purge_days: 90,
      extra: true,
    } as never);
    const r = only(rec);
    expect(r.method).toBe('PUT');
    expect(`${r.url.origin}${r.url.pathname}`).toBe(`${API}/cleanup-policy`);
    expect(r.headers.get('content-type')).toMatch(/^application\/json/);
    expect(JSON.parse(await r.text())).toEqual({ auto_archive_days: 20, auto_purge_days: 90 });
    expect(value).toEqual(loadFixture('notifications', 'cleanup-policy.replaced').body);
  });

  it('P4 replace with 0, -1, 1.5, a string or a missing field → ValidationError, no request', async () => {
    const rec = recordRequests();
    for (const bad of [
      { auto_archive_days: 0, auto_purge_days: 90 },
      { auto_archive_days: 20, auto_purge_days: -1 },
      { auto_archive_days: 1.5, auto_purge_days: 90 },
      { auto_archive_days: '20', auto_purge_days: 90 },
      { auto_archive_days: 20 },
      { auto_purge_days: 90 },
      null,
    ]) {
      await expect(policy.replace(bad as never)).rejects.toBeInstanceOf(ValidationError);
    }
    await expect(
      policy.replace({ auto_archive_days: 20, auto_purge_days: Number.NaN })
    ).rejects.toMatchObject({ status: 0, details: ['auto_purge_days'] });
    expect(rec.requests).toHaveLength(0);
  });
});
