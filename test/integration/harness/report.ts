// `report.json` of an integration run (P0 §5.5.7 RunReport). Global teardown builds it from the run's state
// folder (budget.json, violations.jsonl, cleanup.jsonl, config/, dynamic-allowlist.jsonl, guard/<pid>.json,
// discovery.json) and from what setup and teardown measured. The per-domain test counts come from the test
// outcomes, which a reporter hands over either before teardown (`outcomes.json`) or after it
// (`finalizeRunReport`), so the order of the two does not matter. No value of a request, a response or the
// environment is written: verdicts, counts, rule ids, templates, labels and hashes only.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { budgetRefusals, type BudgetCounts, type BudgetName } from './budgets';
import { isRestored, savedConfigResources } from './config-core';
import type { Harness } from './context';
import type { Tier } from './env';
import { readFacts, type FactValue } from './facts';
import { CUMULATIVE_CAPS } from './ledger.mjs';
import { buildDomainsReport, type DomainReport, type LiveTestOutcome } from './outcomes';
import type { PreflightVerdicts } from './policy';
import type { PreflightWarning } from './preflight';
import type { StateDiff, StateDifference } from './state';
import { readJsonFileSync, writeJsonFileAtomicSync } from './state-io.mjs';

export interface RunReport {
  runId: string;
  sha: string;
  ok: boolean;
  tiers: Record<Tier, boolean>;
  preflight: PreflightVerdicts & { warnings: PreflightWarning[] };
  domains: Record<string, DomainReport>;
  budgets: Record<BudgetName, { used: number; limit: number }>;
  ledger: { othersBefore: Record<BudgetName, number>; caps: Record<BudgetName, number> };
  maxRequestRate: number;
  cleanup: { done: number; failed: { label: string; status?: number }[] };
  configRestores: { resource: string; ok: boolean }[];
  dynamicAllowlist: { test: string; kind: string; reason: string; allowlistId?: string }[];
  state: { differences: StateDifference[] };
  stateDiff: StateDiff;
  discovery?: { venueId: number; mapId: number; hasSafePoint: boolean };
  violations: { rule: string; method: string; template: string }[];
  abort: null | string;
  /** observations recorded by live tests with recordFact (booleans, numbers, null, media types; U1–U9) */
  facts?: Record<string, FactValue>;
}

export function reportPath(stateDir: string): string {
  return join(stateDir, 'report.json');
}

export function outcomesPath(stateDir: string): string {
  return join(stateDir, 'outcomes.json');
}

/** `git rev-parse HEAD` of this checkout, or `unknown`. */
export function headSha(cwd: string): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

function readJsonl<T>(path: string): T[] {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as T);
}

/** Peak rate of the per-process records `guard/<pid>.json` (example preload, integration workers). */
export function processPeakRate(stateDir: string): number {
  const dir = join(stateDir, 'guard');
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return 0;
  }
  let peak = 0;
  for (const name of names.filter((n) => n.endsWith('.json'))) {
    const record = readJsonFileSync<{ maxRequestRate?: unknown } | null>(join(dir, name), null);
    if (typeof record?.maxRequestRate === 'number') peak = Math.max(peak, record.maxRequestRate);
  }
  return peak;
}

/** `guard/<pid>.json` of one process (P0 §5.5.7). */
export interface ProcessStats {
  argv1: string | null;
  mode: Harness['mode'];
  /** units this process counted (G7, G16, consumeBudget) */
  counts: Record<BudgetName, number>;
  /** requests this process sent through the guard */
  requests: number;
  /** unexpected violations recorded for the run */
  violations: number;
  maxRequestRate: number;
}

export function processStatsPath(stateDir: string, pid: number = process.pid): string {
  return join(stateDir, 'guard', `${pid}.json`);
}

/**
 * Writes `guard/<pid>.json` for this process (P0 §5.5.7): mode, the units this process counted, the requests it
 * sent, the number of unexpected violations the run recorded and the peak request rate of this process's G15
 * bucket. Synchronous, so the example-mode preload calls it from its `exit` handler.
 */
export function writeProcessStats(h: Harness): ProcessStats {
  const stats: ProcessStats = {
    argv1: process.argv[1] ?? null,
    mode: h.mode,
    counts: { ...h.processCounts },
    requests: h.requestsSent,
    violations: h.unexpectedViolations().length,
    maxRequestRate: h.bucket.peak,
  };
  writeJsonFileAtomicSync(processStatsPath(h.stateDir), stats);
  return stats;
}

/**
 * Integration workers: like writeProcessStats, but adds this context's counts and requests to the record that an
 * earlier test file of the same process wrote (vitest evaluates the harness afresh for each file of the single
 * worker, so each file has its own context; the record stays per process). The peak rate is the maximum.
 */
export function mergeProcessStats(h: Harness): ProcessStats {
  const path = processStatsPath(h.stateDir);
  const previous = readJsonFileSync<ProcessStats | null>(path, null);
  const own = writeProcessStats(h);
  if (!previous || previous.mode !== own.mode) return own;
  const counts = { ...own.counts };
  for (const name of Object.keys(counts) as BudgetName[])
    counts[name] += typeof previous.counts?.[name] === 'number' ? previous.counts[name] : 0;
  const merged: ProcessStats = {
    ...own,
    counts,
    requests: own.requests + (typeof previous.requests === 'number' ? previous.requests : 0),
    maxRequestRate: Math.max(
      own.maxRequestRate,
      typeof previous.maxRequestRate === 'number' ? previous.maxRequestRate : 0
    ),
  };
  writeJsonFileAtomicSync(path, merged);
  return merged;
}

