import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { abortRun } from './abort';
import { setActiveHarness } from './active';
import type { Harness } from './context';
import type { Tier } from './env';
import { expectGuardViolation, guardedFetch, type GuardViolation } from './guard';
import type { PreflightVerdicts } from './policy';
import {
  buildDomainsReport,
  currentBlock,
  currentTier,
  describeLive,
  liveTitle,
  outcomesFromTasks,
  parseLiveTitle,
  setLiveDecisionSourceForTesting,
  setSuiteApiForTesting,
  type DescribeLiveOptions,
  type LiveTestOutcome,
  type SuiteApi,
  type TaskLike,
} from './tiers';
import {
  apiUrl,
  jsonInit,
  makeHarness,
  SAFE_PREFLIGHT,
  SELF_USER,
  TEST_MAC,
  useDefaultApi,
} from './unit-support';

// ─── One real vitest block (collected with a test harness, never the live one) ──────────────────────
const real = makeHarness({ tiers: { W: true } });
setLiveDecisionSourceForTesting({ hasCredentials: () => true, harness: () => real.h });
describeLive('W', 'real vitest block', () => {
  it('runs under its tier, with the domain of its file', () => {
    expect(real.h.currentBlock()).toEqual(
      expect.objectContaining({ tier: 'W', name: 'real vitest block', domain: 'harness' })
    );
  });
});
setLiveDecisionSourceForTesting(null);
setActiveHarness(null);

// ─── Fake runner with vitest semantics (stack-ordered afterAll, beforeEach chain, ctx.skip) ─────────
interface FakeTest {
  kind: 'test';
  name: string;
  fn: () => unknown;
}
interface FakeSuite {
  kind: 'suite';
  title: string;
  skip: boolean;
  children: (FakeSuite | FakeTest)[];
  beforeAll: (() => unknown)[];
  afterAll: (() => unknown)[];
  beforeEach: ((ctx: { skip: (note?: string) => void }) => unknown)[];
}
const SKIP = Symbol('skip');

function fakeRunner(file = '/repo/test/integration/harness/fake.int.test.ts') {
  const root: FakeSuite = {
    kind: 'suite',
    title: '',
    skip: false,
    children: [],
    beforeAll: [],
    afterAll: [],
    beforeEach: [],
  };
  let current = root;
  const open = (title: string, skip: boolean, fn: () => void): void => {
    const suite: FakeSuite = {
      kind: 'suite',
      title,
      skip,
      children: [],
      beforeAll: [],
      afterAll: [],
      beforeEach: [],
    };
    current.children.push(suite);
    const parent = current;
    current = suite;
    try {
      fn();
    } finally {
      current = parent;
    }
  };
  const api: SuiteApi = {
    describe: (title, fn) => open(title, false, fn),
    describeSkip: (title, fn) => open(title, true, fn),
    beforeAll: (fn) => current.beforeAll.push(fn),
    afterAll: (fn) => current.afterAll.push(fn),
    beforeEach: (fn) => current.beforeEach.push(fn),
  };
  const test = (name: string, fn: () => unknown): void => {
    current.children.push({ kind: 'test', name, fn });
  };
  const errors: unknown[] = [];
  async function run(): Promise<LiveTestOutcome[]> {
    const out: LiveTestOutcome[] = [];
    const walk = async (
      suite: FakeSuite,
      titles: string[],
      skipped: boolean,
      each: FakeSuite['beforeEach']
    ): Promise<void> => {
      const off = skipped || suite.skip;
      const path = suite === root ? titles : [...titles, suite.title];
      const chain = [...each, ...suite.beforeEach];
      if (!off) for (const hook of suite.beforeAll) await hook();
      for (const child of suite.children) {
        if (child.kind === 'suite') {
          await walk(child, path, off, chain);
          continue;
        }
        if (off) {
          out.push({ file, suites: path, test: child.name, state: 'skip' });
          continue;
        }
        let note: string | undefined;
        // the fake runner records every outcome: pass, skip (SKIP thrown) or fail (error kept in `errors`)
        const [settled] = await Promise.allSettled([
          (async () => {
            for (const hook of chain) {
              await hook({
                skip: (n?: string) => {
                  note = n;
                  throw SKIP;
                },
              });
            }
            await child.fn();
          })(),
        ]);
        let outcome: 'pass' | 'skip' | 'fail' = 'pass';
        if (settled?.status === 'rejected') {
          if (settled.reason === SKIP) outcome = 'skip';
          else {
            errors.push(settled.reason);
            outcome = 'fail';
          }
        }
        out.push({
          file,
          suites: path,
          test: child.name,
          state: outcome,
          ...(note ? { note } : {}),
        });
      }
      if (!off) for (const hook of [...suite.afterAll].reverse()) await hook();
    };
    await walk(root, [], false, []);
    return out;
  }
  return { api, test, run, root, errors };
}

