// Run identity and test names (P0 §6.2 `names.ts`, CONVENTIONS §7). The same rules as
// `examples/shared/config.js`: test MACs are `025d4b` + 6 hex (separators and case ignored), names are
// `sdk-test-<runId>-<label>`.
import { randomBytes } from 'node:crypto';
import { peekActiveHarness } from './active';
import { HarnessPrecondition } from './env';

export const RUN_ID_RE = /^[0-9a-f]{8}$/;
export const LABEL_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const TEST_MAC_RE = /^025d4b[0-9a-f]{6}$/;
/**
 * How many leading hex digits of the run id name the run's MAC range (`testMac`, `isRunTestMac`) and key the ledger
 * check of the rule preflight (`freshTestMacs`, LIVE-TESTING §2.7). One constant, so the three cannot drift apart.
 */
export const RUN_RANGE_DIGITS = 4;
/** Made-up id for "unknown id → 404" tests (G5 e). */
export const ZERO_ID = '000000000000000000000000';

/**
 * Run id from a process environment: `RTLS_IT_RUN_ID` when set (must match /^[0-9a-f]{8}$/, else a
 * precondition error), otherwise a fresh random id.
 */
export function runIdFrom(processEnv: NodeJS.ProcessEnv): string {
  const value = processEnv.RTLS_IT_RUN_ID;
  if (value === undefined || value === '') return randomBytes(4).toString('hex');
  if (!RUN_ID_RE.test(value)) {
    throw new HarnessPrecondition('RTLS_IT_RUN_ID must be 8 lowercase hex characters', [
      'RTLS_IT_RUN_ID',
    ]);
  }
  return value;
}

let processRunId: string | null = null;

/** The run id: the active harness's, else `RTLS_IT_RUN_ID`, else a random id fixed for this process. */
export function runId(): string {
  const active = peekActiveHarness();
  if (active) return active.runId;
  processRunId ??= runIdFrom(process.env);
  return processRunId;
}

/** `sdk-test-<runId>-` for a run id. */
export function runPrefix(id: string = runId()): string {
  return `sdk-test-${id}-`;
}

/** `sdk-test-<runId>-<label>`; label /^[a-z0-9][a-z0-9-]{0,39}$/. */
export function testName(label: string, id: string = runId()): string {
  if (typeof label !== 'string' || !LABEL_RE.test(label)) {
    throw new TypeError(`testName: label must match ${String(LABEL_RE)}`);
  }
  return `${runPrefix(id)}${label}`;
}

/** n 0..255 → `025d4b` + runId.slice(0, 4) + hex2(n), e.g. `025d4b3fa901`. */
export function testMac(n: number, id: string = runId()): string {
  if (!Number.isInteger(n) || n < 0 || n > 255) {
    throw new RangeError('testMac: n must be an integer from 0 to 255');
  }
  return `${runMacPrefix(id)}${n.toString(16).padStart(2, '0')}`;
}

/** `025d4b` + the run id's first RUN_RANGE_DIGITS hex digits: the first ten hex digits of every MAC of the run. */
export function runMacPrefix(id: string = runId()): string {
  return `025d4b${id.slice(0, RUN_RANGE_DIGITS)}`;
}

/** Strips `:`, `-` and `.` and lowercases. */
export function normalizeMacLike(mac: string): string {
  return mac.replace(/[:.-]/g, '').toLowerCase();
}

/** 12 hex characters starting `025d4b`; separators and case ignored. */
export function isTestMac(mac: unknown): boolean {
  return typeof mac === 'string' && TEST_MAC_RE.test(normalizeMacLike(mac));
}

/**
 * A test MAC of the run's own range: `025d4b` + the run id's first four hex digits + two hex (`testMac(n)` for some n;
 * separators and case ignored). G18 sends positions only to these (LIVE-TESTING §2.7).
 */
export function isRunTestMac(mac: unknown, id: string = runId()): boolean {
  return isTestMac(mac) && normalizeMacLike(mac as string).startsWith(runMacPrefix(id));
}

/** Starts with `sdk-test-`. */
export function isTestName(name: unknown): boolean {
  return typeof name === 'string' && name.startsWith('sdk-test-');
}
