// Tier W, Demo Factory (P5 §9.2 W1–W12, RTLS_IT_WRITES=1): the dashboard write sequence on two dashboards this
// file creates (both deleted). Every step runs inside a request guard: GETs pass; POST /dashboards only with a
// name of this run; any other write only on an id this file created, so the key owner's real dashboards cannot
// be touched (LIVE-TESTING §5). The test dashboards belong to the API key's user and are visible in that user's
// product UI until deleted. Usernames are fictitious `sdk-test-` names: the server resolves none and notifies
// nobody on share. Nothing read from live data is printed.
import { beforeAll } from 'vitest';
import { NotFoundError, ValidationError, type Dashboard, type RtlsClient } from '../../../src';
import {
  createLiveClient,
  denyAll,
  describeLive,
  expectDeepEqualRedacted,
  expectKnownServerIssue,
  getHarness,
  rawRequest,
  recordFact,
  registerCleanup,
  runId,
  testName,
  withRequestGuard,
  type GuardedRequest,
} from '../harness';

const OBJECT_ID = /^[0-9a-f]{24}$/;
const ENTITY_PATH = /^\/dashboards\/([^/]+)(?:\/(?:share|unshare))?$/;

/** Ids of the dashboards created by this file. */
const mine = new Set<string>();

function isRecord(value: unknown): value is { [key: string]: unknown } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The §9.2 predicate. */
function writePredicate(prefix: string) {
  return (r: GuardedRequest): boolean => {
    if (r.method === 'GET') return true;
    if (r.method === 'POST' && r.path === '/dashboards') {
      const name = isRecord(r.body) ? r.body.name : undefined;
      return typeof name === 'string' && name.startsWith(prefix);
    }
    const match = ENTITY_PATH.exec(r.path);
    return match !== null && mine.has(decodeURIComponent(match[1] as string));
  };
}

/** username → permissions of a creator view. */
const permissionsOf = (d: Dashboard): Record<string, string[]> =>
  Object.fromEntries((d.shared_with ?? []).map((s) => [s.username, [...s.permissions]]));

