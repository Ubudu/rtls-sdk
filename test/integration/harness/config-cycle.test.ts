import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abortExitCode } from './abort';
import { setActiveHarness } from './active';
import { configStatePaths } from './config-core';
import { validateChange } from './config-resources';
import { configCycle, ConfigRestoreFailed, withConfigLock, type ConfigCycle } from './config-cycle';
import type { Harness } from './context';
import { FakeApi } from './fake-api';
import { expectGuardViolation } from './guard';
import { zeroCounts } from './ledger.mjs';
import { acquireRunLock, holdsLock, lockPaths, newLockToken } from './lock.mjs';
import { rawRequest } from './raw';
import { buildRunReport } from './report';
import { inBlock, makeHarness, RUN_PREFIX, SAFE_PREFLIGHT, TEST_NS } from './unit-support';

/** What vitest's ctx.skip does: it throws, so nothing after it runs. */
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

/** Alert-rule document B: one enabled rule naming a real (non-test) asset. */
const B = {
  name: 'Demo rules',
  rules: [
    {
      id: 'rule-1',
      conditions: { all: [{ fact: 'user_udid', operator: 'equal', value: 'aabbccddeeff' }] },
      event: { type: 'message', params: { message: 'hello' } },
    },
  ],
};
const testRule = (suffix: string, extra: Record<string, unknown> = {}) => ({
  id: `${RUN_PREFIX}${suffix}`,
  disabled: true,
  conditions: { all: [{ fact: 'zone_id', operator: 'equal', value: 3 }] },
  event: { type: 'message', params: { message: 'sdk test' } },
  ...extra,
});
const withRule = (rule: unknown) => ({ ...B, rules: [...B.rules, rule] });
const T1 = withRule(testRule('t'));
const T2 = withRule(
  testRule('t', { conditions: { all: [{ fact: 'zone_id', operator: 'equal', value: 4 }] } })
);

let api: FakeApi;
let h: Harness;
let mainStateDir: string;
let stateDir: string;
let token: string;

beforeEach(async () => {
  api = new FakeApi().install();
  api.alertRules = structuredClone(B);
  const t = makeHarness({ tiers: { C: true } });
  h = t.h;
  mainStateDir = t.mainStateDir;
  stateDir = t.stateDir;
  token = newLockToken();
  if (!(await acquireRunLock({ token, stateDir: mainStateDir }))) throw new Error('run lock');
  vi.stubEnv('RTLS_IT_INTERNAL_LOCK_TOKEN', token);
});
afterEach(() => {
  vi.unstubAllEnvs();
  setActiveHarness(null);
});

const configLock = (): string => lockPaths(mainStateDir).config;
const writes = (): string[] => api.writes().map((w) => `${w.method} ${w.path}`);
const alertWrite = (body: unknown) => rawRequest('POST', '/alert_rules/{ns}', { body });
const inC = <R>(fn: () => Promise<R>): Promise<R> => inBlock(h, 'C', fn, 'dashboards-rules');

