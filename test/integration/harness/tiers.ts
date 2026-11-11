// Tiers (LIVE-TESTING §3, P0 §6.2 tiers.ts). `describeLive(tier, name, fn, options)` declares a live block:
// title `[<tier>] <name>`; skipped (reason in the title, and in the report) when there are no credentials,
// the tier flag or a `requires` flag is off, a feature is off, the run was aborted, or a preflight verdict
// that G18 needs for the declared shape is false. While the block runs, the guard's current tier is the
// block's; its afterAll runs the block-end hooks (cleanup replay) under that tier and then restores the
// enclosing block's tier. Blocks nest: an inner block runs under its own tier and options and is skipped when
// its enclosing block is.
import { afterAll, beforeAll, beforeEach, describe, expect } from 'vitest';
import { activeHarness, peekActiveHarness } from './active';
import { blockStorage, type Harness, type LiveBlockRuntime } from './context';
import { hasCredentials, TIER_FLAGS, TIERS, type Tier } from './env';
import { domainOfTestFile, liveTitle } from './outcomes';
import { failedVerdicts, type DomainKey, type ReachShape } from './policy';

export {
  buildDomainsReport,
  domainOfTestFile,
  liveTitle,
  outcomesFromTasks,
  parseLiveTitle,
} from './outcomes';
export type { DomainReport, LiveTestOutcome, TaskLike } from './outcomes';

export type { Tier };

export interface DescribeLiveOptions {
  /** The block writes assets or otherwise reaches the rule engine; default false in every tier. */
  ruleEngine?: boolean;
  /** Further tiers that must be enabled (e.g. ['W'] for an S block that also writes entities). */
  requires?: Tier[];
  /** 'publish': REST or WebSocket publish; 'declared': bulk-declare or a declared_location write. */
  positions?: 'publish' | 'declared';
  feature?: 'notifications' | 'etl';
  /** Default: from the test file path. */
  domain?: DomainKey;
}

/** The runner calls describeLive uses (vitest by default; harness unit tests drive a fake). */
export interface SuiteApi {
  describe(title: string, fn: () => void): void;
  describeSkip(title: string, fn: () => void): void;
  beforeAll(fn: () => unknown): void;
  afterAll(fn: () => unknown): void;
  beforeEach(fn: (ctx: { skip: (note?: string) => void }) => unknown): void;
}

/** Where describeLive reads credentials and the run state (unit tests inject their own). */
export interface LiveDecisionSource {
  hasCredentials(): boolean;
  harness(): Harness;
}

const vitestApi: SuiteApi = {
  describe: (title, fn) => describe(title, fn),
  describeSkip: (title, fn) => describe.skip(title, fn),
  beforeAll: (fn) =>
    beforeAll(async () => {
      await fn();
    }),
  afterAll: (fn) =>
    afterAll(async () => {
      await fn();
    }),
  beforeEach: (fn) =>
    beforeEach(async (ctx) => {
      await fn({ skip: (note?: string) => ctx.skip(note) });
    }),
};

const defaultSource: LiveDecisionSource = {
  hasCredentials: () => peekActiveHarness() !== null || hasCredentials(),
  harness: () => activeHarness(),
};

let suiteApi: SuiteApi = vitestApi;
let source: LiveDecisionSource = defaultSource;

/** @internal harness unit tests */
export function setSuiteApiForTesting(api: SuiteApi | null): void {
  suiteApi = api ?? vitestApi;
}

/** @internal harness unit tests */
export function setLiveDecisionSourceForTesting(next: LiveDecisionSource | null): void {
  source = next ?? defaultSource;
}

interface CollectingBlock {
  id: string;
  tier: Tier;
  name: string;
  domain: DomainKey | null;
  skipped: boolean;
}

const collecting: CollectingBlock[] = [];
let blockCounter = 0;

