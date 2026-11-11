// `npm run test:integration:sweep -- [--check] [--run <runId>] [--force] [--fix-config]` (P0 §6.1, LIVE-TESTING
// §2.5). `--check` lists the `sdk-test-` residue and exits 1 when any is left; it takes a read slot unless its
// `RTLS_IT_INTERNAL_LOCK_TOKEN` holds the run lock or a read slot (a runner's own-run check) or the base URL is
// unreachable. Removal needs `RTLS_IT_WRITES=1` and takes the run lock (or proves it with the inherited token);
// alert rules only with `--fix-config` and `RTLS_IT_CONFIG=1`. Output: targets and ids only. Exit codes: 0 clean,
// 1 residue left or a listing that could not be read, 2 precondition, 3 credentials missing, 4 restore failure.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { originalFetch, setActiveHarness } from './active';
import { createHarnessContext, type Harness } from './context';
import { ContextMissing, HarnessPrecondition, liveEnv } from './env';
import {
  acquireReadSlot,
  acquireRunLock,
  belongsToHolder,
  holdsLock,
  lockPaths,
  newLockToken,
  releaseConfigLock,
  releaseReadSlot,
  releaseRunLock,
} from './lock.mjs';
import { runIdFrom, RUN_ID_RE } from './names';
import { unreachableTarget } from './policy';
import { checkoutStateDir, mainStateDir } from './state-io.mjs';
import { sweep, type SweepOptions } from './sweeper';

export interface SweepCliDeps {
  createHarness?: () => Harness;
  processEnv?: NodeJS.ProcessEnv;
  out?: (line: string) => void;
  err?: (line: string) => void;
  lockWait?: { wait: boolean; pollMs?: number; maxWaitMs?: number };
  /** @internal passed to sweep() */
  sweepOptions?: Pick<SweepOptions, 'allowlistDir' | 'configLockWait'>;
}

function liveHarness(): Harness {
  const runId = runIdFrom(process.env);
  return createHarnessContext({
    env: liveEnv(),
    runId,
    stateDir: join(checkoutStateDir(), `sweep-${runId}`),
    mainStateDir: mainStateDir(),
    fetchImpl: (input, init) => (originalFetch() ?? globalThis.fetch)(input, init),
  });
}

export async function sweepCli(argv: readonly string[], deps: SweepCliDeps = {}): Promise<number> {
  const out = deps.out ?? ((line: string) => console.log(line));
  const err = deps.err ?? ((line: string) => console.error(line));
  const env = deps.processEnv ?? process.env;
  const known = new Set(['--check', '--run', '--force', '--fix-config']);
  const runIndex = argv.indexOf('--run');
  const runId = runIndex >= 0 ? argv[runIndex + 1] : undefined;
  const unknown = argv.filter((a, i) => !known.has(a) && !(runIndex >= 0 && i === runIndex + 1));
  if (unknown.length > 0 || (runIndex >= 0 && (runId === undefined || !RUN_ID_RE.test(runId)))) {
    err(
      'usage: test:integration:sweep -- [--check] [--run <8 hex run id>] [--force] [--fix-config]'
    );
    return 2;
  }
  const check = argv.includes('--check');
  const force = argv.includes('--force');
  const fixConfig = argv.includes('--fix-config');

  let h: Harness;
  try {
    h = (deps.createHarness ?? liveHarness)();
  } catch (error) {
    if (error instanceof ContextMissing || error instanceof HarnessPrecondition) {
      err(error.message);
      return error.exitCode;
    }
    throw error;
  }
  setActiveHarness(h);
  const lockOptions = { stateDir: h.mainStateDir, ...(deps.lockWait ?? { wait: true }) };
  const inherited = env.RTLS_IT_INTERNAL_LOCK_TOKEN || '';
  let token = inherited;
  let took: 'run' | 'slot' | null = null;

  if (check) {
    if (
      !belongsToHolder(inherited, lockOptions) &&
      unreachableTarget(new URL(h.env.baseUrl)) === null
    ) {
      token = newLockToken();
      if ((await acquireReadSlot({ ...lockOptions, token, holder: 'sweeper --check' })) === false) {
        err('sweep: no read slot free after the wait');
        return 2;
      }
      took = 'slot';
    }
  } else {
    if (!h.env.tiers.W) {
      err('sweep: removal needs RTLS_IT_WRITES=1 (use --check to list only)');
      return 2;
    }
    if (fixConfig && !h.env.tiers.C) {
      err('sweep: --fix-config needs RTLS_IT_CONFIG=1');
      return 2;
    }
    if (!holdsLock(lockPaths(h.mainStateDir).run, inherited)) {
      token = newLockToken();
      if (!(await acquireRunLock({ ...lockOptions, token, holder: 'sweeper' }))) {
        err('sweep: the run lock is still held by another run after the wait');
        return 2;
      }
      took = 'run';
    }
  }

  try {
    const result = await sweep({
      check,
      ...(runId !== undefined ? { runId } : {}),
      force,
      fixConfig,
      lockToken: token,
      ...deps.sweepOptions,
    });
    for (const r of result.residue) out(`residue ${r.target} ${r.id}`);
    for (const f of result.readFailures) out(`unreadable ${f.target} status ${f.status}`);
    for (const a of result.accepted) out(`accepted ${a.kind} ${a.match}`);
    for (const id of result.crashedRuns) out(`crashed run ${id}`);
    for (const id of result.skippedRuns) out(`skipped active run ${id}`);
    out(
      `sweep${check ? ' --check' : ''}: ${result.residue.length} residue, ${result.readFailures.length} unreadable, ${result.removed} removed, ${result.accepted.length} accepted`
    );
    if (h.abortState()?.reason === 'restore-failed') return 4;
    // A listing that could not be read leaves the namespace unconfirmed: a failure, like residue.
    return result.residue.length > 0 || result.readFailures.length > 0 ? 1 : 0;
  } catch (error) {
    if (error instanceof HarnessPrecondition) {
      err(error.message);
      return 2;
    }
    throw error;
  } finally {
    if (took === 'run') {
      await releaseConfigLock(token, lockOptions);
      await releaseRunLock(token, lockOptions);
    } else if (took === 'slot') {
      await releaseReadSlot(token, lockOptions);
    }
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  sweepCli(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(`sweep failed: ${error instanceof Error ? error.name : 'error'}`);
      process.exit(1);
    }
  );
}