describe('configCycle order and restore', () => {
  it('order: lock → read → save + read-back → body → read → restore only when different → read → unlock', async () => {
    const events: string[] = [];
    const saved = (): boolean => existsSync(configStatePaths(stateDir, 'alert-rules').json);
    api.onRequest = (r) =>
      events.push(
        `${r.method} lock=${String(holdsLock(configLock(), token))} saved=${String(saved())}`
      );
    await inC(() =>
      configCycle<typeof B>(ctx, 'alert-rules', async (cycle) => {
        events.push(`body lock=${String(holdsLock(configLock(), token))} saved=${String(saved())}`);
        const paths = configStatePaths(stateDir, 'alert-rules');
        expect(JSON.parse(readFileSync(paths.json, 'utf8'))).toEqual(B);
        expect(readFileSync(paths.raw, 'utf8')).toBe(cycle.beforeText);
        expect(cycle.before).toEqual(B);
        expect((await alertWrite(T1)).status).toBe(200);
      })
    );
    expect(events).toEqual([
      'GET lock=true saved=false',
      'body lock=true saved=true',
      'POST lock=true saved=true',
      'GET lock=true saved=true',
      'POST lock=true saved=true',
      'GET lock=true saved=true',
    ]);
    expect(api.alertRules).toEqual(B);
    expect(holdsLock(configLock(), token)).toBe(false);
    expect(existsSync(configStatePaths(stateDir, 'alert-rules').restored)).toBe(true);
  });

  it('a body that ends equal to the before-image makes no restore write', async () => {
    await inC(() =>
      configCycle(ctx, 'alert-rules', async () => {
        await alertWrite(T1);
        await alertWrite(B);
      })
    );
    expect(writes()).toEqual([`POST /alert_rules/${TEST_NS}`, `POST /alert_rules/${TEST_NS}`]);
    expect(api.alertRules).toEqual(B);
  });

  it('a body that leaves a change is restored and verified', async () => {
    await inC(() => configCycle(ctx, 'alert-rules', async () => void (await alertWrite(T1))));
    expect(writes()).toHaveLength(2);
    expect(api.writes()[1]?.body).toEqual(B);
    expect(api.alertRules).toEqual(B);
    expect(api.log.at(-1)?.method).toBe('GET');
    expect(h.abortState()).toBeNull();
  });

  it('a body that throws is restored, then its error is rethrown', async () => {
    const boom = new Error('body failed');
    await expect(
      inC(() =>
        configCycle(ctx, 'alert-rules', async () => {
          await alertWrite(T1);
          throw boom;
        })
      )
    ).rejects.toBe(boom);
    expect(api.alertRules).toEqual(B);
    expect(holdsLock(configLock(), token)).toBe(false);
  });

  it('restoreWith replaces the default raw write; its result is ignored', async () => {
    const restoreWith = vi.fn(async (before: typeof B) => {
      await alertWrite(before);
      return { ignored: true };
    });
    await inC(() =>
      configCycle<typeof B>(ctx, 'alert-rules', async () => void (await alertWrite(T1)), {
        restoreWith,
      })
    );
    expect(restoreWith).toHaveBeenCalledTimes(1);
    expect(restoreWith.mock.calls[0]?.[0]).toEqual(B);
    expect(api.alertRules).toEqual(B);
  });

  it('a restore mismatch aborts the run (restore-failed, driver exit 4) and fails the cycle', async () => {
    api.alertRulesWriteTransform = (body) => ({
      ...(body as object),
      name: 'changed by the server',
    });
    await expect(
      inC(() => configCycle(ctx, 'alert-rules', async () => void (await alertWrite(T1))))
    ).rejects.toBeInstanceOf(ConfigRestoreFailed);
    expect(h.abortState()).toEqual({ reason: 'restore-failed', label: 'alert-rules' });
    const report = buildRunReport({
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
    expect(report.abort).toBe('restore-failed');
    expect(report.ok).toBe(false);
    expect(report.configRestores).toEqual([{ resource: 'alert-rules', ok: false }]);
    expect(abortExitCode(report.abort)).toBe(4);
    expect(holdsLock(configLock(), token)).toBe(false);
  });
});

describe('configCycle with no stored value', () => {
  const skipsWithoutWrite = async (
    resource: 'alert-rules' | 'notification-cleanup-policy',
    run: () => Promise<void>
  ): Promise<void> => {
    await expect(run()).rejects.toMatchObject({ note: 'no stored value' });
    expect(writes()).toEqual([]);
    expect(holdsLock(configLock(), token)).toBe(false);
    expect(existsSync(configStatePaths(stateDir, resource).restored)).toBe(true);
  };

  it('alert rules without a `rules` array → skip, no write', async () => {
    api.alertRules = { name: 'Demo rules' };
    const body = vi.fn(async () => undefined);
    await skipsWithoutWrite('alert-rules', () => inC(() => configCycle(ctx, 'alert-rules', body)));
    expect(body).not.toHaveBeenCalled();
  });

  it('a cleanup policy without `_id` → skip, no write', async () => {
    const body = vi.fn(async () => undefined);
    await skipsWithoutWrite('notification-cleanup-policy', () =>
      inC(() => configCycle(ctx, 'notification-cleanup-policy', body))
    );
    expect(body).not.toHaveBeenCalled();
  });

  it('a 403 → skip, no write', async () => {
    api.cleanupPolicy = { _id: 'cp-1', auto_archive_days: 30 };
    api.status.cleanupPolicy = 403;
    const body = vi.fn(async () => undefined);
    await skipsWithoutWrite('notification-cleanup-policy', () =>
      inC(() => configCycle(ctx, 'notification-cleanup-policy', body))
    );
    expect(body).not.toHaveBeenCalled();
  });
});

describe('configCycle bodies (G9 through validateChange)', () => {
  it("P5's sequence of 7 writes with bodies B, B + T and B + T2 is admitted", async () => {
    const sequence = [T1, B, T2, T1, B, T2, B];
    await inC(() =>
      configCycle(ctx, 'alert-rules', async () => {
        for (const body of sequence) expect((await alertWrite(body)).status).toBe(200);
      })
    );
    expect(writes()).toHaveLength(7);
    expect(h.unexpectedViolations()).toEqual([]);
  });

  it('an added rule that is enabled, or whose id lacks the run prefix, is rejected (G9)', async () => {
    await inC(() =>
      configCycle(ctx, 'alert-rules', async () => {
        await expectGuardViolation('G9', () =>
          alertWrite(withRule(testRule('t', { disabled: false })))
        );
        await expectGuardViolation('G9', () =>
          alertWrite(withRule({ ...testRule('t'), id: 'other-rule' }))
        );
        await expectGuardViolation('G9', () =>
          alertWrite(withRule({ ...testRule('t'), id: 'sdk-test-0badc0de-t' }))
        );
      })
    );
    expect(writes()).toEqual([]);
  });

  it('an added disabled rule holding a mustache tag anywhere (params, keys, conditions) is rejected (G9)', async () => {
    // a section opened in one string and closed in another
    const spanning = testRule('t', {
      event: { type: 'post_to_email', params: { a: '{{#nofact}}' } },
      b: { c: { d: '{{/nofact}}' } },
    });
    const templated = [
      spanning,
      testRule('t', { event: { type: 'message', params: { message: 'hi {{user_name}}' } } }),
      testRule('t', { '{{x}}': 1 }),
      testRule('t', {
        conditions: {
          all: [{ fact: 'user_udid', operator: 'equal', value: '{{#x}}aabbccddeeff{{/x}}' }],
        },
      }),
    ];
    await inC(() =>
      configCycle(ctx, 'alert-rules', async () => {
        for (const rule of templated)
          await expectGuardViolation('G9', () => alertWrite(withRule(rule)));
        // a before-image that changes the delimiters admits no added rule either
        expect(
          validateChange(
            'alert-rules',
            { ...B, name: '{{=<% %>=}}' },
            { ...B, name: '{{=<% %>=}}', rules: [...B.rules, testRule('t')] },
            { runId: h.runId }
          )
        ).toBe(false);
        // the untemplated rule and the write-back stay admitted
        expect((await alertWrite(T1)).status).toBe(200);
        expect((await alertWrite(B)).status).toBe(200);
      })
    );
    expect(writes()).toEqual([`POST /alert_rules/${TEST_NS}`, `POST /alert_rules/${TEST_NS}`]);
  });

  it('cleanup policy: the projection onto the body keys must equal the before-image', async () => {
    api.cleanupPolicy = {
      _id: 'cp-1',
      app_namespace: TEST_NS,
      user_id: 'self-user-1',
      auto_archive_days: 30,
      auto_purge_days: 180,
      updated_at: '2026-01-01T00:00:00.000Z',
    };
    const put = (body: unknown) =>
      rawRequest('PUT', '/notifications/{ns}/cleanup-policy', { body });
    await inC(() =>
      configCycle(ctx, 'notification-cleanup-policy', async () => {
        expect((await put({ auto_archive_days: 30, auto_purge_days: 180 })).status).toBe(200);
        await expectGuardViolation('G9', () =>
          put({ auto_archive_days: 31, auto_purge_days: 180 })
        );
        await expectGuardViolation('G9', () => put({ auto_archive_days: 30, retention: 5 }));
      })
    );
    // The admitted replace stored only two keys: the cycle restored the before-image.
    expect(writes()).toEqual([
      `PUT /notifications/${TEST_NS}/cleanup-policy`,
      `PUT /notifications/${TEST_NS}/cleanup-policy`,
    ]);
    expect(api.cleanupPolicy).toMatchObject({ _id: 'cp-1', auto_purge_days: 180 });
  });

  it('tenant config: the before-image minus metadata and the raw before-image are admitted', async () => {
    const before = {
      _id: 'tc-1',
      app_namespace: TEST_NS,
      updated_at: '2026-01-01T00:00:00.000Z',
      __v: 0,
      inapp: { enabled: true },
    };
    api.tenantConfig = before;
    const put = (body: unknown) =>
      rawRequest('PUT', '/notifications/{ns}/tenant-config', {
        body,
        headers: { 'Content-Type': 'application/json' },
      });
    await inC(() =>
      configCycle<typeof before>(
        ctx,
        'notification-tenant-config',
        async (cycle: ConfigCycle<typeof before>) => {
          const { _id, app_namespace, updated_at, __v, ...rest } = cycle.before;
          expect([_id, app_namespace, updated_at, __v]).toEqual([
            'tc-1',
            TEST_NS,
            before.updated_at,
            0,
          ]);
          expect((await put(rest)).status).toBe(200);
          expect((await put(cycle.beforeText)).status).toBe(200);
          await expectGuardViolation('G9', () => put({ inapp: { enabled: false } }));
        }
      )
    );
    expect(api.tenantConfig).toEqual(before);
  });
});

describe('configCycle lock and block', () => {
  it('releases the config lock on every path (success, body error, skip, restore failure)', async () => {
    await inC(() => configCycle(ctx, 'alert-rules', async () => undefined));
    expect(existsSync(configLock())).toBe(false);
    await expect(
      inC(() =>
        configCycle(ctx, 'alert-rules', async () => {
          throw new Error('x');
        })
      )
    ).rejects.toThrow('x');
    expect(existsSync(configLock())).toBe(false);
    api.alertRules = { name: 'none' };
    await expect(
      inC(() => configCycle(ctx, 'alert-rules', async () => undefined))
    ).rejects.toBeInstanceOf(Skipped);
    expect(existsSync(configLock())).toBe(false);
    api.alertRules = structuredClone(B);
    api.alertRulesWriteTransform = () => ({ name: 'never equal', rules: [] });
    await expect(
      inC(() => configCycle(ctx, 'alert-rules', async () => void (await alertWrite(T1))))
    ).rejects.toBeInstanceOf(ConfigRestoreFailed);
    expect(existsSync(configLock())).toBe(false);
    expect(holdsLock(lockPaths(mainStateDir).run, token)).toBe(true);
  });

  it('outside a C block (or with RTLS_IT_CONFIG off) → GuardViolation G9, no request', async () => {
    await expectGuardViolation('G9', () => configCycle(ctx, 'alert-rules', async () => undefined));
    await expectGuardViolation('G9', () =>
      inBlock(h, 'W', () => configCycle(ctx, 'alert-rules', async () => undefined))
    );
    const off = makeHarness({ tiers: { C: false } }).h;
    await expectGuardViolation('G9', () =>
      inBlock(off, 'C', () => configCycle(ctx, 'alert-rules', async () => undefined))
    );
    expect(api.log).toEqual([]);
  });

  it('without the run lock held by the token, the config lock is not acquired (precondition)', async () => {
    vi.stubEnv('RTLS_IT_INTERNAL_LOCK_TOKEN', newLockToken());
    await expect(
      inC(() => configCycle(ctx, 'alert-rules', async () => undefined))
    ).rejects.toMatchObject({ name: 'HarnessPrecondition', exitCode: 2 });
    expect(api.log).toEqual([]);
  });

  it('withConfigLock holds the lock while fn runs, is re-entrant and releases it afterwards', async () => {
    const held = await withConfigLock(async () => {
      const outer = holdsLock(configLock(), token);
      const inner = await withConfigLock(async () => holdsLock(configLock(), token));
      // the inner call neither took nor released the lock: the outer holder still has it
      return [outer, inner, holdsLock(configLock(), token)];
    });
    expect(held).toEqual([true, true, true]);
    expect(holdsLock(configLock(), token)).toBe(false);
    await expect(
      withConfigLock(async () => {
        throw new Error('inside');
      })
    ).rejects.toThrow('inside');
    expect(existsSync(configLock())).toBe(false);
  });
});
