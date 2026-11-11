// Quality baseline (P0 §5.5.5): findings of typecheck / lint / format / docs / links that existed when
// P0 finished, recorded per file with the owning phase, so a gate can tell "known, owned by another phase"
// from "new". Matching ignores line numbers: (tool, file, code, message) with occurrences ≤ count.
//   --phase Pn  entries owned by Pn are not tolerated (a phase cleans its own files);
//   --release   no entry is tolerated;
//   stale entries (nothing matches them any more) print a warning.
// Only P0 (and the orchestrator applying a handoff) writes the file, through
// `node scripts/quality.mjs <tool> --write-baseline`, which refuses entries for P0-owned files.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './git.mjs';
import { ownerOf as defaultOwnerOf, UNOWNED } from './ownership.mjs';

/** @typedef {'typecheck' | 'lint' | 'format' | 'docs' | 'links'} Tool */
/**
 * @typedef {{ tool: Tool; file: string; line?: number; column?: number; code?: string; message: string }} Finding
 * @typedef {{ tool: Tool; file: string; code?: string; message?: string; count?: number; phase: string }} BaselineEntry
 * @typedef {{ version: 1; entries: BaselineEntry[] }} Baseline
 * @typedef {(path: string) => string} OwnerFn
 */

export const TOOLS = /** @type {const} */ (['typecheck', 'lint', 'format', 'docs', 'links']);
export const BASELINE_PATH = join(REPO_ROOT, 'scripts', 'quality-baseline.json');

/**
 * First line of a message with line/column references removed.
 *
 * @param {string} message
 * @returns {string}
 */
