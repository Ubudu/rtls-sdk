// Internal cycle of namespace configuration (LIVE-TESTING §4, P0 §6.2 config-cycle.ts): the config lock, the
// saved before-image (`config/<resource>.before.json` and `.before.raw.txt`, read back and compared), guarded
// writes inside a config scope (G9), and the restore that ends every cycle (read; write the before-image only when
// the value differs; read again and require equality; `.restored`). A restore mismatch aborts the run
// (`abortRun('restore-failed')`, driver exit 4). `configCycle` (body form), global teardown and the sweeper's
// `--fix-config` mode are built on these functions. Nothing here logs a value.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { abortRun } from './abort';
import { activeHarness } from './active';
import {
  CONFIG_RESOURCES,
  deepEqualJson,
  isAbsent,
  METADATA_KEYS,
  validateChange,
  type ConfigResourceName,
} from './config-resources';
import type { Harness } from './context';
import { HarnessPrecondition } from './env';
import { runWithGuardScope } from './guard';
import { acquireConfigLock, lockPaths, holdsLock, releaseConfigLock } from './lock.mjs';
import { rawRequest, type RawResponse } from './raw';

export interface ConfigRead {
  status: number;
  value: unknown;
  text: string;
}

export interface SavedBefore {
  value: unknown;
  text: string;
}

export interface ConfigLockOptions {
  /** the run's token (`RTLS_IT_INTERNAL_LOCK_TOKEN`); the run lock must be held with it */
  token: string;
  wait?: boolean;
  pollMs?: number;
  maxWaitMs?: number;
}

const CONFIG_NAMES = Object.keys(CONFIG_RESOURCES) as ConfigResourceName[];

/** Paths of a resource's saved before-image in the run's state folder. */
export function configStatePaths(
  stateDir: string,
  resource: ConfigResourceName
): { dir: string; json: string; raw: string; restored: string } {
  const dir = join(stateDir, 'config');
  return {
    dir,
    json: join(dir, `${resource}.before.json`),
    raw: join(dir, `${resource}.before.raw.txt`),
    restored: join(dir, `${resource}.restored`),
  };
}

/** Deep equality of two configuration values, key-order-insensitive, ignoring `updated_at`, `updatedAt`, `__v`. */
export function configValuesEqual(a: unknown, b: unknown): boolean {
  return deepEqualJson(a, b, METADATA_KEYS);
}

/** Raw GET of a resource (the run's credential; G1–G18 apply). */
export async function readConfig(resource: ConfigResourceName): Promise<ConfigRead> {
  const response = await rawRequest('GET', CONFIG_RESOURCES[resource].path);
  return { status: response.status, value: response.json, text: response.text };
}

/**
 * Writes the before-image (JSON and raw text), reads both back and requires equality (LIVE-TESTING §4 step 1).
 * Clears an earlier `.restored` marker of the resource.
 */
export function saveBeforeImage(
  stateDir: string,
  resource: ConfigResourceName,
  value: unknown,
  text: string
): void {
  const paths = configStatePaths(stateDir, resource);
  mkdirSync(paths.dir, { recursive: true });
  const json = `${JSON.stringify(value ?? null, null, 2)}\n`;
  writeFileSync(paths.json, json);
  writeFileSync(paths.raw, text);
  const backJson: unknown = JSON.parse(readFileSync(paths.json, 'utf8'));
  const backText = readFileSync(paths.raw, 'utf8');
  if (!deepEqualJson(backJson, value ?? null) || backText !== text) {
    throw new HarnessPrecondition(`config ${resource}: the saved before-image does not read back`);
  }
  rmSync(paths.restored, { force: true });
}

/** The saved before-image of a resource, or null. */
export function readSavedBefore(
  stateDir: string,
  resource: ConfigResourceName
): SavedBefore | null {
  const paths = configStatePaths(stateDir, resource);
  if (!existsSync(paths.json)) return null;
  return {
    value: JSON.parse(readFileSync(paths.json, 'utf8')) as unknown,
    text: existsSync(paths.raw) ? readFileSync(paths.raw, 'utf8') : '',
  };
}

/** Marks the resource restored (the cycle ended in the before-image). */
export function markRestored(stateDir: string, resource: ConfigResourceName): void {
  const paths = configStatePaths(stateDir, resource);
  mkdirSync(paths.dir, { recursive: true });
  writeFileSync(paths.restored, 'restored\n');
}

export function isRestored(stateDir: string, resource: ConfigResourceName): boolean {
  return existsSync(configStatePaths(stateDir, resource).restored);
}

/** Resources with a saved before-image (any state). */
export function savedConfigResources(stateDir: string): ConfigResourceName[] {
  const dir = join(stateDir, 'config');
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return CONFIG_NAMES.filter((r) => names.includes(`${r}.before.json`));
}

