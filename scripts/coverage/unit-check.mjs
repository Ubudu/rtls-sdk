#!/usr/bin/env node
// `npm run test:coverage` (P0 §6.1): runs `vitest run --coverage` with every positional argument (test
// filters), then applies the coverage thresholds to coverage/coverage-summary.json.
//
//   node scripts/coverage/unit-check.mjs [--phase Pn | --release] [<vitest filters>…]
//
//   default    global floor (GLOBAL_FLOOR, the baseline measured when P0 finished, rounded down; never
//              lowered); skipped when filters are given
//   --phase Pn the phase's src files: aggregate ≥ 95 % lines and ≥ 90 % branches, each file ≥ 80 % lines;
//              a phase that owns no src file (P0, P9, P10) runs the suite and skips the threshold step
//   --release  global lines, statements and functions ≥ 95 %, branches ≥ 90 %
//
// A summary that measured no src line fails (floor and release), and so does a phase whose src files are
// missing from the report: an empty measurement never counts as 100 %.
//
// Exit codes: the vitest exit code when the suite fails; 1 when a threshold is missed; 2 usage error.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { UsageError, parseArgs, parsePhase } from '../lib/cli.mjs';
import { REPO_ROOT, listFiles } from '../lib/git.mjs';
import { ownerOf as defaultOwnerOf } from '../lib/ownership.mjs';
import { ignoreHintFindings } from './ignore-hints.mjs';

/** @typedef {'lines' | 'statements' | 'functions' | 'branches'} Metric */
/** @typedef {{ total: number; covered: number; skipped?: number; pct: number | string }} MetricSummary */
/** @typedef {Record<string, Partial<Record<Metric, MetricSummary>>>} CoverageSummary */

/**
 * Global floor measured after P0's moves (vitest 3.2.7, 307 unit tests: lines 73.93, statements 73.93,
 * functions 75.6, branches 85.46), rounded down (P0 OP-13). Raise it when coverage grows; never lower it.
 */
export const GLOBAL_FLOOR = Object.freeze({
  lines: 73,
  statements: 73,
  functions: 75,
  branches: 85,
});
export const PHASE_THRESHOLDS = Object.freeze({ lines: 95, branches: 90, fileLines: 80 });
export const RELEASE_THRESHOLDS = Object.freeze({
  lines: 95,
  statements: 95,
  functions: 95,
  branches: 90,
});
export const SUMMARY_PATH = join(REPO_ROOT, 'coverage', 'coverage-summary.json');
/** @type {readonly Metric[]} */
const METRICS = ['lines', 'statements', 'functions', 'branches'];

/**
 * @param {MetricSummary | undefined} m
 * @returns {number}
 */
function pctOf(m) {
  if (!m || !m.total) return 100;
  return typeof m.pct === 'number' ? m.pct : (m.covered / m.total) * 100;
}

/**
 * @param {number} n
 */
const fmt = (n) => `${Math.round(n * 100) / 100}%`;

/**
 * Sums covered/total of one metric over several file summaries.
 *
 * @param {Array<Partial<Record<Metric, MetricSummary>>>} files
 * @param {Metric} metric
 * @returns {{ covered: number; total: number; pct: number }}
 */
export function aggregate(files, metric) {
  let covered = 0;
  let total = 0;
  for (const f of files) {
    covered += f[metric]?.covered ?? 0;
    total += f[metric]?.total ?? 0;
  }
  return { covered, total, pct: total ? (covered / total) * 100 : 100 };
}

/**
 * Applies the thresholds of one mode to a json-summary report. A measurement that holds no src line, or a phase
 * file missing from the report, fails (never counts as 100 %). `phaseFiles`: the measured src files the phase
 * owns (repository-relative); each must be in the report.
 *
 * @param {CoverageSummary} summary
 * @param {{ mode: 'floor' | 'phase' | 'release'; phase?: string; floor?: Record<Metric, number>;
 *   root?: string; ownerOf?: (path: string) => string; phaseFiles?: readonly string[] }} options
 * @returns {{ ok: boolean; skipped: boolean; lines: string[] }}
 */
