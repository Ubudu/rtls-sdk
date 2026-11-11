// Cleanup registry (LIVE-TESTING §2.4, P0 §6.2 cleanup.ts). Declarative and persisted: every registration is
// appended to `.state/<runId>/cleanup.jsonl` with the innermost active describeLive block, and so is every
// outcome (`done`, `failed`), so a replay runs only pending entries and is idempotent. A block's afterAll replays
// its own entries (LIFO) under the block's tiers (scope `cleanup`: G4 applies, removals are exempt from G18);
// global teardown replays every entry still pending (scope `teardown` with `replay`: the run's tier flags apply).
// A replay only removes (G4: DELETE, bulk-clear-declared, a bulk delete, a PATCH to enabled: false), and outside a
// W, C or S block only a DELETE may be registered. A 404 or 410 on the undo is "already
// gone"; a failure does not stop the others and fails the run (report.json `cleanup.failed`). Nothing here logs a
// body or a value: labels, methods and statuses only.
import { randomBytes } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { activeHarness } from './active';
import type { Harness } from './context';
import { runWithGuardScope } from './guard';
import { rawRequest } from './raw';

export interface CleanupSpec {
  label: string;
  request: { method: 'DELETE' | 'POST' | 'PUT' | 'PATCH'; path: string; body?: unknown };
  verify?: { path: string; goneStatus?: number[] /* default [404, 410] */ };
}

export interface CleanupResult {
  done: number;
  failed: { label: string; status?: number }[];
}

interface RegisterEvent extends CleanupSpec {
  type: 'register';
  id: string;
  /** the innermost block when registered (`<module nonce>:<block id>`), null at module scope */
  block: string | null;
}
interface OutcomeEvent {
  type: 'done' | 'failed';
  id: string;
  status?: number;
}
type CleanupEvent = RegisterEvent | OutcomeEvent;

const METHODS = new Set(['DELETE', 'POST', 'PUT', 'PATCH']);
/** Block ids restart in every test file (module isolation), so they are qualified by this module instance. */
const MODULE_NONCE = randomBytes(4).toString('hex');
let counter = 0;
const hooked = new WeakSet<Harness>();

export function cleanupLogPath(stateDir: string): string {
  return join(stateDir, 'cleanup.jsonl');
}

function append(stateDir: string, event: CleanupEvent): void {
  mkdirSync(stateDir, { recursive: true });
  appendFileSync(cleanupLogPath(stateDir), `${JSON.stringify(event)}\n`);
}

function readEvents(stateDir: string): CleanupEvent[] {
  let text: string;
  try {
    text = readFileSync(cleanupLogPath(stateDir), 'utf8');
  } catch {
    return [];
  }
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as CleanupEvent);
}

/** Registered entries without an outcome, in registration order. */
export function pendingCleanups(stateDir: string): RegisterEvent[] {
  const events = readEvents(stateDir);
  const finished = new Set(events.filter((e) => e.type !== 'register').map((e) => e.id));
  return events.filter((e): e is RegisterEvent => e.type === 'register' && !finished.has(e.id));
}

function blockKey(h: Harness): string | null {
  const block = h.currentBlock();
  return block ? `${MODULE_NONCE}:${block.id}` : null;
}

function validate(spec: CleanupSpec): void {
  if (typeof spec?.label !== 'string' || spec.label.trim() === '')
    throw new TypeError('registerCleanup: label required');
  if (!METHODS.has(spec.request?.method))
    throw new TypeError('registerCleanup: method must be DELETE, POST, PUT or PATCH');
  if (typeof spec.request.path !== 'string' || !spec.request.path.startsWith('/'))
    throw new TypeError('registerCleanup: request.path must start with /');
  if (spec.verify && (typeof spec.verify.path !== 'string' || !spec.verify.path.startsWith('/')))
    throw new TypeError('registerCleanup: verify.path must start with /');
}

/** Registers the undo of a creation; the entry records the innermost active describeLive block. */
export function registerCleanup(spec: CleanupSpec): void {
  validate(spec);
  const h = activeHarness();
  const block = h.currentBlock();
  if ((block === null || block.tier === 'R') && spec.request.method !== 'DELETE') {
    throw new TypeError(
      'registerCleanup: outside a W, C or S block only a DELETE may be registered'
    );
  }
  if (!hooked.has(h)) {
    hooked.add(h);
    // describeLive's afterAll runs the block-end hooks while the ending block is still current.
    h.blockEndHooks.push(async () => {
      await runCleanup();
    });
  }
  counter += 1;
  append(h.stateDir, {
    type: 'register',
    id: `${process.pid}-${MODULE_NONCE}-${counter}`,
    block: blockKey(h),
    label: spec.label,
    request: { ...spec.request },
    ...(spec.verify ? { verify: { ...spec.verify } } : {}),
  });
}

async function undo(entry: RegisterEvent): Promise<OutcomeEvent> {
  const { id } = entry;
  try {
    const response = await rawRequest(entry.request.method, entry.request.path, {
      ...(entry.request.body !== undefined ? { body: entry.request.body } : {}),
    });
    if (response.status === 404 || response.status === 410) return { type: 'done', id };
    if (response.status < 200 || response.status >= 300) {
      return { type: 'failed', id, status: response.status };
    }
    if (!entry.verify) return { type: 'done', id };
    const check = await rawRequest('GET', entry.verify.path);
    const gone = entry.verify.goneStatus ?? [404, 410];
    return gone.includes(check.status)
      ? { type: 'done', id }
      : { type: 'failed', id, status: check.status };
  } catch {
    return { type: 'failed', id };
  }
}

/**
 * Replays pending entries, LIFO: those of the innermost active block (a block's afterAll), or every pending
 * entry outside any block (global teardown).
 */
export async function runCleanup(): Promise<CleanupResult> {
  const h = activeHarness();
  const key = blockKey(h);
  const entries = pendingCleanups(h.stateDir)
    .filter((e) => key === null || e.block === key)
    .reverse();
  const result: CleanupResult = { done: 0, failed: [] };
  const scope =
    key === null ? ({ kind: 'teardown', replay: true } as const) : ({ kind: 'cleanup' } as const);
  for (const entry of entries) {
    const outcome = await runWithGuardScope(scope, () => undo(entry));
    append(h.stateDir, outcome);
    if (outcome.type === 'done') result.done += 1;
    else {
      result.failed.push({
        label: entry.label,
        ...(outcome.status !== undefined ? { status: outcome.status } : {}),
      });
    }
  }
  return result;
}
