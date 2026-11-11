// Tier-C configuration cycle (LIVE-TESTING §4, P0 §6.2 config-cycle.ts). `configCycle(ctx, resource, body)` is the
// only way a live test writes namespace configuration (alert rules, notification cleanup policy, tenant
// configuration): it takes the main-checkout config lock (inside the run lock, proved by the run's token
// `RTLS_IT_INTERNAL_LOCK_TOKEN`), reads the value raw, saves the before-image (`config/<resource>.before.json` and
// `.before.raw.txt`, read back and compared), skips when there is no stored value, admits the resource's writes
// that `validateChange` accepts while the body runs (G9; any number of writes), and always ends with the restore of
// config-core.ts: read; write the before-image only when the value differs; read again and require equality. A
// restore mismatch aborts the run (`abortRun('restore-failed')`, driver exit 4) and fails the test. Nothing here
// logs a value.
import { activeHarness } from './active';
import {
  holdConfigLock,
  markRestored,
  readConfig,
  restoreConfig,
  saveBeforeImage,
} from './config-core';
import {
  CONFIG_RESOURCES,
  isAbsent,
  validateChange,
  type ConfigResourceName,
} from './config-resources';
import { stateDir } from './context';
import { raiseViolation, runWithGuardScope } from './guard';
import { CONFIG_LOCK_MAX_WAIT_MS, holdsLock, lockPaths, POLL_MS } from './lock.mjs';

export { stateDir };
export type { ConfigResourceName };

/** The part of vitest's TestContext the cycle needs (a real `TestContext` is assignable). */
export interface SkipContext {
  skip(note?: string): void;
}

export interface ConfigCycle<T> {
  /** the value read before the body ran (as returned by the server) */
  readonly before: T;
  /** the raw text of that read */
  readonly beforeText: string;
  /** raw GET of the resource */
  read(): Promise<T>;
}

export interface ConfigCycleOptions<T> {
  /**
   * SDK call that writes the before-image back, passed directly or as `async (b) => { … }`; its result is ignored.
   * Default: a raw write of the saved before-image.
   */
  restoreWith?: (before: T) => Promise<unknown>;
}

/** The cycle could not restore the before-image; the run is aborted (`restore-failed`). */
export class ConfigRestoreFailed extends Error {
  readonly resource: ConfigResourceName;
  constructor(resource: ConfigResourceName, options?: { cause?: unknown }) {
    super(
      `config ${resource}: the before-image could not be restored; the run is aborted`,
      options
    );
    this.name = 'ConfigRestoreFailed';
    this.resource = resource;
  }
}

function lockToken(): string {
  return process.env.RTLS_IT_INTERNAL_LOCK_TOKEN ?? '';
}

/**
 * Runs `fn` while this process holds the main-checkout config lock, taken inside the run lock with the run's
 * token (`RTLS_IT_INTERNAL_LOCK_TOKEN`). Waits at most 15 min, polling every 5 s; a lock whose holder pid is dead
 * is stolen. Re-entrant: when the token already holds the lock, `fn` runs without taking or releasing it.
 * Released in `finally` (global teardown releases a lock left by a killed worker). Not acquired →
 * HarnessPrecondition (exit 2).
 */
export async function withConfigLock<T>(fn: () => Promise<T>): Promise<T> {
  const h = activeHarness();
  const token = lockToken();
  if (holdsLock(lockPaths(h.mainStateDir).config, token)) return fn();
  return holdConfigLock(
    h,
    { token, wait: true, pollMs: POLL_MS, maxWaitMs: CONFIG_LOCK_MAX_WAIT_MS },
    () => fn()
  );
}

/**
 * The tier-C read-modify-write cycle of LIVE-TESTING §4 for one resource. No argument fixes `T`: callers pass it
 * explicitly (`configCycle<NotificationCleanupPolicy>(ctx, 'notification-cleanup-policy', body)`).
 *
 * Requires an active C block with tier C enabled (else GuardViolation G9). Steps: config lock → raw read → save
 * the before-image and read it back → no stored value (`isAbsent`) → `ctx.skip('no stored value')`, no write →
 * the body runs with G9 admitting the resource's writes that `validateChange(before, body)` accepts → finally: raw
 * read; equal to the before-image (metadata ignored) → no write; else restore (restoreWith or raw write), read,
 * require equality → `.restored` → lock released. A body error is rethrown after the restore; a restore mismatch
 * calls `abortRun('restore-failed', resource)` and throws ConfigRestoreFailed.
 */
export async function configCycle<T>(
  ctx: SkipContext,
  resource: ConfigResourceName,
  body: (cycle: ConfigCycle<T>) => Promise<void>,
  options: ConfigCycleOptions<T> = {}
): Promise<void> {
  const h = activeHarness();
  if (!Object.hasOwn(CONFIG_RESOURCES, resource)) {
    throw new TypeError(`configCycle: unknown resource ${String(resource)}`);
  }
  const r = CONFIG_RESOURCES[resource];
  const block = h.currentBlock();
  if (!block || block.tier !== 'C' || !h.env.tiers.C) {
    throw raiseViolation(
      h,
      'G9',
      r.method,
      r.template,
      'configCycle runs only inside a describeLive C block with RTLS_IT_CONFIG=1'
    );
  }
  const token = lockToken();
  const configPath = lockPaths(h.mainStateDir).config;
  const lockHeld = (): boolean => holdsLock(configPath, token);

  await withConfigLock(async () => {
    const first = await readConfig(resource);
    saveBeforeImage(h.stateDir, resource, first.value, first.text);
    if (isAbsent(resource, first.value, first.status)) {
      // No stored value: never written over (LIVE-TESTING §4 step 2); nothing to restore.
      markRestored(h.stateDir, resource);
      ctx.skip('no stored value');
      return;
    }
    const before = first.value as T;
    const cycle: ConfigCycle<T> = {
      before,
      beforeText: first.text,
      read: async () => (await readConfig(resource)).value as T,
    };
    let bodyError: unknown = null;
    let bodyFailed = false;
    try {
      await runWithGuardScope(
        {
          kind: 'config',
          resource,
          before,
          mode: 'cycle',
          validate: (next) => validateChange(resource, before, next, { runId: h.runId }),
          lockHeld,
        },
        () => body(cycle)
      );
    } catch (error) {
      bodyFailed = true;
      bodyError = error;
    }
    const restoreWith = options.restoreWith;
    const restored = await restoreConfig(h, resource, before, {
      lockHeld,
      ...(restoreWith ? { restoreWith: (b: unknown) => restoreWith(b as T) } : {}),
    });
    if (!restored) {
      throw new ConfigRestoreFailed(resource, bodyFailed ? { cause: bodyError } : undefined);
    }
    if (bodyFailed) throw bodyError;
  });
}
