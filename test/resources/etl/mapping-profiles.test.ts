// Unit tests of client.etl.mappingProfiles (P7 §8.1, M1–M31): the real request builders against MSW. Expected
// bodies are read from the loaded fixtures, so that a live re-recording (--record) does not break them.
import { describe, expect, it } from 'vitest';
import { http } from 'msw';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';
import { fixtureResponse, loadFixture } from '../../contract/fixtures';
import {
  AuthorizationError,
  ConflictError,
  ContextError,
  createRtlsClient,
  NotFoundError,
  PayloadTooLargeError,
  ServerError,
  ValidationError,
  type EtlMappingProfile,
  type EtlMappingProfileInput,
  type EtlStaleWriteBody,
  type RtlsClient,
  type RtlsError,
} from '../../../src';

const BASE = 'https://rtls.ubudu.com/api';
const PROFILES = `${BASE}/etl/mapping-profiles`;
const PROFILE = `${BASE}/etl/mapping-profiles/:id`;
const MAPPINGS = `${BASE}/etl/mappings`;
const ID = '64b000000000000000000001';
const fx = (name: string) => loadFixture('etl', name);

/** A client with the default namespace `ns-a`, or none for `null`. */
function client(namespace: string | null = 'ns-a'): RtlsClient {
  return createRtlsClient(
    namespace === null ? { apiKey: 'test-key' } : { apiKey: 'test-key', namespace }
  );
}

function only(rec: { requests: readonly RecordedRequest[] }): RecordedRequest {
  expect(rec.requests).toHaveLength(1);
  return rec.requests[0] as RecordedRequest;
}

/** The request line and the headers every case checks: auth present, JSON type only on a JSON body. */
function expectRequest(r: RecordedRequest, method: string, path: string, json: boolean): void {
  expect(r.method).toBe(method);
  expect(r.url.pathname).toBe(`/api${path}`);
  expect(r.headers.get('x-api-key')).toBe('test-key');
  if (json) expect(r.headers.get('content-type')).toMatch(/^application\/json/);
  else expect(r.headers.get('content-type')).toBeNull();
}

/** The rejection of `p` (fails the test when it resolves). */
async function expectRejection(p: Promise<unknown>): Promise<RtlsError> {
  const [outcome] = await Promise.allSettled([p]);
  expect(outcome?.status).toBe('rejected');
  return (outcome as PromiseRejectedResult).reason as RtlsError;
}

async function jsonBody(r: RecordedRequest): Promise<Record<string, unknown>> {
  return JSON.parse(await r.text()) as Record<string, unknown>;
}

function answer(url: string, method: 'get' | 'post' | 'put' | 'delete', fixture: string): void {
  server.use(http[method](url, () => fixtureResponse(fx(fixture))));
}

function errorText(fixture: string): string {
  return (fx(fixture).body as { error: string }).error;
}

const input: EtlMappingProfileInput = {
  name: 'sdk-test-000000-etl-profile',
  mappings: { user_udid: { sourceColumn: 'MAC', required: true } },
  keyColumns: ['MAC'],
};

