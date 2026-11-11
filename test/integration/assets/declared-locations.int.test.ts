// P2 §9.5: live tests of client.declaredLocations. Local validation in tier R (request counter unchanged); the
// declare (1 published position), the unchanged re-declare (counted, publishes nothing) and the clears run in order
// in one tier-S block that also writes its test asset m6 (requires W). m7 is never created (DL_017 clear target).
// The point is the safe publish point of the discovered map; without one the block skips (never a fallback point).
import { beforeAll } from 'vitest';
import {
  formatMac,
  NotFoundError,
  ValidationError,
  type DeclaredLocation,
  type RtlsClient,
} from '../../../src';
import {
  createLiveClient,
  denyAll,
  describeLive,
  registerCleanup,
  requestLog,
  runId,
  testMac,
  testName,
  withRequestGuard,
} from '../harness';
import { locationOrSkip, safePoint } from './safe-point';

async function expectLocalValidation(fn: () => Promise<unknown>): Promise<void> {
  const before = requestLog().length;
  const g = await withRequestGuard(denyAll, fn);
  expect(g.error).toBeInstanceOf(ValidationError);
  expect(g.attempts).toHaveLength(0);
  expect(requestLog()).toHaveLength(before);
}

const bad = (v: unknown): never => v as never;
const POINT: DeclaredLocation = { lat: 1, lng: 1 };

describeLive('R', 'declared locations local validation', () => {
  let client: RtlsClient;

  beforeAll(() => {
    client = createLiveClient();
  });

  it('bulkDeclare refuses every invalid request before any request', async () => {
    const m = testMac(6);
    const declare = (req: unknown): Promise<unknown> =>
      client.declaredLocations.bulkDeclare(bad(req));
    const one = (item: unknown, extra: Record<string, unknown> = {}): Promise<unknown> =>
      declare({ assets: [item], ...extra });
    await expectLocalValidation(() => declare({ assets: [] }));
    await expectLocalValidation(() => declare({}));
    await expectLocalValidation(() => declare(null));
    await expectLocalValidation(() =>
      declare({
        assets: Array.from({ length: 501 }, (_, i) => ({
          external_id: `sdk-test-${runId()}-x${i}`,
        })),
        shared_location: POINT,
      })
    );
    await expectLocalValidation(() => one(null, { shared_location: POINT }));
    await expectLocalValidation(() => one({ mac_address: 5 }, { shared_location: POINT }));
    await expectLocalValidation(() => one({}, { shared_location: POINT }));
    await expectLocalValidation(() => one({ mac_address: 'zz' }, { shared_location: POINT }));
    await expectLocalValidation(() => one({ external_id: 'bad id!' }, { shared_location: POINT }));
    await expectLocalValidation(() =>
      one({ external_id: 'a'.repeat(129) }, { shared_location: POINT })
    );
    await expectLocalValidation(() => one({ external_id: 5 }, { shared_location: POINT }));
    await expectLocalValidation(() =>
      declare({
        assets: [{ mac_address: 'AA:BB:CC:DD:EE:FF' }, { mac_address: 'aabbccddeeff' }],
        shared_location: POINT,
      })
    );
    await expectLocalValidation(() =>
      declare({
        assets: [{ external_id: 'sdk-test-Ext' }, { external_id: 'sdk-test-ext' }],
        shared_location: POINT,
      })
    );
    await expectLocalValidation(() => one({ mac_address: m }));
    await expectLocalValidation(() =>
      one({ mac_address: m, declared_location: { lat: 91, lng: 1 } })
    );
    await expectLocalValidation(() =>
      one({ mac_address: m, declared_location: { lat: 1, lng: -181 } })
    );
    await expectLocalValidation(() =>
      one({ mac_address: m, declared_location: { lat: 1, lng: 1, level: 201 } })
    );
    await expectLocalValidation(() =>
      one({ mac_address: m, declared_location: { lat: 1, lng: 1, level: 1.5 } })
    );
    await expectLocalValidation(() =>
      one({ mac_address: m, declared_location: { lat: Number.NaN, lng: 1 } })
    );
    await expectLocalValidation(() => one({ mac_address: m, declared_location: null }, {}));
    await expectLocalValidation(() => one({ mac_address: m, declared_location: 'x' }));
    await expectLocalValidation(() => one({ mac_address: m }, { shared_location: { lat: 1 } }));
    await expectLocalValidation(() =>
      one({ mac_address: m }, { shared_location: POINT, auto_create_virtual_assets: 'yes' })
    );
    await expectLocalValidation(() =>
      one({ mac_address: m }, { shared_location: POINT, default_asset_model: 5 })
    );
  });

  it('bulkClear refuses every invalid request before any request', async () => {
    const clear = (req: unknown): Promise<unknown> => client.declaredLocations.bulkClear(bad(req));
    await expectLocalValidation(() => clear({}));
    await expectLocalValidation(() => clear(null));
    await expectLocalValidation(() => clear({ mac_addresses: [], external_ids: [] }));
    await expectLocalValidation(() => clear({ mac_addresses: ['zz'] }));
    await expectLocalValidation(() => clear({ external_ids: [''] }));
    await expectLocalValidation(() => clear({ external_ids: [5] }));
    await expectLocalValidation(() => clear({ mac_addresses: 'x' }));
    await expectLocalValidation(() => clear({ external_ids: 'x' }));
    await expectLocalValidation(() =>
      clear({
        mac_addresses: Array.from({ length: 300 }, () => testMac(7)),
        external_ids: Array.from({ length: 201 }, (_, i) => `sdk-test-${runId()}-x${i}`),
      })
    );
  });
});

