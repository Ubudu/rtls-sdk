import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setActiveHarness } from './active';
import { pendingCleanups, runCleanup } from './cleanup';
import type { Tier } from './env';
import { FakeApi } from './fake-api';
import { expectGuardViolation } from './guard';
import { testMac, testName } from './names';
import { createTestAsset } from './test-asset';
import { inBlock, makeHarness, TEST_NS } from './unit-support';

let api: FakeApi;
beforeEach(() => {
  api = new FakeApi().install();
});
afterEach(() => setActiveHarness(null));

describe('createTestAsset', () => {
  it('an existing MAC → throws without a POST', async () => {
    const { h } = makeHarness({ tiers: { W: true } });
    api.assets.push({ user_udid: testMac(7), user_name: 'left by a crashed run' });
    await inBlock(h, 'W', async () => {
      await expect(createTestAsset(7, 'sweep')).rejects.toThrow(/is not free \(GET answered 200\)/);
    });
    expect(api.writes()).toEqual([]);
    expect(pendingCleanups(h.stateDir)).toEqual([]);
  });

  it('creates the asset (201 Created, no Content-Type) and registers its DELETE with a 404 verify', async () => {
    const { h, stateDir } = makeHarness({ tiers: { W: true } });
    const mac = testMac(0);
    const created = await inBlock(h, 'W', () => createTestAsset(0, 'sweep'));
    expect(created).toEqual({ mac, status: 201, body: 'Created', contentType: null });
    expect(api.writes()).toEqual([
      {
        method: 'POST',
        path: `/assets/${TEST_NS}/${mac}`,
        query: {},
        body: { user_udid: mac, user_name: testName('sweep') },
      },
    ]);
    expect(pendingCleanups(stateDir)).toEqual([
      expect.objectContaining({
        label: `test asset ${mac}`,
        request: { method: 'DELETE', path: `/assets/{ns}/${mac}` },
        verify: { path: `/assets/{ns}/${mac}`, goneStatus: [404] },
      }),
    ]);
    // the registered cleanup removes it and verifies the 404
    expect(await runCleanup()).toEqual({ done: 1, failed: [] });
    expect(api.assets).toEqual([]);
  });

  it('in an S block with tier W enabled (requires W) it is allowed', async () => {
    const { h } = makeHarness({ tiers: { W: true, S: true } });
    const created = await inBlock(h, 'S', () => createTestAsset(41, 'etl-asset'));
    expect(created.mac).toBe(testMac(41));
    expect(api.assets).toHaveLength(1);
  });

  it.each<[string, Partial<Record<Tier, boolean>>, Tier]>([
    ['an S block without tier W', { S: true }, 'S'],
    ['an R block', { W: true }, 'R'],
    ['a C block', { W: true, C: true }, 'C'],
  ])('in %s → GuardViolation G4, nothing created', async (_name, tiers, tier) => {
    const { h } = makeHarness({ tiers });
    await inBlock(h, tier, () => expectGuardViolation('G4', () => createTestAsset(3, 'x')));
    expect(api.assets).toEqual([]);
    expect(api.writes()).toEqual([]);
  });

  it('is rejected by G18 when the preflight forbids asset writes', async () => {
    const { h } = makeHarness({
      tiers: { W: true },
      preflight: {
        ruleEngineSafe: true,
        positionSafe: true,
        declaredPositionSafe: true,
        linkedNamespaceSafe: false,
        linkedCount: 1,
        blocking: [],
      },
    });
    await inBlock(h, 'W', () => expectGuardViolation('G18', () => createTestAsset(3, 'x')));
    expect(api.writes()).toEqual([]);
  });
});
