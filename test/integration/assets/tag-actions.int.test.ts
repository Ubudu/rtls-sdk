// P2 §9.4: live tests of client.tagActions (tier S; BLE budget 1 action) and its local validation (tier R). The only
// action goes to the never-created test MAC testMac(10): the server takes the BLE path, where an ESL-only colour is
// rejected per item before any gateway is contacted. The two `[]` calls count 0 actions.
import { beforeAll } from 'vitest';
import {
  AbortError,
  NotFoundError,
  ValidationError,
  type RtlsClient,
  type TagAction,
} from '../../../src';
import {
  createLiveClient,
  denyAll,
  describeLive,
  getHarness,
  requestLog,
  testMac,
  withRequestGuard,
} from '../harness';

async function expectLocalValidation(fn: () => Promise<unknown>): Promise<void> {
  const before = requestLog().length;
  const g = await withRequestGuard(denyAll, fn);
  expect(g.error).toBeInstanceOf(ValidationError);
  expect(g.attempts).toHaveLength(0);
  expect(requestLog()).toHaveLength(before);
}

const bad = (v: unknown): never => v as never;

describeLive('R', 'tag actions local validation', () => {
  let client: RtlsClient;

  beforeAll(() => {
    client = createLiveClient();
  });

  it('refuses every invalid action list before any request', async () => {
    const mac = testMac(10);
    const send = (actions: unknown): Promise<unknown> => client.tagActions.send(bad(actions));
    await expectLocalValidation(() => send([{ macAddress: 'zz', action: 'ptlBlue' }]));
    await expectLocalValidation(() => send([{ macAddress: mac, action: 'ptlBlue', duration: 0 }]));
    await expectLocalValidation(() =>
      send([{ macAddress: mac, action: 'ptlBlue', duration: 3601 }])
    );
    await expectLocalValidation(() =>
      send([{ macAddress: mac, action: 'ptlBlue', duration: 1.5 }])
    );
    await expectLocalValidation(() => send([{ macAddress: mac, action: 'ptlPink' }]));
    await expectLocalValidation(() => send([null]));
    await expectLocalValidation(() => send([{ action: 'ptlBlue' }]));
    await expectLocalValidation(() => send([{ macAddress: 5, action: 'ptlBlue' }]));
    await expectLocalValidation(() => send({ macAddress: mac, action: 'ptlBlue' }));
  });

  it('a pre-aborted signal is rethrown as AbortError before any request', async () => {
    const before = requestLog().length;
    const g = await withRequestGuard(denyAll, () =>
      client.tagActions.send([], { signal: AbortSignal.abort() })
    );
    expect(g.error).toBeInstanceOf(AbortError);
    expect(g.attempts).toHaveLength(0);
    expect(requestLog()).toHaveLength(before);
  });
});

describeLive('S', 'tag actions', () => {
  let client: RtlsClient;

  beforeAll(() => {
    client = createLiveClient();
  });

  it('an empty list contacts no device', async () => {
    const r = await client.tagActions.send([]);
    expect(r).toMatchObject({ success: true, tagCount: 0, results: [] });
  });

  it('the deprecated client.sendTagActions delegate', async () => {
    const r = await client.sendTagActions(getHarness().env.namespace, []);
    expect(r.tagCount).toBe(0);
  });

  it('an ESL-only colour on a non-ESL test MAC resolves success: false (USI-P2-8)', async () => {
    const mac = testMac(10);
    await expect(client.assets.get(mac)).rejects.toBeInstanceOf(NotFoundError);
    const actions: TagAction[] = [{ macAddress: mac, action: 'ptlBlue', duration: 1 }];
    const r = await client.tagActions.send(actions);
    expect(r.success).toBe(false);
    expect(r.tagCount).toBe(1);
    expect(r.results).toHaveLength(1);
    expect(r.results[0]).toMatchObject({ action: 'ptlBlue', success: false, statusCode: 400 });
    expect(r.results[0]?.error).toContain('ESL-only');
  });
});
