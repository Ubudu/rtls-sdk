// Budgets (LIVE-TESTING §2.6, P0 §5.3). File-backed in `.state/<runId>/budget.json` so they hold across test
// files and processes of one run. Each counted unit is checked against the per-run limit, the domain cap
// (integration mode) or the examples share (example mode), and the cumulative cap of the ledger, and is
// recorded in budget.json and in the run's ledger entry before the request or frame leaves (synchronous
// file calls). G7 and G16 count; tests call consumeBudget only for an effect the guard cannot see.
import { join } from 'node:path';
import { activeHarness } from './active';
import type { Tier } from './env';
import {
  BUDGET_NAMES,
  checkLedger,
  CUMULATIVE_CAPS,
  DOMAIN_CAPS as LEDGER_DOMAIN_CAPS,
  EXAMPLES_SHARE as LEDGER_EXAMPLES_SHARE,
  integrationShare as ledgerIntegrationShare,
  raiseLedgerWithinCaps,
  zeroCounts,
} from './ledger.mjs';
import { DOMAIN_KEYS, type DomainKey } from './policy';
import { updateJsonFileSync, readJsonFileSync } from './state-io.mjs';

export type BudgetName = 'positions' | 'notifications' | 'bleActions' | 'etlWrites';
export type BudgetCounts = Record<BudgetName, number>;
export { BUDGET_NAMES, CUMULATIVE_CAPS };

/** Per-run limits of an integration run (LIVE-TESTING §2.6). */
export const RUN_LIMITS: Readonly<BudgetCounts> = Object.freeze({
  positions: 10,
  notifications: 5,
  bleActions: 1,
  etlWrites: 1,
});

/** Domain caps inside an integration run (INDEX §4); every other domain: 0 (constants in ledger.mjs). */
export const DOMAIN_CAPS: Readonly<Partial<Record<DomainKey, Partial<BudgetCounts>>>> =
  LEDGER_DOMAIN_CAPS;

/** Share of an examples write pass (example mode; no domain caps; constants in ledger.mjs). */
export const EXAMPLES_SHARE: Readonly<BudgetCounts> = LEDGER_EXAMPLES_SHARE;

export type BudgetLimitKind = 'run' | 'domain' | 'examples' | 'cumulative';

/** A counted unit would exceed a limit: the request or frame is not sent and the run fails. */
export class BudgetExceeded extends Error {
  readonly budget: BudgetName;
  readonly limitKind: BudgetLimitKind;
  constructor(budget: BudgetName, limitKind: BudgetLimitKind) {
    super(`budget exceeded: ${budget} (${limitKind} limit)`);
    this.name = 'BudgetExceeded';
    this.budget = budget;
    this.limitKind = limitKind;
  }
}

export interface BudgetFile {
  version: 1;
  counts: BudgetCounts;
  byDomain: Record<string, BudgetCounts>;
  exceeded: { budget: BudgetName; limit: BudgetLimitKind; domain: string | null }[];
}

/** What the budget functions need to know about the run. */
export interface BudgetTarget {
  stateDir: string;
  runId: string;
  mode: 'integration' | 'example';
  ledgerTiers: Record<Tier, boolean>;
  ledgerPath: string;
}

export function budgetFilePath(stateDir: string): string {
  return join(stateDir, 'budget.json');
}

function emptyBudgetFile(): BudgetFile {
  return { version: 1, counts: zeroCounts(), byDomain: {}, exceeded: [] };
}

export function readBudgetFile(stateDir: string): BudgetFile {
  return readJsonFileSync<BudgetFile>(budgetFilePath(stateDir), emptyBudgetFile());
}

function limitOf(target: BudgetTarget, name: BudgetName): number {
  return target.mode === 'example' ? EXAMPLES_SHARE[name] : RUN_LIMITS[name];
}

/** Cap of `name` for `domain` in an integration run (unknown or absent domain: 0). */
export function domainCap(domain: DomainKey | null, name: BudgetName): number {
  if (!domain) return 0;
  return DOMAIN_CAPS[domain]?.[name] ?? 0;
}