function currentTestFile(): string | undefined {
  try {
    const testPath = expect.getState().testPath;
    if (typeof testPath === 'string' && testPath !== '') return testPath;
  } catch {
    // outside a vitest worker
  }
  const stack = new Error().stack ?? '';
  const m = /([^\s(]+\.test\.ts)/.exec(stack);
  return m?.[1];
}

function flagName(tier: Tier): string {
  return tier === 'R' ? '' : TIER_FLAGS[tier];
}

function skipReasonOf(
  src: LiveDecisionSource,
  tier: Tier,
  options: DescribeLiveOptions,
  parent: CollectingBlock | null
): string | null {
  if (parent?.skipped) return 'enclosing block skipped';
  if (!src.hasCredentials()) return 'no credentials';
  const h = src.harness();
  const flags = h.env.tiers;
  if (!flags[tier]) return `tier ${tier} off (${flagName(tier)} not 1)`;
  for (const t of options.requires ?? []) {
    if (!flags[t]) return `requires tier ${t} (${flagName(t)} not 1)`;
  }
  if (options.feature && !h.feature(options.feature)) return `feature ${options.feature} off`;
  if (h.abortState()) return 'run aborted';
  const shapes: ReachShape[] = [];
  if (options.ruleEngine) shapes.push('assets');
  if (options.positions) shapes.push(options.positions);
  const failed = [...new Set(shapes.flatMap((shape) => failedVerdicts(h.preflight(), shape)))];
  if (failed.length > 0) return `preflight: ${failed.join(', ')}`;
  return null;
}

/** Declares a live block (see the module comment). */
export function describeLive(
  tier: Tier,
  name: string,
  fn: () => void,
  options: DescribeLiveOptions = {}
): void {
  if (!TIERS.includes(tier))
    throw new TypeError(`describeLive: tier must be one of ${TIERS.join(', ')}`);
  // The runner and the decision source are those of the collection; the block keeps them when it runs.
  const api = suiteApi;
  const src = source;
  const parent = collecting.at(-1) ?? null;
  const domain = options.domain ?? parent?.domain ?? domainOfTestFile(currentTestFile());
  const reason = skipReasonOf(src, tier, options, parent);
  blockCounter += 1;
  const block: CollectingBlock = {
    id: `b${blockCounter}`,
    tier,
    name,
    domain,
    skipped: reason !== null,
  };
  const collect = (): void => {
    collecting.push(block);
    try {
      fn();
    } finally {
      collecting.pop();
    }
  };
  if (reason !== null) {
    api.describeSkip(liveTitle(tier, name, reason), collect);
    return;
  }
  api.describe(liveTitle(tier, name), () => {
    const runtime: LiveBlockRuntime = { id: block.id, tier, name, domain };
    let entered: Harness | null = null;
    // Registered before the block's own hooks: runs first (beforeAll) and last (afterAll, stack order).
    // The block is bound to the async context of its hooks and tests (blockStorage): the guard admits a request
    // under the tier of the block whose chain sent it, and only while that block runs (Harness.currentBlock).
    api.beforeAll(() => {
      entered = src.harness();
      entered.blocks.push(runtime);
      blockStorage.enterWith(runtime);
    });
    api.beforeEach((ctx) => {
      blockStorage.enterWith(runtime);
      if (entered?.abortState()) ctx.skip('run aborted');
    });
    api.afterAll(async () => {
      const h = entered;
      if (!h) return;
      try {
        await blockStorage.run(runtime, async () => {
          for (const hook of h.blockEndHooks) await hook(runtime);
        });
      } finally {
        const index = h.blocks.lastIndexOf(runtime);
        if (index >= 0) h.blocks.splice(index, 1);
      }
    });
    collect();
    // Registered after the block's own hooks, so it runs first among its afterAll hooks (stack order): they run
    // bound to this block, also when the last test ran in a nested block.
    api.afterAll(() => {
      blockStorage.enterWith(runtime);
    });
  });
}

/** Tier of the innermost running block, or null outside every block. */
export function currentTier(): Tier | null {
  return peekActiveHarness()?.currentBlock()?.tier ?? null;
}

/** Innermost running block, or null. */
export function currentBlock(): LiveBlockRuntime | null {
  return peekActiveHarness()?.currentBlock() ?? null;
}
