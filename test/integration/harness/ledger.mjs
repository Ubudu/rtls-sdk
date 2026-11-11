// @ts-check
// Cumulative budget ledger (LIVE-TESTING §2.6, P0 §5.3, §6.2 `ledger.mjs`). Dependency-free ESM, so the
// examples runners and the example-mode preload use it outside vitest. One ledger for the whole execution
// of the work package, in the main checkout: `test/integration/.state/ledger.json`. Every write is one
// synchronous read–modify–write under `ledger.json.lock`; reads take no lock. A run's entry always holds that
// run's `budget.json` counts: a write raises each count to the given value and never adds, so the guard,
// global teardown and a preload exit may all write the entry without counting a unit twice.
import { join } from 'node:path';
import { mainStateDir, readJsonFileSync, updateJsonFileSync } from './state-io.mjs';

/** @typedef {'positions' | 'notifications' | 'bleActions' | 'etlWrites'} BudgetName */
/** @typedef {Record<BudgetName, number>} BudgetCounts */
/** @typedef {Record<'R' | 'W' | 'C' | 'S', boolean>} TierFlags */
/** @typedef {'integration' | 'examples'} LedgerKind */
/** @typedef {{ runId: string; kind: LedgerKind; startedAt: string; tiers: TierFlags; counts: BudgetCounts }} LedgerRun */
/** @typedef {{ version: 1; runs: LedgerRun[] }} Ledger */
/** @typedef {{ ledgerPath?: string }} LedgerOptions */

/** Absolute path of the ledger in the main checkout. */
export const LEDGER_PATH = join(mainStateDir(), 'ledger.json');

/** Cumulative caps for the whole work-package execution (INDEX OW-18, P0 OP-16; one constant to change). */
export const CUMULATIVE_CAPS = Object.freeze({
  positions: 60,
  notifications: 30,
  bleActions: 6,
  etlWrites: 6,
});

/** @type {readonly BudgetName[]} */
export const BUDGET_NAMES = Object.freeze([
  'positions',
  'notifications',
  'bleActions',
  'etlWrites',
]);

/** @returns {BudgetCounts} */
export function zeroCounts() {
  return { positions: 0, notifications: 0, bleActions: 0, etlWrites: 0 };
}

/**
 * Domain caps inside an integration run (INDEX §4, P0 §5.3); every other domain: 0. The share of an integration
 * run is the sum of the caps of its selected domains (the driver and global setup check it against the ledger).
 *
 * @type {Readonly<Record<string, Readonly<Partial<BudgetCounts>>>>}
 */
export const DOMAIN_CAPS = Object.freeze({
  assets: Object.freeze({ positions: 2, bleActions: 1 }),
  'positions-spatial': Object.freeze({ positions: 2 }),
  websocket: Object.freeze({ positions: 2 }),
  notifications: Object.freeze({ notifications: 3 }),
  etl: Object.freeze({ etlWrites: 1 }),
});

/**
 * Share of an examples write pass (example mode; no domain caps), whatever the selection (P0 §5.3).
 *
 * @type {Readonly<BudgetCounts>}
 */
export const EXAMPLES_SHARE = Object.freeze({
  positions: 4,
  notifications: 2,
  bleActions: 0,
  etlWrites: 0,
});

/**
 * Share of an integration run: the sum of the domain caps of `domains` (none = every domain).
 *
 * @param {readonly string[]} [domains]
 * @returns {BudgetCounts}
 */
export function integrationShare(domains = []) {
  const share = zeroCounts();
  const keys = domains.length > 0 ? domains : Object.keys(DOMAIN_CAPS);
  for (const domain of keys) {
    const caps = DOMAIN_CAPS[domain];
    if (!caps) continue;
    for (const name of BUDGET_NAMES) share[name] += caps[name] ?? 0;
  }
  return share;
}

/** @returns {Ledger} */
function emptyLedger() {
  return { version: 1, runs: [] };
}

/**
 * @param {LedgerOptions | undefined} options
 * @returns {string}
 */
function pathOf(options) {
  return options?.ledgerPath ?? LEDGER_PATH;
}

/**
 * @param {unknown} value
 * @returns {Ledger}
 */
function validLedger(value) {
  const ledger = /** @type {Ledger} */ (value);
  if (!ledger || ledger.version !== 1 || !Array.isArray(ledger.runs)) {
    throw new Error('ledger.json has an unexpected shape');
  }
  for (const run of ledger.runs) {
    if (typeof run?.runId !== 'string' || typeof run.counts !== 'object' || run.counts === null) {
      throw new Error('ledger.json has an entry with an unexpected shape');
    }
    for (const name of BUDGET_NAMES) {
      if (!Number.isInteger(run.counts[name]) || run.counts[name] < 0) {
        throw new Error('ledger.json has an entry with an invalid count');
      }
    }
  }
  return ledger;
}

/**
 * The whole ledger (no lock; a missing file is an empty ledger, a corrupt one an error).
 *
 * @param {LedgerOptions} [options]
 * @returns {Ledger}
 */