interface CleanupEvent {
  type: 'register' | 'done' | 'failed';
  id: string;
  label?: string;
  status?: number;
}

/** Done and failed cleanups of `cleanup.jsonl` (registered entries still pending count as neither). */
export function cleanupSummary(stateDir: string): RunReport['cleanup'] {
  const events = readJsonl<CleanupEvent>(join(stateDir, 'cleanup.jsonl'));
  const labels = new Map<string, string>();
  const final = new Map<string, CleanupEvent>();
  for (const e of events) {
    if (e.type === 'register') labels.set(e.id, e.label ?? e.id);
    else final.set(e.id, e);
  }
  let done = 0;
  const failed: { label: string; status?: number }[] = [];
  for (const [id, e] of final) {
    if (e.type === 'done') done += 1;
    else
      failed.push({
        label: labels.get(id) ?? id,
        ...(typeof e.status === 'number' ? { status: e.status } : {}),
      });
  }
  return { done, failed };
}

/** Every resource with a saved before-image: `ok` once it carries `.restored`. */
export function configRestoreSummary(stateDir: string): RunReport['configRestores'] {
  return savedConfigResources(stateDir).map((resource) => ({
    resource,
    ok: isRestored(stateDir, resource),
  }));
}

function failedTests(domains: Record<string, DomainReport>): number {
  return Object.values(domains).reduce((n, d) => n + d.failed, 0);
}

/** A run is ok only when nothing in the report says otherwise. */
export function reportOk(report: Omit<RunReport, 'ok'>, budgetRefusalCount: number): boolean {
  return (
    report.abort === null &&
    report.violations.length === 0 &&
    budgetRefusalCount === 0 &&
    report.cleanup.failed.length === 0 &&
    report.configRestores.every((r) => r.ok) &&
    report.stateDiff !== 'unexpected' &&
    failedTests(report.domains) === 0
  );
}

export interface ReportInput {
  h: Harness;
  sha: string;
  tiers: Record<Tier, boolean>;
  preflight: PreflightVerdicts;
  warnings: PreflightWarning[];
  othersBefore: BudgetCounts;
  /** cleanup failures found in teardown beyond cleanup.jsonl (e.g. residue the own-run sweep left) */
  extraCleanupFailures?: { label: string; status?: number }[];
  differences: StateDifference[];
  stateDiff: StateDiff;
  abort: string | null;
}

/** Builds the report from the run's state folder and the measured values. */
export function buildRunReport(input: ReportInput): RunReport {
  const { h } = input;
  const cleanup = cleanupSummary(h.stateDir);
  cleanup.failed.push(...(input.extraCleanupFailures ?? []));
  const outcomes = readJsonFileSync<LiveTestOutcome[] | null>(outcomesPath(h.stateDir), null);
  const discovery = readJsonFileSync<RunReport['discovery'] | null>(
    join(h.stateDir, 'discovery.json'),
    null
  );
  const report: Omit<RunReport, 'ok'> = {
    runId: h.runId,
    sha: input.sha,
    tiers: { ...input.tiers },
    preflight: { ...input.preflight, warnings: [...input.warnings] },
    domains: outcomes ? buildDomainsReport(outcomes) : {},
    budgets: h.budgetReport(),
    ledger: { othersBefore: { ...input.othersBefore }, caps: { ...CUMULATIVE_CAPS } },
    maxRequestRate: Math.max(h.bucket.peak, processPeakRate(h.stateDir)),
    cleanup,
    configRestores: configRestoreSummary(h.stateDir),
    dynamicAllowlist: readJsonl(join(h.stateDir, 'dynamic-allowlist.jsonl')),
    state: { differences: input.differences },
    stateDiff: input.stateDiff,
    ...(discovery ? { discovery } : {}),
    violations: h.unexpectedViolations().map(({ rule, method, template }) => ({
      rule,
      method,
      template,
    })),
    abort: input.abort ?? h.abortState()?.reason ?? null,
    facts: readFacts(h.stateDir),
  };
  return { ...report, ok: reportOk(report, budgetRefusals(h.stateDir).length) };
}

export function writeRunReport(stateDir: string, report: RunReport): void {
  writeJsonFileAtomicSync(reportPath(stateDir), report);
}

/**
 * Hands the test outcomes to the report: writes `outcomes.json` (read by teardown) and, when the report already
 * exists, sets its `domains` and turns `ok` false when a test failed. Returns the report, or null when teardown
 * has not written it yet.
 */
export function finalizeRunReport(
  stateDir: string,
  outcomes: readonly LiveTestOutcome[]
): RunReport | null {
  writeJsonFileAtomicSync(outcomesPath(stateDir), outcomes);
  if (!existsSync(reportPath(stateDir))) return null;
  const report = readJsonFileSync<RunReport>(reportPath(stateDir), null as unknown as RunReport);
  const domains = buildDomainsReport(outcomes);
  const next: RunReport = { ...report, domains, ok: report.ok && failedTests(domains) === 0 };
  writeRunReport(stateDir, next);
  return next;
}