describeLive(
  'S',
  'declared locations',
  () => {
    let client: RtlsClient;
    let loc: DeclaredLocation | null = null;
    const m6 = testMac(6);
    const ext = testName('ext');

    beforeAll(async () => {
      client = createLiveClient();
      const p = await safePoint();
      loc =
        p === null
          ? null
          : {
              ...p,
              source: 'rfid',
              declared_via: 'rtls-api',
              device_id: 'sdk-test',
              external_reference: `sdk-test-${runId()}`,
            };
    });

    it('declare by external id publishes one position', async (ctx) => {
      const point = locationOrSkip(ctx, loc);
      await expect(client.assets.get(m6)).rejects.toBeInstanceOf(NotFoundError);
      await client.assets.create(m6, {
        user_name: testName('a6'),
        model: 'sdk-test',
        tags: ['sdk-test'],
        external_id: ext,
      });
      registerCleanup({
        label: `asset ${m6}`,
        request: { method: 'DELETE', path: `/assets/{ns}/${m6}` },
        verify: { path: `/assets/{ns}/${m6}`, goneStatus: [404] },
      });
      // The external id must resolve to the run's own asset only, else nothing is declared.
      const owners = (await client.assets.list()).filter(
        (a) => a.external_id?.toLowerCase() === ext
      );
      expect(owners.map((a) => a.user_udid)).toEqual([m6]);

      const r = await client.declaredLocations.bulkDeclare({
        assets: [{ external_id: ext, declared_location: point }],
      });
      expect(r).toEqual({ success: 1, failed: 0, created: 0, errors: [] });
      expect((await client.assets.get(m6)).declared_location).toEqual(point);
    });

    it('re-declare by MAC with the stored location publishes nothing', async (ctx) => {
      const point = locationOrSkip(ctx, loc);
      const r = await client.declaredLocations.bulkDeclare({
        assets: [{ mac_address: formatMac(m6) }],
        shared_location: point,
      });
      expect(r).toEqual({ success: 1, failed: 0, created: 0, errors: [] });
      expect((await client.assets.get(m6)).declared_location).toEqual(point);
    });

    it('clear by MAC, by external id and an unknown MAC', async (ctx) => {
      locationOrSkip(ctx, loc);
      const byMac = await client.declaredLocations.bulkClear({ mac_addresses: [formatMac(m6)] });
      expect(byMac).toEqual({
        success: 1,
        failed: 0,
        results: [{ mac_address: m6, status: 'cleared' }],
      });
      expect((await client.assets.get(m6)).declared_location).toBeUndefined();

      const byExt = await client.declaredLocations.bulkClear({ external_ids: [ext] });
      expect(byExt.success).toBe(1);
      expect(byExt.results[0]).toEqual({ mac_address: m6, status: 'cleared' });

      const m7 = testMac(7);
      await expect(client.assets.get(m7)).rejects.toBeInstanceOf(NotFoundError);
      const unknown = await client.declaredLocations.bulkClear({ mac_addresses: [m7] });
      expect(unknown.success).toBe(0);
      expect(unknown.failed).toBe(1);
      expect(unknown.results).toHaveLength(1);
      expect(unknown.results[0]).toMatchObject({
        mac_address: m7,
        status: 'error',
        error: 'DL_017',
      });

      await expect(client.assets.delete(m6)).resolves.toBeUndefined();
    });
  },
  { ruleEngine: true, positions: 'declared', requires: ['W'] }
);
