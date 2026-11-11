// Harness context (P0 §6.2): every module is built on `createHarnessContext({ env, stateDir, mainStateDir,
// fetchImpl })`, so unit tests run it against MSW with `https://rtls.test/api` and a temporary folder;
// `getHarness()` returns the lazily created live singleton. The context holds the run's identity, the
// guard's per-process state (tier stack, tracked ids, request log, socket records, rate bucket) and the
// paths of the run's state files.
import { AsyncLocalStorage } from 'node:async_hooks';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  activeHarness,
  originalFetch,
  peekActiveHarness,
  registerHarnessFactory,
  setActiveHarness,
} from './active';
import {
  budgetReportOf,
  budgetRefusals,
  consumeUnits,
  type BudgetCounts,
  type BudgetName,
  type BudgetTarget,
} from './budgets';
import { liveEnv, type LiveEnv, type Tier } from './env';
import { runIdFrom } from './names';
import type { DomainKey, PreflightVerdicts } from './policy';
import { RATE_CAPACITY, RATE_PER_SECOND } from './policy';
import { loadRouteTable, type RouteTable } from './routes';
import {
  CHECKOUT_ROOT,
  checkoutStateDir,
  mainStateDir as liveMainStateDir,
  readJsonFileSync,
  updateJsonFileSync,
} from './state-io.mjs';
import type { ConfigResourceName } from './config-resources';

export { activeHarness, peekActiveHarness, setActiveHarness };

export type HarnessMode = 'integration' | 'example';

/** Example-mode G9 decision for one config write (the preload reads the before-image on the first write). */
export type ConfigGateResult = { admitted: boolean; before?: unknown } | false;
export type ConfigGate = (
  resource: ConfigResourceName,
  body: unknown
) => ConfigGateResult | Promise<ConfigGateResult>;

/** A describeLive block while it runs (tiers.ts pushes and pops it). */
export interface LiveBlockRuntime {
  id: string;
  tier: Tier;
  name: string;
  domain: DomainKey | null;
}

/**
 * The describeLive block an async chain belongs to. tiers.ts enters it in the block's hooks (and unit tests with
 * `inBlock`), so a timer, a handler or a queued request started in a block keeps that block when it runs later.
 */
export const blockStorage = new AsyncLocalStorage<LiveBlockRuntime>();

export interface RequestLogEntry {
  method: string;
  path: string;
  template: string | null;
  query: Record<string, string>;
  /** parsed JSON, `'<FormData: a,b>'` or text */
  body: unknown;
  status?: number;
  responseHeaders?: Record<string, string>;
}

export interface WebSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface SocketRecord {
  /** credentials redacted */
  url: string;
  headerNames: string[];
  /** parsed outbound frames that passed the guard */
  frames: unknown[];
  socket: WebSocketLike;
}

export interface ViolationRecord {
  rule: string;
  method: string;
  template: string;
  expected?: boolean;
}

export interface HarnessContextOptions {
  env: LiveEnv;
  /** `.state/<runId>/` of this run */
  stateDir: string;
  /** `test/integration/.state` of the main checkout (runs/, locks/, ledger.json) */
  mainStateDir: string;
  fetchImpl?: typeof fetch;
  runId?: string;
  mode?: HarnessMode;
  /** example mode: the process was started with `--write` */
  exampleWrite?: boolean;
  /** injected verdicts; otherwise read from `<stateDir>/preflight.json` (absent → every verdict false) */
  preflight?: PreflightVerdicts | null;
  /** injected feature flags; otherwise read from `<stateDir>/features.json` */
  features?: Partial<Record<'notifications' | 'etl', boolean>>;
  specPath?: string;
  overridesPath?: string;
  baseManifestPath?: string;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /**
   * example mode G9 (preload.ts): admits a config write when the config lock is held with the run's token and
   * validateChange(before, body) holds; returns the before-image for G6's alert-rule exemption
   */
  configGate?: ConfigGate;
  /** folder of the live-coverage allowlist fragments (default `test/integration/allowlist`) */
  allowlistDir?: string;
  /** root of the recorded fixtures (default `test/fixtures`) */
  fixturesDir?: string;
  /** G15 bucket to share (the live context shares one per process, `processBucket()`) */
  bucket?: TokenBucket;
}

