// Unit tests of client.notifications.admin (P6 §8.1 A1–A11).
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';
import { fixtureResponse, loadFixture } from '../../contract/fixtures';
import {
  AuthorizationError,
  createRtlsClient,
  NotFoundError,
  ValidationError,
  type NotificationRecipientMapping,
  type NotificationRedactedSecret,
  type NotificationTenantConfig,
} from '../../../src';

const API = 'https://rtls.ubudu.com/api/notifications/ns-test';
const client = createRtlsClient({ apiKey: 'k', namespace: 'ns-test' });
const { tenantConfig, recipientMappings } = client.notifications.admin;

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

function serveRedacted(): void {
  server.use(
    http.get(`${API}/tenant-config`, () =>
      fixtureResponse(loadFixture('notifications', 'tenant-config.redacted'))
    )
  );
}

describe('notifications.admin.tenantConfig', () => {
  it('A1 get() → GET /tenant-config; nothing stored = { app_namespace }', async () => {
    const rec = recordRequests();
    server.use(
      http.get(`${API}/tenant-config`, () =>
        fixtureResponse(loadFixture('notifications', 'tenant-config.empty'))
      )
    );
    const config: NotificationTenantConfig = await tenantConfig.get();
    const r = only(rec);
    expectRequest(r, 'GET', '/tenant-config');
    expect(await r.text()).toBe('');
    expect(config).toEqual({ app_namespace: 'ns-test' });
  });

  it('A2 the redacted fixture: all five secret paths are NotificationRedactedSecret', async () => {
    serveRedacted();
    const config = await tenantConfig.get();
    const secrets = [
      config.email?.auth?.pass,
      config.slack?.bot_token,
      config.telegram?.bot_token,
      config.teams?.azure_app?.client_secret,
      config.whatsapp?.cloud_api?.access_token,
    ];
    expect(secrets).toHaveLength(5);
    for (const secret of secrets) {
      expect(secret).toEqual({ set: true, fingerprint: expect.any(String) as string });
      expect((secret as NotificationRedactedSecret).set).toBe(true);
    }
  });

  it('A3 update(patch) → PUT /tenant-config with exactly the patch', async () => {
    const rec = recordRequests();
    const updated = await tenantConfig.update({
      slack: { bot_token: 's' },
      cleanup_cap: { max_archive_days: 60 },
    });
    const r = only(rec);
    expectRequest(r, 'PUT', '/tenant-config');
    await expectJsonBody(r, { slack: { bot_token: 's' }, cleanup_cap: { max_archive_days: 60 } });
    expect(updated).toEqual(loadFixture('notifications', 'tenant-config.updated').body);
  });

  it('A4 update({ ...fetched }) strips app_namespace, _id, updated_at and __v', async () => {
    serveRedacted();
    const fetched = await tenantConfig.get();
    const rec = recordRequests();
    await tenantConfig.update({ ...fetched });
    const sent = JSON.parse(await only(rec).text()) as Record<string, unknown>;
    for (const key of ['app_namespace', '_id', 'updated_at', '__v']) {
      expect(sent).not.toHaveProperty(key);
    }
    const { app_namespace: _ns, _id, updated_at: _u, __v: _v, ...rest } = fetched;
    expect(sent).toEqual(rest);
  });

  it('A5 403 insufficient_role and namespace_access_denied → AuthorizationError with apiCode', async () => {
    server.use(
      http.get(`${API}/tenant-config`, () =>
        HttpResponse.json(
          { error: 'insufficient_role', message: 'manage_api_keys required' },
          { status: 403 }
        )
      )
    );
    const p = tenantConfig.get();
    await expect(p).rejects.toBeInstanceOf(AuthorizationError);
    await expect(p).rejects.toMatchObject({ status: 403, apiCode: 'insufficient_role' });

    server.use(
      http.put(`${API}/tenant-config`, () =>
        HttpResponse.json({ error: 'namespace_access_denied' }, { status: 403 })
      )
    );
    const q = tenantConfig.update({ cleanup_cap: { max_purge_days: 365 } });
    await expect(q).rejects.toBeInstanceOf(AuthorizationError);
    await expect(q).rejects.toMatchObject({ apiCode: 'namespace_access_denied' });
  });

  it('A11 an empty patch, a patch of stripped keys only, or a non-object → ValidationError, no request', async () => {
    const rec = recordRequests();
    await expect(tenantConfig.update({})).rejects.toMatchObject({
      name: 'ValidationError',
      status: 0,
      details: ['patch'],
    });
    await expect(
      tenantConfig.update({ app_namespace: 'x', _id: 'y', updated_at: 1, __v: 0 } as never)
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(tenantConfig.update({ slack: undefined })).rejects.toBeInstanceOf(ValidationError);
    await expect(tenantConfig.update(null as never)).rejects.toBeInstanceOf(ValidationError);
    await expect(tenantConfig.update([] as never)).rejects.toBeInstanceOf(ValidationError);
    await expect(tenantConfig.update(new Map() as never)).rejects.toBeInstanceOf(ValidationError);
    expect(rec.requests).toHaveLength(0);
  });
});

describe('notifications.admin.recipientMappings', () => {
  it('A6 list() → GET /recipient-mappings, [] typed', async () => {
    const rec = recordRequests();
    const list: NotificationRecipientMapping[] = await recipientMappings.list();
    expectRequest(only(rec), 'GET', '/recipient-mappings');
    expect(list).toEqual([]);
  });

  it('A7 create(input) → POST /recipient-mappings with the input as body; 201 entry', async () => {
    const input = {
      enabled: false,
      match: { event_types: ['e'] },
      recipients: { user_ids: ['u'] },
      channels: ['inapp' as const],
    };
    const rec = recordRequests();
    const created = await recipientMappings.create(input);
    const r = only(rec);
    expectRequest(r, 'POST', '/recipient-mappings');
    await expectJsonBody(r, input);
    expect(created).toEqual(loadFixture('notifications', 'recipient-mapping.created').body);
    expect(created.id).toBe('map_1_1');
  });

  it('A8 create without a boolean enabled → ValidationError, no request', async () => {
    const rec = recordRequests();
    await expect(recipientMappings.create({ match: {} } as never)).rejects.toMatchObject({
      status: 0,
      details: ['enabled'],
    });
    await expect(recipientMappings.create(undefined as never)).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(rec.requests).toHaveLength(0);
  });

  it('A9 get/update/delete by a string id; empty ids refused; unknown ids → NotFoundError', async () => {
    const rec = recordRequests();
    const got = await recipientMappings.get('map_1_1');
    const updated = await recipientMappings.update('map_1_1', { channels: ['inapp'] });
    await expect(recipientMappings.delete('map_1_1')).resolves.toBeUndefined();
    expect(rec.requests).toHaveLength(3);
    const [get, patch, del] = rec.requests as RecordedRequest[];
    expectRequest(get as RecordedRequest, 'GET', '/recipient-mappings/map_1_1');
    expectRequest(patch as RecordedRequest, 'PATCH', '/recipient-mappings/map_1_1');
    await expectJsonBody(patch as RecordedRequest, { channels: ['inapp'] });
    expectRequest(del as RecordedRequest, 'DELETE', '/recipient-mappings/map_1_1');
    expect(await (del as RecordedRequest).text()).toBe('');
    expect(got).toEqual(loadFixture('notifications', 'recipient-mapping').body);
    expect(updated).toEqual(loadFixture('notifications', 'recipient-mapping.updated').body);

    const none = recordRequests();
    for (const bad of ['', '   ', 7 as never]) {
      await expect(recipientMappings.get(bad)).rejects.toMatchObject({
        status: 0,
        details: ['id'],
      });
      await expect(recipientMappings.update(bad, {})).rejects.toBeInstanceOf(ValidationError);
      await expect(recipientMappings.delete(bad)).rejects.toBeInstanceOf(ValidationError);
    }
    expect(none.requests).toHaveLength(0);

    const notFound = () => HttpResponse.json({ error: 'not_found' }, { status: 404 });
    server.use(
      http.get(`${API}/recipient-mappings/:id`, notFound),
      http.patch(`${API}/recipient-mappings/:id`, notFound),
      http.delete(`${API}/recipient-mappings/:id`, notFound)
    );
    await expect(recipientMappings.get('sdk-x')).rejects.toBeInstanceOf(NotFoundError);
    await expect(recipientMappings.update('sdk-x', { enabled: false })).rejects.toMatchObject({
      status: 404,
      apiCode: 'not_found',
    });
    await expect(recipientMappings.delete('sdk-x')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('A10 400 on update → ValidationError', async () => {
    server.use(
      http.patch(`${API}/recipient-mappings/:id`, () =>
        HttpResponse.json(
          { error: 'bad_request', message: 'recipients.zone_responsibles must be integers' },
          { status: 400 }
        )
      )
    );
    const p = recipientMappings.update('map_1_1', {
      recipients: { zone_responsibles: ['x' as never] },
    });
    await expect(p).rejects.toBeInstanceOf(ValidationError);
    await expect(p).rejects.toMatchObject({ status: 400, apiCode: 'bad_request' });
  });
});