function setup(
  options: {
    tiers?: Partial<Record<Tier, boolean>>;
    preflight?: PreflightVerdicts | null;
    features?: Partial<Record<'notifications' | 'etl', boolean>>;
  } = {},
  credentials = true
): { h: Harness; runner: ReturnType<typeof fakeRunner> } {
  const { h } = makeHarness(options);
  const runner = fakeRunner();
  setSuiteApiForTesting(runner.api);
  setLiveDecisionSourceForTesting({ hasCredentials: () => credentials, harness: () => h });
  return { h, runner };
}

function titleOf(runner: ReturnType<typeof fakeRunner>, index = 0): string {
  return (runner.root.children[index] as FakeSuite).title;
}

beforeEach(() => useDefaultApi());
afterEach(() => {
  setSuiteApiForTesting(null);
  setLiveDecisionSourceForTesting(null);
  setActiveHarness(null);
});
afterAll(() => setLiveDecisionSourceForTesting(null));

describe('describeLive titles', () => {
  it('titles are `[<tier>] <name>`; a skipped block carries its reason', () => {
    const { runner } = setup({ tiers: { W: true } });
    describeLive('W', 'sweep', () => undefined);
    describeLive('S', 'publish', () => undefined);
    expect(titleOf(runner, 0)).toBe('[W] sweep');
    expect(titleOf(runner, 1)).toBe(
      '[S] publish (skipped: tier S off (RTLS_IT_SIDE_EFFECTS not 1))'
    );
    expect(parseLiveTitle(titleOf(runner, 1))).toEqual({
      tier: 'S',
      name: 'publish',
      skipReason: 'tier S off (RTLS_IT_SIDE_EFFECTS not 1)',
    });
    expect(parseLiveTitle(liveTitle('R', 'x'))).toEqual({ tier: 'R', name: 'x', skipReason: null });
    expect(parseLiveTitle('plain describe')).toBeNull();
    expect(() => describeLive('X' as Tier, 'bad', () => undefined)).toThrow(TypeError);
  });
});

