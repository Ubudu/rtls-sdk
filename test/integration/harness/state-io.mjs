// @ts-check
// Dependency-free state-file helpers shared by the harness, ledger.mjs and lock.mjs (P0 §5.5.7, §6.2).
// Cross-run files (run registry, created records, locks, ledger) live in the MAIN checkout, found with
// `dirname(realpath(git rev-parse --git-common-dir))`, so every worktree reads and writes the same files.
// Every read–modify–write is synchronous and runs under an exclusive `<file>.lock` created with `wx`, so a
// WebSocket `send` can record inside the call and two processes lose no update. Nothing here logs.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  closeSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Folder of this file (`test/integration/harness`). */
export const HARNESS_DIR = dirname(fileURLToPath(import.meta.url));
/** Root of the checkout this file belongs to (a worktree or the main checkout). */
export const CHECKOUT_ROOT = resolve(HARNESS_DIR, '..', '..', '..');

/**
 * Main checkout from the output of `git rev-parse --git-common-dir` (relative to `cwd` when not absolute).
 *
 * @param {string} output
 * @param {string} cwd
 * @returns {string}
 */
export function mainCheckoutFromGitCommonDir(output, cwd) {
  const commonDir = output.trim();
  const absolute = isAbsolute(commonDir) ? commonDir : resolve(cwd, commonDir);
  try {
    return dirname(realpathSync(absolute));
  } catch {
    return dirname(absolute);
  }
}

/** @type {string | null} */
let cachedMainCheckout = null;

/**
 * Main checkout of the repository that contains this file; falls back to this checkout when git is
 * unavailable.
 *
 * @returns {string}
 */
export function mainCheckoutDir() {
  if (cachedMainCheckout !== null) return cachedMainCheckout;
  try {
    const output = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd: CHECKOUT_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    cachedMainCheckout = mainCheckoutFromGitCommonDir(output, CHECKOUT_ROOT);
  } catch {
    cachedMainCheckout = CHECKOUT_ROOT;
  }
  return cachedMainCheckout;
}

/**
 * `test/integration/.state` of the main checkout (run registry, created records, locks, ledger).
 *
 * @returns {string}
 */
export function mainStateDir() {
  return join(mainCheckoutDir(), 'test', 'integration', '.state');
}

/**
 * `test/integration/.state` of this checkout (per-run state folders).
 *
 * @returns {string}
 */
export function checkoutStateDir() {
  return join(CHECKOUT_ROOT, 'test', 'integration', '.state');
}

/**
 * True when a process with this pid exists (EPERM counts as alive).
 *
 * @param {unknown} pid
 * @returns {boolean}
 */
export function isPidAlive(pid) {
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return /** @type {NodeJS.ErrnoException} */ (error).code === 'EPERM';
  }
}

const sleepCell = new Int32Array(new SharedArrayBuffer(4));

/**
 * Blocks the thread for `ms` milliseconds (used only while waiting for a short file lock).
 *
 * @param {number} ms
 */
export function sleepSync(ms) {
  Atomics.wait(sleepCell, 0, 0, ms);
}

/** An empty lock file older than this is a crash between create and write. */
const EMPTY_LOCK_STALE_MS = 5_000;

/**
 * Creates `path` exclusively (`wx`) holding `{ pid, at }`; false when it exists.
 *
 * @param {string} path
 * @returns {boolean}
 */
function tryCreateLock(path) {
  let fd;
  try {
    fd = openSync(path, 'wx');
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'EEXIST') return false;
    throw error;
  }
  try {
    writeSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
  } finally {
    closeSync(fd);
  }
  return true;
}

/**
 * Runs `fn` while holding the exclusive lock file `lockPath` (created with `wx`, holds `{ pid, at }`).
 * A lock whose holder pid is dead is taken over under `<lock>.steal` (see `takeOverStaleLock`), so two contenders
 * never remove each other's fresh lock; waiting is bounded by `timeoutMs`.
 *
 * @template T
 * @param {string} lockPath
 * @param {() => T} fn
 * @param {{ timeoutMs?: number }} [options]
 * @returns {T}
 */