/**
 * G15 rate limit (waits, never drops) that also measures the peak rate per second. At most `capacity` sends in
 * any sliding window of `capacity / perSecond` seconds (5 in any second for the harness): LIVE-TESTING §2.6
 * "5 requests per second per process". A plain token bucket of 5 refilled at 5/s would let 10 through within one
 * sliding second (burst plus refill), so each send is checked against the actual send times of the window.
 */
export class TokenBucket {
  private readonly windowMs: number;
  private readonly sent: number[] = [];
  /** end of the latest wait: an injected sleep that returns at once (unit tests) still moves the clock */
  private waitedUntil = Number.NEGATIVE_INFINITY;
  peak = 0;
  constructor(
    private readonly capacity: number,
    perSecond: number,
    private readonly now: () => number,
    private readonly sleep: (ms: number) => Promise<void>
  ) {
    this.windowMs = (capacity / perSecond) * 1000;
  }

  /** The later of the clock and the end of the latest wait (a late wake-up records the actual time). */
  private clock(): number {
    return Math.max(this.now(), this.waitedUntil);
  }

  async take(): Promise<void> {
    for (;;) {
      const t = this.clock();
      while (this.sent.length > 0 && (this.sent[0] as number) <= t - this.windowMs)
        this.sent.shift();
      // Check and record with no await in between: concurrent callers cannot both take the last place.
      if (this.sent.length < this.capacity) {
        this.sent.push(t);
        this.peak = Math.max(this.peak, this.sent.length);
        return;
      }
      const until = (this.sent[0] as number) + this.windowMs;
      await this.sleep(until - t);
      this.waitedUntil = Math.max(this.waitedUntil, until);
    }
  }
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export class Harness {
  readonly env: LiveEnv;
  readonly runId: string;
  readonly stateDir: string;
  readonly mainStateDir: string;
  readonly mode: HarnessMode;
  readonly exampleWrite: boolean;
  fetchImpl: typeof fetch;
  readonly routes: RouteTable;
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly bucket: TokenBucket;
  readonly configGate?: ConfigGate;
  readonly allowlistDir: string;
  readonly fixturesDir: string;
  /** units this process counted (G7, G16, consumeBudget): `guard/<pid>.json` `counts` */
  readonly processCounts: BudgetCounts = {
    positions: 0,
    notifications: 0,
    bleActions: 0,
    etlWrites: 0,
  };
  /** requests this process sent through the guard: `guard/<pid>.json` `requests` */
  requestsSent = 0;
  /** describeLive blocks currently running, outermost first */
  readonly blocks: LiveBlockRuntime[] = [];
  /** called by a block's afterAll before its tier is restored (cleanup.ts registers runCleanup) */
  readonly blockEndHooks: ((block: LiveBlockRuntime) => Promise<void> | void)[] = [];
  readonly tracked = new Set<string>();
  readonly sockets: SocketRecord[] = [];
  /** loopback WebSocket servers a test started itself (G1) */
  readonly localWebSocketPorts = new Set<number>();
  requestLog: RequestLogEntry[] = [];
  selfUserId: Promise<string> | null = null;
  private readonly injectedPreflight: PreflightVerdicts | null | undefined;
  private preflightCache: PreflightVerdicts | null | undefined;
  private readonly injectedFeatures: Partial<Record<'notifications' | 'etl', boolean>> | undefined;
  private featuresCache: Partial<Record<'notifications' | 'etl', boolean>> | undefined;

  constructor(options: HarnessContextOptions) {
    this.env = options.env;
    this.runId = options.runId ?? runIdFrom(process.env);
    this.stateDir = options.stateDir;
    this.mainStateDir = options.mainStateDir;
    this.mode = options.mode ?? 'integration';
    this.exampleWrite = options.exampleWrite ?? false;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
    this.routes = loadRouteTable({
      specPath: options.specPath,
      overridesPath: options.overridesPath,
      baseManifestPath: options.baseManifestPath,
    });
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? defaultSleep;
    this.bucket =
      options.bucket ?? new TokenBucket(RATE_CAPACITY, RATE_PER_SECOND, this.now, this.sleep);
    this.configGate = options.configGate;
    this.allowlistDir =
      options.allowlistDir ?? join(CHECKOUT_ROOT, 'test', 'integration', 'allowlist');
    this.fixturesDir = options.fixturesDir ?? join(CHECKOUT_ROOT, 'test', 'fixtures');
    this.injectedPreflight = options.preflight;
    this.injectedFeatures = options.features;
  }

  get ledgerPath(): string {
    return join(this.mainStateDir, 'ledger.json');
  }

  get createdPath(): string {
    return join(this.mainStateDir, 'runs', `${this.runId}.created.json`);
  }

  get violationsPath(): string {
    return join(this.stateDir, 'violations.jsonl');
  }

  get runPrefix(): string {
    return `sdk-test-${this.runId}-`;
  }

  /** Tiers that are enabled for this process: the command-line flags; in example mode only with --write. */
  enabledTiers(): Record<Tier, boolean> {
    const t = this.env.tiers;
    if (this.mode === 'integration') return { ...t };
    const w = this.exampleWrite;
    return { R: true, W: w && t.W, C: w && t.C, S: w && t.S };
  }

  /**
   * The block of the current async chain while that block is still running, else null (outside every block: GETs
   * only, G4). Work that a block started and that runs after the block ended, for example a timer of a tier-R test
   * that fires while a later S block runs, therefore gets no tier.
   */
  currentBlock(): LiveBlockRuntime | null {
    const bound = blockStorage.getStore();
    return bound !== undefined && this.blocks.includes(bound) ? bound : null;
  }

  currentDomain(): DomainKey | null {
    return this.currentBlock()?.domain ?? null;
  }

  /** Preflight verdicts of the run (injected, else `preflight.json`); null when none was computed. */
  preflight(): PreflightVerdicts | null {
    if (this.injectedPreflight !== undefined) return this.injectedPreflight;
    if (this.preflightCache === undefined) {
      this.preflightCache = readJsonFileSync<PreflightVerdicts | null>(
        join(this.stateDir, 'preflight.json'),
        null
      );
    }
    return this.preflightCache ?? null;
  }

  /** Feature flags of the run (injected, else `features.json` written by global setup). */
  feature(name: 'notifications' | 'etl'): boolean {
    if (this.injectedFeatures) return this.injectedFeatures[name] === true;
    this.featuresCache ??= readJsonFileSync<Partial<Record<'notifications' | 'etl', boolean>>>(
      join(this.stateDir, 'features.json'),
      {}
    );
    return this.featuresCache[name] === true;
  }

  /** `abort.json` of the run (abortRun), or null. */
  abortState(): { reason: string; label: string } | null {
    return readJsonFileSync<{ reason: string; label: string } | null>(
      join(this.stateDir, 'abort.json'),
      null
    );
  }

  budgetTarget(): BudgetTarget {
    return {
      stateDir: this.stateDir,
      runId: this.runId,
      mode: this.mode,
      ledgerTiers: this.enabledTiers(),
      ledgerPath: this.ledgerPath,
    };
  }

  consume(units: Partial<BudgetCounts>, domain: DomainKey | null): void {
    consumeUnits(this.budgetTarget(), units, domain);
    for (const [name, n] of Object.entries(units) as [BudgetName, number | undefined][]) {
      if (typeof n === 'number' && n > 0) this.processCounts[name] += n;
    }
  }

  budgetReport(): Record<BudgetName, { used: number; limit: number }> {
    return budgetReportOf(this.budgetTarget());
  }

  /** Appends a violation (rule, method, template; never values) to `violations.jsonl`. */
  recordViolation(record: ViolationRecord): void {
    mkdirSync(this.stateDir, { recursive: true });
    appendFileSync(this.violationsPath, `${JSON.stringify(record)}\n`);
  }

  violations(): ViolationRecord[] {
    let text: string;
    try {
      text = readFileSync(this.violationsPath, 'utf8');
    } catch {
      return [];
    }
    return text
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line) as ViolationRecord);
  }

  /** Violations that no `expectGuardViolation` expected (they fail the run in teardown). */
  unexpectedViolations(): ViolationRecord[] {
    return this.violations().filter((v) => v.expected !== true);
  }

  /** Why the run has failed so far: unexpected violations and budget refusals. */
  failureReasons(): string[] {
    const reasons: string[] = [];
    const violations = this.unexpectedViolations().length;
    if (violations > 0) reasons.push(`${violations} guard violation(s)`);
    const refusals = budgetRefusals(this.stateDir).length;
    if (refusals > 0) reasons.push(`${refusals} budget refusal(s)`);
    return reasons;
  }

  /** Records ids and test MACs in memory and in `runs/<runId>.created.json` (main checkout). */
  track(ids: readonly string[], macs: readonly string[] = []): void {
    const newIds = ids.filter((id) => id !== '' && !this.tracked.has(id));
    for (const id of newIds) this.tracked.add(id);
    if (newIds.length === 0 && macs.length === 0) return;
    updateJsonFileSync<{ ids: string[]; macs: string[] }>(
      this.createdPath,
      { ids: [], macs: [] },
      (current) => {
        const idSet = new Set(current.ids);
        const macSet = new Set(current.macs);
        const before = idSet.size + macSet.size;
        for (const id of newIds) idSet.add(id);
        for (const mac of macs) macSet.add(mac);
        if (idSet.size + macSet.size === before) return undefined;
        return { ids: [...idSet], macs: [...macSet] };
      }
    );
  }

  /** Tracked in this process or recorded for this run by another process. */
  isTracked(id: string): boolean {
    if (this.tracked.has(id)) return true;
    const created = readJsonFileSync<{ ids: string[] }>(this.createdPath, { ids: [] });
    return Array.isArray(created.ids) && created.ids.includes(id);
  }
}

