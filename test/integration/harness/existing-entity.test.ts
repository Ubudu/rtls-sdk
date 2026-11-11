import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abortExitCode } from './abort';
import { setActiveHarness } from './active';
import { withConfigLock } from './config-cycle';
import type { Harness } from './context';
import { withExistingEntityGuard } from './existing-entity';
import { FakeApi } from './fake-api';
import { expectGuardViolation } from './guard';
import { zeroCounts } from './ledger.mjs';
import { acquireRunLock, newLockToken } from './lock.mjs';
import { rawRequest } from './raw';
import { buildRunReport } from './report';
import { describeLive, setLiveDecisionSourceForTesting, setSuiteApiForTesting } from './tiers';
import { inBlock, makeHarness, RUN_PREFIX, SAFE_PREFLIGHT } from './unit-support';

class Skipped extends Error {
  constructor(readonly note?: string) {
    super(`skipped: ${note ?? ''}`);
  }
}
const ctx = {
  skip: (note?: string): never => {
    throw new Skipped(note);
  },
};

interface Connection {
  _id: string;
  channel: string;
}
interface Mapping {
  id: string;
  enabled: boolean;
}

let api: FakeApi;
let h: Harness;
let token: string;

beforeEach(async () => {
  api = new FakeApi().install();
  const t = makeHarness({ tiers: { W: true, C: true } });
  h = t.h;
  token = newLockToken();
  if (!(await acquireRunLock({ token, stateDir: t.mainStateDir }))) throw new Error('run lock');
  vi.stubEnv('RTLS_IT_INTERNAL_LOCK_TOKEN', token);
  mkdirSync(h.allowlistDir, { recursive: true });
  writeFileSync(
    join(h.allowlistDir, 'P6.json'),
    JSON.stringify({
      phase: 'P6',
      entries: [
        {
          id: 'P6-1',
          file: 'src/resources/notifications/connections.ts',
          lines: [1, 2],
          match: 'x',
          category: 'unreachable-live',
          reason: 'existing connection for the channel in this run',
          unitTest: 'test/resources/notifications/connections.test.ts',
          runScoped: true,
        },
        {
          id: 'P6-2',
          file: 'src/resources/notifications/connections.ts',
          lines: [3, 4],
          match: 'y',
          category: 'unreachable-live',
          reason: 'second run-scoped entry of the same guard',
          unitTest: 'test/resources/notifications/connections.test.ts',
          runScoped: true,
        },
      ],
    })
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  setActiveHarness(null);
  setSuiteApiForTesting(null);
  setLiveDecisionSourceForTesting(null);
});

const report = () =>
  buildRunReport({
    h,
    sha: 'unit',
    tiers: h.env.tiers,
    preflight: SAFE_PREFLIGHT,
    warnings: [],
    othersBefore: zeroCounts(),
    differences: [],
    stateDiff: 'none',
    abort: null,
  });
const listConnections = async (): Promise<Connection[]> =>
  (await rawRequest('GET', '/notifications/{ns}/connections')).json as Connection[];
const listMappings = async (): Promise<Mapping[]> =>
  (await rawRequest('GET', '/notifications/{ns}/recipient-mappings')).json as Mapping[];
const postConnection = (channel: string) =>
  rawRequest('POST', '/notifications/{ns}/connections', { body: { channel, config: {} } });
const postMapping = () =>
  rawRequest('POST', '/notifications/{ns}/recipient-mappings', {
    body: { enabled: false, match: { event_types: [`${RUN_PREFIX}map`] } },
  });

describe('withExistingEntityGuard: skip on an existing entry', () => {
  it('a matching entry → skip, a dynamic-allowlist entry and every allowlistIds entry activated', async () => {
    api.connections = [{ _id: 'c-1', channel: 'email' }];
    const body = vi.fn(async () => 'ran');
    await expect(
      inBlock(h, 'W', () =>
        withExistingEntityGuard(
          ctx,
          'notification-connections',
          listConnections,
          (c) => c.channel === 'email',
          body,
          { allowlistIds: ['P6-1', 'P6-2'] }
        )
      )
    ).rejects.toBeInstanceOf(Skipped);
    expect(body).not.toHaveBeenCalled();
    const entries = report().dynamicAllowlist;
    expect(entries.map((e) => [e.kind, e.allowlistId ?? null])).toEqual([
      ['run-scoped', 'P6-1'],
      ['run-scoped', 'P6-2'],
      ['existing-entity', null],
    ]);
    expect(entries.every((e) => e.reason.includes('notification-connections'))).toBe(true);
    expect(api.writes()).toEqual([]);
  });

  it('a non-matching entry does not skip; the typed form infers I from listBefore', async () => {
    api.connections = [{ _id: 'c-1', channel: 'slack' }];
    const result = await inBlock(h, 'W', () =>
      withExistingEntityGuard<string, Connection>(
        ctx,
        'notification-connections',
        listConnections,
        (c) => c.channel === 'email',
        async () => 'ran'
      )
    );
    expect(result).toBe('ran');
    expect(report().dynamicAllowlist).toEqual([]);
  });
});

describe('withExistingEntityGuard: G10 inside the body only', () => {
  it('connections: an upsert passes inside the body, the same request outside is rejected', async () => {
    await inBlock(h, 'W', async () => {
      await expectGuardViolation('G10', () => postConnection('email'));
      const created = await withExistingEntityGuard(
        ctx,
        'notification-connections',
        listConnections,
        (c) => c.channel === 'email',
        async () => {
          const r = await postConnection('email');
          expect(r.status).toBe(201);
          const id = (r.json as Connection)._id;
          expect((await rawRequest('DELETE', `/notifications/{ns}/connections/${id}`)).status).toBe(
            204
          );
          return id;
        }
      );
      expect(created).toMatch(/^connections-/);
      await expectGuardViolation('G10', () => postConnection('email'));
    });
    expect(api.connections).toEqual([]);
  });

  it("'notification-connections' outside a W block (or with RTLS_IT_WRITES off) → GuardViolation", async () => {
    const run = () =>
      withExistingEntityGuard(
        ctx,
        'notification-connections',
        listConnections,
        () => false,
        async () => 1
      );
    await expectGuardViolation('G10', run);
    await expectGuardViolation('G10', () => inBlock(h, 'C', run));
    const off = makeHarness({ tiers: { W: false } }).h;
    await expectGuardViolation('G10', () => inBlock(off, 'W', run));
    expect(api.log).toEqual([]);
  });

  it("'recipient-mappings' without the config lock, or outside a C block → GuardViolation", async () => {
    const run = () =>
      withExistingEntityGuard(
        ctx,
        'recipient-mappings',
        listMappings,
        () => false,
        async () => 1
      );
    await expectGuardViolation('G10', () => inBlock(h, 'C', run));
    await expectGuardViolation('G10', () => withConfigLock(() => inBlock(h, 'W', run)));
    await expectGuardViolation('G10', () => withConfigLock(run));
    expect(api.log).toEqual([]);
  });

  it('onFailure with notification-connections → throws before any request', async () => {
    await expect(
      inBlock(h, 'W', () =>
        withExistingEntityGuard(
          ctx,
          'notification-connections',
          listConnections,
          () => false,
          async () => 1,
          {
            onFailure: 'abort',
          }
        )
      )
    ).rejects.toThrow(/onFailure is valid only for 'recipient-mappings'/);
    expect(api.log).toEqual([]);
  });
});

describe('withExistingEntityGuard: recipient-mapping restore check (onFailure abort)', () => {
  const guarded = (body: () => Promise<unknown>) =>
    withConfigLock(() =>
      inBlock(h, 'C', () =>
        withExistingEntityGuard(ctx, 'recipient-mappings', listMappings, () => false, body, {
          onFailure: 'abort',
        })
      )
    );

  it('a body that leaves the list as it was → no abort', async () => {
    api.recipientMappings = [{ id: 'map_9_9', enabled: false }];
    await guarded(async () => {
      const r = await postMapping();
      const id = (r.json as Mapping).id;
      expect(
        (await rawRequest('DELETE', `/notifications/{ns}/recipient-mappings/${id}`)).status
      ).toBe(204);
    });
    expect(h.abortState()).toBeNull();
    expect(report().abort).toBeNull();
  });

  it('a list that differs after the body returned → restore-failed, exit 4, later blocks skipped', async () => {
    await guarded(async () => void (await postMapping()));
    expect(h.abortState()).toEqual({ reason: 'restore-failed', label: 'recipient-mappings' });
    expect(report().abort).toBe('restore-failed');
    expect(abortExitCode(report().abort)).toBe(4);
    const skippedTitles: string[] = [];
    setSuiteApiForTesting({
      describe: () => undefined,
      describeSkip: (title) => skippedTitles.push(title),
      beforeAll: () => undefined,
      afterAll: () => undefined,
      beforeEach: () => undefined,
    });
    setLiveDecisionSourceForTesting({ hasCredentials: () => true, harness: () => h });
    describeLive('R', 'later block', () => undefined);
    expect(skippedTitles).toEqual(['[R] later block (skipped: run aborted)']);
  });

  it('a list that differs after the body threw → restore-failed, and the body error is rethrown', async () => {
    const boom = new Error('body failed');
    await expect(
      guarded(async () => {
        await postMapping();
        throw boom;
      })
    ).rejects.toBe(boom);
    expect(report().abort).toBe('restore-failed');
  });

  it('recipient mappings default to the restore check without onFailure', async () => {
    await withConfigLock(() =>
      inBlock(h, 'C', () =>
        withExistingEntityGuard(
          ctx,
          'recipient-mappings',
          listMappings,
          () => false,
          async () => postMapping()
        )
      )
    );
    expect(report().abort).toBe('restore-failed');
  });
});
