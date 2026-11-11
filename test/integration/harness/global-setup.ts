// Global setup and teardown of an integration run (P0 §6.2 "Global setup", LIVE-TESTING §2.5–§2.11). Runs in the
// vitest main process (it imports nothing that loads vitest). `startRun()` and `LiveRun.finish()` hold the logic
// and take their context as arguments, so the harness unit tests run them against MSW and temporary folders; the
// default export wires them to the live environment.
//
// Setup: credentials (absent → report `abort: 'no-credentials'`, tests skip, driver exit 3) → run id and
// `.state/<runId>/` → W, C or S enabled: the driver's run-lock token, or the run lock taken here (still held after
// the wait → `no-run-lock`); tier R only: the driver's read slot, or a slot taken here (none free → `no-read-slot`)
// → S enabled: the cumulative ledger (`ledger-cap`) → the run's ledger entry (zero counts) → run registry →
// `GET /health` → feature probes → preflight (four verdicts, `preflight.json`) → before-image → `budget.json` →
// `env.json`. A setup abort is written to `abort.json`, so every live block skips with reason 'run aborted'.
//
// Teardown: replay every pending cleanup of `cleanup.jsonl` → restore every saved config before-image without
// `.restored` → sweep this run's residue (removal with tier W, a check otherwise; alert rules with tier C;
// residue left fails the run) → after-image and comparison (`stateDiff`) → the ledger entry confirmed with the
// `budget.json` counts (never added) → `report.json` → deregister → release what this process took (config lock,
// run lock or read slot).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { abortRun } from './abort';
import { originalFetch, setActiveHarness } from './active';
import {
  integrationShare,
  ledgerRefusal,
  readBudgetFile,
  type BudgetCounts,
  type BudgetFile,
} from './budgets';
import { pendingConfigRestores, restorePendingConfigs } from './config-core';
import { createHarnessContext, type Harness } from './context';
import { ContextMissing, HarnessPrecondition, liveEnv, tiersFrom, type Tier } from './env';
import { runWithGuardScope } from './guard';
import { CUMULATIVE_CAPS, ledgerTotals, recordLedger, zeroCounts } from './ledger.mjs';
import {
  acquireReadSlot,
  acquireRunLock,
  belongsToHolder,
  deregisterRun,
  holdsLock,
  lockPaths,
  newLockToken,
  registerRun,
  releaseConfigLock,
  releaseReadSlot,
  releaseRunLock,
} from './lock.mjs';
import { runIdFrom } from './names';
import { DOMAIN_KEYS, unreachableTarget, type DomainKey, type PreflightVerdicts } from './policy';
import { runCleanup } from './cleanup';
import { computePreflight, UNSAFE_PREFLIGHT, type PreflightWarning } from './preflight';
import { rawRequest } from './raw';
import { buildRunReport, headSha, writeRunReport, type RunReport } from './report';
import {
  compareSnapshots,
  readSnapshot,
  stateDiffOf,
  takeSnapshot,
  writeSnapshot,
  type StateDiff,
  type StateDifference,
  type StateSnapshot,
} from './state';
import { sweep, type SweepOptions } from './sweeper';
import {
  CHECKOUT_ROOT,
  checkoutStateDir,
  mainStateDir,
  readJsonFileSync,
  updateJsonFileSync,
  writeJsonFileAtomicSync,
} from './state-io.mjs';

export type SetupAbort =
  | 'no-credentials'
  | 'precondition'
  | 'no-run-lock'
  | 'no-read-slot'
  | 'ledger-cap'
  | 'health-check-failed'
  | 'before-snapshot-failed';

export interface LockWaitOptions {
  wait: boolean;
  pollMs?: number;
  maxWaitMs?: number;
}