describe('describeLive skip-reason matrix', () => {
  const allOn = { W: true, C: true, S: true };
  const cases: [
    string,
    Tier,
    DescribeLiveOptions,
    Parameters<typeof setup>[0],
    boolean,
    string | null,
  ][] = [
    ['no credentials', 'R', {}, {}, false, 'no credentials'],
    ['tier flag off', 'W', {}, {}, true, 'tier W off (RTLS_IT_WRITES not 1)'],
    [
      'requires W with W off',
      'S',
      { requires: ['W'] },
      { tiers: { S: true } },
      true,
      'requires tier W (RTLS_IT_WRITES not 1)',
    ],
    [
      'ruleEngine + ruleEngineSafe false',
      'W',
      { ruleEngine: true },
      { tiers: allOn, preflight: { ...SAFE_PREFLIGHT, ruleEngineSafe: false } },
      true,
      'preflight: ruleEngineSafe',
    ],
    [
      'ruleEngine + linkedNamespaceSafe false',
      'W',
      { ruleEngine: true },
      { tiers: allOn, preflight: { ...SAFE_PREFLIGHT, linkedNamespaceSafe: false } },
      true,
      'preflight: linkedNamespaceSafe',
    ],
    [
      'publish + positionSafe false',
      'S',
      { positions: 'publish' },
      { tiers: allOn, preflight: { ...SAFE_PREFLIGHT, positionSafe: false } },
      true,
      'preflight: positionSafe',
    ],
    [
      'declared + declaredPositionSafe false',
      'S',
      { positions: 'declared' },
      { tiers: allOn, preflight: { ...SAFE_PREFLIGHT, declaredPositionSafe: false } },
      true,
      'preflight: declaredPositionSafe',
    ],
    [
      'declared + a time-limited declaredPositionSafe past its end',
      'S',
      { positions: 'declared' },
      {
        tiers: allOn,
        preflight: {
          ...SAFE_PREFLIGHT,
          timeLimited: ['declaredPositionSafe'],
          timeLimitedUntil: new Date(Date.now() - 1_000).toISOString(),
        },
      },
      true,
      'preflight: declaredPositionSafe',
    ],
    [
      'declared + a time-limited declaredPositionSafe before its end',
      'S',
      { positions: 'declared' },
      {
        tiers: allOn,
        preflight: {
          ...SAFE_PREFLIGHT,
          timeLimited: ['declaredPositionSafe'],
          timeLimitedUntil: new Date(Date.now() + 3_600_000).toISOString(),
        },
      },
      true,
      null,
    ],
    [
      'ruleEngine without a preflight',
      'W',
      { ruleEngine: true },
      { tiers: allOn, preflight: null },
      true,
      'preflight: ruleEngineSafe, linkedNamespaceSafe',
    ],
    [
      'feature off',
      'R',
      { feature: 'notifications' },
      { features: { notifications: false } },
      true,
      'feature notifications off',
    ],
    [
      'S block without options, ruleEngineSafe false',
      'S',
      {},
      { tiers: allOn, preflight: { ...SAFE_PREFLIGHT, ruleEngineSafe: false } },
      true,
      null,
    ],
    [
      'S block without options, linkedNamespaceSafe false',
      'S',
      {},
      { tiers: allOn, preflight: { ...SAFE_PREFLIGHT, linkedNamespaceSafe: false } },
      true,
      null,
    ],
    [
      'all needed verdicts true',
      'S',
      { ruleEngine: true, positions: 'declared', requires: ['W'] },
      { tiers: allOn },
      true,
      null,
    ],
  ];
  it.each(cases)('%s', (_label, tier, options, harnessOptions, credentials, reason) => {
    const { runner } = setup(harnessOptions, credentials);
    describeLive(tier, 'block', () => undefined, options);
    const suite = runner.root.children[0] as FakeSuite;
    expect(suite.skip).toBe(reason !== null);
    expect(parseLiveTitle(suite.title)?.skipReason ?? null).toBe(reason);
  });

  it('an aborted run (abortRun) skips every later block', () => {
    const { runner } = setup({ tiers: { W: true } });
    describeLive('R', 'before', () => undefined);
    abortRun('restore-failed', 'alert-rules');
    describeLive('R', 'after', () => undefined);
    expect([titleOf(runner, 0), titleOf(runner, 1)]).toEqual([
      '[R] before',
      '[R] after (skipped: run aborted)',
    ]);
  });

  it('a block aborted while it runs skips its remaining tests at run time', async () => {
    const { h, runner } = setup({ tiers: { W: true } });
    describeLive('W', 'cycle', () => {
      runner.test('restore fails', () => abortRun('restore-failed', 'alert-rules'));
      runner.test('later test', () => {
        throw new Error('must not run');
      });
    });
    const outcomes = await runner.run();
    expect(outcomes.map((o) => [o.test, o.state, o.note])).toEqual([
      ['restore fails', 'pass', undefined],
      ['later test', 'skip', 'run aborted'],
    ]);
    expect(h.abortState()).toEqual({ reason: 'restore-failed', label: 'alert-rules' });
    expect(h.blocks).toEqual([]);
  });
});

