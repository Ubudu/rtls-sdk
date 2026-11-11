// Unit tests of client.dataModels (P2 §8.1, error matrix §6.7) against the default MSW handler and overrides.
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import {
  AbortError,
  AuthenticationError,
  ContextError,
  createRtlsClient,
  ServerError,
  type DataModelField,
} from '../../../src';
import { fixtureResponse, loadFixture } from '../../contract/fixtures';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';

const TAXONOMY_URL = 'https://rtls.ubudu.com/api/data_filters_taxonomy/:ns';
const client = (): ReturnType<typeof createRtlsClient> =>
  createRtlsClient({ apiKey: 'test-key', namespace: 'ns' });

describe('dataModels.get', () => {
  it('GET /data_filters_taxonomy/<ns>; field entries and the data_models entry, unchanged', async () => {
    const rec = recordRequests();
    const fields: DataModelField[] = await client().dataModels.get();
    expect(rec.requests).toHaveLength(1);
    const req = rec.requests[0] as RecordedRequest;
    expect(req.method).toBe('GET');
    expect(req.url.pathname).toBe('/api/data_filters_taxonomy/ns');
    expect(req.url.search).toBe('');
    expect(req.headers.get('content-type')).toBeNull();
    expect(req.headers.get('x-api-key')).toBe('test-key');
    expect(req.headers.get('authorization')).toBeNull();
    expect(fields).toStrictEqual(loadFixture('assets', 'data-models').body);
    expect(fields.map((f) => f.key)).toStrictEqual([
      'user_name',
      'data.battery',
      'tags',
      'data_models',
    ]);
    const models = fields.find((f) => f.key === 'data_models')?.data ?? [];
    expect(models.map((m) => m.key)).toStrictEqual(['forklift']);
    expect(models[0]?.properties?.[0]?.key).toBe('data.load_kg');
  });

  it('[] when nothing is stored (USI-P2-9)', async () => {
    server.use(http.get(TAXONOMY_URL, () => HttpResponse.json([])));
    await expect(client().dataModels.get()).resolves.toStrictEqual([]);
  });

  it('an unknown type string is returned as stored', async () => {
    server.use(http.get(TAXONOMY_URL, () => HttpResponse.json([{ key: 'x', type: 'geo' }])));
    const fields = await client().dataModels.get();
    expect(fields[0]?.type).toBe('geo');
  });

  it('{ namespace } overrides the default namespace', async () => {
    const rec = recordRequests();
    await client().dataModels.get({ namespace: 'other' });
    expect(rec.requests.map((r) => r.url.pathname)).toStrictEqual([
      '/api/data_filters_taxonomy/other',
    ]);
  });

  it('no namespace → ContextError, no request', async () => {
    const rec = recordRequests();
    await expect(createRtlsClient({ apiKey: 'test-key' }).dataModels.get()).rejects.toBeInstanceOf(
      ContextError
    );
    expect(rec.requests).toHaveLength(0);
  });

  it('pre-aborted signal → AbortError', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(client().dataModels.get({ signal: controller.signal })).rejects.toBeInstanceOf(
      AbortError
    );
  });

  it('500 (corrupt stored value) → ServerError', async () => {
    server.use(http.get(TAXONOMY_URL, () => HttpResponse.json({ error: 'x' }, { status: 500 })));
    await expect(client().dataModels.get()).rejects.toBeInstanceOf(ServerError);
  });

  it('401 → AuthenticationError', async () => {
    server.use(http.get(TAXONOMY_URL, () => fixtureResponse(loadFixture('core', 'error-401'))));
    await expect(client().dataModels.get()).rejects.toBeInstanceOf(AuthenticationError);
  });
});
