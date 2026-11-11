// Git file listing for the P0 tooling (P0 §3.1, §6.1).
// `listFiles()` returns the tracked files plus the untracked files that are not ignored
// (`git ls-files` + `git ls-files --others --exclude-standard`), so folders that are excluded locally
// (for example `.wp-discovery/`) are never touched by lint, format or scans.
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * @param {string[]} args
 * @param {string} cwd
 * @returns {string[]}
 */
function gitLines(args, cwd) {
  const out = execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\0').filter((line) => line.length > 0);
}

/**
 * Repository-relative POSIX paths of the tracked files, plus (by default) the untracked files that are
 * not ignored. Sorted, without duplicates. Paths of deleted-but-tracked files are dropped.
 *
 * @param {{ cwd?: string; others?: boolean; existingOnly?: boolean }} [options]
 * @returns {string[]}
 */
export function listFiles({ cwd = REPO_ROOT, others = true, existingOnly = true } = {}) {
  const files = new Set(gitLines(['ls-files', '-z'], cwd));
  if (others) {
    for (const f of gitLines(['ls-files', '-z', '--others', '--exclude-standard'], cwd))
      files.add(f);
  }
  if (existingOnly) {
    const deleted = new Set(gitLines(['ls-files', '-z', '--deleted'], cwd));
    for (const f of deleted) files.delete(f);
  }
  return [...files].sort();
}

/**
 * Tracked files only (`git ls-files`).
 *
 * @param {{ cwd?: string }} [options]
 * @returns {string[]}
 */
export function listTrackedFiles({ cwd = REPO_ROOT } = {}) {
  return listFiles({ cwd, others: false, existingOnly: false });
}