describe('describeLive at run time', () => {
  it('an S block without options runs when ruleEngineSafe is false: a send passes, a publish is still rejected', async () => {
    const { h, runner } = setup({
      tiers: { S: true },
      preflight: { ...SAFE_PREFLIGHT, ruleEngineSafe: false },
    });
    const statuses: number[] = [];
    describeLive(
      'S',
      'inbox',
      () => {
        runner.test('send and publish', async () => {
          const sent = await guardedFetch(
            apiUrl('/notifications/{ns}/send'),
            jsonInit('POST', { recipients: [{ target_type: 'user', id: SELF_USER }], title: 't' })
          );
          statuses.push(sent.status);
          await expectGuardViolation('G18', () =>
            guardedFetch(apiUrl('/publisher/{ns}'), jsonInit('POST', { user_udid: TEST_MAC }))
          );
        });
      },
      { domain: 'notifications' }
    );
    const outcomes = await runner.run();
    expect(outcomes.map((o) => o.state)).toEqual(['pass']);
    expect(statuses).toEqual([201]);
    expect(h.budgetReport().notifications.used).toBe(1);
  });

  it('a block without options whose publish G18 rejects fails with a violation', async () => {
    const { h, runner } = setup({
      tiers: { S: true },
      preflight: { ...SAFE_PREFLIGHT, positionSafe: false },
    });
    describeLive(
      'S',
      'publish without options',
      () => {
        runner.test('publishes', () =>
          guardedFetch(apiUrl('/publisher/{ns}'), jsonInit('POST', { user_udid: TEST_MAC }))
        );
      },
      { domain: 'positions-spatial' }
    );
    const outcomes = await runner.run();
    expect(outcomes.map((o) => o.state)).toEqual(['fail']);
    expect(h.unexpectedViolations()).toEqual([
      { rule: 'G18', method: 'POST', template: '/publisher/{ns}' },
    ]);
  });

  it('nesting: S (requires W) inside W runs under S, replays only its own cleanups, and W resumes after it', async () => {
    const { h, runner } = setup({ tiers: { W: true, S: true } });
    const pending: { label: string; block: string }[] = [];
    const seen: string[] = [];
    const register = (label: string): void => {
      pending.push({ label, block: currentBlock()?.id ?? 'none' });
    };
    h.blockEndHooks.push((block) => {
      for (const entry of [...pending].reverse()) {
        if (entry.block !== block.id) continue;
        seen.push(
          `replay ${entry.label} under ${currentTier()} (pending: ${pending.map((p) => p.label).join(',')})`
        );
        pending.splice(pending.indexOf(entry), 1);
      }
    });
    describeLive('W', 'outer', () => {
      runner.test('outer first', () => {
        seen.push(`test outer-1 under ${currentTier()}`);
        register('outer-entry');
      });
      describeLive(
        'S',
        'inner',
        () => {
          runner.test('inner', () => {
            seen.push(`test inner under ${currentTier()}`);
            register('inner-a');
            register('inner-b');
          });
        },
        { requires: ['W'] }
      );
      runner.test('outer second', () => {
        seen.push(`test outer-2 under ${currentTier()}`);
      });
    });
    await runner.run();
    expect(seen).toEqual([
      'test outer-1 under W',
      'test inner under S',
      'replay inner-b under S (pending: outer-entry,inner-a,inner-b)',
      'replay inner-a under S (pending: outer-entry,inner-a)',
      'test outer-2 under W',
      'replay outer-entry under W (pending: outer-entry)',
    ]);
    expect(currentTier()).toBeNull();
    expect(h.blocks).toEqual([]);
  });

  it('a timer started in an R block that fires while a later S block runs is outside every block (G4)', async () => {
    const { h, runner } = setup({ tiers: { S: true } });
    const publish = (): Promise<Response> =>
      guardedFetch(apiUrl('/publisher/{ns}'), jsonInit('POST', { user_udid: TEST_MAC }));
    let leaked: Promise<PromiseSettledResult<Response>[]> | undefined;
    describeLive('R', 'reader', () => {
      runner.test('leaves a timer', async () => {
        await expectGuardViolation('G4', publish);
        leaked = new Promise<PromiseSettledResult<Response>[]>((resolve) => {
          setTimeout(() => resolve(Promise.allSettled([publish()])), 20);
        });
      });
    });
    describeLive(
      'S',
      'publisher',
      () => {
        runner.test('publishes and waits', async () => {
          expect((await publish()).status).toBe(201);
          await new Promise((resolve) => setTimeout(resolve, 80));
        });
      },
      { positions: 'publish', domain: 'positions-spatial' }
    );
    const outcomes = await runner.run();
    expect(outcomes.map((o) => o.state)).toEqual(['pass', 'pass']);
    const [late] = await (leaked as Promise<PromiseSettledResult<Response>[]>);
    expect(late?.status).toBe('rejected');
    expect(((late as PromiseRejectedResult).reason as GuardViolation).rule).toBe('G4');
    expect(h.budgetReport().positions.used).toBe(1);
    expect(h.unexpectedViolations()).toEqual([
      { rule: 'G4', method: 'POST', template: '/publisher/{ns}' },
    ]);
  });

  it('an inner block is skipped when its outer block is', async () => {
    const { runner } = setup({ tiers: { S: true } });
    describeLive('W', 'outer', () => {
      describeLive('S', 'inner', () => {
        runner.test('never runs', () => {
          throw new Error('must not run');
        });
      });
    });
    const outer = runner.root.children[0] as FakeSuite;
    expect((outer.children[0] as FakeSuite).title).toBe(
      '[S] inner (skipped: enclosing block skipped)'
    );
    const outcomes = await runner.run();
    expect(outcomes.map((o) => o.state)).toEqual(['skip']);
    expect(runner.errors).toEqual([]);
  });
});