export interface StartRunOptions {
  runId: string;
  /** `.state/<runId>/` of this checkout */
  stateDir: string;
  /** builds the run's context; throws ContextMissing without credentials */
  createHarness: () => Harness;
  /** selected domains (none = all): the ledger share is the sum of their domain caps */
  domains?: readonly DomainKey[];
  /** the environment the driver started vitest with (read: tier flags, lock token; written: run id, token) */
  processEnv?: NodeJS.ProcessEnv;
  /** run lock and read slot wait (default: wait, 5 s polls, 30 min) */
  lockWait?: LockWaitOptions;
  /** config lock wait for the teardown restores (default: wait, 5 s polls, 15 min) */
  configLockWait?: LockWaitOptions;
  /** @internal options of the own-run sweep (allowlist folder, config lock wait) */
  sweepOptions?: Pick<SweepOptions, 'allowlistDir' | 'configLockWait'>;
  sha?: string;
}

export interface LiveRun {
  runId: string;
  stateDir: string;
  harness: Harness | null;
  abort: SetupAbort | null;
  /** the lock token of the run (the driver's or this process's), or null */
  token: string | null;
  finish(): Promise<RunReport>;
}

/** Report of a run that never had a context (no credentials, a precondition). */
export function minimalReport(input: {
  runId: string;
  sha: string;
  tiers: Record<Tier, boolean>;
  abort: string;
}): RunReport {
  return {
    runId: input.runId,
    sha: input.sha,
    ok: false,
    tiers: { ...input.tiers },
    preflight: { ...UNSAFE_PREFLIGHT, blocking: [], warnings: [] },
    domains: {},
    budgets: {
      positions: { used: 0, limit: 0 },
      notifications: { used: 0, limit: 0 },
      bleActions: { used: 0, limit: 0 },
      etlWrites: { used: 0, limit: 0 },
    },
    ledger: { othersBefore: zeroCounts(), caps: { ...CUMULATIVE_CAPS } },
    maxRequestRate: 0,
    cleanup: { done: 0, failed: [] },
    configRestores: [],
    dynamicAllowlist: [],
    state: { differences: [] },
    stateDiff: 'none',
    violations: [],
    abort: input.abort,
  };
}

async function statusOf(path: string): Promise<number> {
  try {
    return (await rawRequest('GET', path)).status;
  } catch {
    return 0;
  }
}