describe('client.etl.mappingProfiles.list (GET /etl/mappings)', () => {
  it('M1 sends applicationId = the client namespace and nothing else; returns the fixture', async () => {
    const rec = recordRequests();
    const profiles: EtlMappingProfile[] = await client().etl.mappingProfiles.list();
    const r = only(rec);
    expectRequest(r, 'GET', '/etl/mappings', false);
    expect([...r.url.searchParams.keys()]).toEqual(['applicationId']);
    expect(r.url.searchParams.get('applicationId')).toBe('ns-a');
    expect(profiles).toEqual(fx('mapping-profile-list').body);
  });

  it('M2 a per-call namespace wins', async () => {
    const rec = recordRequests();
    await client().etl.mappingProfiles.list({ namespace: 'ns-b' });
    expect(only(rec).url.searchParams.get('applicationId')).toBe('ns-b');
  });

  it('M3 without any namespace: ContextError, no request', async () => {
    const rec = recordRequests();
    await expect(client(null).etl.mappingProfiles.list()).rejects.toBeInstanceOf(ContextError);
    expect(rec.requests).toHaveLength(0);
  });

  it('M4 500 {error} → ServerError with the message', async () => {
    answer(MAPPINGS, 'get', 'error-list-500');
    const err = await expectRejection(client().etl.mappingProfiles.list());
    expect(err).toBeInstanceOf(ServerError);
    expect(err).toMatchObject({ status: 500, message: errorText('error-list-500') });
    expect(err.body).toEqual(fx('error-list-500').body);
  });

  it('forwards the request options: a pre-aborted signal ends the call before any request', async () => {
    const rec = recordRequests();
    const controller = new AbortController();
    controller.abort();
    await expect(
      client().etl.mappingProfiles.list({ signal: controller.signal, timeoutMs: 5000 })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(rec.requests).toHaveLength(0);
  });

  it('forwards per-call headers', async () => {
    const rec = recordRequests();
    await client().etl.mappingProfiles.list({ headers: { 'X-Trace': 't1' } });
    expect(only(rec).headers.get('x-trace')).toBe('t1');
  });
});

describe('client.etl.mappingProfiles.listAll (GET /etl/mapping-profiles)', () => {
  it('M5 GET with no query even when the client has a namespace', async () => {
    const rec = recordRequests();
    const profiles = await client().etl.mappingProfiles.listAll();
    const r = only(rec);
    expectRequest(r, 'GET', '/etl/mapping-profiles', false);
    expect(r.url.search).toBe('');
    expect(profiles).toEqual(fx('mapping-profile-list-all').body);
  });

  it('M5b needs no namespace', async () => {
    const rec = recordRequests();
    await client(null).etl.mappingProfiles.listAll();
    expect(only(rec).url.search).toBe('');
  });

  it('M6 403 insufficient_role → AuthorizationError with apiCode and message', async () => {
    answer(PROFILES, 'get', 'error-insufficient-role');
    const err = await expectRejection(client().etl.mappingProfiles.listAll());
    expect(err).toBeInstanceOf(AuthorizationError);
    expect(err).toMatchObject({
      status: 403,
      apiCode: 'insufficient_role',
      message: 'This feature requires the access_data_import role',
    });
    expect(err.body).toEqual(fx('error-insufficient-role').body);
  });

  it('M7 a legacy string-valued mapping is returned untouched', async () => {
    answer(PROFILES, 'get', 'mapping-profile-legacy');
    const [profile] = await client().etl.mappingProfiles.listAll();
    const expected = (fx('mapping-profile-legacy').body as EtlMappingProfile[])[0];
    expect(profile?.mappings).toEqual(expected?.mappings);
    const legacy = Object.values(profile?.mappings ?? {}).filter((m) => typeof m === 'string');
    expect(legacy).toHaveLength(1);
  });

  it('M31 500 {error} → ServerError, message kept', async () => {
    answer(PROFILES, 'get', 'error-list-500');
    const err = await expectRejection(client().etl.mappingProfiles.listAll());
    expect(err).toBeInstanceOf(ServerError);
    expect(err).toMatchObject({ status: 500, message: errorText('error-list-500') });
    expect(err.body).toEqual(fx('error-list-500').body);
  });
});

describe('client.etl.mappingProfiles.get (GET /etl/mapping-profiles/{id})', () => {
  it('M8 GET by id; the id is percent-encoded once', async () => {
    const rec = recordRequests();
    const profile = await client().etl.mappingProfiles.get(ID);
    expectRequest(only(rec), 'GET', `/etl/mapping-profiles/${ID}`, false);
    expect(profile).toEqual(fx('mapping-profile-get').body);
    rec.stop();

    const rec2 = recordRequests();
    await client().etl.mappingProfiles.get('a/b');
    expect(only(rec2).url.pathname).toBe('/api/etl/mapping-profiles/a%2Fb');
  });

  it('M9 404 → NotFoundError with the server message', async () => {
    answer(PROFILE, 'get', 'error-not-found');
    const err = await expectRejection(client().etl.mappingProfiles.get(ID));
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err).toMatchObject({ status: 404, message: 'Mapping profile not found' });
    expect(err.body).toEqual(fx('error-not-found').body);
  });

  it('M10 500 cast error body → ServerError 500', async () => {
    answer(PROFILE, 'get', 'error-cast-500');
    const err = await expectRejection(client().etl.mappingProfiles.get('not-an-id'));
    expect(err).toBeInstanceOf(ServerError);
    expect(err).toMatchObject({ status: 500, message: errorText('error-cast-500') });
    expect(err.body).toEqual(fx('error-cast-500').body);
  });

  it('M11 an empty id → ValidationError, no request (get, update, delete)', async () => {
    const rec = recordRequests();
    const p = client().etl.mappingProfiles;
    await expect(p.get('')).rejects.toBeInstanceOf(ValidationError);
    await expect(p.update('', { name: 'x' })).rejects.toBeInstanceOf(ValidationError);
    await expect(p.delete('')).rejects.toMatchObject({
      name: 'ValidationError',
      status: 0,
      details: ['id'],
    });
    await expect(p.get(undefined as never)).rejects.toBeInstanceOf(ValidationError);
    expect(rec.requests).toHaveLength(0);
  });
});

