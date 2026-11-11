// Unit tests of client.assetTree (P2 §8.1, error matrix §6.7) against the default MSW handler and overrides.
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import {
  AbortError,
  AuthenticationError,
  ContextError,
  createRtlsClient,
  ServerError,
  type AssetTree,
} from '../../../src';
import { fixtureResponse, loadFixture } from '../../contract/fixtures';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';

const TREE_URL = 'https://rtls.ubudu.com/api/assets_library/:ns';
const client = (): ReturnType<typeof createRtlsClient> =>
  createRtlsClient({ apiKey: 'test-key', namespace: 'ns' });

describe('assetTree.get', () => {
  it('GET /assets_library/<ns>; the nested tree, typed and unchanged', async () => {
    const rec = recordRequests();
    const tree: AssetTree = await client().assetTree.get();
    expect(rec.requests).toHaveLength(1);
    const req = rec.requests[0] as RecordedRequest;
    expect(req.method).toBe('GET');
    expect(req.url.pathname).toBe('/api/assets_library/ns');
    expect(req.url.search).toBe('');
    expect(req.headers.get('content-type')).toBeNull();
    expect(req.headers.get('x-api-key')).toBe('test-key');
    expect(req.headers.get('authorization')).toBeNull();
    expect(tree).toStrictEqual(loadFixture('assets', 'asset-tree').body);
    // two levels of families
    expect(tree[0]?.families?.[0]?.families?.[0]?.name).toBe('Forklifts');
  });

  it('[] when no tree is stored', async () => {
    server.use(http.get(TREE_URL, () => HttpResponse.json([])));
    await expect(client().assetTree.get()).resolves.toStrictEqual([]);
  });

  it('a non-array stored value is returned unchanged', async () => {
    server.use(http.get(TREE_URL, () => HttpResponse.json({ name: 'Root' })));
    await expect(client().assetTree.get()).resolves.toStrictEqual({ name: 'Root' });
  });

  it('{ namespace } overrides the default namespace', async () => {
    const rec = recordRequests();
    await client().assetTree.get({ namespace: 'other' });
    expect(rec.requests.map((r) => r.url.pathname)).toStrictEqual(['/api/assets_library/other']);
  });

  it('no namespace → ContextError, no request', async () => {
    const rec = recordRequests();
    await expect(createRtlsClient({ apiKey: 'test-key' }).assetTree.get()).rejects.toBeInstanceOf(
      ContextError
    );
    expect(rec.requests).toHaveLength(0);
  });

  it('pre-aborted signal → AbortError', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(client().assetTree.get({ signal: controller.signal })).rejects.toBeInstanceOf(
      AbortError
    );
  });

  it('500 (corrupt stored value) → ServerError', async () => {
    server.use(http.get(TREE_URL, () => HttpResponse.json({ error: 'x' }, { status: 500 })));
    await expect(client().assetTree.get()).rejects.toBeInstanceOf(ServerError);
  });

  it('401 → AuthenticationError', async () => {
    server.use(http.get(TREE_URL, () => fixtureResponse(loadFixture('core', 'error-401'))));
    await expect(client().assetTree.get()).rejects.toBeInstanceOf(AuthenticationError);
  });
});
