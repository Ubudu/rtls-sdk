// @ts-check
// Run lock, read slots, config lock and run registry (LIVE-TESTING §2.11, P0 §6.2 `lock.mjs`). Dependency-free
// ESM, so the integration driver, the examples runners, the CLIs and the example-mode preload use it outside
// vitest. Every file lives in the MAIN checkout (`test/integration/.state/locks/`, `…/runs/`), found from the git
// common dir, so all worktrees share them.
//
// A lock file holds `{ pid, startedAt, holder, tokenHash }`, never the token: ownership is proved by the token
// (`RTLS_IT_INTERNAL_LOCK_TOKEN` in child processes), whose sha256 must equal `tokenHash`, and by a live pid. A
// lock is created atomically (a complete temporary file hard-linked to the lock path), so no reader ever sees a
// half-written lock. A lock whose holder pid is dead is stolen under a short `<lock>.steal` file lock, so two
// stealers never remove each other's fresh lock.
import { createHash, randomBytes } from 'node:crypto';
import {
  linkSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import {
  isPidAlive,
  mainCheckoutFromGitCommonDir,
  mainStateDir,
  readJsonFileSync,
  withFileLockSync,
  writeJsonFileAtomicSync,
} from './state-io.mjs';

export { mainCheckoutFromGitCommonDir };

/** @typedef {{ pid: number; startedAt: string; holder: string; tokenHash: string }} LockFile */
/** @typedef {{ pid: number; startedAt: string; domain: string; tiers: Record<'R' | 'W' | 'C' | 'S', boolean> }} RunEntry */
/** @typedef {{ stateDir?: string }} StateOptions */
/** @typedef {StateOptions & { wait?: boolean; token: string; holder?: string; pollMs?: number; maxWaitMs?: number }} AcquireOptions */

/** Poll interval while waiting for a lock or a read slot. */
export const POLL_MS = 5_000;
/** Longest wait for the run lock and for a read slot. */
export const RUN_LOCK_MAX_WAIT_MS = 30 * 60_000;
/** Longest wait for the config lock. */
export const CONFIG_LOCK_MAX_WAIT_MS = 15 * 60_000;
/** A lock file that cannot be parsed and is older than this is treated as stale. */
const UNREADABLE_STALE_MS = 5_000;

/**
 * Lock and registry paths below a main-checkout state folder (`test/integration/.state`).
 *
 * @param {string} [stateDir]
 * @returns {{ locksDir: string; runsDir: string; run: string; config: string; readSlots: readonly [string, string] }}
 */
export function lockPaths(stateDir = mainStateDir()) {
  const locksDir = join(stateDir, 'locks');
  return {
    locksDir,
    runsDir: join(stateDir, 'runs'),
    run: join(locksDir, 'run.lock'),
    config: join(locksDir, 'config.lock'),
    readSlots: Object.freeze(
      /** @type {const} */ ([join(locksDir, 'read-1.lock'), join(locksDir, 'read-2.lock')])
    ),
  };
}

const DEFAULT_PATHS = lockPaths();
/** `test/integration/.state/locks/run.lock` in the main checkout. */
export const RUN_LOCK_PATH = DEFAULT_PATHS.run;
/** `test/integration/.state/locks/config.lock` in the main checkout. */
export const CONFIG_LOCK_PATH = DEFAULT_PATHS.config;
/** `test/integration/.state/locks/read-1.lock` and `read-2.lock` in the main checkout. */
export const READ_SLOT_PATHS = DEFAULT_PATHS.readSlots;

/** 32 random hex characters: the token of one run, used for every lock or read slot the run holds. */
export function newLockToken() {
  return randomBytes(16).toString('hex');
}

/**
 * @param {string} token
 * @returns {string}
 */
function hashOf(token) {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * @param {unknown} token
 * @returns {asserts token is string}
 */
function requireToken(token) {
  if (typeof token !== 'string' || token.length < 16) {
    throw new TypeError('lock: a token of at least 16 characters is required');
  }
}

/**
 * The parsed lock file, `null` when absent, `'unreadable'` when it cannot be parsed.
 *
 * @param {string} path
 * @returns {LockFile | null | 'unreadable'}
 */
function readLock(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return null;
    throw error;
  }
  try {
    const value = JSON.parse(text);
    if (value && typeof value === 'object' && typeof value.tokenHash === 'string') return value;
  } catch {
    // fall through
  }
  return 'unreadable';
}

/**
 * Holder of a lock without its token hash (for listings), or null.
 *
 * @param {string} path
 * @returns {{ pid: number; startedAt: string; holder: string; alive: boolean } | null}
 */
export function lockHolder(path) {
  const lock = readLock(path);
  if (lock === null || lock === 'unreadable') return null;
  return {
    pid: lock.pid,
    startedAt: lock.startedAt,
    holder: lock.holder,
    alive: isPidAlive(lock.pid),
  };
}

/**
 * True when the lock file at `path` exists, its `tokenHash` is the sha256 of `token` and its pid is alive.
 *
 * @param {string} path
 * @param {string | undefined | null} token
 * @returns {boolean}
 */
export function holdsLock(path, token) {
  if (typeof token !== 'string' || token === '') return false;
  const lock = readLock(path);
  if (lock === null || lock === 'unreadable') return false;
  return lock.tokenHash === hashOf(token) && isPidAlive(lock.pid);
}

/**
 * @param {string} path
 * @returns {boolean}
 */
function isStale(path) {
  const lock = readLock(path);
  if (lock === null) return false;
  if (lock === 'unreadable') {
    try {
      return Date.now() - statSync(path).mtimeMs > UNREADABLE_STALE_MS;
    } catch {
      return false;
    }
  }
  return !isPidAlive(lock.pid);
}

/**
 * One attempt to take the lock at `path`: true when taken (or already held with this token by a live pid).
 *
 * @param {string} path
 * @param {string} token
 * @param {string} holder
 * @returns {boolean}
 */
function tryAcquire(path, token, holder) {
  mkdirSync(dirname(path), { recursive: true });
  if (holdsLock(path, token)) return true;
  if (isStale(path)) {
    withFileLockSync(`${path}.steal`, () => {
      if (isStale(path)) rmSync(path, { force: true });
    });
  }
  /** @type {LockFile} */
  const content = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    holder,
    tokenHash: hashOf(token),
  };
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(content)}\n`);
  try {
    linkSync(tmp, path);
    return true;
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'EEXIST') return false;
    throw error;
  } finally {
    rmSync(tmp, { force: true });
  }
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Takes the first of `paths` that is free; with `wait`, polls until one frees or the wait ends.
 *
 * @param {readonly string[]} paths
 * @param {AcquireOptions} options
 * @param {number} defaultMaxWait
 * @returns {Promise<string | false>}
 */
async function acquireAny(paths, options, defaultMaxWait) {
  requireToken(options.token);
  const holder = options.holder ?? `pid ${process.pid}`;
  const pollMs = options.pollMs ?? POLL_MS;
  const deadline = Date.now() + (options.maxWaitMs ?? defaultMaxWait);
  for (;;) {
    for (const path of paths) if (tryAcquire(path, options.token, holder)) return path;
    if (!options.wait || Date.now() + pollMs > deadline) return false;
    await delay(pollMs);
  }
}

/**
 * Removes the lock at `path` when it is held with `token` (any pid; the holder's own release or its run's).
 *
 * @param {string} path
 * @param {string} token
 * @returns {boolean} true when a lock was removed
 */
function releasePath(path, token) {
  const lock = readLock(path);
  if (lock === null || lock === 'unreadable' || lock.tokenHash !== hashOf(token)) return false;
  rmSync(path, { force: true });
  return true;
}

/**
 * The run lock, held by every write-capable run for its whole duration. `wait: false` → `false` when held by a
 * live pid; `wait: true` → polls every 5 s for at most 30 min, then `false`. A lock whose holder pid is dead is
 * stolen.
 *
 * @param {AcquireOptions} options
 * @returns {Promise<boolean>}
 */
export async function acquireRunLock(options) {
  const { run } = lockPaths(options.stateDir);
  return (await acquireAny([run], options, RUN_LOCK_MAX_WAIT_MS)) !== false;
}

/**
 * @param {string} token
 * @param {StateOptions} [options]
 * @returns {Promise<boolean>}
 */
export async function releaseRunLock(token, options = {}) {
  return releasePath(lockPaths(options.stateDir).run, token);
}

/**
 * The config lock, taken only while the same token holds the run lock (otherwise refused: `false` at once).
 * `wait: true` polls for at most 15 min.
 *
 * @param {AcquireOptions} options
 * @returns {Promise<boolean>}
 */
export async function acquireConfigLock(options) {
  requireToken(options.token);
  const paths = lockPaths(options.stateDir);
  if (!holdsLock(paths.run, options.token)) return false;
  return (await acquireAny([paths.config], options, CONFIG_LOCK_MAX_WAIT_MS)) !== false;
}

/**
 * @param {string} token
 * @param {StateOptions} [options]
 * @returns {Promise<boolean>}
 */
export async function releaseConfigLock(token, options = {}) {
  return releasePath(lockPaths(options.stateDir).config, token);
}

/**
 * One of the two read slots, held by every tier-R-only live process. Returns the slot path, or `false` when both
 * are held by live pids (after the wait with `wait: true`: polls every 5 s, at most 30 min).
 *
 * @param {AcquireOptions} options
 * @returns {Promise<string | false>}
 */
export async function acquireReadSlot(options) {
  return acquireAny(lockPaths(options.stateDir).readSlots, options, RUN_LOCK_MAX_WAIT_MS);
}

/**
 * @param {string} token
 * @param {StateOptions} [options]
 * @returns {Promise<boolean>}
 */
export async function releaseReadSlot(token, options = {}) {
  let released = false;
  for (const path of lockPaths(options.stateDir).readSlots) {
    if (releasePath(path, token)) released = true;
  }
  return released;
}

/**
 * `holdsLock` on either read slot.
 *
 * @param {string | undefined | null} token
 * @param {StateOptions} [options]
 * @returns {boolean}
 */
export function holdsReadSlot(token, options = {}) {
  return lockPaths(options.stateDir).readSlots.some((path) => holdsLock(path, token));
}

/**
 * True when `token` holds the run lock or a read slot: the process belongs to that holder's run and takes no
 * slot of its own.
 *
 * @param {string | undefined | null} token
 * @param {StateOptions} [options]
 * @returns {boolean}
 */
export function belongsToHolder(token, options = {}) {
  return holdsLock(lockPaths(options.stateDir).run, token) || holdsReadSlot(token, options);
}

const RUN_ID_RE = /^[0-9a-f]{8}$/;

/**
 * @param {string} runId
 */
function requireRunId(runId) {
  if (typeof runId !== 'string' || !RUN_ID_RE.test(runId)) {
    throw new TypeError('run registry: the run id must be 8 lowercase hex characters');
  }
}

/**
 * Writes `runs/<runId>.json` `{ pid, startedAt, domain, tiers }` with the caller's pid.
 *
 * @param {string} runId
 * @param {{ domain: string; tiers: Record<'R' | 'W' | 'C' | 'S', boolean> }} info
 * @param {StateOptions} [options]
 * @returns {RunEntry}
 */
export function registerRun(runId, info, options = {}) {
  requireRunId(runId);
  /** @type {RunEntry} */
  const entry = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    domain: String(info.domain),
    tiers: { ...info.tiers },
  };
  writeJsonFileAtomicSync(join(lockPaths(options.stateDir).runsDir, `${runId}.json`), entry);
  return entry;
}

/**
 * Removes `runs/<runId>.json`.
 *
 * @param {string} runId
 * @param {StateOptions} [options]
 */
export function deregisterRun(runId, options = {}) {
  requireRunId(runId);
  rmSync(join(lockPaths(options.stateDir).runsDir, `${runId}.json`), { force: true });
}

/**
 * A registered run is active only while its recorded process is alive.
 *
 * @param {unknown} entry
 * @returns {boolean}
 */
export function isRunActive(entry) {
  return (
    typeof entry === 'object' && entry !== null && isPidAlive(/** @type {RunEntry} */ (entry).pid)
  );
}

/**
 * Every registered run and every created record in `runs/` (main checkout).
 *
 * @param {StateOptions} [options]
 * @returns {{ runId: string; entry: RunEntry | null; created: { ids: string[]; macs: string[] } | null }[]}
 */
export function listRuns(options = {}) {
  const { runsDir } = lockPaths(options.stateDir);
  /** @type {string[]} */
  let names;
  try {
    names = readdirSync(runsDir);
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return [];
    throw error;
  }
  /** @type {Map<string, { runId: string; entry: RunEntry | null; created: { ids: string[]; macs: string[] } | null }>} */
  const runs = new Map();
  for (const name of names) {
    const m = /^([0-9a-f]{8})(\.created)?\.json$/.exec(name);
    if (!m) continue;
    const runId = /** @type {string} */ (m[1]);
    const run = runs.get(runId) ?? { runId, entry: null, created: null };
    const value = readJsonFileSync(join(runsDir, name), null);
    if (m[2]) {
      const v = /** @type {{ ids?: unknown; macs?: unknown } | null} */ (value);
      run.created = {
        ids: Array.isArray(v?.ids) ? v.ids.filter((x) => typeof x === 'string') : [],
        macs: Array.isArray(v?.macs) ? v.macs.filter((x) => typeof x === 'string') : [],
      };
    } else {
      run.entry = /** @type {RunEntry | null} */ (value);
    }
    runs.set(runId, run);
  }
  return [...runs.values()].sort((a, b) => a.runId.localeCompare(b.runId));
}

/**
 * Deletes `runs/<runId>.created.json` (the sweeper, once none of its residue is left).
 *
 * @param {string} runId
 * @param {StateOptions} [options]
 */
export function deleteCreatedRecord(runId, options = {}) {
  requireRunId(runId);
  rmSync(join(lockPaths(options.stateDir).runsDir, `${runId}.created.json`), { force: true });
}
