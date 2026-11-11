// Rule preflight of an integration run (LIVE-TESTING §2.7, P0 §6.2 "Rule preflight"). Global setup reads the
// alert rules, the asset list and the settings raw (through the guarded fetch), reads the ledger, evaluates them
// with the one implementation in `examples/shared/preflight.js`, and writes `.state/<runId>/preflight.json`
// (global setup replaces a file left by an earlier run of a reused run id; the example-mode preload and
// `preflightRules()` keep the first writer's file within one pass). G18 and describeLive read that file. A read
// that fails gives unsafe verdicts (fail closed). A position verdict that holds only through the `time_in_zone`
// leaf is written with `timeLimited` and expires TIME_IN_ZONE_RUN_LIMIT_SECONDS after the preflight began. Only
// indices, event types, counts and that time are stored or returned.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  evaluateAlertRules,
  evaluateLinkedNamespace,
  preflightWarnings,
  TIME_IN_ZONE_RUN_LIMIT_SECONDS,
} from '../../../examples/shared/preflight.js';
import type { Harness } from './context';
import { readLedger } from './ledger.mjs';
import { RUN_RANGE_DIGITS } from './names';
import type { PreflightVerdicts, TimeLimitedVerdict } from './policy';
import { rawRequest } from './raw';
import { writeJsonFileAtomicSync } from './state-io.mjs';

export type PreflightWarning = 'message-rules-reach-notifications';

export interface PreflightResult {
  verdicts: PreflightVerdicts;
  warnings: PreflightWarning[];
}

/** Every verdict false (a missing or failed preflight). */
export const UNSAFE_PREFLIGHT: Readonly<PreflightVerdicts> = Object.freeze({
  ruleEngineSafe: false,
  positionSafe: false,
  declaredPositionSafe: false,
  linkedNamespaceSafe: false,
  linkedCount: 0,
  blocking: [],
});

const TIME_LIMITED_VERDICTS: readonly TimeLimitedVerdict[] = [
  'positionSafe',
  'declaredPositionSafe',
];

/**
 * The exact preflight.json shape (verdicts, the count, indices and event types; `timeLimited` and
 * `timeLimitedUntil` only when a verdict is time-limited, the time kept only when it is a string). A `timeLimited`
 * that is present and not an array is an unknown shape: both position verdicts are dropped with it (false).
 */
export function pickVerdicts(value: unknown): PreflightVerdicts {
  const v = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const blocking = Array.isArray(v.blocking) ? v.blocking : [];
  const malformed = v.timeLimited !== undefined && !Array.isArray(v.timeLimited);
  const limited = Array.isArray(v.timeLimited)
    ? TIME_LIMITED_VERDICTS.filter((name) => (v.timeLimited as unknown[]).includes(name))
    : [];
  return {
    ruleEngineSafe: v.ruleEngineSafe === true,
    positionSafe: !malformed && v.positionSafe === true,
    declaredPositionSafe: !malformed && v.declaredPositionSafe === true,
    linkedNamespaceSafe: v.linkedNamespaceSafe === true,
    linkedCount: typeof v.linkedCount === 'number' ? v.linkedCount : 0,
    blocking: blocking.map((b: unknown) => {
      const o = (typeof b === 'object' && b !== null ? b : {}) as Record<string, unknown>;
      return { index: Number(o.index), eventType: String(o.eventType) };
    }),
    ...(limited.length > 0
      ? {
          timeLimited: limited,
          timeLimitedUntil: typeof v.timeLimitedUntil === 'string' ? v.timeLimitedUntil : null,
        }
      : {}),
  };
}

export function preflightPath(stateDir: string): string {
  return join(stateDir, 'preflight.json');
}

/**
 * Writes preflight.json unless it exists (flag `wx`: the first writer of the run id wins) and returns the
 * verdicts the file holds. With `replace` the file is written atomically whatever exists (global setup: one
 * integration run, one preflight).
 */
export function writePreflightFile(
  stateDir: string,
  verdicts: PreflightVerdicts,
  options: { replace?: boolean } = {}
): PreflightVerdicts {
  const path = preflightPath(stateDir);
  mkdirSync(stateDir, { recursive: true });
  if (options.replace === true) {
    writeJsonFileAtomicSync(path, pickVerdicts(verdicts));
    return pickVerdicts(verdicts);
  }
  try {
    writeFileSync(path, `${JSON.stringify(pickVerdicts(verdicts), null, 2)}\n`, { flag: 'wx' });
    return pickVerdicts(verdicts);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    return pickVerdicts(JSON.parse(readFileSync(path, 'utf8')));
  }
}

