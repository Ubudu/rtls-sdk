// Run-scoped live-coverage allowlist entries (P0 §5.5.4, §6.2 run-allowlist.ts; P6 §9.6, P10 H11). A live test that
// skips only in some runs (existing-entity guard, a feature absent on the server) activates the entry that covers
// the lines it skipped, at the moment it skips: `activateRunAllowlist(id, reason)` appends
// `{ allowlistId, test, kind: 'run-scoped', reason }` to `.state/<runId>/dynamic-allowlist.jsonl`, which
// `report.json.dynamicAllowlist` lists and `coverage:live:check` judges. The id must name an entry with
// `runScoped: true` in a fragment `test/integration/allowlist/<phase>.json`.
import { appendFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from 'vitest';
import { activeHarness } from './active';
import type { Harness } from './context';
import { isPlainObject } from './policy';
import { readJsonFileSync } from './state-io.mjs';

export interface DynamicAllowlistEntry {
  test: string;
  kind: string;
  reason: string;
  allowlistId?: string;
}

export function dynamicAllowlistPath(stateDir: string): string {
  return join(stateDir, 'dynamic-allowlist.jsonl');
}

/** Entries (line and operation entries) of every fragment in `dir`; a fragment that is not JSON is an error. */
export function allowlistEntries(dir: string): Record<string, unknown>[] {
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith('.json'));
  } catch {
    return [];
  }
  const out: Record<string, unknown>[] = [];
  for (const name of names.sort()) {
    const file = readJsonFileSync<unknown>(join(dir, name), null);
    const entries = Array.isArray(file)
      ? file
      : isPlainObject(file) && Array.isArray(file.entries)
        ? file.entries
        : [];
    for (const e of entries) if (isPlainObject(e)) out.push(e);
  }
  return out;
}

/** Full name of the running test (vitest), else the innermost live block, else `<outside a test>`. */
export function currentTestLabel(h: Harness = activeHarness()): string {
  try {
    const name = expect.getState().currentTestName;
    if (typeof name === 'string' && name !== '') return name;
  } catch {
    // outside a vitest worker
  }
  const block = h.currentBlock();
  return block ? `[${block.tier}] ${block.name}` : '<outside a test>';
}

/** Appends one entry to the run's dynamic allowlist (report.json `dynamicAllowlist`). */
export function appendDynamicAllowlist(h: Harness, entry: DynamicAllowlistEntry): void {
  mkdirSync(h.stateDir, { recursive: true });
  appendFileSync(dynamicAllowlistPath(h.stateDir), `${JSON.stringify(entry)}\n`);
}

/**
 * Activates the run-scoped allowlist entry `id` for this run (the test calls it at the moment it skips). An id
 * that names no entry with `runScoped: true` → throws.
 */
export function activateRunAllowlist(id: string, reason: string): void {
  if (typeof id !== 'string' || id === '') throw new TypeError('activateRunAllowlist: id required');
  if (typeof reason !== 'string' || reason.trim() === '') {
    throw new TypeError('activateRunAllowlist: reason required');
  }
  const h = activeHarness();
  const entry = allowlistEntries(h.allowlistDir).find((e) => e.id === id);
  if (!entry) throw new Error(`activateRunAllowlist: no allowlist entry ${id}`);
  if (entry.runScoped !== true) {
    throw new Error(`activateRunAllowlist: allowlist entry ${id} is not runScoped`);
  }
  appendDynamicAllowlist(h, {
    allowlistId: id,
    test: currentTestLabel(h),
    kind: 'run-scoped',
    reason,
  });
}
