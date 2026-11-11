// Coverage-ignore hints in src (P0 §5.7, LIVE-TESTING §6). The v8 provider counts every line under a
// `/* v8 ignore … */` (also `c8`, `node:coverage`, `istanbul`) hint as covered, and its default v8-to-istanbul
// remapping also drops every line between `/* node:coverage disable */` and `/* node:coverage enable */`, so a hint
// would exempt lines from both coverage gates without an allowlist entry, a reason or a unit test.
// `coverage:live:check` and `test:coverage -- --phase Pn | --release` reject every such hint in the files they judge.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const IGNORE_HINT_RE =
  /\b(?:[cv]8|node:coverage|istanbul)\s+ignore\b|\bnode:coverage\s+(?:disable|enable)\b/;

/**
 * One finding `<file>:<line>: coverage ignore hint: use an allowlist entry` per line of `files` (repository-relative)
 * that carries a hint; files that do not exist under `root` are skipped.
 *
 * @param {string} root
 * @param {readonly string[]} files
 * @returns {string[]}
 */
export function ignoreHintFindings(root, files) {
  /** @type {string[]} */
  const findings = [];
  for (const file of files) {
    const abs = join(root, file);
    if (!existsSync(abs)) continue;
    readFileSync(abs, 'utf8')
      .split('\n')
      .forEach((text, i) => {
        if (IGNORE_HINT_RE.test(text))
          findings.push(`${file}:${i + 1}: coverage ignore hint: use an allowlist entry`);
      });
  }
  return findings;
}
