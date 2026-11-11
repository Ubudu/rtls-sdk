// `npm run test:integration:snapshot -- --label <name> [--compare <name>]` (P0 §6.1, P10 H1): the LIVE-TESTING
// §2.10 image of the namespace taken outside a test run, stored as `test/integration/.state/<name>/snapshot.json`
// (git-ignored). `--compare <name>` compares the new image with an earlier one and exits 1 on any difference
// outside `sdk-test-` entities (and the ids of every `runs/*.created.json`), printing keys, paths and ids only.
// Takes a read slot unless its `RTLS_IT_INTERNAL_LOCK_TOKEN` holds the run lock or a read slot (a runner's own
// snapshot), or the base URL is unreachable. Exit codes: 0 equal (or no compare), 1 differences, 2 precondition,
// 3 credentials missing. Credentials are read by the harness only and never printed.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { originalFetch, setActiveHarness } from './active';
import { createHarnessContext, type Harness } from './context';
import { ContextMissing, HarnessPrecondition, liveEnv } from './env';
import {
  acquireReadSlot,
  belongsToHolder,
  listRuns,
  newLockToken,
  releaseReadSlot,
} from './lock.mjs';
import { runIdFrom } from './names';
import { unreachableTarget } from './policy';
import { compareSnapshots, readSnapshot, takeSnapshot, writeSnapshot } from './state';
import { checkoutStateDir, mainStateDir } from './state-io.mjs';

const LABEL_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

export interface CliDeps {
  /** builds the context for a state folder (default: the live environment) */
  createHarness?: (stateDir: string) => Harness;
  /** folder holding the labelled images (default: this checkout's `test/integration/.state`) */
  stateRoot?: string;
  processEnv?: NodeJS.ProcessEnv;
  out?: (line: string) => void;
  err?: (line: string) => void;
  slotWait?: { wait: boolean; pollMs?: number; maxWaitMs?: number };
}

function argValue(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  const next = argv[i + 1];
  return next !== undefined && !next.startsWith('--') ? next : '';
}

function liveHarness(stateDir: string): Harness {
  return createHarnessContext({
    env: liveEnv(),
    runId: runIdFrom(process.env),
    stateDir,
    mainStateDir: mainStateDir(),
    fetchImpl: (input, init) => (originalFetch() ?? globalThis.fetch)(input, init),
  });
}

export async function snapshotCli(argv: readonly string[], deps: CliDeps = {}): Promise<number> {
  const out = deps.out ?? ((line: string) => console.log(line));
  const err = deps.err ?? ((line: string) => console.error(line));
  const env = deps.processEnv ?? process.env;
  const label = argValue(argv, '--label');
  const compare = argValue(argv, '--compare');
  if (!label || !LABEL_RE.test(label) || (compare !== undefined && !LABEL_RE.test(compare))) {
    err(
      'usage: test:integration:snapshot -- --label <name> [--compare <name>] (names: letters, digits, . _ -)'
    );
    return 2;
  }
  const root = deps.stateRoot ?? checkoutStateDir();
  const comparePath = compare !== undefined ? join(root, compare, 'snapshot.json') : null;
  if (comparePath && !existsSync(comparePath)) {
    err(`snapshot: no image labelled ${compare}`);
    return 2;
  }
  let h: Harness;
  try {
    h = (deps.createHarness ?? liveHarness)(join(root, label));
  } catch (error) {
    if (error instanceof ContextMissing) {
      err(error.message);
      return 3;
    }
    if (error instanceof HarnessPrecondition) {
      err(error.message);
      return 2;
    }
    throw error;
  }
  setActiveHarness(h);
  const lockOptions = { stateDir: h.mainStateDir };
  const inherited = env.RTLS_IT_INTERNAL_LOCK_TOKEN;
  let slotToken: string | null = null;
  if (
    !belongsToHolder(inherited, lockOptions) &&
    unreachableTarget(new URL(h.env.baseUrl)) === null
  ) {
    const token = newLockToken();
    const slot = await acquireReadSlot({
      ...lockOptions,
      ...(deps.slotWait ?? { wait: true }),
      token,
      holder: `snapshot ${label}`,
    });
    if (slot === false) {
      err('snapshot: no read slot free after the wait');
      return 2;
    }
    slotToken = token;
  }
  try {
    const snapshot = await takeSnapshot(h);
    writeSnapshot(join(root, label, 'snapshot.json'), snapshot);
    out(`snapshot ${label}: ${Object.keys(snapshot.items).length} items`);
    if (!comparePath) return 0;
    const createdIds = new Set(listRuns(lockOptions).flatMap((r) => r.created?.ids ?? []));
    const differences = compareSnapshots(readSnapshot(comparePath), snapshot, {
      prefix: 'sdk-test-',
      createdIds,
    });
    for (const d of differences) out(`difference ${d.key} ${d.path}`);
    out(`compare ${compare} -> ${label}: ${differences.length} difference(s)`);
    return differences.length === 0 ? 0 : 1;
  } finally {
    if (slotToken) await releaseReadSlot(slotToken, lockOptions);
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  snapshotCli(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(`snapshot failed: ${error instanceof Error ? error.name : 'error'}`);
      process.exit(1);
    }
  );
}
