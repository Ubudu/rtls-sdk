// Live-block titles and the per-domain test counts of `report.json` (P0 §5.5.7, P10-T6). Free of vitest imports,
// so global setup/teardown and a reporter in the vitest main process can use it; tiers.ts re-exports it.
import type { Tier } from './env';
import { DOMAIN_KEYS, type DomainKey } from './policy';

const TITLE_RE = /^\[([RWCS])\] (.*?)(?: \(skipped: (.*)\))?$/;

/** `[<tier>] <name>`, plus ` (skipped: <reason>)` for a skipped block. */
export function liveTitle(tier: Tier, name: string, skipReason: string | null = null): string {
  return skipReason ? `[${tier}] ${name} (skipped: ${skipReason})` : `[${tier}] ${name}`;
}

export function parseLiveTitle(
  title: string
): { tier: Tier; name: string; skipReason: string | null } | null {
  const m = TITLE_RE.exec(title);
  if (!m) return null;
  return { tier: m[1] as Tier, name: m[2] as string, skipReason: m[3] ?? null };
}

/** Domain key of a test file: `test/integration/<domain>/…`, `test/websocket/…` → websocket. */
export function domainOfTestFile(file: string | undefined): DomainKey | null {
  if (!file) return null;
  const path = file.replace(/\\/g, '/');
  const m = /\/test\/integration\/([^/]+)\//.exec(path);
  if (m && (DOMAIN_KEYS as readonly string[]).includes(m[1] as string)) return m[1] as DomainKey;
  if (/\/test\/websocket\//.test(path)) return 'websocket';
  return null;
}

export interface LiveTestOutcome {
  file: string;
  /** suite titles, outermost first */
  suites: string[];
  test: string;
  state: 'pass' | 'fail' | 'skip';
  note?: string;
}

type Counts = { passed: number; failed: number; skipped: number };

export interface DomainReport {
  passed: number;
  failed: number;
  skipped: { test: string; reason: string }[];
  tiers: Record<Tier, Counts>;
}

function emptyDomain(): DomainReport {
  const zero = (): Counts => ({ passed: 0, failed: 0, skipped: 0 });
  return {
    passed: 0,
    failed: 0,
    skipped: [],
    tiers: { R: zero(), W: zero(), C: zero(), S: zero() },
  };
}

/**
 * Per-domain counts; each test counts under the tier of its innermost describeLive block (from the
 * `[<tier>]` title prefix), and a skipped test carries the innermost skip reason of its blocks, else the
 * runtime skip note.
 */
export function buildDomainsReport(
  outcomes: readonly LiveTestOutcome[]
): Record<string, DomainReport> {
  const domains: Record<string, DomainReport> = {};
  for (const o of outcomes) {
    const key = domainOfTestFile(o.file) ?? 'unknown';
    const d = (domains[key] ??= emptyDomain());
    const blocks = o.suites
      .map(parseLiveTitle)
      .filter((b): b is NonNullable<typeof b> => b !== null);
    const innermost = blocks.at(-1) ?? null;
    const tierCounts = innermost ? d.tiers[innermost.tier] : null;
    if (o.state === 'pass') {
      d.passed += 1;
      if (tierCounts) tierCounts.passed += 1;
    } else if (o.state === 'fail') {
      d.failed += 1;
      if (tierCounts) tierCounts.failed += 1;
    } else {
      const reason =
        [...blocks].reverse().find((b) => b.skipReason !== null)?.skipReason ?? o.note ?? 'skipped';
      d.skipped.push({ test: [...o.suites, o.test].join(' > '), reason });
      if (tierCounts) tierCounts.skipped += 1;
    }
  }
  return domains;
}

/** Minimal shape of a vitest task tree (reporter `onFinished(files)`). */
export interface TaskLike {
  type: string;
  name: string;
  mode?: string;
  filepath?: string;
  result?: { state?: string; note?: string };
  tasks?: TaskLike[];
}

/** Flattens vitest File tasks into outcomes for buildDomainsReport. */
export function outcomesFromTasks(files: readonly TaskLike[]): LiveTestOutcome[] {
  const out: LiveTestOutcome[] = [];
  const walk = (task: TaskLike, file: string, suites: string[]): void => {
    if (task.type === 'test') {
      const state =
        task.result?.state === 'fail' ? 'fail' : task.result?.state === 'pass' ? 'pass' : 'skip';
      out.push({
        file,
        suites,
        test: task.name,
        state,
        ...(task.result?.note ? { note: task.result.note } : {}),
      });
      return;
    }
    for (const child of task.tasks ?? [])
      walk(child, file, task.type === 'suite' ? [...suites, task.name] : suites);
  };
  // A vitest File is a suite too: its own name is not a suite title.
  for (const file of files)
    for (const child of file.tasks ?? []) walk(child, file.filepath ?? file.name, []);
  return out;
}