/**
 * True when no ledger entry whose run id starts with the same four hex digits as `runId` (the run's own entry
 * included: a reused run id) has recorded a position, so no earlier recorded run positioned a MAC of this run's
 * test range (`025d4b` + those four digits + two; G18 sends a run's positions to its own range only). A ledger with
 * no history gives false: a missing file, or one that records no run other than `runId` (global setup creates the
 * run's own entry before the preflight, so after the ledger was lost the first run finds only that entry). An
 * unreadable ledger gives false. The ledger sees only the runs of this checkout family (LIVE-TESTING §2.7).
 */
export function freshTestMacs(runId: string, ledgerPath: string): boolean {
  try {
    if (!existsSync(ledgerPath)) return false;
    const { runs } = readLedger({ ledgerPath });
    if (!runs.some((run) => run.runId !== runId)) return false;
    const range = (id: string): string => id.slice(0, RUN_RANGE_DIGITS);
    return !runs.some((run) => range(run.runId) === range(runId) && run.counts.positions > 0);
  } catch {
    return false;
  }
}

/**
 * Pure part: the four verdicts and the warnings from the documents (null = the read failed → unsafe; a failed
 * settings read or `freshTestMacs: false` only keeps the `time_in_zone` leaf "may match"). A position verdict that
 * is true only with that leaf counted gets `timeLimited`, ending TIME_IN_ZONE_RUN_LIMIT_SECONDS after `startedAt`
 * (ms; when the preflight began, before its reads).
 */
export function evaluatePreflight(input: {
  alertRules: unknown | null;
  assets: unknown | null;
  settings?: unknown | null;
  freshTestMacs?: boolean;
  namespace: string;
  notifications: boolean;
  startedAt?: number;
}): PreflightResult {
  const settings = input.settings;
  const positionsExpirationPeriod =
    typeof settings === 'object' && settings !== null && !Array.isArray(settings)
      ? (settings as Record<string, unknown>).positionsExpirationPeriod
      : undefined;
  const unsafeRules = {
    ruleEngineSafe: false,
    positionSafe: false,
    declaredPositionSafe: false,
    blocking: [],
  };
  const rules =
    input.alertRules === null
      ? unsafeRules
      : evaluateAlertRules(input.alertRules, undefined, {
          positionsExpirationPeriod,
          freshTestMacs: input.freshTestMacs === true,
        });
  // The same document without the time_in_zone leaf: a verdict true only above depends on that leaf.
  const untimed = input.alertRules === null ? unsafeRules : evaluateAlertRules(input.alertRules);
  const timeLimited = TIME_LIMITED_VERDICTS.filter((name) => rules[name] && !untimed[name]);
  const startedAt = input.startedAt ?? Date.now();
  const limit =
    timeLimited.length > 0
      ? {
          timeLimited,
          timeLimitedUntil: new Date(
            startedAt + TIME_IN_ZONE_RUN_LIMIT_SECONDS * 1000
          ).toISOString(),
        }
      : {};
  const linked =
    input.assets === null
      ? { linkedNamespaceSafe: false, linkedCount: 0 }
      : evaluateLinkedNamespace(input.assets, input.namespace);
  const warnings =
    input.alertRules === null
      ? []
      : preflightWarnings(input.alertRules, { notifications: input.notifications });
  return { verdicts: pickVerdicts({ ...rules, ...linked, ...limit }), warnings };
}

/**
 * The preflight of global setup and of the example-mode preload: raw `GET /alert_rules/{ns}`, `GET /assets/{ns}`
 * and `GET /settings/{ns}`, the ledger's `freshTestMacs`, the four verdicts (a time limit counted from before the
 * first read), preflight.json and the warnings. An existing file of the run id is kept and its verdicts returned,
 * unless `replace` (global setup).
 */
export async function computePreflight(
  h: Harness,
  options: { notifications: boolean; replace?: boolean }
): Promise<PreflightResult> {
  const startedAt = Date.now();
  const read = async (path: string): Promise<unknown | null> => {
    try {
      const response = await rawRequest('GET', path);
      return response.status === 200 && response.json !== undefined ? response.json : null;
    } catch {
      return null;
    }
  };
  const alertRules = await read('/alert_rules/{ns}');
  const assets = await read('/assets/{ns}');
  const settings = await read('/settings/{ns}');
  const result = evaluatePreflight({
    alertRules,
    assets,
    settings,
    freshTestMacs: freshTestMacs(h.runId, h.ledgerPath),
    namespace: h.env.namespace,
    notifications: options.notifications,
    startedAt,
  });
  return {
    verdicts: writePreflightFile(h.stateDir, result.verdicts, { replace: options.replace }),
    warnings: result.warnings,
  };
}
