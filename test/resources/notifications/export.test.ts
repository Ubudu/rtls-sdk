// Unit tests of notifications.export (P6 §8.1 E1–E4; E5 is a type test in test/types/notifications.test-d.ts): the real
// resource through the P1 transport against MSW.
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';
import { loadFixture } from '../../contract/fixtures';
import { createRtlsClient, ValidationError, type NotificationItem } from '../../../src';

const API = 'https://rtls.ubudu.com/api/notifications/ns-test';
const HEADER =
  '_id,created_at,kind,severity,title,read,acknowledged,archived,thread_key,zone_name,asset_name';
const client = createRtlsClient({ apiKey: 'k', namespace: 'ns-test' });
const notifications = client.notifications;

function only(rec: { requests: readonly RecordedRequest[] }): RecordedRequest {
  expect(rec.requests).toHaveLength(1);
  return rec.requests[0] as RecordedRequest;
}

function expectExport(r: RecordedRequest, query: Record<string, string>): void {
  expect(r.method).toBe('GET');
  expect(`${r.url.origin}${r.url.pathname}`).toBe(`${API}/export`);
  const actual: Record<string, string> = {};
  let count = 0;
  r.url.searchParams.forEach((value, key) => {
    actual[key] = value;
    count += 1;
  });
  expect(Object.keys(actual)).toHaveLength(count);
  expect(actual).toEqual(query);
  expect(r.headers.get('x-api-key')).toBe('k');
  expect(r.headers.get('content-type')).toBeNull();
}

describe('notifications.export', () => {
  it('E1 csv → GET /export?format=csv&state=all; the CSV text as a string', async () => {
    const rec = recordRequests();
    const csv: string = await notifications.export({ format: 'csv', state: 'all' });
    expectExport(only(rec), { format: 'csv', state: 'all' });
    expect(typeof csv).toBe('string');
    expect(csv.split('\n')[0]).toBe(HEADER);
    expect(csv).toBe(loadFixture('notifications', 'export.csv').text);
  });

  it('E2 export() → format=json; NotificationItem[]', async () => {
    const rec = recordRequests();
    const items: NotificationItem[] = await notifications.export();
    expectExport(only(rec), { format: 'json' });
    expect(items).toEqual(loadFixture('notifications', 'export.json.json').body);
  });

  it('E3 json with filters → format=json&thread_key=dm%3Ax&zone=4', async () => {
    const rec = recordRequests();
    await notifications.export({ format: 'json', thread_key: 'dm:x', zone: 4 });
    const r = only(rec);
    expectExport(r, { format: 'json', thread_key: 'dm:x', zone: '4' });
    expect(r.url.search).toContain('thread_key=dm%3Ax');
  });

  it('E4 a quoted CSV field with a comma and a newline is returned verbatim', async () => {
    const text = `${HEADER}\na1,1,direct_message,info,"x, y\nz ""q""",false,false,false,dm:a,,`;
    server.use(
      http.get(
        `${API}/export`,
        () => new HttpResponse(text, { headers: { 'Content-Type': 'text/csv; charset=utf-8' } })
      )
    );
    await expect(notifications.export({ format: 'csv' })).resolves.toBe(text);
    const fixture = await notifications.export({ format: 'csv' }, { namespace: 'ns-test' });
    expect(fixture).toBe(text);
  });

  it('E4 the CSV is read as text even when the server labels it JSON', async () => {
    server.use(
      http.get(
        `${API}/export`,
        () => new HttpResponse(HEADER, { headers: { 'Content-Type': 'application/json' } })
      )
    );
    await expect(notifications.export({ format: 'csv' })).resolves.toBe(HEADER);
  });

  it('a format other than csv/json or a bad filter → ValidationError, no request', async () => {
    const rec = recordRequests();
    await expect(notifications.export({ format: 'xml' } as never)).rejects.toEqual(
      expect.objectContaining({ status: 0, details: ['format'] })
    );
    await expect(notifications.export({ kind: 'nope' } as never)).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(rec.requests).toHaveLength(0);
  });
});
