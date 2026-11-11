// Example mode of the guards (P0 §6.2 `preload.mjs`, LIVE-TESTING §2.1, §2.6, §2.7, §2.11), loaded by preload.mjs
// before the example's own code. Reads the environment once at start-up (process environment first, then `.env`;
// tier flags only from the process environment), installs the guarded fetch and WebSocket for the run id
// (`RTLS_IT_RUN_ID`, drawn here and exported when absent, so examples/shared/config.js agrees):
//
// - tier R unless argv holds `--write`; with `--write`, W/C/S need their command-line variable, the run lock must
//   be held with the token in `RTLS_IT_INTERNAL_LOCK_TOKEN` (else exit 2 before any request) and, with S enabled,
//   the cumulative ledger must admit the examples share (else exit 2);
// - a read-only process whose token holds the run lock or a read slot takes no slot; one without such a token
//   holds a read slot for its lifetime (none free after the wait → exit 2); an unreachable base URL takes none;
// - budgets: the examples share, shared through `.state/<runId>/budget.json`; each counted unit reaches the run's
//   ledger entry (kind `examples`) before it leaves;
// - preflight: a `--write` process reads `.state/<runId>/preflight.json`, or computes the four verdicts once for the
//   pass (raw GETs of the alert rules, the assets and the settings, and the ledger; the runner removes an earlier
//   pass's file), before the example runs; G18 applies from it;
// - G9: a config write passes while the config lock is held with the token and validateChange(before, body)
//   holds, `before` being read raw before the first config write of the process and saved as
//   `config/<resource>.before.json`; at exit the value is re-read and, when it differs, restored and verified (a
//   mismatch exits 4);
// - at exit: `guard/<pid>.json` (this process's counts, requests, violations, peak rate) and, in a `--write`
//   process, the ledger entry confirmed with the run's `budget.json` counts (raised, never added).
//
// Messages name variables, rules and counts only; nothing here prints a value.
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { originalFetch, setActiveHarness } from './active';
import { EXAMPLES_SHARE, readBudgetFile } from './budgets';
import { readConfig, restoreConfig, saveBeforeImage } from './config-core';
import { isAbsent, validateChange, type ConfigResourceName } from './config-resources';
import { createHarnessContext, type ConfigGate } from './context';
import { ContextMissing, HarnessPrecondition, liveEnv, type LiveEnv } from './env';
import { installGuards } from './install';
import { checkLedger, recordLedger } from './ledger.mjs';
import {
  acquireReadSlot,
  belongsToHolder,
  holdsLock,
  lockPaths,
  newLockToken,
  releaseReadSlot,
} from './lock.mjs';
import { runIdFrom } from './names';
import { unreachableTarget } from './policy';
import { computePreflight, preflightPath } from './preflight';
import { writeProcessStats } from './report';
import { checkoutStateDir, mainStateDir } from './state-io.mjs';
import { guardWebSocket, type WebSocketLike } from './ws-guard';
import { WS_GUARD_GLOBAL } from './ws-hook.mjs';

function stop(code: 2 | 3, message: string): never {
  process.stderr.write(`preload: ${message}\n`);
  process.exit(code);
}

const write = process.argv.slice(2).includes('--write');

let env: LiveEnv;
try {
  env = liveEnv();
} catch (error) {
  if (error instanceof ContextMissing) stop(3, `CONFIG MISSING: ${error.names.join(', ')}`);
  if (error instanceof HarnessPrecondition) {
    stop(2, `CONFIG INVALID: ${error.names.length > 0 ? error.names.join(', ') : error.message}`);
  }
  throw error;
}

let runId: string;
try {
  runId = runIdFrom(process.env);
} catch {
  stop(2, 'CONFIG INVALID: RTLS_IT_RUN_ID');
}
process.env.RTLS_IT_RUN_ID = runId;

const stateDir = join(checkoutStateDir(), runId);
const mainDir = mainStateDir();
const locks = lockPaths(mainDir);
const ledgerPath = join(mainDir, 'ledger.json');
const token = process.env.RTLS_IT_INTERNAL_LOCK_TOKEN ?? '';
const unreachable = unreachableTarget(new URL(env.baseUrl)) !== null;