export function readLedger(options) {
  return validLedger(readJsonFileSync(pathOf(options), emptyLedger()));
}

/**
 * @param {Ledger} ledger
 * @param {string | undefined} excludeRunId
 * @returns {BudgetCounts}
 */
function totalsOf(ledger, excludeRunId) {
  const totals = zeroCounts();
  for (const run of ledger.runs) {
    if (run.runId === excludeRunId) continue;
    for (const name of BUDGET_NAMES) totals[name] += run.counts[name];
  }
  return totals;
}

/**
 * Sum of the counts of every run, optionally without one run.
 *
 * @param {{ excludeRunId?: string } & LedgerOptions} [options]
 * @returns {BudgetCounts}
 */
export function ledgerTotals(options = {}) {
  return totalsOf(readLedger(options), options.excludeRunId);
}

/**
 * The entry of `runId`, or `null`.
 *
 * @param {string} runId
 * @param {LedgerOptions} [options]
 * @returns {LedgerRun | null}
 */
export function ledgerEntry(runId, options) {
  return readLedger(options).runs.find((run) => run.runId === runId) ?? null;
}

/**
 * Budget names that the other runs' totals plus `share` would push over a cumulative cap (empty = allowed).
 *
 * @param {string} runId
 * @param {Partial<BudgetCounts>} share
 * @param {LedgerOptions & { caps?: BudgetCounts }} [options]
 * @returns {BudgetName[]}
 */
export function checkLedger(runId, share, options = {}) {
  const caps = options.caps ?? CUMULATIVE_CAPS;
  const others = ledgerTotals({ excludeRunId: runId, ledgerPath: options.ledgerPath });
  return BUDGET_NAMES.filter((name) => others[name] + (share[name] ?? 0) > caps[name]);
}

/**
 * @param {Ledger} ledger
 * @param {string} runId
 * @param {LedgerKind} kind
 * @param {TierFlags} tiers
 * @param {Partial<BudgetCounts>} counts
 * @returns {LedgerRun}
 */
function raisedEntry(ledger, runId, kind, tiers, counts) {
  const existing = ledger.runs.find((run) => run.runId === runId);
  const base = existing ?? {
    runId,
    kind,
    startedAt: new Date().toISOString(),
    tiers,
    counts: zeroCounts(),
  };
  const next = { ...base, kind, tiers: { ...tiers }, counts: { ...base.counts } };
  for (const name of BUDGET_NAMES) {
    const value = counts[name];
    if (value !== undefined) {
      if (!Number.isInteger(value) || value < 0)
        throw new RangeError(`invalid ledger count ${name}`);
      next.counts[name] = Math.max(next.counts[name], value);
    }
  }
  return next;
}

/**
 * @param {Ledger} ledger
 * @param {LedgerRun} entry
 * @returns {Ledger}
 */
function withEntry(ledger, entry) {
  const runs = ledger.runs.filter((run) => run.runId !== entry.runId);
  return { version: 1, runs: [...runs, entry] };
}

/**
 * Creates the entry of `runId` when absent, sets its tiers and raises each count to the given value (never
 * adds; P0 §5.3 recording).
 *
 * @param {string} runId
 * @param {LedgerKind} kind
 * @param {TierFlags} tiers
 * @param {Partial<BudgetCounts>} [counts]
 * @param {LedgerOptions} [options]
 * @returns {LedgerRun}
 */
export function recordLedger(runId, kind, tiers, counts = {}, options) {
  /** @type {LedgerRun | undefined} */
  let written;
  updateJsonFileSync(pathOf(options), emptyLedger(), (current) => {
    const ledger = validLedger(current);
    written = raisedEntry(ledger, runId, kind, tiers, counts);
    return withEntry(ledger, written);
  });
  return /** @type {LedgerRun} */ (written);
}

/**
 * The guard's per-unit form of recordLedger: under the same lock, refuses (writes nothing, returns the names)
 * when the raised entry would take the total of all runs, this one included, over a cumulative cap.
 *
 * @param {string} runId
 * @param {LedgerKind} kind
 * @param {TierFlags} tiers
 * @param {Partial<BudgetCounts>} counts
 * @param {LedgerOptions & { caps?: BudgetCounts }} [options]
 * @returns {BudgetName[]}
 */
export function raiseLedgerWithinCaps(runId, kind, tiers, counts, options = {}) {
  const caps = options.caps ?? CUMULATIVE_CAPS;
  /** @type {BudgetName[]} */
  let refused = [];
  updateJsonFileSync(pathOf(options), emptyLedger(), (current) => {
    const ledger = validLedger(current);
    const entry = raisedEntry(ledger, runId, kind, tiers, counts);
    const others = totalsOf(ledger, runId);
    refused = BUDGET_NAMES.filter((name) => others[name] + entry.counts[name] > caps[name]);
    if (refused.length > 0) return undefined;
    return withEntry(ledger, entry);
  });
  return refused;
}
