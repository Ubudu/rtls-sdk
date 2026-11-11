// Shared helpers of `docs:snippets` and `docs:links` (P0 §6.1, §6.4): the default document sets, a fenced
// code block scanner, and the CLI that applies the quality baseline (P0 §5.5.5) exactly as
// `scripts/quality.mjs docs|links` does.
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import picomatch from 'picomatch';
import { BASELINE_PATH, describeFinding, evaluate, loadBaseline } from '../lib/baseline.mjs';
import { UsageError, parseArgs, parsePhase } from '../lib/cli.mjs';
import { REPO_ROOT, listFiles } from '../lib/git.mjs';
import { ownerOf } from '../lib/ownership.mjs';

/** @typedef {import('../lib/baseline.mjs').Finding} Finding */

/** Documents whose links `docs:links` checks (P0 §6.1). */
export const LINK_DOCS = Object.freeze([
  'README.md',
  'CHANGELOG.md',
  'CLAUDE.md',
  'docs/**/*.md',
  'examples/README.md',
]);
/** P0's developer READMEs, added to the snippet set (P0 §6.4). */
export const DEVELOPER_READMES = Object.freeze([
  'spec/manifest/README.md',
  'test/contract/README.md',
  'test/integration/harness/README.md',
]);

const isLinkDocGlob = picomatch(/** @type {string[]} */ ([...LINK_DOCS]), { dot: true });

/**
 * @param {string} path  repository-relative POSIX path
 */
export function isLinkDoc(path) {
  return isLinkDocGlob(path);
}

/**
 * The snippet set: the link set minus the generated API reference, plus P0's developer READMEs.
 *
 * @param {string} path  repository-relative POSIX path
 */
export function isSnippetDoc(path) {
  if (DEVELOPER_READMES.includes(path)) return true;
  return isLinkDoc(path) && !path.startsWith('docs/api/reference/');
}

/**
 * @param {string} cwd
 * @param {string} file
 */
export function toRepoPath(cwd, file) {
  return relative(cwd, isAbsolute(file) ? file : resolve(cwd, file))
    .split('\\')
    .join('/');
}

/**
 * Selects the documents of a set from a file listing (default: `git ls-files` + untracked, not ignored).
 *
 * @param {(path: string) => boolean} predicate
 * @param {{ cwd?: string; files?: readonly string[] }} [options]
 * @returns {string[]}
 */
export function selectDocs(predicate, { cwd = REPO_ROOT, files } = {}) {
  const listing = files ? files.map((f) => toRepoPath(cwd, f)) : listFiles({ cwd });
  return [...new Set(listing)].filter((f) => predicate(f) && existsSync(resolve(cwd, f))).sort();
}

/**
 * @typedef {{
 *   fenceLine: number;          // 1-based line of the opening fence
 *   closeLine: number | null;   // 1-based line of the closing fence (null: unterminated, runs to the end)
 *   info: string;               // info string after the fence characters
 *   lang: string;               // first word of the info string, lower case
 *   lines: string[];            // content lines, indentation of the fence removed
 *   above: string | null;       // the line directly above the fence (directive comments live there)
 * }} Fence
 */

/**
 * Fenced code blocks of a Markdown text (backtick or tilde fences of three or more characters, at any
 * indentation, so fences inside list items are found too).
 *
 * @param {string} text
 * @returns {Fence[]}
 */