export function withFileLockSync(lockPath, fn, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30_000;
  mkdirSync(dirname(lockPath), { recursive: true });
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (tryCreateLock(lockPath)) break;
    const judged = readLockText(lockPath);
    // retry at once only after removing the stale lock; otherwise (someone else took it over, or the steal lock
    // stayed held up to the deadline) the deadline check and the sleep below apply
    if (
      judged !== null &&
      lockIsStale(lockPath, judged) &&
      takeOverStaleLock(lockPath, judged, deadline)
    )
      continue;
    if (Date.now() > deadline) throw new Error(`file lock not acquired in ${timeoutMs} ms`);
    sleepSync(5);
  }
  try {
    return fn();
  } finally {
    rmSync(lockPath, { force: true });
  }
}

/**
 * The text of a lock file, or null when it does not exist.
 *
 * @param {string} lockPath
 * @returns {string | null}
 */
function readLockText(lockPath) {
  try {
    return readFileSync(lockPath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Removes the stale lock `lockPath` only while holding `<lock>.steal`, and only when its text still equals the
 * text that was judged stale (`judged`: same pid and time) and it is still stale: a contender that judged the same
 * lock stale earlier then finds the fresh lock of the contender that took over, and leaves it. A steal lock whose
 * holder is dead is removed only when it is still the file judged stale (rename, compare, then delete).
 * True when it removed the stale lock; false when the lock had changed or the steal lock stayed held by a live
 * process up to `deadline`.
 *
 * @param {string} lockPath
 * @param {string} judged
 * @param {number} deadline
 * @returns {boolean}
 */
function takeOverStaleLock(lockPath, judged, deadline) {
  const stealPath = `${lockPath}.steal`;
  for (;;) {
    if (tryCreateLock(stealPath)) break;
    const stealText = readLockText(stealPath);
    if (stealText !== null && lockIsStale(stealPath, stealText)) {
      removeIfUnchanged(stealPath, stealText);
      continue;
    }
    if (Date.now() > deadline) return false;
    sleepSync(1);
  }
  try {
    const current = readLockText(lockPath);
    if (current !== judged || !lockIsStale(lockPath, current)) return false;
    rmSync(lockPath, { force: true });
    return true;
  } finally {
    rmSync(stealPath, { force: true });
  }
}

/**
 * Deletes `path` when its text is still `expected`: the file is first renamed to a unique name (atomic), so exactly
 * the file that was compared is deleted; a different file found there is put back.
 *
 * @param {string} path
 * @param {string} expected
 */
function removeIfUnchanged(path, expected) {
  const aside = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.stale`;
  try {
    renameSync(path, aside);
  } catch {
    return;
  }
  try {
    if (readLockText(aside) !== expected) {
      try {
        linkSync(aside, path);
      } catch {
        // another lock was created meanwhile: it stays, the moved one is dropped
      }
    }
  } finally {
    rmSync(aside, { force: true });
  }
}

/**
 * @param {string} lockPath
 * @param {string} text the lock's text as read
 * @returns {boolean}
 */
function lockIsStale(lockPath, text) {
  if (text.trim() === '') {
    try {
      return Date.now() - statSync(lockPath).mtimeMs > EMPTY_LOCK_STALE_MS;
    } catch {
      return false;
    }
  }
  try {
    const holder = JSON.parse(text);
    return !isPidAlive(holder?.pid);
  } catch {
    return false;
  }
}

/**
 * Reads a JSON file; `fallback` when the file does not exist. A file that exists but does not parse is an
 * error (a corrupt counter file must never read as zero).
 *
 * @template T
 * @param {string} path
 * @param {T} fallback
 * @returns {T}
 */
export function readJsonFileSync(path, fallback) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return fallback;
    throw error;
  }
  return JSON.parse(text);
}

/**
 * Writes JSON through a temporary file and an atomic rename.
 *
 * @param {string} path
 * @param {unknown} value
 */
export function writeJsonFileAtomicSync(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path);
}

/**
 * One synchronous read–modify–write of a JSON file under `<path>.lock`. `update` returns the next value
 * (written) or `undefined` (nothing written) and may throw to abort without writing.
 *
 * @template T
 * @param {string} path
 * @param {T} fallback
 * @param {(current: T) => T | undefined} update
 * @returns {T}
 */
export function updateJsonFileSync(path, fallback, update) {
  return withFileLockSync(`${path}.lock`, () => {
    const current = readJsonFileSync(path, fallback);
    const next = update(current);
    if (next === undefined) return current;
    writeJsonFileAtomicSync(path, next);
    return next;
  });
}