export function createHarnessContext(options: HarnessContextOptions): Harness {
  return new Harness(options);
}

const PROCESS_BUCKET = Symbol.for('ubudu-rtls-sdk.harness.bucket');

/**
 * The G15 bucket of this process. vitest evaluates the harness afresh for every test file of the single
 * integration worker while `globalThis` persists, so the bucket is kept there: the 5 requests/s limit and the
 * measured peak hold for the whole process, not per file.
 */
export function processBucket(): TokenBucket {
  const g = globalThis as Record<PropertyKey, unknown>;
  const existing = g[PROCESS_BUCKET] as TokenBucket | undefined;
  if (existing) return existing;
  const bucket = new TokenBucket(RATE_CAPACITY, RATE_PER_SECOND, () => Date.now(), defaultSleep);
  g[PROCESS_BUCKET] = bucket;
  return bucket;
}

/** Live singleton: credentials from env.ts, run id from RTLS_IT_RUN_ID, state in this checkout. */
function createLiveHarness(): Harness {
  const env = liveEnv();
  const runId = runIdFrom(process.env);
  return new Harness({
    env,
    runId,
    stateDir: join(checkoutStateDir(), runId),
    mainStateDir: liveMainStateDir(),
    fetchImpl: (input, init) => (originalFetch() ?? globalThis.fetch)(input, init),
    bucket: processBucket(),
  });
}

registerHarnessFactory(createLiveHarness);

/** The active context: an installed one, else the lazily created live singleton. */
export function getHarness(): Harness {
  return activeHarness();
}

/** `.state/<runId>/` of the active run. */
export function stateDir(): string {
  return activeHarness().stateDir;
}