describe('client.etl.mappingProfiles.create (POST /etl/mapping-profiles)', () => {
  it('M12 JSON body = the input keys + applicationId from the client namespace; 201 typed', async () => {
    const rec = recordRequests();
    const created: EtlMappingProfile = await client().etl.mappingProfiles.create(input);
    const r = only(rec);
    expectRequest(r, 'POST', '/etl/mapping-profiles', true);
    expect(await jsonBody(r)).toEqual({ ...input, applicationId: 'ns-a' });
    expect(created).toEqual(fx('mapping-profile').body);
  });

  it('M12b every optional input key is sent when defined, undefined ones are not', async () => {
    const rec = recordRequests();
    const full: EtlMappingProfileInput = {
      ...input,
      description: 'd',
      sourceType: 'csv',
      requiredFields: ['MAC'],
      defaults: { 'data.site': { value: 'A', type: 'string' } },
      modelKey: 'asset',
    };
    await client().etl.mappingProfiles.create({ ...full, keyColumns: undefined });
    const expected: Record<string, unknown> = { ...full, applicationId: 'ns-a' };
    delete expected.keyColumns;
    expect(await jsonBody(only(rec))).toEqual(expected);
  });

  it('M13 an explicit applicationId wins over the client namespace', async () => {
    const rec = recordRequests();
    await client().etl.mappingProfiles.create({ ...input, applicationId: 'x' });
    expect((await jsonBody(only(rec))).applicationId).toBe('x');
  });

  it("M13b an empty applicationId counts as not given (the namespace is sent, never '')", async () => {
    const rec = recordRequests();
    await client().etl.mappingProfiles.create({ ...input, applicationId: '' });
    expect((await jsonBody(only(rec))).applicationId).toBe('ns-a');
  });

  it('M14 a per-call namespace is the default target', async () => {
    const rec = recordRequests();
    await client().etl.mappingProfiles.create(input, { namespace: 'ns-b' });
    expect((await jsonBody(only(rec))).applicationId).toBe('ns-b');
  });

  it('M15 no namespace and no applicationId → ContextError, no request', async () => {
    const rec = recordRequests();
    await expect(client(null).etl.mappingProfiles.create(input)).rejects.toBeInstanceOf(
      ContextError
    );
    expect(rec.requests).toHaveLength(0);
  });

  it('M15b an explicit applicationId needs no namespace', async () => {
    const rec = recordRequests();
    await client(null).etl.mappingProfiles.create({ ...input, applicationId: 'x' });
    expect((await jsonBody(only(rec))).applicationId).toBe('x');
  });

  it('M16 server-assigned and unknown keys are never sent', async () => {
    const rec = recordRequests();
    await client().etl.mappingProfiles.create({
      ...input,
      _id: ID,
      userId: 'u',
      created_at: 'c',
      status: 'active',
    } as never);
    const body = await jsonBody(only(rec));
    expect(Object.keys(body).sort()).toEqual(['applicationId', 'keyColumns', 'mappings', 'name']);
  });

  it('M17 empty name, null / array / Map mappings, no input → ValidationError, no request', async () => {
    const rec = recordRequests();
    const p = client(null).etl.mappingProfiles;
    await expect(p.create({ ...input, name: '  ' })).rejects.toMatchObject({
      name: 'ValidationError',
      status: 0,
      details: ['name'],
    });
    await expect(p.create({ ...input, mappings: null as never })).rejects.toMatchObject({
      details: ['mappings'],
    });
    await expect(p.create({ ...input, mappings: [] as never })).rejects.toMatchObject({
      details: ['mappings'],
    });
    await expect(p.create({ ...input, mappings: new Map() as never })).rejects.toBeInstanceOf(
      ValidationError
    );
    await expect(p.create({ ...input, name: 1 as never })).rejects.toBeInstanceOf(ValidationError);
    await expect(p.create(null as never)).rejects.toMatchObject({ details: ['input'] });
    expect(rec.requests).toHaveLength(0);
  });

  it('M17b a null-prototype mappings object is accepted', async () => {
    const rec = recordRequests();
    const mappings = Object.assign(Object.create(null) as object, {
      user_udid: { sourceColumn: 'MAC' },
    }) as EtlMappingProfileInput['mappings'];
    await client().etl.mappingProfiles.create({ name: 'n', mappings });
    expect((await jsonBody(only(rec))).mappings).toEqual({ user_udid: { sourceColumn: 'MAC' } });
  });

  it('M18 403 namespace_access_denied → AuthorizationError with apiCode', async () => {
    answer(PROFILES, 'post', 'error-namespace-access-denied');
    const err = await expectRejection(client().etl.mappingProfiles.create(input));
    expect(err).toBeInstanceOf(AuthorizationError);
    expect(err).toMatchObject({ status: 403, apiCode: 'namespace_access_denied' });
    expect(err.body).toEqual(fx('error-namespace-access-denied').body);
  });

  it('M19 500 model validation failure → ServerError', async () => {
    answer(PROFILES, 'post', 'error-create-validation-500');
    const err = await expectRejection(client().etl.mappingProfiles.create(input));
    expect(err).toBeInstanceOf(ServerError);
    expect(err).toMatchObject({ status: 500, message: errorText('error-create-validation-500') });
    expect(err.body).toEqual(fx('error-create-validation-500').body);
  });

  it('M20 413 HTML body → PayloadTooLargeError, body is the string', async () => {
    answer(PROFILES, 'post', 'error-payload-too-large');
    const err = await expectRejection(client().etl.mappingProfiles.create(input));
    expect(err).toBeInstanceOf(PayloadTooLargeError);
    expect(err).toMatchObject({ status: 413 });
    expect(err.body).toBe(fx('error-payload-too-large').text);
  });
});