export function evaluateCoverage(
  summary,
  { mode, phase, floor = GLOBAL_FLOOR, root = REPO_ROOT, ownerOf = defaultOwnerOf, phaseFiles }
) {
  /** @type {string[]} */
  const lines = [];
  let ok = true;
  const total = summary.total ?? {};
  if (mode === 'floor' || mode === 'release') {
    if (!((total.lines?.total ?? 0) > 0)) {
      lines.push('FAIL coverage measured no src file (total lines 0)');
      return { ok: false, skipped: false, lines };
    }
    const limits = mode === 'floor' ? floor : RELEASE_THRESHOLDS;
    for (const metric of METRICS) {
      const pct = pctOf(total[metric]);
      const pass = pct >= limits[metric];
      if (!pass) ok = false;
      lines.push(
        `${pass ? 'ok  ' : 'FAIL'} global ${metric} ${fmt(pct)} (${mode === 'floor' ? 'floor' : 'release'} ${limits[metric]}%)`
      );
    }
    return { ok, skipped: false, lines };
  }
  const files = Object.entries(summary)
    .filter(([key]) => key !== 'total')
    .map(([key, value]) => ({
      file: relative(root, isAbsolute(key) ? key : resolve(root, key))
        .split('\\')
        .join('/'),
      value,
    }))
    .filter(({ file }) => ownerOf(file) === phase);
  // Reached only for a phase that owns measured src files: each of them must be in the report.
  const reported = new Set(files.map((f) => f.file));
  for (const missing of (phaseFiles ?? []).filter((f) => !reported.has(f)).sort()) {
    ok = false;
    lines.push(`FAIL ${missing} is missing from the coverage report`);
  }
  if (files.length === 0) {
    lines.push(`FAIL phase ${phase} owns src files but none is in the coverage report`);
    return { ok: false, skipped: false, lines };
  }
  for (const [metric, limit] of /** @type {const} */ ([
    ['lines', PHASE_THRESHOLDS.lines],
    ['branches', PHASE_THRESHOLDS.branches],
  ])) {
    const agg = aggregate(
      files.map((f) => f.value),
      metric
    );
    const pass = agg.pct >= limit;
    if (!pass) ok = false;
    lines.push(
      `${pass ? 'ok  ' : 'FAIL'} ${phase} aggregate ${metric} ${fmt(agg.pct)} (${agg.covered}/${agg.total}; ≥ ${limit}%)`
    );
  }
  for (const { file, value } of files.sort((a, b) => (a.file < b.file ? -1 : 1))) {
    const pct = pctOf(value.lines);
    const pass = pct >= PHASE_THRESHOLDS.fileLines;
    if (!pass) ok = false;
    lines.push(
      `${pass ? 'ok  ' : 'FAIL'} ${file} lines ${fmt(pct)} (≥ ${PHASE_THRESHOLDS.fileLines}%)`
    );
  }
  return { ok, skipped: false, lines };
}

/**
 * The src files the unit coverage measures (`src/**\/*.ts` minus `src/generated/**` and `src/index.ts`).
 *
 * @param {readonly string[]} files
 * @returns {string[]}
 */
export function measuredSrc(files) {
  return files.filter(
    (f) =>
      f.startsWith('src/') &&
      /\.ts$/.test(f) &&
      !f.startsWith('src/generated/') &&
      f !== 'src/index.ts'
  );
}

/**
 * Whether the phase owns a src file that the unit coverage measures.
 *
 * @param {string} phase
 * @param {readonly string[]} files
 * @param {(path: string) => string} ownerOf
 */
export function phaseOwnsSrc(phase, files, ownerOf = defaultOwnerOf) {
  return measuredSrc(files).some((f) => ownerOf(f) === phase);
}

/**
 * @param {readonly string[]} args
 * @returns {number}
 */
function runVitestDefault(args) {
  const bin = join(REPO_ROOT, 'node_modules', 'vitest', 'vitest.mjs');
  const res = spawnSync(process.execPath, [bin, 'run', '--coverage', ...args], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
  return res.status ?? 1;
}

/**
 * @param {readonly string[]} argv
 * @param {{ runVitest?: (args: readonly string[]) => number; summaryPath?: string;
 *   files?: readonly string[]; root?: string; ownerOf?: (path: string) => string }} [deps]
 * @returns {number}
 */
export function main(argv, deps = {}) {
  const {
    runVitest = runVitestDefault,
    summaryPath = SUMMARY_PATH,
    root = REPO_ROOT,
    ownerOf = defaultOwnerOf,
  } = deps;
  /** @type {string | undefined} */
  let phase;
  /** @type {ReturnType<typeof parseArgs<'release', 'phase'>>} */
  let args;
  try {
    args = parseArgs(argv, { flags: ['release'], options: ['phase'] });
    phase = parsePhase(args.options.phase);
    if (phase && args.flags.release)
      throw new UsageError('--phase and --release exclude each other');
  } catch (err) {
    console.error(`test:coverage: ${/** @type {Error} */ (err).message}`);
    return 2;
  }
  const filters = args.positionals;
  const mode = args.flags.release ? 'release' : phase ? 'phase' : 'floor';
  const skipReason =
    mode === 'floor' && filters.length
      ? 'test filters given: global floor not applied'
      : mode === 'phase' &&
          !phaseOwnsSrc(
            /** @type {string} */ (phase),
            deps.files ?? listFiles({ cwd: root }),
            ownerOf
          )
        ? `phase ${phase} owns no src file: threshold step skipped`
        : null;

  const status = runVitest(filters);
  if (status !== 0) return status;
  if (skipReason) {
    console.log(`test:coverage: ${skipReason}`);
    return 0;
  }
  if (!existsSync(summaryPath)) {
    console.error(`test:coverage: ${relative(root, summaryPath)} missing (json-summary reporter)`);
    return 1;
  }
  const summary = /** @type {CoverageSummary} */ (JSON.parse(readFileSync(summaryPath, 'utf8')));
  const measured = measuredSrc(deps.files ?? listFiles({ cwd: root }));
  const result = evaluateCoverage(summary, {
    mode,
    phase,
    root,
    ownerOf,
    ...(mode === 'phase' ? { phaseFiles: measured.filter((f) => ownerOf(f) === phase) } : {}),
  });
  for (const line of result.lines) console.log(`test:coverage: ${line}`);
  // --phase / --release: a coverage-ignore hint in a judged file would count its lines as covered.
  const hints =
    mode === 'floor'
      ? []
      : ignoreHintFindings(
          root,
          measured.filter((f) => mode === 'release' || ownerOf(f) === phase)
        );
  for (const hint of hints) console.log(`test:coverage: FAIL ${hint}`);
  return result.ok && hints.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