// Locks: a write process belongs to the run that holds the run lock; a read-only process holds a read slot unless
// its token proves it belongs to a holder (or it can reach no host).
let slotToken: string | null = null;
if (write) {
  if (!holdsLock(locks.run, token)) {
    stop(
      2,
      'a --write example needs the run lock held with RTLS_IT_INTERNAL_LOCK_TOKEN (start it through npm run examples:check or examples:all)'
    );
  }
  if (env.tiers.S) {
    const refused = checkLedger(runId, EXAMPLES_SHARE, { ledgerPath });
    if (refused.length > 0) {
      stop(2, `cumulative cap: the examples share would exceed the cap of ${refused.join(', ')}`);
    }
  }
} else if (!unreachable && !belongsToHolder(token, { stateDir: mainDir })) {
  const own = newLockToken();
  const slot = await acquireReadSlot({
    token: own,
    wait: true,
    stateDir: mainDir,
    holder: `example ${basename(process.argv[1] ?? 'process')}`,
  });
  if (slot === false) {
    stop(2, 'no read slot free after the wait (two tier-R-only live processes are running)');
  }
  slotToken = own;
}

// Example-mode G9: the before-image of a resource is read before its first write in this process.
const configBefore = new Map<ConfigResourceName, unknown>();
const configLockHeld = (): boolean => holdsLock(locks.config, token);
const configGate: ConfigGate = async (resource, body) => {
  if (!write || !configLockHeld()) return false;
  if (!configBefore.has(resource)) {
    const read = await readConfig(resource);
    // No stored value is never written over (LIVE-TESTING §4 step 2).
    if (read.status !== 200 || isAbsent(resource, read.value, read.status)) return false;
    saveBeforeImage(stateDir, resource, read.value, read.text);
    configBefore.set(resource, read.value);
  }
  const before = configBefore.get(resource);
  return { admitted: validateChange(resource, before, body, { runId }), before };
};

const h = createHarnessContext({
  env,
  runId,
  stateDir,
  mainStateDir: mainDir,
  mode: 'example',
  exampleWrite: write,
  configGate,
  fetchImpl: (input, init) => (originalFetch() ?? globalThis.fetch)(input, init),
});
setActiveHarness(h);
installGuards();

// One guarded class per real `ws` class, shared by ws-guarded.mjs and ws-guarded.cjs (ws-hook.mjs).
const guardedClasses = new WeakMap<object, unknown>();
function guardedWsClass(Real: new (...a: never[]) => WebSocketLike): unknown {
  let cls = guardedClasses.get(Real);
  if (!cls) {
    const guarded = guardWebSocket(Real);
    Object.defineProperty(guarded, 'WebSocket', {
      value: guarded,
      configurable: true,
      writable: true,
    });
    guardedClasses.set(Real, guarded);
    cls = guarded;
  }
  return cls;
}
(globalThis as unknown as Record<symbol, unknown>)[WS_GUARD_GLOBAL] = guardedWsClass;

// End of the process: restore what a config write changed (async, before exiting), then the synchronous records.
async function restoreConfigs(): Promise<boolean> {
  let ok = true;
  for (const [resource, before] of configBefore) {
    if (!(await restoreConfig(h, resource, before, { lockHeld: configLockHeld }))) ok = false;
  }
  configBefore.clear();
  return ok;
}
const realExit = process.exit.bind(process) as (code?: number | string | null) => never;
let restoring: Promise<void> | null = null;
function exitAfterRestore(code: number | string | null | undefined): void {
  restoring ??= restoreConfigs().then(
    (ok) => realExit(ok ? code : 4),
    () => realExit(4)
  );
}
process.exit = ((code?: number | string | null) => {
  if (configBefore.size === 0 && restoring === null) return realExit(code);
  exitAfterRestore(code);
  return undefined as never;
}) as typeof process.exit;
process.on('beforeExit', (code) => {
  if (configBefore.size > 0) exitAfterRestore(code);
});
for (const [signal, code] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
] as const) {
  process.once(signal, () => process.exit(code));
}

let recorded = false;
process.on('exit', () => {
  if (recorded) return;
  recorded = true;
  try {
    writeProcessStats(h);
  } catch {
    process.stderr.write('preload: guard record not written\n');
  }
  if (write) {
    try {
      recordLedger(runId, 'examples', h.enabledTiers(), readBudgetFile(stateDir).counts, {
        ledgerPath,
      });
    } catch {
      process.stderr.write('preload: ledger entry not confirmed\n');
      if (!process.exitCode) process.exitCode = 1;
    }
  }
  if (slotToken) void releaseReadSlot(slotToken, { stateDir: mainDir });
});

// Preflight (write processes only; a read-only process sends no G18-shaped request): once per run id.
if (write && !existsSync(preflightPath(stateDir))) {
  await computePreflight(h, { notifications: false });
}
