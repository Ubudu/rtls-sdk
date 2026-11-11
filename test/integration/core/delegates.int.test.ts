// Core live tests L-D1, L-D2 and L-D4 (P1 §9): the deprecated root delegates against production, tier R. The
// settings documents are compared with expectDeepEqualRedacted, which never prints a value.
import { resolveTimeRange } from '../../../src/utils/time';
import {
  createLiveClient,
  describeLive,
  expectDeepEqualRedacted,
  getHarness,
  requestLog,
} from '../harness';
import { auditReadOnlyRequests } from './support/request-audit';

describeLive('R', 'core delegates', () => {
  auditReadOnlyRequests();

  it('L-D1 getSettings() reads the default namespace settings', async () => {
    const settings = await createLiveClient().getSettings();
    expect(typeof settings === 'object' && settings !== null && !Array.isArray(settings)).toBe(
      true
    );
    expect(Object.keys(settings as object).includes('map')).toBe(true);
    expect(requestLog().map((e) => `${e.method} ${e.template} ${e.status}`)).toEqual([
      'GET /settings/{app_namespace} 200',
    ]);
  });

  it('L-D2 the namespace, bag, trailing-options and settings.get() forms read the same document', async () => {
    const client = createLiveClient();
    const namespace = getHarness().env.namespace;
    const reference = await client.getSettings();
    expectDeepEqualRedacted(await client.getSettings(namespace), reference, 'getSettings(ns)');
    expectDeepEqualRedacted(
      await client.getSettings({ namespace }),
      reference,
      'getSettings({ namespace })'
    );
    expectDeepEqualRedacted(
      await client.getSettings({ namespace, timeoutMs: 1 }, { timeoutMs: 20_000 }),
      reference,
      'getSettings(bag, trailing options)'
    );
    expectDeepEqualRedacted(await client.settings.get(), reference, 'settings.get()');
    expect(
      requestLog().every((e) => e.template === '/settings/{app_namespace}' && e.status === 200)
    ).toBe(true);
    expect(requestLog()).toHaveLength(5);
  });

  it('L-D4 esQuery runs a bounded read-only query on the last hour of alerts', async () => {
    const { from } = resolveTimeRange({ from: new Date(Date.now() - 3_600_000) });
    const namespace = getHarness().env.namespace;
    const result = await createLiveClient().esQuery(namespace, 'alerts', {
      size: 1,
      _source: ['timestamp'],
      query: { range: { timestamp: { gte: from } } },
    });
    const hits = (result as { hits?: { hits?: unknown } }).hits?.hits;
    expect(Array.isArray(hits)).toBe(true);
    expect((hits as unknown[]).length <= 1).toBe(true);
    expect(requestLog().map((e) => `${e.method} ${e.template} ${e.status}`)).toEqual([
      'POST /es/query/{appNamespace}/{dataType} 200',
    ]);
  });
});