describe('client.etl.mappingProfiles.update (PUT /etl/mapping-profiles/{id})', () => {
  it('M21 sends only the given keys; undefined values are dropped; no updated_at unless given', async () => {
    const rec = recordRequests();
    const updated = await client().etl.mappingProfiles.update(ID, { description: 'd' });
    const r = only(rec);
    expectRequest(r, 'PUT', `/etl/mapping-profiles/${ID}`, true);
    expect(await jsonBody(r)).toEqual({ description: 'd' });
    expect(updated).toEqual(fx('mapping-profile-updated').body);
    rec.stop();

    const rec2 = recordRequests();
    await client().etl.mappingProfiles.update(ID, { description: undefined, keyColumns: ['MAC'] });
    expect(await jsonBody(only(rec2))).toEqual({ keyColumns: ['MAC'] });
  });

  it('M22 an ISO updated_at round-trips unchanged', async () => {
    const rec = recordRequests();
    await client().etl.mappingProfiles.update(ID, { updated_at: '2000-01-02T03:04:05.678Z' });
    expect(await jsonBody(only(rec))).toEqual({ updated_at: '2000-01-02T03:04:05.678Z' });
  });

  it('M23 a Date, epoch ms and a digit string are sent as the same ISO string', async () => {
    const iso = '2000-01-02T03:04:05.678Z';
    const ms = Date.parse(iso);
    const sent: unknown[] = [];
    for (const value of [new Date(iso), ms, String(ms)]) {
      const rec = recordRequests();
      await client().etl.mappingProfiles.update(ID, { updated_at: value });
      sent.push((await jsonBody(only(rec))).updated_at);
      rec.stop();
    }
    expect(sent).toEqual([iso, iso, iso]);
  });

  it('M23b a non-ISO date string is normalised on the client', async () => {
    const rec = recordRequests();
    await client().etl.mappingProfiles.update(ID, { updated_at: 'Sun, 02 Jan 2000 03:04:05 GMT' });
    expect((await jsonBody(only(rec))).updated_at).toBe('2000-01-02T03:04:05.000Z');
  });

  it('M24 an unreadable updated_at, an empty name, no changes → ValidationError, no request', async () => {
    const rec = recordRequests();
    const p = client().etl.mappingProfiles;
    await expect(p.update(ID, { updated_at: 'nope' })).rejects.toMatchObject({
      name: 'ValidationError',
      status: 0,
      details: ['updated_at'],
    });
    await expect(p.update(ID, { updated_at: 1e20 })).rejects.toMatchObject({
      details: ['updated_at'],
    });
    await expect(p.update(ID, { name: '' })).rejects.toMatchObject({ details: ['name'] });
    await expect(p.update(ID, { name: ' ' })).rejects.toBeInstanceOf(ValidationError);
    await expect(p.update(ID, null as never)).rejects.toMatchObject({ details: ['changes'] });
    expect(rec.requests).toHaveLength(0);
  });

  it('M25 a full profile value: only the assignable keys + updated_at are sent', async () => {
    const profile = fx('mapping-profile-get').body as EtlMappingProfile;
    const rec = recordRequests();
    await client().etl.mappingProfiles.update(profile._id, profile);
    const body = await jsonBody(only(rec));
    const assignable = [
      'name',
      'description',
      'sourceType',
      'mappings',
      'keyColumns',
      'requiredFields',
      'defaults',
      'applicationId',
      'modelKey',
    ] as const;
    const expected: Record<string, unknown> = {
      updated_at: new Date(profile.updated_at).toISOString(),
    };
    for (const key of assignable) if (profile[key] !== undefined) expected[key] = profile[key];
    expect(body).toEqual(expected);
    for (const key of ['_id', 'userId', 'created_at', '__v']) expect(body).not.toHaveProperty(key);
  });

  it('M25b inherited keys are not sent (own properties only)', async () => {
    const rec = recordRequests();
    const changes = Object.create({ name: 'inherited' }) as { description: string };
    changes.description = 'own';
    await client().etl.mappingProfiles.update(ID, changes);
    expect(await jsonBody(only(rec))).toEqual({ description: 'own' });
  });

  it('M26 a per-call namespace never adds applicationId', async () => {
    const rec = recordRequests();
    await client().etl.mappingProfiles.update(ID, { description: 'd' }, { namespace: 'ns-b' });
    expect(await jsonBody(only(rec))).toEqual({ description: 'd' });
  });

  it('M27 409 stale write → ConflictError, apiCode stale_write, current profile in body', async () => {
    answer(PROFILE, 'put', 'error-stale-write');
    const stale = fx('error-stale-write').body as EtlStaleWriteBody;
    const err = await expectRejection(
      client().etl.mappingProfiles.update(ID, {
        description: 'd',
        updated_at: '2000-01-01T00:00:00.000Z',
      })
    );
    expect(err).toBeInstanceOf(ConflictError);
    expect(err).toMatchObject({ status: 409, apiCode: 'stale_write' });
    expect((err.body as EtlStaleWriteBody).current._id).toBe(stale.current._id);
    expect(err.body).toEqual(stale);
  });

  it('M28 404 / 403 / 400 cast error → NotFoundError / AuthorizationError / ValidationError', async () => {
    const cases = [
      ['error-not-found', NotFoundError, 404],
      ['error-namespace-access-denied', AuthorizationError, 403],
      ['error-cast-400', ValidationError, 400],
    ] as const;
    const seen: unknown[] = [];
    for (const [name, cls, status] of cases) {
      answer(PROFILE, 'put', name);
      const err = await expectRejection(client().etl.mappingProfiles.update(ID, { name: 'x' }));
      seen.push([err instanceof cls, err.status, err.body]);
      expect(err.body).toEqual(fx(name).body);
      expect(err.status).toBe(status);
    }
    expect(seen.map((s) => (s as unknown[])[0])).toEqual([true, true, true]);
  });
});

describe('client.etl.mappingProfiles.delete (DELETE /etl/mapping-profiles/{id})', () => {
  it('M29 DELETE with no body and no Content-Type; resolves undefined on 204', async () => {
    const rec = recordRequests();
    const result = await client().etl.mappingProfiles.delete(ID);
    const r = only(rec);
    expectRequest(r, 'DELETE', `/etl/mapping-profiles/${ID}`, false);
    expect(await r.text()).toBe('');
    expect(result).toBeUndefined();
  });

  it('M30 403 namespace_access_denied; 404; 500 cast error', async () => {
    const cases = [
      ['error-namespace-access-denied', AuthorizationError, 403],
      ['error-not-found', NotFoundError, 404],
      ['error-cast-500', ServerError, 500],
    ] as const;
    const classes: boolean[] = [];
    for (const [name, cls, status] of cases) {
      answer(PROFILE, 'delete', name);
      const err = await expectRejection(client().etl.mappingProfiles.delete(ID));
      classes.push(err instanceof cls);
      expect(err.status).toBe(status);
      expect(err.body).toEqual(fx(name).body);
    }
    expect(classes).toEqual([true, true, true]);
  });
});