/** Resources whose before-image has no `.restored` marker (global teardown restores them). */
export function pendingConfigRestores(stateDir: string): ConfigResourceName[] {
  return savedConfigResources(stateDir).filter((r) => !isRestored(stateDir, r));
}

/**
 * Runs `fn` while this process holds the config lock with `token` (taken inside the run lock; released in
 * `finally`). Not acquired → HarnessPrecondition (exit 2).
 */
export async function holdConfigLock<T>(
  h: Harness,
  options: ConfigLockOptions,
  fn: (lockHeld: () => boolean) => Promise<T>
): Promise<T> {
  const lockOptions = { stateDir: h.mainStateDir };
  const acquired = await acquireConfigLock({
    token: options.token,
    wait: options.wait ?? true,
    pollMs: options.pollMs,
    maxWaitMs: options.maxWaitMs,
    holder: 'config cycle',
    ...lockOptions,
  });
  if (!acquired) {
    throw new HarnessPrecondition(
      'config lock not acquired (held by another run, or the run lock is not held with this token)'
    );
  }
  const configPath = lockPaths(h.mainStateDir).config;
  try {
    return await fn(() => holdsLock(configPath, options.token));
  } finally {
    await releaseConfigLock(options.token, lockOptions);
  }
}

/**
 * A raw write of `body` to `resource` inside a config scope (G9): admitted only while `lockHeld()` and only when
 * `validateChange(resource, before, body, { mode })` holds.
 */
export async function writeConfig(
  h: Harness,
  resource: ConfigResourceName,
  before: unknown,
  body: unknown,
  options: { mode: 'cycle' | 'sweeper'; lockHeld: () => boolean }
): Promise<RawResponse> {
  const r = CONFIG_RESOURCES[resource];
  return runWithGuardScope(
    {
      kind: 'config',
      resource,
      before,
      mode: options.mode,
      validate: (next) =>
        validateChange(resource, before, next, { runId: h.runId, mode: options.mode }),
      lockHeld: options.lockHeld,
    },
    () => rawRequest(r.method, r.path, { body })
  );
}

export interface RestoreOptions {
  lockHeld: () => boolean;
  /** SDK call that writes the before-image (default: raw write of the saved before-image) */
  restoreWith?: (before: unknown) => Promise<unknown>;
  /** folder of the `.restored` marker (default: the run's state folder; the sweeper keeps its own) */
  stateDir?: string;
}

/**
 * Ends a cycle: raw read; when it equals the before-image (metadata ignored) no write is made, else the
 * before-image is written (restoreWith or raw write), read again and required equal. Success writes `.restored`.
 * A mismatch, or a failing write, calls `abortRun('restore-failed', resource)` and returns false. An absent
 * before-image (no stored value) is never written over (LIVE-TESTING §4 step 2): it counts as restored.
 */
export async function restoreConfig(
  h: Harness,
  resource: ConfigResourceName,
  before: unknown,
  options: RestoreOptions
): Promise<boolean> {
  const done = (): boolean => {
    markRestored(options.stateDir ?? h.stateDir, resource);
    return true;
  };
  const failed = (): boolean => {
    abortRun('restore-failed', resource);
    return false;
  };
  try {
    if (isAbsent(resource, before)) return done();
    const current = await readConfig(resource);
    if (current.status === 200 && configValuesEqual(current.value, before)) return done();
    if (options.restoreWith) {
      await runWithGuardScope(
        {
          kind: 'config',
          resource,
          before,
          mode: 'cycle',
          validate: (next) => validateChange(resource, before, next, { runId: h.runId }),
          lockHeld: options.lockHeld,
        },
        () => (options.restoreWith as (b: unknown) => Promise<unknown>)(before)
      );
    } else {
      const written = await writeConfig(h, resource, before, before, {
        mode: 'cycle',
        lockHeld: options.lockHeld,
      });
      if (written.status < 200 || written.status >= 300) return failed();
    }
    const after = await readConfig(resource);
    return after.status === 200 && configValuesEqual(after.value, before) ? done() : failed();
  } catch {
    return failed();
  }
}

/**
 * Global teardown: restores every saved before-image without `.restored` (P0 §6.2 teardown), each inside the
 * config lock. Returns one `{ resource, ok }` per resource attempted.
 */
export async function restorePendingConfigs(
  options: ConfigLockOptions & { harness?: Harness }
): Promise<{ resource: ConfigResourceName; ok: boolean }[]> {
  const h = options.harness ?? activeHarness();
  const pending = pendingConfigRestores(h.stateDir);
  const results: { resource: ConfigResourceName; ok: boolean }[] = [];
  if (pending.length === 0) return results;
  await holdConfigLock(h, options, async (lockHeld) => {
    for (const resource of pending) {
      const saved = readSavedBefore(h.stateDir, resource);
      const ok = saved ? await restoreConfig(h, resource, saved.value, { lockHeld }) : false;
      results.push({ resource, ok });
    }
  });
  return results;
}