describeLive('W', 'P5 dashboards write', () => {
  let client: RtlsClient;
  let namespace: string;
  let prefix: string;
  let N: string;
  let V: string;
  let E: string;
  let L: string;
  let D: Dashboard;
  let allowed: (r: GuardedRequest) => boolean;

  /** Runs one step inside the write guard; the step's own error is rethrown. */
  async function step<T>(fn: () => Promise<T>): Promise<T> {
    const run = await withRequestGuard(allowed, fn);
    expect(
      run.attempts.filter((a) => !a.allowed).length,
      'requests rejected by the write predicate'
    ).toBe(0);
    if (run.error !== undefined) throw run.error;
    return run.result as T;
  }

  beforeAll(() => {
    client = createLiveClient();
    namespace = getHarness().env.namespace;
    prefix = `sdk-test-${runId()}-`;
    N = testName('dashboard');
    V = testName('viewer');
    E = testName('editor');
    L = testName('legacy');
    allowed = writePredicate(prefix);
  });

  it('W1 create: every field forwarded, creator view returned', async () => {
    const variables = [{ id: 'var_sdk_test', name: 'sdk_test', version: 1 }];
    D = await step(() =>
      client.dashboards.create({
        name: N,
        description: 'SDK integration test, safe to delete',
        data: [],
        dynamicVariables: variables,
      })
    );
    mine.add(D._id);
    registerCleanup({
      label: 'dashboard',
      request: { method: 'DELETE', path: `/dashboards/${D._id}` },
    });
    expect(OBJECT_ID.test(D._id), 'W1 _id is a 24-hex ObjectId').toBe(true);
    expect(D.name).toBe(N);
    expect(D.application_namespace === namespace, 'W1 application_namespace').toBe(true);
    expect(Array.isArray(D.data) && D.data.length === 0, 'W1 data is []').toBe(true);
    expectDeepEqualRedacted(D.dynamicVariables, variables, 'W1 dynamicVariables');
    expect(D.shared_with?.length, 'W1 shared_with is []').toBe(0);
    expect(D.selected_by?.length, 'W1 selected_by is []').toBe(0);
    expect(D.selected).toBe(false);
    expect(D.can_edit).toBe(true);
    expect(typeof D.created_by === 'string' && D.created_by.length > 0, 'W1 created_by').toBe(true);
  });

  it('W2 get and the four lists', async () => {
    await step(async () => {
      expectDeepEqualRedacted(await client.dashboards.get(D._id), D, 'W2 get vs create');
      const has = (list: Dashboard[]): boolean => list.some((d) => d._id === D._id);
      expect(has(await client.dashboards.list()), 'W2 in list').toBe(true);
      expect(has(await client.dashboards.listCreated()), 'W2 in listCreated').toBe(true);
      expect(has(await client.dashboards.listShared()), 'W2 not in listShared').toBe(false);
      expect(has(await client.dashboards.listSelected()), 'W2 not in listSelected').toBe(false);
    });
  });

  it('W3 update: three fields changed, dynamicVariables kept, updated_at not earlier', async () => {
    const U = await step(() =>
      client.dashboards.update(D._id, {
        name: `${N}-renamed`,
        description: 'updated',
        data: [{ id: 'sdk-test-widget' }],
      })
    );
    expect(U.name).toBe(`${N}-renamed`);
    expect(U.description).toBe('updated');
    expectDeepEqualRedacted(U.data, [{ id: 'sdk-test-widget' }], 'W3 data');
    expectDeepEqualRedacted(U.dynamicVariables, D.dynamicVariables, 'W3 dynamicVariables');
    expect(Date.parse(U.updated_at) >= Date.parse(D.updated_at), 'W3 updated_at').toBe(true);
  });

  it('W4 dynamicVariables [] clears them (U4)', async () => {
    const X = await step(() => client.dashboards.update(D._id, { dynamicVariables: [] }));
    const G = await step(() => client.dashboards.get(D._id));
    expect((X.dynamicVariables ?? []).length).toBe(0);
    expect((G.dynamicVariables ?? []).length).toBe(0);
    // Facts take booleans, numbers, null or media types only: true = the key is present (as []), false = absent.
    recordFact('U4.updateResponseHasKey', 'dynamicVariables' in X);
    recordFact('U4.getResponseHasKey', 'dynamicVariables' in G);
  });

  it("W5 share with ['view'] → a member without permissions (U2)", async () => {
    const S = await step(() =>
      client.dashboards.share(D._id, { username: V, permissions: ['view'] })
    );
    expect(S.shared_with?.length).toBe(1);
    expect(S.shared_with?.[0]?.username).toBe(V);
    expect(S.shared_with?.[0]?.permissions).toStrictEqual([]);
    recordFact('U2.shareEntryHasId', typeof S.shared_with?.[0]?._id === 'string');
  });

  it('W6 share merges by username; the legacy overload maps write to edit', async () => {
    const first = await step(() =>
      client.dashboards.share(D._id, [{ username: E, permissions: ['edit'] }])
    );
    expect(permissionsOf(first)).toStrictEqual({ [V]: [], [E]: ['edit'] });
    const second = await step(() =>
      client.dashboards.share(D._id, { username: V, permissions: ['edit'] })
    );
    expect(permissionsOf(second)).toStrictEqual({ [V]: ['edit'], [E]: ['edit'] });
    const third = await step(() => client.dashboards.share(D._id, L, { write: true }));
    expect(permissionsOf(third)).toStrictEqual({ [V]: ['edit'], [E]: ['edit'], [L]: ['edit'] });
    expect(third.shared_with?.length).toBe(3);
  });

  it("W7 USI-P5-5: a raw share with permissions ['view'] (U1)", async () => {
    const rawViewer = testName('rawview');
    const res = await step(() =>
      rawRequest('POST', `/dashboards/${D._id}/share`, {
        body: { users: [{ username: rawViewer, permissions: ['view'] }] },
      })
    );
    recordFact('U1.viewPermissionStatus', res.status);
    if (res.status === 200) await step(() => client.dashboards.unshare(D._id, rawViewer));
    const error = isRecord(res.json) ? res.json.error : undefined;
    await expectKnownServerIssue(
      'USI-P5-5',
      "dashboard share with permissions ['view'] is rejected with 400 Validation error",
      () => {
        expect(res.status).toBe(400);
        expect(error).toBe('Validation error');
      }
    );
  });

  it('W8 update shared_with replaces the list; selected_by keeps a shared user', async () => {
    const W = await step(() =>
      client.dashboards.update(D._id, { shared_with: [{ username: V }], selected_by: [V] })
    );
    expect(permissionsOf(W)).toStrictEqual({ [V]: [] });
    expect(W.selected_by).toStrictEqual([V]);
    expect(W.selected).toBe(false);
    const selected = await step(() => client.dashboards.listSelected());
    expect(
      selected.some((d) => d._id === D._id),
      'W8 not in listSelected'
    ).toBe(false);
  });

  it('W9 unshare removes from shared_with and selected_by; repeating it is a no-op', async () => {
    const A = await step(() => client.dashboards.unshare(D._id, V));
    expect(A.shared_with?.length).toBe(0);
    expect(A.selected_by?.length).toBe(0);
    const B = await step(() => client.dashboards.unshare(D._id, [E, L]));
    expect(B.shared_with?.length).toBe(0);
    expect(B.selected_by?.length).toBe(0);
  });

  it('W10 client-side guards send nothing (deny-all)', async () => {
    const run = await withRequestGuard(denyAll, async () => {
      await expect(client.dashboards.update(D._id, { name: '  ' })).rejects.toBeInstanceOf(
        ValidationError
      );
      await expect(client.dashboards.share(D._id, [])).rejects.toBeInstanceOf(ValidationError);
      await expect(
        client.dashboards.create({ name: `${N}-guard`, data: {} })
      ).rejects.toBeInstanceOf(ValidationError);
    });
    expect(run.error).toBeUndefined();
    expect(run.attempts).toHaveLength(0);
  });

  it('W11 delete: 204 → undefined, then NotFoundError twice', async () => {
    expect(await step(() => client.dashboards.delete(D._id))).toBeUndefined();
    await step(async () => {
      await expect(client.dashboards.get(D._id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(client.dashboards.delete(D._id)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  it('W12 U3 probe: a dashboard created with data {} (raw: the SDK refuses data {})', async () => {
    const res = await step(() =>
      rawRequest('POST', '/dashboards', {
        body: { name: `${N}-objdata`, application_namespace: namespace, data: {} },
      })
    );
    expect(res.status).toBe(201);
    const O = res.json as Dashboard;
    expect(OBJECT_ID.test(O._id), 'W12 _id is a 24-hex ObjectId').toBe(true);
    mine.add(O._id);
    registerCleanup({
      label: 'dashboard-objdata',
      request: { method: 'DELETE', path: `/dashboards/${O._id}` },
    });
    const update = await withRequestGuard(allowed, () =>
      client.dashboards.update(O._id, { description: 'x' })
    );
    const updateError = update.error ?? null;
    recordFact('U3.dataKeyPresent', 'data' in O);
    recordFact('U3.updateRejected', updateError instanceof ValidationError);
    await expectKnownServerIssue(
      'USI-P5-10',
      'a dashboard created with data {} is stored without data and later updates fail with Validation error',
      () => {
        expect('data' in O).toBe(false);
        expect(updateError).toBeInstanceOf(ValidationError);
        expect((updateError as ValidationError).message).toBe('Validation error');
      }
    );
    expect(await step(() => client.dashboards.delete(O._id))).toBeUndefined();
  });

  it('W-end no dashboard of this run is left in listCreated()', async () => {
    const created = await step(() => client.dashboards.listCreated());
    expect(created.filter((d) => d.name.startsWith(prefix)).length).toBe(0);
  });
});
