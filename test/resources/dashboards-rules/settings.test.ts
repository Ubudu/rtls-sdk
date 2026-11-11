// client.settings.get and the deprecated client.getSettings delegate against MSW (P5 §8.1 S1–S3).
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';
import { fixtureResponse, loadFixture } from '../../contract/fixtures';
import {
  AuthenticationError,
  ContextError,
  createRtlsClient,
  ServerError,
  type NamespaceSettings,
  type RtlsClient,
} from '../../../src';

const SETTINGS_URL = 'https://rtls.ubudu.com/api/settings/:ns';
const client = (): RtlsClient => createRtlsClient({ apiKey: 'test-key', namespace: 'test-ns' });
const bare = (): RtlsClient => createRtlsClient({ apiKey: 'test-key' });
const fixture = () => loadFixture('dashboards-rules', 'settings');

function serve(): void {
  server.use(http.get(SETTINGS_URL, () => fixtureResponse(fixture())));
}

const described = (r: RecordedRequest) => [
  r.method,
  r.url.pathname,
  r.url.search,
  r.headers.get('x-api-key'),
];

describe('settings.get (S1)', () => {
  it('GET /settings/{ns} with the default namespace; typed result keeps unknown keys (tagActions)', async () => {
    serve();
    const rec = recordRequests();
    const settings: NamespaceSettings = await client().settings.get();
    expect(described(rec.requests[0] as RecordedRequest)).toStrictEqual([
      'GET',
      '/api/settings/test-ns',
      '',
      'test-key',
    ]);
    expect(settings).toStrictEqual(fixture().body);
    expect(settings.positionsExpirationPeriod).toBe(60);
    expect(settings.accuracy).toStrictEqual({ accuracy_meter: 5, show: false });
    expect(settings.tagActions?.uwbBlink).toBe(false);
    expect(settings.tagActions?.bleComms).toStrictEqual({ ptlRed: true });
  });

  it('options.namespace and request options', async () => {
    serve();
    const rec = recordRequests();
    await client().settings.get({ namespace: 'other', headers: { 'X-Trace': '1' } });
    expect(rec.requests[0]?.url.pathname).toBe('/api/settings/other');
    expect(rec.requests[0]?.headers.get('x-trace')).toBe('1');
  });

  it('no namespace → ContextError, no request', async () => {
    const rec = recordRequests();
    await expect(bare().settings.get()).rejects.toBeInstanceOf(ContextError);
    expect(rec.requests).toHaveLength(0);
  });
});

describe('client.getSettings (S2, deprecated delegate)', () => {
  it('getSettings(), getSettings("ns"), getSettings({ namespace }) send the request of settings.get', async () => {
    serve();
    const rec = recordRequests();
    await client().settings.get();
    const viaDelegate = await client().getSettings();
    await client().getSettings('ns');
    await client().getSettings({ namespace: 'ns' });
    await client().settings.get({ namespace: 'ns' });
    const all = rec.requests.map((r) => described(r));
    expect(all[1]).toStrictEqual(all[0]);
    expect(all[2]).toStrictEqual(all[4]);
    expect(all[3]).toStrictEqual(all[4]);
    expect(all[4]).toStrictEqual(['GET', '/api/settings/ns', '', 'test-key']);
    expect(viaDelegate).toStrictEqual(fixture().body);
  });

  it('getSettings() without any namespace → ContextError, no request', async () => {
    const rec = recordRequests();
    await expect(bare().getSettings()).rejects.toBeInstanceOf(ContextError);
    expect(rec.requests).toHaveLength(0);
  });
});

describe('settings errors (S3)', () => {
  it('401 → AuthenticationError; 500 → ServerError', async () => {
    server.use(
      http.get(SETTINGS_URL, () =>
        HttpResponse.json({ error: 'No authentication credentials provided' }, { status: 401 })
      )
    );
    await expect(client().settings.get()).rejects.toSatisfy(
      (e) =>
        e instanceof AuthenticationError &&
        e.status === 401 &&
        e.message === 'No authentication credentials provided'
    );
    server.use(
      http.get(
        SETTINGS_URL,
        () => new Response(new TextEncoder().encode('Redis error: x'), { status: 500 })
      )
    );
    await expect(client().getSettings()).rejects.toSatisfy(
      (e) => e instanceof ServerError && e.status === 500 && e.message.includes('Redis error')
    );
  });
});
