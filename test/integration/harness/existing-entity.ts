// Existing-entity guard (LIVE-TESTING §2.9, P0 §6.2 existing-entity.ts, G10). A write whose endpoint is an upsert
// keyed by something other than a test name (notification connections per channel, recipient mappings) runs only
// when the listing holds no matching entry before the test; otherwise the test skips and activates the run-scoped
// allowlist entries it names. While the body runs the guard admits G10's writes for that kind. Recipient mappings
// are tier C under the config lock and, by default (`onFailure: 'abort'`), are listed again after the body: any
// difference from the before-list aborts the run (`abortRun('restore-failed', kind)`, driver exit 4). Only ids and
// counts are kept; nothing here logs a value.
import { abortRun } from './abort';
import { activeHarness } from './active';
import { raiseViolation, runWithGuardScope, type ExistingEntityKind } from './guard';
import { holdsLock, lockPaths } from './lock.mjs';
import { T } from './policy';
import { activateRunAllowlist, appendDynamicAllowlist, currentTestLabel } from './run-allowlist';
import type { SkipContext } from './config-cycle';

export type { ExistingEntityKind };

export interface ExistingEntityOptions {
  /** run-scoped allowlist entries to activate when the guard skips */
  allowlistIds?: string[];
  /** valid only for 'recipient-mappings', where it is the default */
  onFailure?: 'abort';
}

const KIND_TEMPLATE: Record<ExistingEntityKind, string> = {
  'notification-connections': T.connections,
  'recipient-mappings': T.mappings,
};

/** Identity of a listed item: its `_id` or `id`, else its canonical JSON. */
function itemKey(item: unknown): string {
  if (typeof item === 'object' && item !== null) {
    const o = item as Record<string, unknown>;
    for (const key of ['_id', 'id']) {
      const v = o[key];
      if (typeof v === 'string' || typeof v === 'number') return `${key}:${String(v)}`;
    }
  }
  return `json:${JSON.stringify(item)}`;
}

function sameIds(a: readonly unknown[], b: readonly unknown[]): boolean {
  const ka = a.map(itemKey).sort();
  const kb = b.map(itemKey).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i]);
}

/**
 * Runs `body` only when `listBefore()` holds no item that `matches`; otherwise activates every `allowlistIds`
 * entry, adds a guard-skip entry to the run's dynamic allowlist and calls `ctx.skip()`. `I` is inferred from
 * `listBefore`. 'notification-connections' needs an active W block; 'recipient-mappings' an active C block and the
 * config lock held with the run's token (else GuardViolation G10). G10 admits the kind's writes during `body` only.
 * With `onFailure: 'abort'` (the default for recipient mappings) `listBefore()` is called again after `body`
 * returns or throws, and any difference in ids aborts the run.
 */
export async function withExistingEntityGuard<T, I = unknown>(
  ctx: SkipContext,
  kind: ExistingEntityKind,
  listBefore: () => Promise<I[]>,
  matches: (item: I) => boolean,
  body: () => Promise<T>,
  options: ExistingEntityOptions = {}
): Promise<T | undefined> {
  if (kind !== 'notification-connections' && kind !== 'recipient-mappings') {
    throw new TypeError(`withExistingEntityGuard: unknown kind ${String(kind)}`);
  }
  if (options.onFailure !== undefined && kind !== 'recipient-mappings') {
    throw new TypeError(
      "withExistingEntityGuard: onFailure is valid only for 'recipient-mappings'"
    );
  }
  if (options.onFailure !== undefined && options.onFailure !== 'abort') {
    throw new TypeError("withExistingEntityGuard: onFailure must be 'abort'");
  }
  const h = activeHarness();
  const block = h.currentBlock();
  const token = process.env.RTLS_IT_INTERNAL_LOCK_TOKEN ?? '';
  const configPath = lockPaths(h.mainStateDir).config;
  const lockHeld = (): boolean => holdsLock(configPath, token);
  const fail = (reason: string): Error =>
    raiseViolation(h, 'G10', 'POST', KIND_TEMPLATE[kind], reason);
  if (kind === 'notification-connections') {
    if (!block || block.tier !== 'W' || !h.env.tiers.W) {
      throw fail('notification connections need an active W block with RTLS_IT_WRITES=1');
    }
  } else {
    if (!block || block.tier !== 'C' || !h.env.tiers.C) {
      throw fail('recipient mappings need an active C block with RTLS_IT_CONFIG=1');
    }
    if (!lockHeld()) throw fail('recipient mappings need the config lock held by this run');
  }

  const before = await listBefore();
  if (!Array.isArray(before))
    throw new TypeError('withExistingEntityGuard: listBefore must return an array');
  if (before.some((item) => matches(item))) {
    const reason = `${kind}: an existing entry matches; the upsert is not tested in this run`;
    for (const id of options.allowlistIds ?? []) activateRunAllowlist(id, reason);
    appendDynamicAllowlist(h, { test: currentTestLabel(h), kind: 'existing-entity', reason });
    ctx.skip(reason);
    return undefined;
  }

  const abortOnFailure = kind === 'recipient-mappings';
  let result: T | undefined;
  let failed = false;
  let error: unknown;
  try {
    result = await runWithGuardScope({ kind: 'existing-entity', entity: kind, lockHeld }, body);
  } catch (e) {
    failed = true;
    error = e;
  }
  if (abortOnFailure) {
    let after: I[] | null;
    try {
      after = await listBefore();
    } catch {
      after = null;
    }
    if (!Array.isArray(after) || !sameIds(before, after)) abortRun('restore-failed', kind);
  }
  if (failed) throw error;
  return result;
}