export function scanFences(text) {
  const lines = text.split(/\r?\n/);
  /** @type {Fence[]} */
  const fences = [];
  for (let i = 0; i < lines.length; i++) {
    const open = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(/** @type {string} */ (lines[i]));
    if (!open) continue;
    const indent = /** @type {string} */ (open[1]).length;
    const marker = /** @type {string} */ (open[2]);
    const info = /** @type {string} */ (open[3]).trim();
    if (marker[0] === '`' && info.includes('`')) continue; // not a fence (inline code)
    /** @type {string[]} */
    const content = [];
    let close = null;
    for (let j = i + 1; j < lines.length; j++) {
      const line = /** @type {string} */ (lines[j]);
      const m = /^\s*(`{3,}|~{3,})\s*$/.exec(line);
      if (
        m &&
        /** @type {string} */ (m[1])[0] === marker[0] &&
        /** @type {string} */ (m[1]).length >= marker.length
      ) {
        close = j;
        break;
      }
      content.push(stripIndent(line, indent));
    }
    fences.push({
      fenceLine: i + 1,
      closeLine: close === null ? null : close + 1,
      info,
      lang: (info.split(/\s+/)[0] ?? '').toLowerCase(),
      lines: content,
      above: i > 0 ? /** @type {string} */ (lines[i - 1]) : null,
    });
    i = close === null ? lines.length : close;
  }
  return fences;
}

/**
 * @param {string} line
 * @param {number} indent
 */
function stripIndent(line, indent) {
  let n = 0;
  while (n < indent && n < line.length && (line[n] === ' ' || line[n] === '\t')) n++;
  return line.slice(n);
}

/**
 * For every line of the text, whether it lies inside a fenced code block (fence lines included).
 *
 * @param {string} text
 * @returns {boolean[]}  index = line - 1
 */
export function codeLineMask(text) {
  const count = text.split(/\r?\n/).length;
  const mask = new Array(count).fill(false);
  for (const f of scanFences(text)) {
    const last = (f.closeLine ?? count) - 1;
    for (let i = f.fenceLine - 1; i <= last && i < count; i++) mask[i] = true;
  }
  return mask;
}

/**
 * @param {string} cwd
 * @param {string} file
 */
export function readDoc(cwd, file) {
  return readFileSync(resolve(cwd, file), 'utf8');
}

/**
 * Shared CLI: `<script> [files…] [--phase Pn] [--release] [extra flags]`. Collects the findings, applies
 * the quality baseline (P0 §5.5.5) and prints them like `scripts/quality.mjs`.
 *
 * @template {string} F
 * @param {{
 *   tool: 'docs' | 'links';
 *   name: string;
 *   argv: readonly string[];
 *   flags?: readonly F[];
 *   collect: (options: { cwd: string; files?: string[]; flags: Record<F, boolean> }) => Promise<{ findings: Finding[]; summary: string; extra?: string[] }>;
 *   format?: (finding: Finding) => string;
 *   cwd?: string;
 *   baselinePath?: string;
 *   log?: (line: string) => void;
 *   error?: (line: string) => void;
 * }} options
 * @returns {Promise<number>}
 */
export async function runDocsCli({
  tool,
  name,
  argv,
  flags = [],
  collect,
  format = (f) => `${describeFinding(f)} [owner ${ownerOf(f.file)}]`,
  cwd = REPO_ROOT,
  baselinePath = BASELINE_PATH,
  log = (line) => console.log(line),
  error = (line) => console.error(line),
}) {
  const usage = `usage: ${name} [files…] [--phase Pn] [--release]${flags.map((f) => ` [--${f}]`).join('')}`;
  /** @type {ReturnType<typeof parseArgs<F | 'release', 'phase'>>} */
  let args;
  /** @type {string | undefined} */
  let phase;
  try {
    args = parseArgs(argv, { flags: [...flags, 'release'], options: ['phase'] });
    phase = parsePhase(args.options.phase);
  } catch (err) {
    error(`${name}: ${/** @type {Error} */ (err).message}\n${usage}`);
    return 2;
  }
  const files = args.positionals.length
    ? args.positionals.map((p) => toRepoPath(cwd, p))
    : undefined;
  for (const f of files ?? []) {
    if (!existsSync(resolve(cwd, f))) {
      error(`${name}: ${f} not found`);
      return 2;
    }
  }
  /** @type {Awaited<ReturnType<typeof collect>>} */
  let collected;
  try {
    collected = await collect({
      cwd,
      files,
      flags: /** @type {Record<F, boolean>} */ (args.flags),
    });
  } catch (err) {
    if (err instanceof UsageError) {
      error(`${name}: ${err.message}`);
      return 2;
    }
    throw err;
  }
  const result = evaluate(collected.findings, loadBaseline(baselinePath), {
    tool,
    phase,
    release: args.flags.release,
    files,
  });
  for (const w of result.warnings) log(`${name}: warning: ${w}`);
  for (const f of result.failures) error(format(f));
  for (const line of collected.extra ?? []) log(line);
  const mode = args.flags.release ? ' --release' : phase ? ` --phase ${phase}` : '';
  log(
    `${name}${mode}: ${collected.summary}; ${result.failures.length} failing, ${result.tolerated.length} tolerated by the baseline, ${result.unowned.length} on unowned files`
  );
  return result.failures.length ? 1 : 0;
}