export function normalizeMessage(message) {
  const first = String(message).split(/\r?\n/, 1)[0] ?? '';
  return first
    .replace(/\s*\(\d+,\d+\)/g, '')
    .replace(/:\d+:\d+\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} [path]
 * @returns {Baseline}
 */
export function loadBaseline(path = BASELINE_PATH) {
  if (!existsSync(path)) return { version: 1, entries: [] };
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (data?.version !== 1 || !Array.isArray(data.entries))
    throw new Error(`${path}: not a version 1 quality baseline`);
  return data;
}

/**
 * @param {BaselineEntry} entry
 * @param {Finding} finding
 */
function entryMatches(entry, finding) {
  return (
    entry.tool === finding.tool &&
    entry.file === finding.file &&
    (entry.code === undefined || entry.code === finding.code) &&
    (entry.message === undefined || entry.message === normalizeMessage(finding.message))
  );
}

/**
 * @param {BaselineEntry} e
 */
export function describeEntry(e) {
  return [e.tool, e.file, e.code, e.message].filter((x) => x !== undefined && x !== '').join(' ');
}

/**
 * @param {Finding} f
 */
export function describeFinding(f) {
  const where =
    f.line !== undefined
      ? `${f.file}:${f.line}${f.column !== undefined ? `:${f.column}` : ''}`
      : f.file;
  return `${where} ${f.tool}${f.code ? ` ${f.code}` : ''} ${normalizeMessage(f.message)}`;
}

/**
 * Applies the baseline to the findings of one tool.
 *
 * @param {readonly Finding[]} findings
 * @param {Baseline} baseline
 * @param {{ tool: Tool; phase?: string; release?: boolean; ownerOf?: OwnerFn; files?: readonly string[] }} options
 *   `files`: when only some files were checked, stale-entry warnings are limited to those files.
 * @returns {{ failures: Finding[]; tolerated: Finding[]; unowned: Finding[]; warnings: string[] }}
 */
export function evaluate(
  findings,
  baseline,
  { tool, phase, release = false, ownerOf = defaultOwnerOf, files }
) {
  const scope = files ? new Set(files) : null;
  const entries = baseline.entries.filter((e) => e.tool === tool);
  const remaining = entries.map((e) => e.count ?? 1);
  const matched = entries.map(() => 0);
  /** @type {Finding[]} */
  const failures = [];
  /** @type {Finding[]} */
  const tolerated = [];
  /** @type {Finding[]} */
  const unowned = [];
  /** @type {string[]} */
  const warnings = [];

  for (const finding of findings) {
    const owner = ownerOf(finding.file);
    let slot = -1;
    for (let i = 0; i < entries.length; i++) {
      if (!entryMatches(/** @type {BaselineEntry} */ (entries[i]), finding)) continue;
      matched[i] = /** @type {number} */ (matched[i]) + 1;
      if (slot === -1 && /** @type {number} */ (remaining[i]) > 0) slot = i;
    }
    if (release) {
      failures.push(finding);
      continue;
    }
    if (phase !== undefined && owner === phase) {
      failures.push(finding);
      continue;
    }
    if (slot !== -1) {
      remaining[slot] = /** @type {number} */ (remaining[slot]) - 1;
      tolerated.push(finding);
      continue;
    }
    if (owner === UNOWNED) {
      unowned.push(finding);
      warnings.push(
        `finding on an unowned file (fails with --release): ${describeFinding(finding)}`
      );
      continue;
    }
    failures.push(finding);
  }

  entries.forEach((entry, i) => {
    if (scope && !scope.has(entry.file)) return;
    const found = /** @type {number} */ (matched[i]);
    const allowed = entry.count ?? 1;
    if (found === 0)
      warnings.push(`stale baseline entry (nothing matches it): ${describeEntry(entry)}`);
    else if (found < allowed)
      warnings.push(
        `baseline entry allows ${allowed}, found ${found} (lower the count): ${describeEntry(entry)}`
      );
    const owner = ownerOf(entry.file);
    if (owner !== entry.phase)
      warnings.push(
        `baseline entry phase ${entry.phase} differs from the owner ${owner}: ${describeEntry(entry)}`
      );
  });

  return { failures, tolerated, unowned, warnings };
}

/**
 * Builds the baseline entries of one tool from its findings: one entry per (file, code, message) with
 * its count and owner. Findings on P0-owned files are refused (P0 cleans its own files).
 *
 * @param {Tool} tool
 * @param {readonly Finding[]} findings
 * @param {OwnerFn} [ownerOf]
 * @returns {{ entries: BaselineEntry[]; refused: Finding[] }}
 */
export function buildEntries(tool, findings, ownerOf = defaultOwnerOf) {
  /** @type {Map<string, BaselineEntry>} */
  const byKey = new Map();
  /** @type {Finding[]} */
  const refused = [];
  for (const f of findings) {
    if (f.tool !== tool) continue;
    const phase = ownerOf(f.file);
    if (phase === 'P0') {
      refused.push(f);
      continue;
    }
    const message = normalizeMessage(f.message);
    const key = JSON.stringify([f.file, f.code ?? null, message]);
    const existing = byKey.get(key);
    if (existing) existing.count = (existing.count ?? 1) + 1;
    else {
      /** @type {BaselineEntry} */
      const entry = { tool, file: f.file, message, count: 1, phase };
      if (f.code !== undefined) entry.code = f.code;
      byKey.set(key, entry);
    }
  }
  return { entries: sortEntries([...byKey.values()]), refused };
}

/**
 * @param {BaselineEntry[]} entries
 */
function sortEntries(entries) {
  const k = (/** @type {BaselineEntry} */ e) =>
    [e.tool, e.file, e.code ?? '', e.message ?? ''].join('\0');
  return [...entries].sort((a, b) => (k(a) < k(b) ? -1 : k(a) > k(b) ? 1 : 0));
}

/**
 * Replaces the entries of one tool, keeping the other tools' entries.
 *
 * @param {Baseline} baseline
 * @param {Tool} tool
 * @param {BaselineEntry[]} entries
 * @returns {Baseline}
 */
export function replaceToolEntries(baseline, tool, entries) {
  return {
    version: 1,
    entries: sortEntries([...baseline.entries.filter((e) => e.tool !== tool), ...entries]),
  };
}

/**
 * Serialised form of a baseline (stable key order, two-space indent, trailing newline).
 *
 * @param {Baseline} baseline
 * @returns {string}
 */
export function baselineText(baseline) {
  const ordered = {
    version: 1,
    entries: baseline.entries.map((e) => {
      /** @type {Record<string, unknown>} */
      const o = { tool: e.tool, file: e.file };
      if (e.code !== undefined) o.code = e.code;
      if (e.message !== undefined) o.message = e.message;
      if (e.count !== undefined) o.count = e.count;
      o.phase = e.phase;
      return o;
    }),
  };
  return JSON.stringify(ordered, null, 2) + '\n';
}

/**
 * @param {Baseline} baseline
 * @param {string} [path]
 */
export function saveBaseline(baseline, path = BASELINE_PATH) {
  writeFileSync(path, baselineText(baseline));
}