describe('report counts per domain and tier', () => {
  it('counts each test under the tier of its innermost block (S nested in W counts under S)', async () => {
    const { runner } = setup({ tiers: { W: true, S: true } });
    describeLive('W', 'outer', () => {
      runner.test('w pass', () => undefined);
      runner.test('w fail', () => {
        throw new Error('boom');
      });
      describeLive('S', 'inner', () => {
        runner.test('s pass', () => undefined);
      });
      describeLive('C', 'config', () => {
        runner.test('c skipped', () => undefined);
      });
    });
    const outcomes = (await runner.run()).map((o) => ({
      ...o,
      file: '/repo/test/integration/assets/a.int.test.ts',
    }));
    const report = buildDomainsReport(outcomes);
    expect(Object.keys(report)).toEqual(['assets']);
    expect(report.assets).toEqual({
      passed: 2,
      failed: 1,
      skipped: [
        {
          test: '[W] outer > [C] config (skipped: tier C off (RTLS_IT_CONFIG not 1)) > c skipped',
          reason: 'tier C off (RTLS_IT_CONFIG not 1)',
        },
      ],
      tiers: {
        R: { passed: 0, failed: 0, skipped: 0 },
        W: { passed: 1, failed: 1, skipped: 0 },
        C: { passed: 0, failed: 0, skipped: 1 },
        S: { passed: 1, failed: 0, skipped: 0 },
      },
    });
  });

  it('reads vitest task trees: domains from file paths, runtime skip notes as reasons', () => {
    const files: TaskLike[] = [
      {
        type: 'suite',
        name: 'test/integration/notifications/inbox.int.test.ts',
        filepath: '/repo/test/integration/notifications/inbox.int.test.ts',
        tasks: [
          {
            type: 'suite',
            name: '[W] inbox',
            tasks: [
              { type: 'test', name: 'list', result: { state: 'pass' } },
              {
                type: 'test',
                name: 'guarded',
                mode: 'run',
                result: { state: 'skip', note: 'existing connection' },
              },
            ],
          },
        ],
      },
      {
        type: 'suite',
        name: 'ws',
        filepath: '/repo/test/websocket/live.int.test.ts',
        tasks: [
          {
            type: 'suite',
            name: '[R] subscriber',
            tasks: [{ type: 'test', name: 'confirm', result: { state: 'fail' } }],
          },
        ],
      },
    ];
    const outcomes = outcomesFromTasks(files);
    expect(outcomes.map((o) => [o.suites.join('/'), o.test, o.state])).toEqual([
      ['[W] inbox', 'list', 'pass'],
      ['[W] inbox', 'guarded', 'skip'],
      ['[R] subscriber', 'confirm', 'fail'],
    ]);
    const report = buildDomainsReport(outcomes);
    expect(report.notifications?.skipped).toEqual([
      { test: '[W] inbox > guarded', reason: 'existing connection' },
    ]);
    expect(report.notifications?.tiers.W).toEqual({ passed: 1, failed: 0, skipped: 1 });
    expect(report.websocket?.tiers.R).toEqual({ passed: 0, failed: 1, skipped: 0 });
  });
});