export async function startRun(options: StartRunOptions): Promise<LiveRun> {
  const env = options.processEnv ?? process.env;
  const sha = options.sha ?? headSha(CHECKOUT_ROOT);
  const lockWait: LockWaitOptions = options.lockWait ?? { wait: true };
  const { runId, stateDir } = options;
  mkdirSync(stateDir, { recursive: true });
  env.RTLS_IT_RUN_ID = runId;

  let h: Harness;
  try {
    h = options.createHarness();
  } catch (error) {
    const abort =
      error instanceof ContextMissing
        ? 'no-credentials'
        : error instanceof HarnessPrecondition
          ? 'precondition'
          : null;
    if (abort === null) throw error;
    const report = minimalReport({ runId, sha, tiers: tiersFrom(env), abort });
    writeRunReport(stateDir, report);
    return {
      runId,
      stateDir,
      harness: null,
      abort,
      token: null,
      finish: async () => {
        writeRunReport(stateDir, report);
        return report;
      },
    };
  }
  setActiveHarness(h);

  const tiers = h.env.tiers;
  const writeCapable = tiers.W || tiers.C || tiers.S;
  const paths = lockPaths(h.mainStateDir);
  const lockOptions = { stateDir: h.mainStateDir, ...lockWait };
  const driverToken = env.RTLS_IT_INTERNAL_LOCK_TOKEN || null;
  const domains =
    options.domains && options.domains.length > 0 ? [...options.domains] : [...DOMAIN_KEYS];

  const state: { abort: SetupAbort | null } = { abort: null };
  let token: string | null = null;
  let took: 'run' | 'slot' | null = null;
  let ledgerEntryCreated = false;
  let registered = false;
  let completed = false;
  let othersBefore: BudgetCounts = zeroCounts();
  let preflight: PreflightVerdicts = { ...UNSAFE_PREFLIGHT, blocking: [] };
  let warnings: PreflightWarning[] = [];
  let before: StateSnapshot | null = null;

  const fail = (reason: SetupAbort): void => {
    state.abort = reason;
    abortRun(reason, 'global-setup');
  };

  // Run lock (W, C or S) or read slot (tier R only).
  if (writeCapable) {
    if (driverToken) {
      if (holdsLock(paths.run, driverToken)) token = driverToken;
      else fail('no-run-lock');
    } else {
      const own = newLockToken();
      if (await acquireRunLock({ ...lockOptions, token: own, holder: `integration ${runId}` })) {
        token = own;
        took = 'run';
      } else fail('no-run-lock');
    }
  } else if (unreachableTarget(new URL(h.env.baseUrl)) === null) {
    if (driverToken && belongsToHolder(driverToken, { stateDir: h.mainStateDir })) {
      token = driverToken;
    } else {
      const own = newLockToken();
      if (await acquireReadSlot({ ...lockOptions, token: own, holder: `integration ${runId}` })) {
        token = own;
        took = 'slot';
      } else fail('no-read-slot');
    }
  }
  if (token) env.RTLS_IT_INTERNAL_LOCK_TOKEN = token;

  if (state.abort === null && tiers.S) {
    const refused = ledgerRefusal({
      runId,
      tiers,
      share: integrationShare(domains),
      ledgerPath: h.ledgerPath,
    });
    if (refused.length > 0) fail('ledger-cap');
  }

  if (state.abort === null) {
    othersBefore = ledgerTotals({ excludeRunId: runId, ledgerPath: h.ledgerPath });
    recordLedger(runId, 'integration', tiers, {}, { ledgerPath: h.ledgerPath });
    ledgerEntryCreated = true;
    registerRun(runId, { domain: domains.join(','), tiers }, { stateDir: h.mainStateDir });
    registered = true;

    if ((await statusOf('/health')) !== 200) fail('health-check-failed');
  }

  if (state.abort === null) {
    const features = {
      notifications: (await statusOf('/notifications/{ns}/unread_count')) === 200,
      etl: (await statusOf('/etl/mapping-profiles')) === 200,
    };
    writeJsonFileAtomicSync(join(stateDir, 'features.json'), features);
    // A preflight.json left by an earlier run of a reused run id is replaced: each run reads its own state.
    const result = await computePreflight(h, {
      notifications: features.notifications,
      replace: true,
    });
    preflight = result.verdicts;
    warnings = result.warnings;
    try {
      before = await takeSnapshot(h);
      writeSnapshot(join(stateDir, 'before.json'), before);
    } catch {
      fail('before-snapshot-failed');
    }
  }

  if (state.abort === null) {
    updateJsonFileSync<BudgetFile | null>(join(stateDir, 'budget.json'), null, (current) =>
      current === null
        ? { version: 1, counts: zeroCounts(), byDomain: {}, exceeded: [] }
        : undefined
    );
    writeJsonFileAtomicSync(join(stateDir, 'env.json'), {
      runId,
      mode: 'integration',
      tiers,
      baseHost: new URL(h.env.baseUrl).host,
      domains,
      startedAt: new Date().toISOString(),
    });
    completed = true;
  }

  const harness = h;
  // Teardown actions (replay, restores, own-run sweep) run in the guard's teardown scope: G1–G3, G5, G6 apply,
  // G4 does not (P0 §5.3).
  const finish = (): Promise<RunReport> =>
    runWithGuardScope({ kind: 'teardown' }, () => teardown());
  const teardown = async (): Promise<RunReport> => {
    let differences: StateDifference[] = [];
    let stateDiff: StateDiff = 'none';
    const failures: { label: string; status?: number }[] = [];
    try {
      if (completed) {
        // Failures are recorded in cleanup.jsonl; the report reads them from there.
        await runCleanup();
        if (pendingConfigRestores(stateDir).length > 0) {
          try {
            if (!token) throw new HarnessPrecondition('no lock token for the config restore');
            await restorePendingConfigs({
              harness,
              token,
              ...(options.configLockWait ?? { wait: true }),
            });
          } catch {
            abortRun('restore-failed', 'teardown');
          }
        }
        if (writeCapable && token) {
          try {
            const swept = await sweep({
              check: !tiers.W,
              runId,
              force: true,
              fixConfig: tiers.C,
              lockToken: token,
              ...(options.sweepOptions ?? {}),
            });
            for (const r of swept.residue) failures.push({ label: `residue ${r.target} ${r.id}` });
            for (const f of swept.readFailures)
              failures.push({ label: `sweep unreadable ${f.target}`, status: f.status });
          } catch {
            failures.push({ label: 'own-run sweep failed' });
          }
        }
        try {
          const after = await takeSnapshot(harness);
          writeSnapshot(join(stateDir, 'after.json'), after);
          const created = readJsonFileSync<{ ids?: string[] }>(harness.createdPath, {});
          differences = compareSnapshots(
            before ?? readSnapshot(join(stateDir, 'before.json')),
            after,
            {
              prefix: harness.runPrefix,
              createdIds: new Set(Array.isArray(created.ids) ? created.ids : []),
            }
          );
        } catch {
          differences = [{ key: '<snapshot>', path: 'after-image failed' }];
        }
        stateDiff = stateDiffOf(differences, writeCapable);
      }
      if (ledgerEntryCreated) {
        recordLedger(runId, 'integration', tiers, readBudgetFile(stateDir).counts, {
          ledgerPath: harness.ledgerPath,
        });
      }
      const report = buildRunReport({
        h: harness,
        sha,
        tiers,
        preflight,
        warnings,
        othersBefore,
        extraCleanupFailures: failures,
        differences,
        stateDiff,
        abort: state.abort,
      });
      writeRunReport(stateDir, report);
      return report;
    } finally {
      if (registered) deregisterRun(runId, { stateDir: harness.mainStateDir });
      if (took === 'run' && token) {
        await releaseConfigLock(token, { stateDir: harness.mainStateDir });
        await releaseRunLock(token, { stateDir: harness.mainStateDir });
      } else if (took === 'slot' && token) {
        await releaseReadSlot(token, { stateDir: harness.mainStateDir });
      }
    }
  };

  return { runId, stateDir, harness: h, abort: state.abort, token, finish };
}

/** The live context of the run (credentials from env.ts; sends through the unguarded fetch of this process). */
function createLiveHarness(runId: string, stateDir: string): Harness {
  return createHarnessContext({
    env: liveEnv(),
    runId,
    stateDir,
    mainStateDir: mainStateDir(),
    fetchImpl: (input, init) => (originalFetch() ?? globalThis.fetch)(input, init),
  });
}

/**
 * vitest `globalSetup` entry: the run id comes from `RTLS_IT_RUN_ID` (the driver exports it) or is drawn here and
 * exported to the workers; the selected domains from `.state/<runId>/selection.json` (`{ domains }`, written by
 * the driver), else all.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const runId = runIdFrom(process.env);
  const stateDir = join(checkoutStateDir(), runId);
  const selection = readJsonFileSync<{ domains?: unknown } | null>(
    join(stateDir, 'selection.json'),
    null
  );
  const domains = Array.isArray(selection?.domains)
    ? selection.domains.filter((d): d is DomainKey =>
        (DOMAIN_KEYS as readonly unknown[]).includes(d)
      )
    : [];
  const run = await startRun({
    runId,
    stateDir,
    createHarness: () => createLiveHarness(runId, stateDir),
    domains,
  });
  return async () => {
    await run.finish();
  };
}