/**
 * Counts `units` for `domain` (all or nothing): per-run limit or examples share, domain cap (integration
 * mode), cumulative cap (ledger, raised under its lock). On refusal nothing is counted, the refusal is
 * recorded in budget.json (the run fails) and BudgetExceeded is thrown.
 */
export function consumeUnits(
  target: BudgetTarget,
  units: Partial<BudgetCounts>,
  domain: DomainKey | null
): void {
  const names = BUDGET_NAMES.filter((name) => (units[name] ?? 0) > 0);
  if (names.length === 0) return;
  let refusal: BudgetExceeded | null = null;
  updateJsonFileSync<BudgetFile>(budgetFilePath(target.stateDir), emptyBudgetFile(), (file) => {
    const domainKey = domain ?? '-';
    const counts = { ...file.counts };
    const domainCounts = { ...(file.byDomain[domainKey] ?? zeroCounts()) };
    for (const name of names) {
      const n = units[name] as number;
      if (counts[name] + n > limitOf(target, name)) {
        refusal = new BudgetExceeded(name, target.mode === 'example' ? 'examples' : 'run');
        break;
      }
      if (target.mode === 'integration' && domainCounts[name] + n > domainCap(domain, name)) {
        refusal = new BudgetExceeded(name, 'domain');
        break;
      }
      counts[name] += n;
      domainCounts[name] += n;
    }
    if (!refusal) {
      const refused = raiseLedgerWithinCaps(
        target.runId,
        target.mode === 'example' ? 'examples' : 'integration',
        target.ledgerTiers,
        counts,
        { ledgerPath: target.ledgerPath }
      );
      if (refused.length > 0) refusal = new BudgetExceeded(refused[0] as BudgetName, 'cumulative');
    }
    if (refusal) {
      const r = refusal as BudgetExceeded;
      return {
        ...file,
        exceeded: [...file.exceeded, { budget: r.budget, limit: r.limitKind, domain }],
      };
    }
    return { ...file, counts, byDomain: { ...file.byDomain, [domainKey]: domainCounts } };
  });
  if (refusal) throw refusal;
}

export function budgetReportOf(
  target: BudgetTarget
): Record<BudgetName, { used: number; limit: number }> {
  const file = readBudgetFile(target.stateDir);
  const report = {} as Record<BudgetName, { used: number; limit: number }>;
  for (const name of BUDGET_NAMES)
    report[name] = { used: file.counts[name], limit: limitOf(target, name) };
  return report;
}

/** Budget refusals recorded for the run (a non-empty list fails the run). */
export function budgetRefusals(stateDir: string): BudgetFile['exceeded'] {
  return readBudgetFile(stateDir).exceeded;
}

/** Share of an integration run: the sum of the domain caps of the selected domains (none selected = all). */
export function integrationShare(domains: readonly DomainKey[] = []): BudgetCounts {
  return ledgerIntegrationShare(domains.length > 0 ? domains : DOMAIN_KEYS);
}

/**
 * Names that refuse a run before its first request (P0 §5.3): only a run with tier S enabled is refused,
 * when the other runs' ledger totals plus its share would exceed a cumulative cap.
 */
export function ledgerRefusal(input: {
  runId: string;
  tiers: Record<Tier, boolean>;
  share: Partial<BudgetCounts>;
  ledgerPath?: string;
}): BudgetName[] {
  if (!input.tiers.S) return [];
  return checkLedger(input.runId, input.share, { ledgerPath: input.ledgerPath });
}

/** Counts an effect the guard cannot see (never a publish, declare, send, tag action or ETL write). */
export function consumeBudget(name: BudgetName, n = 1): void {
  if (!BUDGET_NAMES.includes(name)) throw new TypeError(`unknown budget ${String(name)}`);
  if (!Number.isInteger(n) || n < 0)
    throw new RangeError('consumeBudget: n must be a non-negative integer');
  activeHarness().consume({ [name]: n }, activeHarness().currentDomain());
}

/** Used and limit per budget for the active run. */
export function budgetReport(): Record<BudgetName, { used: number; limit: number }> {
  return activeHarness().budgetReport();
}
